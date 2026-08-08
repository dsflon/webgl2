/**
 * レンズ変形の数理(仕様 §4.2)。
 *
 * 設計: 半径方向の変位 D(d) を「スケールプロファイル s(r) の積分」として閉形式で定義する。
 *   remap(d) = ∫₀^d s(r) dr,  s(r) = remap'(r)
 * これにより局所の半径方向伸縮率がタイル倍率と厳密に一致し、タイル同士の非重複と
 * ギャップ比率の保存が数式レベルで成立する(リラクゼーション不要)。
 *
 * プロファイル p(u)(u = d/R):
 *   コア   u∈[0,1) : smootherstep(1-u)          … 1→0 に減衰(拡大域)
 *   裾野   u∈[1,T) : -α·sin²(π(u-1)/(T-1))      … 負のローブ(圧縮域=波のうねり)
 *   遠方   u≥T     : 0                           … 変位一定(歪みなし)
 * スケール s = 1 + (MAX_SCALE-1)·p·amount。α は最小倍率 minScale を保証する振幅。
 */

export interface LensShape {
  /** コア影響半径(px) */
  radius: number;
  /** 裾野終端(×radius) */
  tailEnd: number;
  /** 中心の最大倍率 */
  maxScale: number;
  /** 圧縮域の最小倍率 */
  minScale: number;
}

/** smootherstep: 6t⁵-15t⁴+10t³ */
export function smootherstep(t: number): number {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * x * (x * (x * 6 - 15) + 10);
}

/** ∫smootherstep dt の原始関数 */
function integralS(t: number): number {
  return t * t * t * t * (t * (t - 3) + 2.5);
}

/** 裾野振幅 α。minScale を保証しつつ、変位が負にならない(remap ≥ d)範囲へクランプ */
export function tailAlpha(shape: LensShape): number {
  const a = (1 - shape.minScale) / Math.max(shape.maxScale - 1, 1e-6);
  const aMax = 0.98 / (shape.tailEnd - 1); // P(x) ≥ 0 の保証(∫tail ≤ 0.49 < ∫core = 0.5)
  return Math.min(a, aMax);
}

/** プロファイル p(u)。s = 1 + (maxScale-1)·p·amount */
export function profile(u: number, shape: LensShape): number {
  if (u < 0) return 1;
  if (u < 1) return smootherstep(1 - u);
  const t = shape.tailEnd;
  if (u < t) {
    const w = (u - 1) / (t - 1);
    const s = Math.sin(Math.PI * w);
    return -tailAlpha(shape) * s * s;
  }
  return 0;
}

/** P(x) = ∫₀^x p(u) du(閉形式) */
export function profileIntegral(x: number, shape: LensShape): number {
  if (x <= 0) return 0;
  if (x <= 1) return 0.5 - integralS(1 - x);
  const t = shape.tailEnd;
  const a = tailAlpha(shape);
  const cap = Math.min(x, t) - 1;
  // ∫sin²(πw/(t-1))du = (u-1)/2 - ((t-1)/4π)·sin(2π(u-1)/(t-1))
  const tail = cap / 2 - ((t - 1) / (4 * Math.PI)) * Math.sin((2 * Math.PI * cap) / (t - 1));
  return 0.5 - a * tail;
}

/** タイル倍率 s(d) */
export function scaleAt(d: number, shape: LensShape, amount: number): number {
  return 1 + (shape.maxScale - 1) * profile(d / shape.radius, shape) * amount;
}

/** 半径リマップ remap(d) = d + (maxScale-1)·R·P(d/R)·amount(単調増加) */
export function remap(d: number, shape: LensShape, amount: number): number {
  return d + (shape.maxScale - 1) * shape.radius * profileIntegral(d / shape.radius, shape) * amount;
}

/** 点 (x,y) をポインタ基準の半径リマップで写像し、out[o..o+1] に書き込む */
export function mapPoint(
  x: number,
  y: number,
  px: number,
  py: number,
  shape: LensShape,
  amount: number,
  out: Float64Array,
  o: number,
): void {
  const dx = x - px;
  const dy = y - py;
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) {
    out[o] = x;
    out[o + 1] = y;
    return;
  }
  const r = remap(d, shape, amount) / d;
  out[o] = px + dx * r;
  out[o + 1] = py + dy * r;
}

/**
 * 写像済みセル中心のグリッドから、各セルの軸平行タイル矩形(中心とギャップ抜きの寸法)を求める(§4.2)。
 *
 * 配置規則(スパン充填):
 *   タイルの x 区間 = 同じ行の左右隣接中心との中点で区切られたスパン(行方向を完全に充填)
 *   タイルの y 区間 = 同じ列の上下隣接中心との中点で区切られたスパン(列方向を完全に充填)
 * スパンは行・列の直線上を互いに素に分割するため、水平・垂直の隣接対は構成的に重ならず、
 * ギャップは各スパンの gapF 割合として保存される。
 *
 * 残る対角対の食い込み(レンズ縁の強い剪断域でのみ発生)は、決定的な緩和スイープを2回かけて
 * 侵入量の小さい軸の寸法を対で縮めて解消する(§4.2 が認めるリラクゼーション)。
 *
 * xs/ys: 写像済み中心(row-major, cols×rows)。out*: 同レイアウト(境界1周は未定義のまま)。
 * outW/outH はギャップ控除済みのタイル寸法。
 */
export function fitRects(
  xs: Float64Array,
  ys: Float64Array,
  cols: number,
  rows: number,
  gapF: number,
  gapMin: number,
  outX: Float64Array,
  outY: Float64Array,
  outW: Float64Array,
  outH: Float64Array,
): void {
  // パスA: スパン配置
  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < cols - 1; c++) {
      const i = r * cols + c;
      const xL = ((xs[i - 1] as number) + (xs[i] as number)) / 2;
      const xR = ((xs[i] as number) + (xs[i + 1] as number)) / 2;
      const yT = ((ys[i - cols] as number) + (ys[i] as number)) / 2;
      const yB = ((ys[i] as number) + (ys[i + cols] as number)) / 2;
      outX[i] = (xL + xR) / 2;
      outY[i] = (yT + yB) / 2;
      outW[i] = Math.abs(xR - xL) * (1 - gapF);
      outH[i] = Math.abs(yB - yT) * (1 - gapF);
    }
  }
  // パスB: 対角対の緩和(決定的・2スイープ)
  for (let sweep = 0; sweep < 2; sweep++) {
    for (let r = 1; r < rows - 2; r++) {
      for (let c = 1; c < cols - 1; c++) {
        const i = r * cols + c;
        for (let dx = -1; dx <= 1; dx += 2) {
          const cc = c + dx;
          if (cc < 1 || cc > cols - 2) continue;
          const j = i + cols + dx;
          const ovX =
            ((outW[i] as number) + (outW[j] as number)) / 2 +
            gapMin -
            Math.abs((outX[j] as number) - (outX[i] as number));
          if (ovX <= 0) continue;
          const ovY =
            ((outH[i] as number) + (outH[j] as number)) / 2 +
            gapMin -
            Math.abs((outY[j] as number) - (outY[i] as number));
          if (ovY <= 0) continue;
          // 両軸で食い込み → 侵入量の小さい軸を対で均等に縮める(+0.5px は丸め誤差の安全代)
          if (ovX <= ovY) {
            outW[i] = Math.max((outW[i] as number) - ovX - 0.5, 1);
            outW[j] = Math.max((outW[j] as number) - ovX - 0.5, 1);
          } else {
            outH[i] = Math.max((outH[i] as number) - ovY - 0.5, 1);
            outH[j] = Math.max((outH[j] as number) - ovY - 0.5, 1);
          }
        }
      }
    }
  }
}
