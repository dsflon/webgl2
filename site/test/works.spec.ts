import { describe, it, expect, vi } from 'vitest';
import { adaptWorks, adaptEntry } from '../src/data/works';

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
