/**
 * フォールバック静的グリッド(仕様 §9)。
 * WebGL2不可 / works.json 失敗 / コンテキスト復帰失敗時に、CSSグリッドの通常リンク一覧を出す。
 * デザインは旧トップ「黒の展示室」の簡約版。エフェクトなしでも全作品の閲覧・遷移が成立する。
 */
import type { Work } from '../data/works';

export function showFallback(works: readonly Work[] | null): void {
  document.getElementById('stage')?.remove();
  document.getElementById('overlay')?.remove();
  document.getElementById('progress')?.remove();
  const main = document.getElementById('fallback');
  if (!main) return;
  main.hidden = false;

  const header = document.createElement('header');
  const h1 = document.createElement('h1');
  h1.textContent = 'WEBGL2 — Realtime Graphics Experiments';
  const p = document.createElement('p');
  p.className = 'fb-note';
  p.textContent =
    'WebGL2 でリアルタイムのグラフィック表現を実験している作品集。' +
    (works ? '' : '作品データの取得に失敗しました。再読み込みをお試しください。');
  header.append(h1, p);
  main.appendChild(header);

  if (!works) return;
  const grid = document.createElement('div');
  grid.className = 'fb-grid';
  for (const w of works) {
    const a = document.createElement('a');
    a.className = 'fb-card';
    a.href = w.url;
    const img = document.createElement('img');
    img.src = w.image;
    img.alt = '';
    img.loading = 'lazy';
    img.width = 800;
    img.height = 500;
    const t = document.createElement('h2');
    t.textContent = w.title;
    const meta = document.createElement('p');
    meta.className = 'fb-meta';
    meta.textContent = [w.date, w.tags.join(' / ')].filter(Boolean).join(' — ');
    a.append(img, t, meta);
    grid.appendChild(a);
  }
  main.appendChild(grid);
}
