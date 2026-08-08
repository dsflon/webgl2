/**
 * テクスチャアトラスの実行時生成(仕様 §5.2)。
 * 全作品画像を 512×320(8:5) の枠へ cover で焼き込む。works ≤ 16 なら 2048²、以降 4096²。
 * 焼き込みはチャンク分割し、1タスク 16ms 以下(§8)。ロード失敗はプレースホルダ(§6)。
 */
import { CONFIG } from '../config';
import type { Work } from '../data/works';

export interface AtlasResult {
  canvas: HTMLCanvasElement;
  /** work index → [u, v, w, h](アトラスUV矩形) */
  uv: Float32Array;
  size: number;
  failed: ReadonlySet<string>;
}

function nextFrame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()));
}

/** 同時 loadConcurrency 本で画像を並列ロード(§6)。失敗は null */
async function loadImages(
  works: readonly Work[],
  onProgress: (done: number) => void,
): Promise<(HTMLImageElement | null)[]> {
  const out: (HTMLImageElement | null)[] = new Array<HTMLImageElement | null>(works.length).fill(null);
  let next = 0;
  let done = 0;
  async function worker(): Promise<void> {
    while (next < works.length) {
      const i = next++;
      const w = works[i] as Work;
      try {
        out[i] = await loadImage(w.image);
      } catch {
        console.error(`画像ロード失敗: ${w.image}(プレースホルダで継続)`);
        out[i] = null;
      }
      onProgress(++done);
    }
  }
  const workers: Promise<void>[] = [];
  for (let k = 0; k < Math.min(CONFIG.loadConcurrency, works.length); k++) workers.push(worker());
  await Promise.all(workers);
  return out;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(src));
    img.src = src;
  });
}

export async function buildAtlas(
  works: readonly Work[],
  newIds: ReadonlySet<string>,
  onProgress: (done: number, total: number) => void,
): Promise<AtlasResult> {
  const tw = CONFIG.atlasTileW;
  const th = CONFIG.atlasTileH;
  const size = works.length <= 16 ? 2048 : 4096;
  const cols = Math.floor(size / tw);
  const rows = Math.floor(size / th);
  if (works.length > cols * rows) {
    // 仕様§5.2: 64超は複数枚分割だが、現行運用(≤96枠)では到達しない。到達時は明示エラー。
    throw new Error(`アトラス容量超過: ${works.length} > ${cols * rows}`);
  }

  const images = await loadImages(works, (done) => onProgress(done, works.length));

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D コンテキスト取得失敗');
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, size, size);

  const uv = new Float32Array(works.length * 4);
  const failed = new Set<string>();

  // チャンク分割焼き込み: 1フレームの作業を約12msで打ち切り、次フレームへ譲る(§8)
  let start = performance.now();
  for (let i = 0; i < works.length; i++) {
    const w = works[i] as Work;
    const x = (i % cols) * tw;
    const y = ((i / cols) | 0) * th;
    const img = images[i];
    if (img) {
      drawCover(ctx, img, x, y, tw, th);
    } else {
      drawPlaceholder(ctx, w.id, x, y, tw, th);
      failed.add(w.id);
    }
    if (newIds.has(w.id)) drawNewBadge(ctx, x, y);
    // UVは僅かに内側へ(隣枠のにじみ防止)
    const inset = 1;
    uv[i * 4 + 0] = (x + inset) / size;
    uv[i * 4 + 1] = (y + inset) / size;
    uv[i * 4 + 2] = (tw - inset * 2) / size;
    uv[i * 4 + 3] = (th - inset * 2) / size;
    if (performance.now() - start > 12) {
      await nextFrame();
      start = performance.now();
    }
  }
  return { canvas, uv, size, failed };
}

/** cover 切り抜き(§5.2): アスペクト比の差はここで吸収 */
function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const sw = img.naturalWidth;
  const sh = img.naturalHeight;
  const scale = Math.max(w / sw, h / sh);
  const cw = w / scale;
  const ch = h / scale;
  const sx = (sw - cw) / 2;
  const sy = (sh - ch) / 2;
  ctx.drawImage(img, sx, sy, cw, ch, x, y, w, h);
}

/** 新着バッジ(§7.4): タイル左上に金地の NEW を焼き込む */
function drawNewBadge(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const m = 14;
  const bw = 96;
  const bh = 38;
  const r = 10;
  ctx.beginPath();
  ctx.roundRect(x + m, y + m, bw, bh, r);
  ctx.fillStyle = '#d9a83c';
  ctx.fill();
  ctx.fillStyle = '#0a0a0a';
  ctx.font = '700 24px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('NEW', x + m + bw / 2, y + m + bh / 2 + 1);
}

/** ロード失敗時のプレースホルダ: 単色 + IDテキスト(§6) */
function drawPlaceholder(
  ctx: CanvasRenderingContext2D,
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  ctx.fillStyle = '#1c1f26';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#97a0ad';
  ctx.font = `${Math.floor(h / 8)}px ui-monospace, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(id, x + w / 2, y + h / 2, w * 0.9);
}
