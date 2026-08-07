/**
 * 起動シーケンスとフレームループ(docs/top_page_spec_v1.1.md が唯一の正)。
 * 流れ: works.json → sr-only nav → WebGL2 init → アトラス → フェードイン → ループ。
 * 失敗時は静的グリッドへフォールバック(§9)。
 */
import './style.css';
import { CONFIG, applyReducedMotion, dtLerp } from './config';
import { fetchWorks, type Work } from './data/works';
import { buildAssignment, workAt } from './gfx/grid';
import { mapPoint, fitRects, type LensShape } from './gfx/lens';
import { buildAtlas } from './gfx/atlas';
import { Renderer, STRIDE } from './gfx/renderer';
import { PointerInput } from './input/pointer';
import { Overlay, renderWorksNav } from './ui/overlay';
import { showFallback } from './fallback/staticGrid';
import type { DebugTools } from './debug';

/** 波の航跡(§4.6)の状態配列の一辺。可視窓の最大セル数より大きいこと */
const STATE_N = 96;

async function boot(): Promise<void> {
  let works: Work[];
  try {
    works = await fetchWorks();
  } catch (err) {
    console.error(err);
    showFallback(null);
    return;
  }
  renderWorksNav(works);

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    applyReducedMotion(CONFIG);
  }
  const seedParam = new URLSearchParams(location.search).get('seed');
  if (seedParam !== null && /^\d+$/.test(seedParam)) CONFIG.seed = Number(seedParam);

  const overlay = new Overlay();
  overlay.setProgress(0, works.length);

  const canvas = document.getElementById('stage') as HTMLCanvasElement;
  let renderer: Renderer;
  try {
    renderer = new Renderer(canvas);
  } catch (err) {
    console.error(err);
    showFallback(works);
    return;
  }
  renderer.onContextRestoreFailed = () => showFallback(works);

  const atlas = await buildAtlas(works, (done, total) => overlay.setProgress(done, total));
  renderer.uploadAtlas(atlas.canvas);
  overlay.hideProgress();

  run(works, atlas.uv, renderer, overlay, canvas);
}

function run(
  works: readonly Work[],
  uv: Float32Array,
  renderer: Renderer,
  overlay: Overlay,
  canvas: HTMLCanvasElement,
): void {
  const table = buildAssignment(CONFIG.seed, works.length, CONFIG.patternSize);

  let vw = window.innerWidth;
  let vh = window.innerHeight;
  renderer.resize(vw, vh);
  const pointer = new PointerInput(canvas, vw, vh);
  window.addEventListener('resize', () => {
    vw = window.innerWidth;
    vh = window.innerHeight;
    renderer.resize(vw, vh);
    pointer.resize(vw, vh);
  });

  // --- 事前確保(§8: 毎フレームGCゼロ) ---
  const dispX = new Float32Array(STATE_N * STATE_N);
  const dispY = new Float32Array(STATE_N * STATE_N);
  const dispW = new Float32Array(STATE_N * STATE_N); // 変形後のセル弦長(x)
  const dispHt = new Float32Array(STATE_N * STATE_N); // 変形後のセル弦長(y)
  const dispHl = new Float32Array(STATE_N * STATE_N); // 注視ハイライトのクロスフェード
  const lastCol = new Int32Array(STATE_N * STATE_N).fill(0x7fffffff);
  const lastRow = new Int32Array(STATE_N * STATE_N);
  // 可視窓+外周1セルの写像作業グリッド(fitRects 用)
  const SCRATCH = 3 * CONFIG.maxInstances;
  const gridX = new Float64Array(SCRATCH);
  const gridY = new Float64Array(SCRATCH);
  const gridOX = new Float64Array(SCRATCH); // スパン配置後のタイル中心
  const gridOY = new Float64Array(SCRATCH);
  const gridW = new Float64Array(SCRATCH); // ギャップ控除済みタイル寸法
  const gridH = new Float64Array(SCRATCH);
  const tmp = new Float64Array(2);
  const shape: LensShape = { radius: 1, tailEnd: 2.4, maxScale: 5, minScale: 0.45 };

  let lensAmount = 0; // 初回ロードは閉→開(§4.5)
  let fade = 0;
  let focusCol = 0x7fffffff;
  let focusRow = 0;
  let focusWork: Work | null = null;
  let last = performance.now();

  // クリック→遷移(§7.2): 表示中の変形済み矩形に対する点包含判定
  pointer.onClick((cx, cy) => {
    const g = geometry();
    const px = pointer.state.panX;
    const py = pointer.state.panY;
    const c0 = Math.floor(px / g.cellW) - 1;
    const c1 = Math.ceil((px + vw) / g.cellW) + 1;
    const r0 = Math.floor(py / g.cellH) - 1;
    const r1 = Math.ceil((py + vh) / g.cellH) + 1;
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        const si = stateIndex(col, row);
        if ((lastCol[si] as number) !== col || (lastRow[si] as number) !== row) continue;
        const hw = (dispW[si] as number) / 2;
        const hh = (dispHt[si] as number) / 2;
        const sx = (dispX[si] as number) - px;
        const sy = (dispY[si] as number) - py;
        if (Math.abs(cx - sx) <= hw && Math.abs(cy - sy) <= hh) {
          const w = works[workAt(table, CONFIG.patternSize, col, row)] as Work;
          if (CONFIG.openInNewTab) window.open(w.url, '_blank', 'noopener,noreferrer');
          else location.href = w.url;
          return;
        }
      }
    }
  });

  /** グリッド寸法(§3.1)。maxInstances 超過時はセルを自動拡大 */
  function geometry(): { cellW: number; cellH: number } {
    let cellH = vh * CONFIG.cellFraction;
    let cellW = cellH * CONFIG.cellAspect;
    const m = CONFIG.windowMargin;
    const count = (Math.ceil(vw / cellW) + 2 * m + 1) * (Math.ceil(vh / cellH) + 2 * m + 1);
    if (count > CONFIG.maxInstances) {
      const f = Math.sqrt(count / CONFIG.maxInstances);
      cellH *= f;
      cellW *= f;
    }
    return { cellW, cellH };
  }

  function stateIndex(col: number, row: number): number {
    const c = ((col % STATE_N) + STATE_N) % STATE_N;
    const r = ((row % STATE_N) + STATE_N) % STATE_N;
    return r * STATE_N + c;
  }

  let debug: DebugTools | null = null;
  if (new URLSearchParams(location.search).get('debug') === '1') {
    void import('./debug').then((m) => (debug = m.initDebug()));
  }

  function frame(now: number): void {
    requestAnimationFrame(frame);
    if (document.hidden) {
      last = now;
      return;
    }
    debug?.begin();
    const dt = Math.min(Math.max((now - last) / 1000, 0), 0.1);
    last = now;

    pointer.update(dt);
    const ps = pointer.state;

    // レンズ開閉(§4.5)
    const closing = ps.dragging || ps.speed > CONFIG.closeSpeed;
    const target = closing ? CONFIG.lensMin : 1;
    const k = dtLerp(closing ? CONFIG.lensCloseLerp : CONFIG.lensOpenLerp, dt);
    lensAmount += (target - lensAmount) * k;
    overlay.setDim(lensAmount < 0.55);

    if (fade < 1) fade = Math.min(1, fade + dt / 0.6);

    // レンズ形状(毎フレーム config を反映 — GUI 調整対応)
    shape.radius = Math.min(vw, vh) * CONFIG.lensRadiusFraction;
    shape.tailEnd = CONFIG.tailEnd;
    shape.maxScale = CONFIG.maxScale;
    shape.minScale = CONFIG.minScale;

    const g = geometry();
    const px = ps.panX;
    const py = ps.panY;
    const lensWX = ps.lensX + px; // レンズ中心(ワールド)
    const lensWY = ps.lensY + py;

    const m = CONFIG.windowMargin;
    const c0 = Math.floor(px / g.cellW) - m;
    const c1 = Math.ceil((px + vw) / g.cellW) + m;
    const r0 = Math.floor(py / g.cellH) - m;
    const r1 = Math.ceil((py + vh) / g.cellH) + m;

    // 注視タイル(§7.1): レンズ中心に最も近いセルをCPU座標から直接検索
    let bestD = Infinity;
    let bestCol = focusCol;
    let bestRow = focusRow;

    const data = renderer.instanceData;
    const tailPx = shape.radius * shape.tailEnd;

    // パス1: 可視窓+外周1セルの中心を写像 → パス2で隣接実距離からタイル寸法を決める(§4.2)
    const gc0 = c0 - 1;
    const gr0 = r0 - 1;
    const gcols = c1 - gc0 + 2;
    const grows = r1 - gr0 + 2;
    if (gcols * grows <= SCRATCH) {
      for (let row = gr0; row < gr0 + grows; row++) {
        for (let col = gc0; col < gc0 + gcols; col++) {
          mapPoint(
            (col + 0.5) * g.cellW,
            (row + 0.5) * g.cellH,
            lensWX,
            lensWY,
            shape,
            lensAmount,
            tmp,
            0,
          );
          const gi = (row - gr0) * gcols + (col - gc0);
          gridX[gi] = tmp[0] as number;
          gridY[gi] = tmp[1] as number;
        }
      }
      fitRects(gridX, gridY, gcols, grows, CONFIG.gapBase, 2, gridOX, gridOY, gridW, gridH);
    }

    let n = 0;
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        if (n >= CONFIG.maxInstances) break;
        const cx = (col + 0.5) * g.cellW;
        const cy = (row + 0.5) * g.cellH;
        const gi = (row - gr0) * gcols + (col - gc0);

        // 波の航跡(§4.6): セル毎の時間平滑。セルの正体が変わったらスナップ
        const si = stateIndex(col, row);
        const fresh = (lastCol[si] as number) !== col || (lastRow[si] as number) !== row;
        if (fresh) {
          lastCol[si] = col;
          lastRow[si] = row;
          dispX[si] = gridOX[gi] as number;
          dispY[si] = gridOY[gi] as number;
          dispW[si] = gridW[gi] as number;
          dispHt[si] = gridH[gi] as number;
          dispHl[si] = 0;
        } else {
          const dCell = Math.hypot(cx - lensWX, cy - lensWY);
          const lag = 1 - CONFIG.waveLag * Math.min(dCell / tailPx, 1);
          const kc = dtLerp(CONFIG.lerpCellBase * lag, dt);
          dispX[si] =
            (dispX[si] as number) + ((gridOX[gi] as number) - (dispX[si] as number)) * kc;
          dispY[si] =
            (dispY[si] as number) + ((gridOY[gi] as number) - (dispY[si] as number)) * kc;
          dispW[si] = (dispW[si] as number) + ((gridW[gi] as number) - (dispW[si] as number)) * kc;
          dispHt[si] =
            (dispHt[si] as number) + ((gridH[gi] as number) - (dispHt[si] as number)) * kc;
        }

        const sx = (dispX[si] as number) - px; // スクリーン座標
        const sy = (dispY[si] as number) - py;
        const w = dispW[si] as number;
        const h = dispHt[si] as number;
        // カリング: 画面外はバッファに書かない
        if (sx + w / 2 < 0 || sx - w / 2 > vw || sy + h / 2 < 0 || sy - h / 2 > vh) continue;

        // 注視候補(スクリーン上でレンズ中心に最も近い)
        const fd = Math.hypot(sx - ps.lensX, sy - ps.lensY);
        if (fd < bestD) {
          bestD = fd;
          bestCol = col;
          bestRow = row;
        }

        // ハイライトのクロスフェード(§5.4)
        const hTarget = CONFIG.focusHighlight && col === focusCol && row === focusRow ? 1 : 0;
        dispHl[si] = (dispHl[si] as number) + (hTarget - (dispHl[si] as number)) * dtLerp(0.25, dt);

        // ヴィネット/彩度(§5.4): レンズ中心からの距離で減衰
        const dCell = Math.hypot(cx - lensWX, cy - lensWY);
        const vig = Math.min(dCell / tailPx, 1);
        const ease = vig * vig * (3 - 2 * vig); // smoothstep
        const brightness = 1 - (1 - CONFIG.vignetteMin) * ease;
        const sat = 1 - (1 - CONFIG.desatMin) * ease;

        const wi = workAt(table, CONFIG.patternSize, col, row);
        const o = n * STRIDE;
        data[o] = sx;
        data[o + 1] = sy;
        data[o + 2] = w;
        data[o + 3] = h;
        data[o + 4] = uv[wi * 4] as number;
        data[o + 5] = uv[wi * 4 + 1] as number;
        data[o + 6] = uv[wi * 4 + 2] as number;
        data[o + 7] = uv[wi * 4 + 3] as number;
        data[o + 8] = brightness;
        data[o + 9] = sat;
        data[o + 10] = (dispHl[si] as number) * lensAmount;
        n++;
      }
    }

    if (bestCol !== focusCol || bestRow !== focusRow) {
      focusCol = bestCol;
      focusRow = bestRow;
      focusWork = works[workAt(table, CONFIG.patternSize, focusCol, focusRow)] ?? null;
    }
    overlay.setWork(focusWork);
    canvas.classList.toggle('fine', ps.fine && !ps.dragging);
    canvas.classList.toggle('dragging', ps.dragging);

    renderer.draw(n, vw, vh, fade);
    debug?.end();
  }
  requestAnimationFrame(frame);
}

void boot();
