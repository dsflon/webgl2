import { describe, it, expect } from 'vitest';
import { buildAssignment, workAt, hashCell } from '../src/gfx/grid';

const SIZE = 48;

function neighborsOk(table: Int32Array, size: number): boolean {
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const v = table[row * size + col];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const c = (col + dx + size) % size;
          const r = (row + dy + size) % size;
          if (table[r * size + c] === v) return false;
        }
      }
    }
  }
  return true;
}

describe('トーラス周期割当表(§3.2)', () => {
  it('同一seedで完全に決定的', () => {
    const a = buildAssignment(42, 33, SIZE);
    const b = buildAssignment(42, 33, SIZE);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('seedが変わると配置が変わる', () => {
    const a = buildAssignment(42, 33, SIZE);
    const b = buildAssignment(43, 33, SIZE);
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });

  it('全セルが割当済み', () => {
    const t = buildAssignment(42, 33, SIZE);
    expect(Array.from(t).every((v) => v >= 0 && v < 33)).toBe(true);
  });

  it('8近傍(周期境界のラップ含む)に同一作品が並ばない(works≥9)', () => {
    for (const seed of [1, 2, 42, 999]) {
      for (const count of [9, 20, 33, 120]) {
        expect(neighborsOk(buildAssignment(seed, count, SIZE), SIZE)).toBe(true);
      }
    }
  });

  it('全作品が最低1回登場する(受け入れ §14)', () => {
    for (const count of [9, 33, 500]) {
      const t = buildAssignment(42, count, SIZE);
      const seen = new Set(Array.from(t));
      expect(seen.size).toBe(count);
    }
  });

  it('works<9 はベストエフォートで全セル割当(クラッシュしない)', () => {
    for (const count of [1, 2, 4, 8]) {
      const t = buildAssignment(42, count, SIZE);
      expect(Array.from(t).every((v) => v >= 0 && v < count)).toBe(true);
    }
  });

  it('workAt は負座標・範囲外座標でも周期参照できる', () => {
    const t = buildAssignment(42, 33, SIZE);
    expect(workAt(t, SIZE, -1, -1)).toBe(workAt(t, SIZE, SIZE - 1, SIZE - 1));
    expect(workAt(t, SIZE, SIZE * 5 + 3, SIZE * -7 + 4)).toBe(workAt(t, SIZE, 3, 4));
  });

  it('hashCell は決定的で引数に敏感', () => {
    expect(hashCell(1, 2, 42)).toBe(hashCell(1, 2, 42));
    expect(hashCell(1, 2, 42)).not.toBe(hashCell(2, 1, 42));
    expect(hashCell(1, 2, 42)).not.toBe(hashCell(1, 2, 43));
  });
});
