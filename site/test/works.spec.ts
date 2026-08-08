import { describe, it, expect, vi } from 'vitest';
import { adaptWorks, adaptEntry, isNewWork, newWorkIds, newestIndex } from '../src/data/works';
import type { Work } from '../src/data/works';

const valid = {
  slug: 'fable5_mosaic',
  file: 'fable5_mosaic.html',
  title: '黄金地モザイク',
  date: '2026-07-17',
  desc: 'x',
  model: 'Fable 5',
  tags: ['WebGL2'],
  series: 'FABLE5',
  thumb: 'thumbs/fable5_mosaic.jpg',
};

describe('works.json 検証+アダプタ(§2)', () => {
  it('既存スキーマ→内部型へ変換される', () => {
    const w = adaptEntry(valid);
    expect(w).toEqual({
      id: 'fable5_mosaic',
      title: '黄金地モザイク',
      url: 'fable5_mosaic.html',
      image: 'thumbs/fable5_mosaic.jpg',
      date: '2026-07-17',
      tags: ['WebGL2'],
    });
  });

  it('不正エントリはスキップして全体は継続(§2)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const out = adaptWorks([valid, { slug: 'bad slug!' }, null, 42, { ...valid, slug: 'ok-2' }]);
    expect(out.map((w) => w.id)).toEqual(['fable5_mosaic', 'ok-2']);
    expect(spy).toHaveBeenCalledTimes(3);
    spy.mockRestore();
  });

  it('id重複はスキップ', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(adaptWorks([valid, valid]).length).toBe(1);
    spy.mockRestore();
  });

  it('有効0件・非配列はエラー(→フォールバックへ)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => adaptWorks([{ broken: true }])).toThrow();
    expect(() => adaptWorks({})).toThrow();
    spy.mockRestore();
  });

  it('model=null や tags 欠落を許容する(実データ互換)', () => {
    const w = adaptEntry({ ...valid, model: null, tags: undefined });
    expect(w?.tags).toEqual([]);
  });
});

describe('新着表現(§7.4)', () => {
  const NOW = Date.parse('2026-08-08');
  const mk = (id: string, date: string): Work => ({
    id,
    title: id,
    url: `${id}.html`,
    image: `thumbs/${id}.jpg`,
    date,
    tags: [],
  });

  it('isNewWork: 日数以内のみ true、不正日付・無効(0日)は false', () => {
    expect(isNewWork('2026-08-02', NOW, 30)).toBe(true);
    expect(isNewWork('2026-07-01', NOW, 30)).toBe(false);
    expect(isNewWork('', NOW, 30)).toBe(false);
    expect(isNewWork('2026-08-02', NOW, 0)).toBe(false);
  });

  it('newWorkIds: 日数以内かつ新しい順に最大 max 件', () => {
    const works = [
      mk('a', '2026-08-02'),
      mk('b', '2026-07-31'),
      mk('c', '2026-07-29'),
      mk('d', '2026-07-28'),
      mk('e', '2026-06-01'),
    ];
    expect([...newWorkIds(works, NOW, 30, 3)].sort()).toEqual(['a', 'b', 'c']);
    expect(newWorkIds(works, NOW, 30, 0).size).toBe(0);
    expect(newWorkIds(works, NOW, 3, 3).size).toBe(0); // 3日以内は該当なし
  });

  it('newestIndex: 最新 date の作品を返す。日付なしは -1', () => {
    const works = [mk('old', '2026-06-01'), mk('newest', '2026-08-02'), mk('mid', '2026-07-20')];
    expect(newestIndex(works)).toBe(1);
    expect(newestIndex([mk('x', '')])).toBe(-1);
  });
});
