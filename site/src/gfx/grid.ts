/**
 * トーラス周期の決定的作品割当(仕様 §3.2)。
 * 起動時に seed から N×N の割当表を生成し、実行時はセル座標の剰余で O(1) 参照する。
 * 制約: 8近傍(周期境界のラップ含む)に同一作品IDが来ない。全作品が最低1回登場する。
 */

/** mulberry32 — 決定的な軽量PRNG */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** セル座標+seed の決定的ハッシュ(0..2^32) */
export function hashCell(col: number, row: number, seed: number): number {
  let h = seed >>> 0;
  h = Math.imul(h ^ (col | 0), 0x9e3779b1);
  h = (h << 13) | (h >>> 19);
  h = Math.imul(h ^ (row | 0), 0x85ebca77);
  h ^= h >>> 16;
  return h >>> 0;
}

const NEIGHBORS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
];

/**
 * N×N トーラス割当表を生成する。返り値は長さ N*N の workIndex 配列(row*N+col)。
 * 1) 各作品を seed 順のシャッフル位置へ1つずつ先置き(全作品出現の保証)
 * 2) 残りセルを行順に hash+線形プローブで充填。割当済みの8近傍(ラップ含む)と重複しない
 *    候補を選ぶ。works < 9 のときはベストエフォート(プローブ一周で妥協)。
 */
export function buildAssignment(seed: number, worksCount: number, size: number): Int32Array {
  if (worksCount < 1) throw new Error('worksCount must be >= 1');
  const n = size * size;
  const table = new Int32Array(n).fill(-1);
  const rng = mulberry32(seed);

  // --- 1) 先置き: 全作品の出現保証 ---
  const cells = new Int32Array(n);
  for (let i = 0; i < n; i++) cells[i] = i;
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = cells[i] as number;
    cells[i] = cells[j] as number;
    cells[j] = t;
  }
  let placed = 0;
  for (let ci = 0; ci < n && placed < Math.min(worksCount, n); ci++) {
    const cell = cells[ci] as number;
    const col = cell % size;
    const row = (cell / size) | 0;
    if (conflicts(table, size, col, row, placed)) continue;
    table[cell] = placed;
    placed++;
  }

  // --- 2) 充填: 行順 + hash + 線形プローブ ---
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const idx = row * size + col;
      if (table[idx] !== -1) continue;
      const start = hashCell(col, row, seed) % worksCount;
      let chosen = start;
      for (let step = 0; step < worksCount; step++) {
        const cand = (start + step) % worksCount;
        if (!conflicts(table, size, col, row, cand)) {
          chosen = cand;
          break;
        }
        chosen = cand; // 全滅時(works<9)は最後の候補で妥協 = ベストエフォート
      }
      table[idx] = chosen;
    }
  }
  return table;
}

/** (col,row) に work を置いたとき、割当済みの8近傍(トーラス)と重複するか */
function conflicts(table: Int32Array, size: number, col: number, row: number, work: number): boolean {
  for (const [dx, dy] of NEIGHBORS) {
    const c = (col + dx + size) % size;
    const r = (row + dy + size) % size;
    const v = table[r * size + c] as number;
    if (v === work) return true;
  }
  return false;
}

/** 実行時参照: 論理セル (col,row) の作品インデックス */
export function workAt(table: Int32Array, size: number, col: number, row: number): number {
  const c = ((col % size) + size) % size;
  const r = ((row % size) + size) % size;
  return table[r * size + c] as number;
}
