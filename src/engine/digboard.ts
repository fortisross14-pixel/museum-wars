/* ============================================================
   ENGINE — EXPEDITION DIG BOARD  ( src/engine/ )
   A minesweeper-inverted board. Tiles hide:
     bomb   — a "lose everything" tile
     danger — a hint: a bomb sits in an orthogonal neighbour
     clue   — a hint: a find (artifact/shard) sits in a neighbour
     find   — an artifact or a shard cache
     empty  — nothing
   The player reveals tiles up to a dig limit. Hitting more bombs
   than the tier tolerates ejects them with nothing. Banking is
   always safe; the risk is purely in digging on.
   Pure logic — the UI owns timing and presentation.
   ============================================================ */
import type { ExpeditionTierDef } from '../data/constants';
import { randInt } from './util';

export type TileKind = 'bomb' | 'danger' | 'clue' | 'find' | 'empty';
export type FindKind = 'artifact' | 'shard';

export interface DigTile {
  kind: TileKind;
  findKind?: FindKind;     // when kind === 'find'
  shardAmount?: number;    // when findKind === 'shard'
  revealed: boolean;
}

export interface DigBoard {
  size: number;
  tiles: DigTile[];        // length size*size, row-major
  digsLeft: number;
  bombsHit: number;
  bombTolerance: number;
  artifactsFound: number;
  shardsBanked: number;
  ejected: boolean;        // hit too many bombs — run over, nothing kept
  finished: boolean;       // player banked, or ejected, or out of digs
}

const idx = (size: number, r: number, c: number) => r * size + c;

/** orthogonal neighbour indices of a cell */
function neighbours(size: number, i: number): number[] {
  const r = Math.floor(i / size), c = i % size;
  const out: number[] = [];
  if (r > 0) out.push(idx(size, r - 1, c));
  if (r < size - 1) out.push(idx(size, r + 1, c));
  if (c > 0) out.push(idx(size, r, c - 1));
  if (c < size - 1) out.push(idx(size, r, c + 1));
  return out;
}

/** Build a fresh board for a tier. Bombs, then artifact/shard
 *  finds, are scattered; danger and clue hints are derived from
 *  what sits next to each remaining empty tile.
 *  `bonusDigs` and `bonusTolerance` come from explorer staff. */
export function makeBoard(
  def: ExpeditionTierDef, bonusDigs = 0, bonusTolerance = 0,
): DigBoard {
  const size = def.gridSize;
  const n = size * size;
  const kind: TileKind[] = new Array(n).fill('empty');
  const findKind: (FindKind | undefined)[] = new Array(n).fill(undefined);
  const shardAmount: (number | undefined)[] = new Array(n).fill(undefined);

  // a shuffled list of all cell indices to place things into
  const free = Array.from({ length: n }, (_, i) => i);
  for (let i = free.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [free[i], free[j]] = [free[j], free[i]];
  }
  let p = 0;
  const take = () => free[p++];

  // bombs
  for (let b = 0; b < def.bombs; b++) kind[take()] = 'bomb';
  // whole-artifact finds
  for (let a = 0; a < def.artifacts; a++) {
    const i = take(); kind[i] = 'find'; findKind[i] = 'artifact';
  }
  // shard caches
  for (let sct = 0; sct < def.shardTiles; sct++) {
    const i = take(); kind[i] = 'find'; findKind[i] = 'shard';
    // each cache holds a few shards; rarer tiers a touch richer
    shardAmount[i] = randInt(2, def.id === 'epic' ? 5 : 4);
  }

  // derive hints: any still-empty tile next to a bomb becomes a
  // danger hint; next to a find becomes a clue hint. Bomb-adjacency
  // takes priority — a danger warning matters more than a clue.
  for (let i = 0; i < n; i++) {
    if (kind[i] !== 'empty') continue;
    const nb = neighbours(size, i);
    if (nb.some(j => kind[j] === 'bomb')) kind[i] = 'danger';
    else if (nb.some(j => kind[j] === 'find')) kind[i] = 'clue';
  }

  return {
    size,
    tiles: kind.map((k, i) => ({
      kind: k,
      findKind: findKind[i],
      shardAmount: shardAmount[i],
      revealed: false,
    })),
    digsLeft: def.digs + bonusDigs,
    bombsHit: 0,
    bombTolerance: def.bombTolerance + bonusTolerance,
    artifactsFound: 0,
    shardsBanked: 0,
    ejected: false,
    finished: false,
  };
}

/** Reveal a tile. Returns a new board. Revealing a bomb may eject
 *  the player; revealing a find banks it; running out of digs
 *  finishes the run (the player keeps what was banked). */
export function revealTile(board: DigBoard, i: number): DigBoard {
  if (board.finished) return board;
  const tile = board.tiles[i];
  if (tile.revealed || board.digsLeft <= 0) return board;

  const tiles = board.tiles.map((t, j) =>
    j === i ? { ...t, revealed: true } : t);
  let { bombsHit, artifactsFound, shardsBanked } = board;
  const digsLeft = board.digsLeft - 1;
  let ejected = false;

  if (tile.kind === 'bomb') {
    bombsHit += 1;
    if (bombsHit >= board.bombTolerance) ejected = true;
  } else if (tile.kind === 'find') {
    if (tile.findKind === 'artifact') artifactsFound += 1;
    else shardsBanked += tile.shardAmount || 0;
  }

  const finished = ejected || digsLeft <= 0;
  return {
    ...board, tiles, digsLeft, bombsHit,
    artifactsFound, shardsBanked, ejected, finished,
  };
}

/** The player chooses to stop and bank. Safe — keeps everything
 *  found so far. */
export function bankBoard(board: DigBoard): DigBoard {
  if (board.finished) return board;
  return { ...board, finished: true };
}

/** What the player walks away with. If ejected, nothing. */
export function boardResult(board: DigBoard):
  { artifacts: number; shards: number } {
  if (board.ejected) return { artifacts: 0, shards: 0 };
  return { artifacts: board.artifactsFound, shards: board.shardsBanked };
}
