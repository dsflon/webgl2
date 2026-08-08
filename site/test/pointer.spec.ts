import { describe, it, expect } from 'vitest';
import { isClick } from '../src/input/pointer';
import { dtLerp } from '../src/config';

describe('クリック/ドラッグ判別(§7.2)', () => {
  it('移動6px未満かつ500ms未満のみクリック', () => {
    expect(isClick(0, 0, 6, 500)).toBe(true);
    expect(isClick(5.9, 499, 6, 500)).toBe(true);
    expect(isClick(6, 100, 6, 500)).toBe(false); // 6pxちょうどはドラッグ
    expect(isClick(3, 500, 6, 500)).toBe(false); // 500msちょうどは対象外
    expect(isClick(30, 100, 6, 500)).toBe(false);
  });
});

describe('dt正規化Lerp(§4.3)', () => {
  it('120Hzで2フレーム = 60Hzで1フレーム(体感速度が一致)', () => {
    for (const k of [0.05, 0.12, 0.35, 0.8]) {
      const oneStep60 = dtLerp(k, 1 / 60);
      const k120 = dtLerp(k, 1 / 120);
      const twoStep120 = 1 - (1 - k120) * (1 - k120);
      expect(twoStep120).toBeCloseTo(oneStep60, 10);
    }
  });

  it('144Hzでも同様(12フレーム ≒ 60Hzの5フレーム)', () => {
    const k = 0.12;
    const after60 = 1 - Math.pow(1 - dtLerp(k, 1 / 60), 5);
    const after144 = 1 - Math.pow(1 - dtLerp(k, 1 / 144), 12);
    expect(after144).toBeCloseTo(after60, 10);
  });
});
