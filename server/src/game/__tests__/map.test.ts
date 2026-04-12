import { describe, it, expect } from 'vitest';
import { generateMap } from '../map';
import { BOARD_SIZE } from '@isekai/shared';

// ─── generateMap ──────────────────────────────────────────────────────────────

describe('generateMap', () => {
  it('BOARD_SIZE 個のマスを生成する', () => {
    const map = generateMap(42);
    expect(map).toHaveLength(BOARD_SIZE);
  });

  it('各マスの index が 0 から BOARD_SIZE-1 まで順番通り', () => {
    const map = generateMap(42);
    map.forEach((sq, i) => {
      expect(sq.index).toBe(i);
    });
  });

  it('最初のマス（index 0）は recovery（スタートマス）', () => {
    const map = generateMap(42);
    expect(map[0].type).toBe('recovery');
    expect(map[0].index).toBe(0);
  });

  it('最後のマス（index BOARD_SIZE-1）はボスマス（boss / dragon）', () => {
    const map = generateMap(42);
    const last = map[BOARD_SIZE - 1];
    expect(last.type).toBe('boss');
    expect(last.monsterId).toBe('dragon');
  });

  it('同じシードから生成したマップは同一（決定論的）', () => {
    const map1 = generateMap(12345);
    const map2 = generateMap(12345);
    expect(map1).toEqual(map2);
  });

  it('異なるシードは異なるマップを生成する（高確率）', () => {
    const map1 = generateMap(111);
    const map2 = generateMap(999);
    // Compare middle section — at least some squares differ
    const differ = map1.some((sq, i) => sq.type !== map2[i].type);
    expect(differ).toBe(true);
  });

  it('battle マスには monsterId が設定される', () => {
    const map = generateMap(42);
    const battleSquares = map.filter(s => s.type === 'battle');
    for (const sq of battleSquares) {
      expect(sq.monsterId).toBeTruthy();
    }
  });

  it('battle でも boss でもないマスに monsterId は設定されない', () => {
    const map = generateMap(42);
    const nonCombat = map.filter(s => s.type !== 'battle' && s.type !== 'boss');
    for (const sq of nonCombat) {
      expect(sq.monsterId).toBeUndefined();
    }
  });

  it('中間マスには battle / shop / recovery / event のいずれかが割り当てられる', () => {
    const map = generateMap(42);
    const validTypes = new Set(['battle', 'shop', 'recovery', 'event']);
    const midSquares = map.slice(1, BOARD_SIZE - 1);
    for (const sq of midSquares) {
      expect(validTypes.has(sq.type)).toBe(true);
    }
  });

  it('早期ゾーン（index 1–13）の battle マスには slime か orc が配置される', () => {
    const map = generateMap(42);
    const earlyBattles = map.slice(1, 14).filter(s => s.type === 'battle');
    for (const sq of earlyBattles) {
      // Tier 1-2 monsters in early zone (slime or orc, not demon)
      expect(['slime', 'orc']).toContain(sq.monsterId);
    }
  });

  it('終盤ゾーン（index 27+）の battle マスには demon が配置される', () => {
    const map = generateMap(42);
    // index 27+ is late zone → should have demon monsters
    const lateBattles = map.slice(27, BOARD_SIZE - 1).filter(s => s.type === 'battle');
    for (const sq of lateBattles) {
      expect(sq.monsterId).toBe('demon');
    }
  });
});
