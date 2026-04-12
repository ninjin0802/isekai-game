import type { MapSquare, SquareType } from '@isekai/shared';
import { BOARD_SIZE } from '@isekai/shared';
import { seededRandom } from '../utils/seededRandom';

/**
 * Monster tier by board position:
 *   0–33%  → slime
 *   34–66% → orc
 *   67–89% → demon
 *   90%+   → dragon (boss square only)
 */
function monsterForPosition(index: number): 'slime' | 'orc' | 'demon' | 'dragon' {
  const pct = index / BOARD_SIZE;
  if (pct < 0.34) return 'slime';
  if (pct < 0.67) return 'orc';
  return 'demon';
}

/**
 * Square type weights by map third:
 *   Early (0–33%)  battle:45 shop:15 recovery:25 event:15
 *   Mid   (34–66%) battle:40 shop:15 recovery:20 event:25
 *   Late  (67%+)   battle:50 shop:10 recovery:15 event:25
 */
function weightedSquareType(index: number, rng: () => number): SquareType {
  const pct = index / BOARD_SIZE;

  let weights: [SquareType, number][];
  if (pct < 0.34) {
    weights = [['battle', 45], ['shop', 15], ['recovery', 25], ['event', 15]];
  } else if (pct < 0.67) {
    weights = [['battle', 40], ['shop', 15], ['recovery', 20], ['event', 25]];
  } else {
    weights = [['battle', 50], ['shop', 10], ['recovery', 15], ['event', 25]];
  }

  const total = weights.reduce((s, [, w]) => s + w, 0);
  let roll = rng() * total;
  for (const [type, w] of weights) {
    roll -= w;
    if (roll <= 0) return type;
  }
  return 'battle';
}

/**
 * Generate a deterministic board from `seed`.
 * Square 0 is always the start (recovery-like, no event).
 * Last square (BOARD_SIZE - 1) is always the boss.
 */
export function generateMap(seed: number): MapSquare[] {
  const rng = seededRandom(seed);
  const squares: MapSquare[] = [];

  // Square 0 — start
  squares.push({ index: 0, type: 'recovery' });

  for (let i = 1; i < BOARD_SIZE - 1; i++) {
    const type = weightedSquareType(i, rng);
    const square: MapSquare = { index: i, type };
    if (type === 'battle') {
      square.monsterId = monsterForPosition(i);
    }
    squares.push(square);
  }

  // Last square — dragon boss
  squares.push({ index: BOARD_SIZE - 1, type: 'boss', monsterId: 'dragon' });

  return squares;
}
