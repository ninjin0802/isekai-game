import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createPvPCombat,
  processPvPAction,
  applyPvPResult,
  PVP_GOLD_REWARD_AMOUNT,
} from '../pvp';
import type { CombatState, Player, GameRoom } from '@isekai/shared';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'p1',
    userId: 'u1',
    username: '勇者',
    position: 5,
    hp: 100,
    maxHp: 100,
    attack: 10,
    defense: 5,
    gold: 500,
    isAlive: true,
    turnOrder: 0,
    inventory: [],
    attackBonus: 0,
    ...overrides,
  };
}

function makeRoom(players: Player[] = []): GameRoom {
  return {
    id: 'room1',
    status: 'playing',
    players,
    currentTurnIndex: 0,
    turnNumber: 1,
    mapSeed: 42,
    map: [],
  };
}

function makePvPActiveState(
  attacker: Player,
  defender: Player,
  overrides: Partial<CombatState> = {}
): CombatState {
  return {
    battleId: 'pvp-battle-1',
    type: 'pvp',
    phase: 'active',
    combatantId: attacker.id,
    opponentId: defender.id,
    combatantHp: attacker.hp,
    opponentHp: defender.hp,
    turn: 'combatant',
    round: 1,
    log: [],
    ...overrides,
  };
}

// ─── createPvPCombat ──────────────────────────────────────────────────────────

describe('createPvPCombat', () => {
  afterEach(() => vi.restoreAllMocks());

  it('PvP CombatState の初期値が正しい', () => {
    const attacker = makePlayer({ id: 'a1', hp: 80 });
    const defender = makePlayer({ id: 'd1', hp: 60 });

    const { state } = createPvPCombat(attacker, defender);

    expect(state.type).toBe('pvp');
    expect(state.phase).toBe('betting');
    expect(state.combatantId).toBe('a1');
    expect(state.opponentId).toBe('d1');
    expect(state.combatantHp).toBe(80);
    expect(state.opponentHp).toBe(60);
    expect(state.log).toEqual([]);
  });

  it('ロールが高い方が先攻（attacker > defender → combatant 先攻）', () => {
    // First call returns 0.9 (attacker=6), second returns 0.1 (defender=1)
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.9).mockReturnValueOnce(0.1);
    const attacker = makePlayer({ id: 'a1' });
    const defender = makePlayer({ id: 'd1' });

    const { state, attackerRoll, defenderRoll } = createPvPCombat(attacker, defender);

    expect(attackerRoll).toBeGreaterThan(defenderRoll);
    expect(state.turn).toBe('combatant');
  });

  it('ロールが低い方が後攻（defender > attacker → opponent 先攻）', () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.1).mockReturnValueOnce(0.9);
    const attacker = makePlayer({ id: 'a1' });
    const defender = makePlayer({ id: 'd1' });

    const { state, attackerRoll, defenderRoll } = createPvPCombat(attacker, defender);

    expect(defenderRoll).toBeGreaterThan(attackerRoll);
    expect(state.turn).toBe('opponent');
  });

  it('ロール同点は attacker 先攻（同点は combatant が有利）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // both roll same
    const attacker = makePlayer({ id: 'a1' });
    const defender = makePlayer({ id: 'd1' });

    const { state } = createPvPCombat(attacker, defender);

    expect(state.turn).toBe('combatant');
  });

  it('attackerRoll と defenderRoll がそれぞれ 1〜6 の範囲', () => {
    const attacker = makePlayer({ id: 'a1' });
    const defender = makePlayer({ id: 'd1' });

    const { attackerRoll, defenderRoll } = createPvPCombat(attacker, defender);

    expect(attackerRoll).toBeGreaterThanOrEqual(1);
    expect(attackerRoll).toBeLessThanOrEqual(6);
    expect(defenderRoll).toBeGreaterThanOrEqual(1);
    expect(defenderRoll).toBeLessThanOrEqual(6);
  });
});

// ─── processPvPAction — attack ────────────────────────────────────────────────

describe('processPvPAction / attack', () => {
  afterEach(() => vi.restoreAllMocks());

  it('攻撃側が defender HP を削る', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // roll=4
    const attacker = makePlayer({ id: 'a1', attack: 10, attackBonus: 0 });
    const defender = makePlayer({ id: 'd1', defense: 5 });
    const state = makePvPActiveState(attacker, defender, { opponentHp: 80 });

    const result = processPvPAction(state, attacker, defender, 'attack');

    expect(result.finished).toBe(false);
    expect(result.state.opponentHp).toBeLessThan(80);
    expect(result.state.turn).toBe('opponent');
  });

  it('defender の HP が 0 になると finished で winnerId が設定される', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // roll=6 → big damage
    const attacker = makePlayer({ id: 'a1', attack: 50, attackBonus: 0 });
    const defender = makePlayer({ id: 'd1', defense: 0 });
    const state = makePvPActiveState(attacker, defender, { opponentHp: 1 });

    const result = processPvPAction(state, attacker, defender, 'attack');

    expect(result.finished).toBe(true);
    expect(result.winnerId).toBe('a1');
    expect(result.loserId).toBe('d1');
    expect(result.state.phase).toBe('finished');
  });

  it('opponent の番に defender が攻撃すると combatantHp が削られる', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const attacker = makePlayer({ id: 'a1', defense: 5 });
    const defender = makePlayer({ id: 'd1', attack: 10, attackBonus: 0 });
    const state = makePvPActiveState(attacker, defender, { turn: 'opponent', combatantHp: 80 });

    const result = processPvPAction(state, defender, attacker, 'attack');

    expect(result.state.combatantHp).toBeLessThan(80);
    expect(result.state.turn).toBe('combatant');
  });

  it('phase が active でない場合はエラーを投げる', () => {
    const attacker = makePlayer({ id: 'a1' });
    const defender = makePlayer({ id: 'd1' });
    const state = makePvPActiveState(attacker, defender, { phase: 'betting' });
    expect(() => processPvPAction(state, attacker, defender, 'attack')).toThrow('戦闘はまだ開始されていません');
  });

  it('自分の turn でない場合はエラーを投げる', () => {
    const attacker = makePlayer({ id: 'a1' });
    const defender = makePlayer({ id: 'd1' });
    const state = makePvPActiveState(attacker, defender, { turn: 'opponent' });
    // attacker tries to act but it's opponent's turn
    expect(() => processPvPAction(state, attacker, defender, 'attack')).toThrow('あなたのターンではありません');
  });
});

// ─── processPvPAction — defend ────────────────────────────────────────────────

describe('processPvPAction / defend', () => {
  it('防御ログを追加して turn が切り替わる', () => {
    const attacker = makePlayer({ id: 'a1' });
    const defender = makePlayer({ id: 'd1' });
    const state = makePvPActiveState(attacker, defender);

    const result = processPvPAction(state, attacker, defender, 'defend');

    expect(result.finished).toBe(false);
    expect(result.state.turn).toBe('opponent');
    expect(result.state.log.some(e => e.action === 'defend')).toBe(true);
  });
});

// ─── processPvPAction — item ──────────────────────────────────────────────────

describe('processPvPAction / item', () => {
  it('ポーション使用で combatantHp が回復する', () => {
    const attacker = makePlayer({ id: 'a1', hp: 50, maxHp: 100 });
    const defender = makePlayer({ id: 'd1' });
    const state = makePvPActiveState(attacker, defender, { combatantHp: 50 });

    const result = processPvPAction(state, attacker, defender, 'item', 'potion');

    expect(result.state.combatantHp).toBe(80); // 50 + 30
    expect(result.state.log.some(e => e.action === 'item')).toBe(true);
  });

  it('スモークボムで引き分け終了（winner なし）', () => {
    const attacker = makePlayer({ id: 'a1' });
    const defender = makePlayer({ id: 'd1' });
    const state = makePvPActiveState(attacker, defender);

    const result = processPvPAction(state, attacker, defender, 'item', 'smoke_bomb');

    expect(result.finished).toBe(true);
    expect(result.winnerId).toBeUndefined();
    expect(result.loserId).toBeUndefined();
  });

  it('itemId が未指定だとエラー', () => {
    const attacker = makePlayer({ id: 'a1' });
    const defender = makePlayer({ id: 'd1' });
    const state = makePvPActiveState(attacker, defender);
    expect(() => processPvPAction(state, attacker, defender, 'item')).toThrow('アイテムIDが必要です');
  });
});

// ─── processPvPAction — flee ──────────────────────────────────────────────────

describe('processPvPAction / flee', () => {
  afterEach(() => vi.restoreAllMocks());

  it('逃走成功（30% チャンス）で引き分け終了', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1); // 0.1 < 0.3 → success
    const attacker = makePlayer({ id: 'a1' });
    const defender = makePlayer({ id: 'd1' });
    const state = makePvPActiveState(attacker, defender);

    const result = processPvPAction(state, attacker, defender, 'flee');

    expect(result.finished).toBe(true);
    expect(result.winnerId).toBeUndefined();
  });

  it('逃走失敗（30% チャンス以上）でゲーム継続', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9); // 0.9 >= 0.3 → fail
    const attacker = makePlayer({ id: 'a1' });
    const defender = makePlayer({ id: 'd1' });
    const state = makePvPActiveState(attacker, defender);

    const result = processPvPAction(state, attacker, defender, 'flee');

    expect(result.finished).toBe(false);
  });
});

// ─── applyPvPResult ───────────────────────────────────────────────────────────

describe('applyPvPResult', () => {
  it('勝者にゴールドが加算される', () => {
    const winner = makePlayer({ id: 'w1', gold: 300 });
    const loser = makePlayer({ id: 'l1', gold: 200 });
    const room = makeRoom([winner, loser]);
    const state = makePvPActiveState(winner, loser, {
      combatantId: 'w1',
      opponentId: 'l1',
      combatantHp: 50,
      opponentHp: 0,
    });

    applyPvPResult(room, state, 'w1', 'l1');

    expect(winner.gold).toBe(300 + PVP_GOLD_REWARD_AMOUNT);
  });

  it('敗者の isAlive が false になる', () => {
    const winner = makePlayer({ id: 'w1' });
    const loser = makePlayer({ id: 'l1' });
    const room = makeRoom([winner, loser]);
    const state = makePvPActiveState(winner, loser);

    applyPvPResult(room, state, 'w1', 'l1');

    expect(loser.isAlive).toBe(false);
    expect(loser.hp).toBe(0);
  });

  it('引き分け（winner undefined）は両者 HP 復元で isAlive 維持', () => {
    const a = makePlayer({ id: 'a1', hp: 100 });
    const d = makePlayer({ id: 'd1', hp: 100 });
    const room = makeRoom([a, d]);
    const state = makePvPActiveState(a, d, { combatantHp: 20, opponentHp: 15 });

    applyPvPResult(room, state, undefined, undefined);

    expect(a.hp).toBeGreaterThan(0);
    expect(d.hp).toBeGreaterThan(0);
    expect(a.isAlive).toBe(true);
    expect(d.isAlive).toBe(true);
  });

  it('勝者の HP が combatState の値に同期される', () => {
    const winner = makePlayer({ id: 'w1', hp: 100 });
    const loser = makePlayer({ id: 'l1', hp: 100 });
    const room = makeRoom([winner, loser]);
    const state = makePvPActiveState(winner, loser, {
      combatantId: 'w1',
      opponentId: 'l1',
      combatantHp: 45,
    });

    applyPvPResult(room, state, 'w1', 'l1');

    expect(winner.hp).toBe(45);
  });
});
