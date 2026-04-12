import { describe, it, expect, beforeEach } from 'vitest';
import {
  createBettingState,
  placeBet,
  closeBettingWindow,
  resolveBets,
  applyPayouts,
  deductBetFromPlayer,
  refundPreviousBet,
} from '../betting';
import type { BettingState, GameRoom, Player } from '@isekai/shared';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'p1',
    username: 'テスト太郎',
    hp: 100,
    maxHp: 100,
    attack: 10,
    defense: 5,
    gold: 1000,
    position: 0,
    isAlive: true,
    inventory: [],
    equippedWeaponId: null,
    attackBonus: 0,
    isConnected: true,
    ...overrides,
  };
}

function makeRoom(players: Player[] = []): GameRoom {
  return {
    id: 'room1',
    name: 'テストルーム',
    host: players[0]?.id ?? 'p1',
    players,
    status: 'playing',
    currentPlayerIndex: 0,
    turn: 1,
    boardSquares: [],
    activeCombat: null,
    activeBetting: null,
    createdAt: Date.now(),
  };
}

// ─── createBettingState ───────────────────────────────────────────────────────

describe('createBettingState', () => {
  it('賭け状態を正しく初期化する', () => {
    const state = createBettingState('battle-123');
    expect(state.battleId).toBe('battle-123');
    expect(state.bets).toEqual([]);
    expect(state.totalPot).toBe(0);
    expect(state.windowOpen).toBe(true);
    expect(state.expiresAt).toBeGreaterThan(Date.now());
  });

  it('expiresAt が現在時刻 + 15秒以上である', () => {
    const before = Date.now();
    const state = createBettingState('b1');
    expect(state.expiresAt).toBeGreaterThanOrEqual(before + 15_000);
  });
});

// ─── placeBet ────────────────────────────────────────────────────────────────

describe('placeBet', () => {
  let state: BettingState;

  beforeEach(() => {
    state = createBettingState('battle-1');
  });

  it('新規ベットを追加し totalPot を更新する', () => {
    const result = placeBet(state, {
      battleId: 'battle-1',
      bettorPlayerId: 'p1',
      bettorUsername: '太郎',
      betOn: 'player_wins',
      amount: 100,
    });
    expect(result.bets).toHaveLength(1);
    expect(result.totalPot).toBe(100);
    expect(result.bets[0].result).toBe('pending');
  });

  it('同じプレイヤーが再ベットすると置き換えられる', () => {
    placeBet(state, { battleId: 'battle-1', bettorPlayerId: 'p1', bettorUsername: '太郎', betOn: 'player_wins', amount: 100 });
    const result = placeBet(state, { battleId: 'battle-1', bettorPlayerId: 'p1', bettorUsername: '太郎', betOn: 'monster_wins', amount: 200 });
    expect(result.bets).toHaveLength(1);
    expect(result.bets[0].betOn).toBe('monster_wins');
    expect(result.bets[0].amount).toBe(200);
    expect(result.totalPot).toBe(200);
  });

  it('複数プレイヤーのベットで totalPot が合計される', () => {
    placeBet(state, { battleId: 'battle-1', bettorPlayerId: 'p1', bettorUsername: '太郎', betOn: 'player_wins', amount: 100 });
    placeBet(state, { battleId: 'battle-1', bettorPlayerId: 'p2', bettorUsername: '花子', betOn: 'monster_wins', amount: 200 });
    expect(state.totalPot).toBe(300);
    expect(state.bets).toHaveLength(2);
  });

  it('window が閉じているとエラーを投げる', () => {
    state.windowOpen = false;
    expect(() => placeBet(state, { battleId: 'battle-1', bettorPlayerId: 'p1', bettorUsername: '太郎', betOn: 'player_wins', amount: 100 }))
      .toThrow('賭け受付は終了しています');
  });

  it('最低賭け金 10G 未満だとエラーを投げる', () => {
    expect(() => placeBet(state, { battleId: 'battle-1', bettorPlayerId: 'p1', bettorUsername: '太郎', betOn: 'player_wins', amount: 9 }))
      .toThrow('最低賭け金は 10G です');
  });

  it('battleId が一致しないとエラーを投げる', () => {
    expect(() => placeBet(state, { battleId: 'other-battle', bettorPlayerId: 'p1', bettorUsername: '太郎', betOn: 'player_wins', amount: 100 }))
      .toThrow('戦闘IDが一致しません');
  });
});

// ─── closeBettingWindow ───────────────────────────────────────────────────────

describe('closeBettingWindow', () => {
  it('windowOpen を false にする', () => {
    const state = createBettingState('b1');
    const result = closeBettingWindow(state);
    expect(result.windowOpen).toBe(false);
  });
});

// ─── resolveBets ──────────────────────────────────────────────────────────────

describe('resolveBets', () => {
  it('ベットなしの場合 空の結果を返す', () => {
    const state = createBettingState('b1');
    const result = resolveBets(state, 'player_wins', 'combatant1');
    expect(result.payouts).toEqual([]);
    expect(result.combatantBonus).toBe(0);
  });

  it('全員外れた場合、コンバタントがポット全額を受け取る', () => {
    const state = createBettingState('b1');
    placeBet(state, { battleId: 'b1', bettorPlayerId: 'p2', bettorUsername: '花子', betOn: 'monster_wins', amount: 200 });
    const result = resolveBets(state, 'player_wins', 'combatant1');
    expect(result.combatantBonus).toBe(200);
    expect(result.payouts).toHaveLength(1);
    expect(result.payouts[0]).toEqual({ playerId: 'combatant1', delta: 200 });
  });

  it('勝者が自分のステークと敗者ポットのシェアを受け取る', () => {
    const state = createBettingState('b1');
    placeBet(state, { battleId: 'b1', bettorPlayerId: 'winner1', bettorUsername: '当て', betOn: 'player_wins', amount: 100 });
    placeBet(state, { battleId: 'b1', bettorPlayerId: 'loser1', bettorUsername: '外れ', betOn: 'monster_wins', amount: 100 });
    const result = resolveBets(state, 'player_wins', 'combatant1');
    // winner gets their 100 back + all 100 from loser = 200
    const winnerPayout = result.payouts.find(p => p.playerId === 'winner1');
    expect(winnerPayout).toBeDefined();
    expect(winnerPayout!.delta).toBe(200);
    expect(result.combatantBonus).toBe(0);
  });

  it('複数勝者でポットを按分配当する', () => {
    const state = createBettingState('b1');
    placeBet(state, { battleId: 'b1', bettorPlayerId: 'w1', bettorUsername: 'w1', betOn: 'player_wins', amount: 300 });
    placeBet(state, { battleId: 'b1', bettorPlayerId: 'w2', bettorUsername: 'w2', betOn: 'player_wins', amount: 100 });
    placeBet(state, { battleId: 'b1', bettorPlayerId: 'l1', bettorUsername: 'l1', betOn: 'monster_wins', amount: 400 });
    const result = resolveBets(state, 'player_wins', 'combatant1');
    const totalPayout = result.payouts.reduce((s, p) => s + p.delta, 0);
    // All payouts should sum to total pot (400 loser + 400 winner stake)
    expect(totalPayout).toBe(800);
  });

  it('ベット結果フラグが正しく設定される', () => {
    const state = createBettingState('b1');
    placeBet(state, { battleId: 'b1', bettorPlayerId: 'p1', bettorUsername: 'p1', betOn: 'player_wins', amount: 100 });
    placeBet(state, { battleId: 'b1', bettorPlayerId: 'p2', bettorUsername: 'p2', betOn: 'monster_wins', amount: 100 });
    const result = resolveBets(state, 'player_wins', 'combatant1');
    const wonBet = result.updatedBets.find(b => b.bettorId === 'p1');
    const lostBet = result.updatedBets.find(b => b.bettorId === 'p2');
    expect(wonBet!.result).toBe('won');
    expect(lostBet!.result).toBe('lost');
  });
});

// ─── applyPayouts ─────────────────────────────────────────────────────────────

describe('applyPayouts', () => {
  it('プレイヤーのゴールドに delta を加算する', () => {
    const p1 = makePlayer({ id: 'p1', gold: 500 });
    const room = makeRoom([p1]);
    applyPayouts(room, [{ playerId: 'p1', delta: 200 }]);
    expect(p1.gold).toBe(700);
  });

  it('ゴールドが 0 未満にならない', () => {
    const p1 = makePlayer({ id: 'p1', gold: 100 });
    const room = makeRoom([p1]);
    applyPayouts(room, [{ playerId: 'p1', delta: -500 }]);
    expect(p1.gold).toBe(0);
  });

  it('存在しないプレイヤーは無視する', () => {
    const room = makeRoom([makePlayer({ id: 'p1' })]);
    expect(() => applyPayouts(room, [{ playerId: 'ghost', delta: 100 }])).not.toThrow();
  });
});

// ─── deductBetFromPlayer ──────────────────────────────────────────────────────

describe('deductBetFromPlayer', () => {
  it('ゴールドを差し引き true を返す', () => {
    const p1 = makePlayer({ id: 'p1', gold: 500 });
    const room = makeRoom([p1]);
    const result = deductBetFromPlayer(room, 'p1', 200);
    expect(result).toBe(true);
    expect(p1.gold).toBe(300);
  });

  it('ゴールドが不足していると false を返す', () => {
    const p1 = makePlayer({ id: 'p1', gold: 50 });
    const room = makeRoom([p1]);
    const result = deductBetFromPlayer(room, 'p1', 100);
    expect(result).toBe(false);
    expect(p1.gold).toBe(50); // unchanged
  });

  it('存在しないプレイヤーは false を返す', () => {
    const room = makeRoom([]);
    expect(deductBetFromPlayer(room, 'ghost', 100)).toBe(false);
  });
});

// ─── refundPreviousBet ────────────────────────────────────────────────────────

describe('refundPreviousBet', () => {
  it('前回ベット額を返金する', () => {
    const p1 = makePlayer({ id: 'p1', gold: 300 });
    const room = makeRoom([p1]);
    refundPreviousBet(room, 'p1', 200);
    expect(p1.gold).toBe(500);
  });

  it('存在しないプレイヤーでもエラーにならない', () => {
    const room = makeRoom([]);
    expect(() => refundPreviousBet(room, 'ghost', 100)).not.toThrow();
  });
});
