import { describe, it, expect } from 'vitest';
import {
  remap,
  scaleAt,
  mapPoint,
  fitRects,
  profileIntegral,
  type LensShape,
} from '../src/gfx/lens';

const shape: LensShape = { radius: 486, tailEnd: 2.4, maxScale: 5, minScale: 0.5 };

describe('レンズ関数(§4.2)', () => {
  it('remap は単調増加(タイルの順序が入れ替わらない)', () => {
    for (const amount of [0.15, 0.5, 1]) {
      let prev = -1;
      for (let d = 0; d <= shape.radius * 4; d += 2) {
        const r = remap(d, shape, amount);
        expect(r).toBeGreaterThan(prev);
        prev = r;
      }
    }
  });

  it('remap(d) ≥ d(変位は常に外向き → 接線方向の圧縮なし)', () => {
    for (let d = 0; d <= shape.radius * 4; d += 5) {
      expect(remap(d, shape, 1)).toBeGreaterThanOrEqual(d - 1e-9);
    }
  });

  it('スケールは中心で maxScale、遠方で 1、常に minScale 以上', () => {
    expect(scaleAt(0, shape, 1)).toBeCloseTo(shape.maxScale, 6);
    expect(scaleAt(shape.radius * shape.tailEnd + 1, shape, 1)).toBeCloseTo(1, 6);
    for (const amount of [0.15, 0.5, 1]) {
      for (let d = 0; d <= shape.radius * 4; d += 3) {
        expect(scaleAt(d, shape, amount)).toBeGreaterThanOrEqual(shape.minScale - 1e-9);
        expect(scaleAt(d, shape, amount)).toBeLessThanOrEqual(shape.maxScale + 1e-9);
      }
    }
  });

  it('amount=0 で恒等写像(レンズ全閉)', () => {
    for (let d = 0; d <= shape.radius * 3; d += 7) {
      expect(remap(d, shape, 0)).toBeCloseTo(d, 9);
      expect(scaleAt(d, shape, 0)).toBeCloseTo(1, 9);
    }
  });

  it('P(x) は非負(変位が負にならない安全弁を含む)', () => {
    const extreme: LensShape = { radius: 400, tailEnd: 2.4, maxScale: 1.5, minScale: 0.2 };
    for (let x = 0; x <= 5; x += 0.01) {
      expect(profileIntegral(x, extreme)).toBeGreaterThanOrEqual(-1e-9);
    }
  });
});

describe('非重複と GAP_MIN(§4.2 受け入れ条件)', () => {
  const GAP_MIN = 2;
  // 1080p 相当のグリッド(セル 123.4×77.1、ギャップ9%) — CONFIG 既定値と一致させること
  const cellH = 1080 / 14;
  const cellW = cellH * 1.6;
  const GAP_FRAC = 0.09;

  it('いかなるポインタ位置・開度でも隣接タイルが重ならず GAP_MIN を維持', () => {
    const out = new Float64Array(2);
    const range = Math.ceil((shape.radius * shape.tailEnd * 1.2) / Math.min(cellW, cellH));
    const cols = range * 2 + 3; // 外周1セルのリング込み(本番と同じ)
    const xs = new Float64Array(cols * cols);
    const ys = new Float64Array(cols * cols);
    const oxs = new Float64Array(cols * cols);
    const oys = new Float64Array(cols * cols);
    const ws = new Float64Array(cols * cols);
    const hs = new Float64Array(cols * cols);
    let worst = Infinity;
    // ポインタをセル内オフセット5×5でサンプリング
    for (const amount of [0.15, 0.6, 1]) {
      for (let oy = 0; oy < 5; oy++) {
        for (let ox = 0; ox < 5; ox++) {
          const pxp = (ox / 5) * cellW;
          const pyp = (oy / 5) * cellH;
          // 本番(main.ts)と同一の2パス: 中心写像 → fitRects
          for (let r = 0; r < cols; r++) {
            for (let c = 0; c < cols; c++) {
              mapPoint(
                (c - range - 0.5) * cellW,
                (r - range - 0.5) * cellH,
                pxp,
                pyp,
                shape,
                amount,
                out,
                0,
              );
              xs[r * cols + c] = out[0] as number;
              ys[r * cols + c] = out[1] as number;
            }
          }
          fitRects(xs, ys, cols, cols, GAP_FRAC, GAP_MIN, oxs, oys, ws, hs);
          // 内側セルの4方向ペア(右・下・右下・左下)で矩形の分離を確認
          const pairs = [
            [1, 0],
            [0, 1],
            [1, 1],
            [-1, 1],
          ] as const;
          for (let r = 1; r < cols - 2; r++) {
            for (let c = 1; c < cols - 2; c++) {
              const i = r * cols + c;
              for (const [dc, dr] of pairs) {
                if (c + dc < 1 || c + dc > cols - 2) continue;
                const j = (r + dr) * cols + (c + dc);
                const gapX =
                  Math.abs((oxs[j] as number) - (oxs[i] as number)) -
                  ((ws[i] as number) + (ws[j] as number)) / 2;
                const gapY =
                  Math.abs((oys[j] as number) - (oys[i] as number)) -
                  ((hs[i] as number) + (hs[j] as number)) / 2;
                // 少なくとも一軸で GAP_MIN 以上離れていれば重ならない
                const g = Math.max(gapX, gapY);
                if (g < worst) worst = g;
                expect(g).toBeGreaterThanOrEqual(GAP_MIN);
              }
            }
          }
        }
      }
    }
    // 参考値の記録(受け入れ §14 のセルフチェックで参照)
    console.log(`最悪ギャップ: ${worst.toFixed(2)}px`);
  });
});
