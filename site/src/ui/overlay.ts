/**
 * 注視タイルのメタデータ表示 + ローディング進捗(仕様 §6, §7.1)。
 * タイトル(大)・日付(小・年月)・タグチップ。切替は150msクロスフェード。
 */
import type { Work } from '../data/works';

const FADE_MS = 150;

export class Overlay {
  private root = byId('overlay');
  private title = byId('ov-title');
  private date = byId('ov-date');
  private tags = byId('ov-tags');
  private progress = byId('progress');
  private pDone = byId('p-done');
  private pTotal = byId('p-total');
  private pFill = byId('p-fill');
  private currentId = '';
  private timer = 0;

  setWork(work: Work | null, isNew = false): void {
    const id = work ? work.id : '';
    if (id === this.currentId) return;
    this.currentId = id;
    this.root.classList.add('ov-fading');
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      if (work) {
        this.title.textContent = work.title;
        this.date.textContent = work.date ? work.date.slice(0, 7).replace('-', '.') : '';
        const chips = work.tags.map((t) => {
          const el = document.createElement('span');
          el.className = 'chip';
          el.textContent = t;
          return el;
        });
        if (isNew) {
          const el = document.createElement('span');
          el.className = 'chip chip-new';
          el.textContent = 'NEW';
          chips.unshift(el);
        }
        this.tags.replaceChildren(...chips);
      } else {
        this.title.textContent = '';
        this.date.textContent = '';
        this.tags.replaceChildren();
      }
      this.root.classList.remove('ov-fading');
    }, FADE_MS);
  }

  /** レンズが閉じている間の減光(§7.1) */
  setDim(dim: boolean): void {
    this.root.classList.toggle('ov-dim', dim);
  }

  setProgress(done: number, total: number): void {
    this.pDone.textContent = String(done);
    this.pTotal.textContent = String(total);
    this.pFill.style.width = total > 0 ? `${(done / total) * 100}%` : '0%';
  }

  hideProgress(): void {
    this.progress.classList.add('done');
    window.setTimeout(() => this.progress.remove(), 700);
  }
}

/** sr-only の実体リンク一覧(§7.3)。Tab移動・スクリーンリーダー・クローラー用 */
export function renderWorksNav(works: readonly Work[]): void {
  const nav = byId('works-nav');
  const ul = document.createElement('ul');
  for (const w of works) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = w.url;
    a.textContent = `${w.title} (${w.date})`;
    li.appendChild(a);
    ul.appendChild(li);
  }
  nav.replaceChildren(ul);
}

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} が見つかりません`);
  return el;
}
