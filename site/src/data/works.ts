/**
 * works.json(既存スキーマが正)の取得・検証・内部型への変換(仕様 §2)。
 * 既存スキーマ: slug/file/title/date/desc/model/tags/series/thumb
 * 内部型: id/title/url/image/date/tags — 以降のモジュールは内部型のみに依存する。
 */
export interface Work {
  id: string;
  title: string;
  url: string;
  image: string;
  date: string;
  tags: readonly string[];
}

const ID_RE = /^[\w-]+$/;

/** 1エントリの検証+変換。不正なら理由を throw せず null(呼び出し側でスキップ) */
export function adaptEntry(raw: unknown): Work | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const { slug, file, title, thumb } = r;
  if (typeof slug !== 'string' || !ID_RE.test(slug)) return null;
  if (typeof file !== 'string' || file.length === 0) return null;
  if (typeof title !== 'string' || title.length === 0) return null;
  if (typeof thumb !== 'string' || thumb.length === 0) return null;
  const date = typeof r.date === 'string' ? r.date : '';
  const tags = Array.isArray(r.tags) ? r.tags.filter((t): t is string => typeof t === 'string') : [];
  return { id: slug, title, url: file, image: thumb, date, tags };
}

/** 配列全体の検証。不正エントリは console.error のうえスキップし、全体は継続(§2) */
export function adaptWorks(json: unknown): Work[] {
  if (!Array.isArray(json)) throw new Error('works.json: 配列ではありません');
  const out: Work[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < json.length; i++) {
    const w = adaptEntry(json[i]);
    if (w === null) {
      console.error(`works.json[${i}]: スキーマ不正のためスキップ`, json[i]);
      continue;
    }
    if (seen.has(w.id)) {
      console.error(`works.json[${i}]: id重複(${w.id})のためスキップ`);
      continue;
    }
    seen.add(w.id);
    out.push(w);
  }
  if (out.length < 1) throw new Error('works.json: 有効な作品が0件です');
  return out;
}

export async function fetchWorks(): Promise<Work[]> {
  const res = await fetch('works.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`works.json: HTTP ${res.status}`);
  return adaptWorks((await res.json()) as unknown);
}

/** date(YYYY-MM-DD)が now から days 日以内なら新着(§7.4)。不正な日付は false */
export function isNewWork(date: string, now: number, days: number): boolean {
  if (days <= 0) return false;
  const t = Date.parse(date);
  if (Number.isNaN(t)) return false;
  return now - t <= days * 86400000;
}

/**
 * NEW バッジ対象の作品ID集合(§7.4): date が days 日以内、かつ新しい順に最大 max 件。
 * 制作ペースが速い時期に NEW が溢れないよう件数で上限を切る。
 */
export function newWorkIds(
  works: readonly Work[],
  now: number,
  days: number,
  max: number,
): Set<string> {
  return new Set(
    works
      .filter((w) => isNewWork(w.date, now, days))
      .slice()
      .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
      .slice(0, Math.max(0, max))
      .map((w) => w.id),
  );
}

/** 最も新しい date を持つ作品のインデックス。有効な日付が無ければ -1 */
export function newestIndex(works: readonly Work[]): number {
  let best = -1;
  let bestT = -Infinity;
  for (let i = 0; i < works.length; i++) {
    const t = Date.parse((works[i] as Work).date);
    if (!Number.isNaN(t) && t > bestT) {
      bestT = t;
      best = i;
    }
  }
  return best;
}
