import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createPvECombat,
  processPlayerAction,
  processMonsterAttack,
  applyCombatResult,
  wasLastActionDefend,
} from '../combat';
import type { CombatState, Player, GameRoom } from '@isekai/shared';
import { MONSTERS } from '@isekai/shared';

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

function makeActiveState(overrides: Partial<CombatState> = {}): CombatState {
  return {
    battleId: 'battle-1',
    type: 'pve',
    phase: 'active',
    combatantId: 'p1',
    opponentId: 'slime',
    monster: { ...MONSTERS.slime },
    combatantHp: 100,
    opponentHp: 30,
    turn: 'combatant',
    round: 1,
    log: [],
    ...overrides,
  };
}

// ─── createPvECombat ──────────────────────────────────────────────────────────

describe('createPvECombat', () => {
  it('プレイヤーとモンスターの初期状態を正しく生成する', () => {
    const player = makePlayer({ id: 'p1', hp: 80 });
    const room = makeRoom([player]);

    const state = createPvECombat(room, 'p1', 'slime');

    expect(state.type).toBe('pve');
    expect(state.phase).toBe('betting');
    expect(state.combatantId).toBe('p1');
    expect(state.opponentId).toBe('slime');
    expect(state.combatantHp).toBe(80);
    expect(state.opponentHp).toBe(MONSTERS.slime.maxHp);
    expect(state.monster?.id).toBe('slime');
    expect(state.turn).toBe('combatant');
    expect(state.round).toBe(1);
    expect(state.log).toEqual([]);
    expect(state.battleId).toBeTruthy();
  });

  it('存在しないプレイヤーIDはエラーを投げる', () => {
    const room = makeRoom([]);
    expect(() => createPvECombat(room, 'ghost', 'slime')).toThrow('Combatant not found');
  });

  it('各モンスターで正しいHPが設定される', () => {
    const player = makePlayer();
    const room = makeRoom([player]);

    const orcState = createPvECombat(room, 'p1', 'orc');
    expect(orcState.opponentHp).toBe(MONSTERS.orc.maxHp);

    const dragonState = createPvECombat(room, 'p1', 'dragon');
    expect(dragonState.opponentHp).toBe(MONSTERS.dragon.maxHp);
  });
});

// ─── processPlayerAction — attack ─────────────────────────────────────────────

describe('processPlayerAction / attack', () => {
  afterEach(() => vi.restoreAllMocks());

  it('モンスターにダメージを与える（turn が opponent に変わる）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // roll = 4
    const player = makePlayer({ attack: 10, attackBonus: 0 });
    const state = makeActiveState({ opponentHp: 100 });

    const result = processPlayerAction(state, player, 'attack');

    expect(result.finished).toBe(false);
    expect(result.state.opponentHp).toBeLessThan(100);
    expect(result.state.turn).toBe('opponent');
  });

  it('モンスターHPが0になると finished:true で combatant winner', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // roll = 6 → big damage
    const player = makePlayer({ attack: 50, attackBonus: 0 });
    const state = makeActiveState({ opponentHp: 1 });

    const result = processPlayerAction(state, player, 'attack');

    expect(result.finished).toBe(true);
    expect(result.winner).toBe('combatant');
    expect(result.goldReward).toBeGreaterThanOrEqual(MONSTERS.slime.goldReward[0]);
    expect(result.goldReward).toBeLessThanOrEqual(MONSTERS.slime.goldReward[1]);
    expect(result.state.phase).toBe('finished');
  });

  it('ダメージが最低1を保証する（敵防御力が高くても）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // roll = 1, rawDmg = 10
    const player = makePlayer({ attack: 10, attackBonus: 0 });
    // slime defense=2, rawDmg=10: 10-2=8 → but even if defense > rawDmg, min 1
    const state = makeActiveState();

    const result = processPlayerAction(state, player, 'attack');

    expect(result.state.opponentHp).toBeLessThan(state.opponentHp);
  });

  it('phase が active でない場合はエラーを投げる', () => {
    const player = makePlayer();
    const state = makeActiveState({ phase: 'betting' });
    expect(() => processPlayerAction(state, player, 'attack')).toThrow('戦闘はまだ開始されていません');
  });

  it('combatant の turn でない場合はエラーを投げる', () => {
    const player = makePlayer();
    const state = makeActiveState({ turn: 'opponent' });
    expect(() => processPlayerAction(state, player, 'attack')).toThrow('プレイヤーのターンではありません');
  });

  it('ラウンドカウントが増加する', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const player = makePlayer();
    const state = makeActiveState({ round: 3 });

    const result = processPlayerAction(state, player, 'attack');

    expect(result.state.round).toBe(4);
  });
});

// ─── processPlayerAction — defend ─────────────────────────────────────────────

describe('processPlayerAction / defend', () => {
  it('防御ログを追加して opponent turn になる', () => {
    const player = makePlayer();
    const state = makeActiveState();

    const result = processPlayerAction(state, player, 'defend');

    expect(result.finished).toBe(false);
    expect(result.state.turn).toBe('opponent');
    expect(result.state.log.some(e => e.action === 'defend')).toBe(true);
  });
});

// ─── processPlayerAction — item ───────────────────────────────────────────────

describe('processPlayerAction / item', () => {
  it('ポーション使用で combatantHp が回復する', () => {
    const player = makePlayer({ hp: 50, maxHp: 100 });
    const state = makeActiveState({ combatantHp: 50 });

    const result = processPlayerAction(state, player, 'item', 'potion');

    expect(result.state.combatantHp).toBe(80); // 50 + 30
    expect(result.state.log.some(e => e.action === 'item' && e.heal === 30)).toBe(true);
  });

  it('回復が maxHp を超えない', () => {
    const player = makePlayer({ hp: 95, maxHp: 100 });
    const state = makeActiveState({ combatantHp: 95 });

    const result = processPlayerAction(state, player, 'item', 'potion');

    expect(result.state.combatantHp).toBe(100); // capped
  });

  it('スモークボムで確定逃走 finished:true', () => {
    const player = makePlayer();
    const state = makeActiveState();

    const result = processPlayerAction(state, player, 'item', 'smoke_bomb');

    expect(result.finished).toBe(true);
    expect(result.winner).toBe('combatant');
    expect(result.goldReward).toBe(0);
    expect(result.state.phase).toBe('finished');
  });

  it('itemId が未指定だとエラーを投げる', () => {
    const player = makePlayer();
    const state = makeActiveState();
    expect(() => processPlayerAction(state, player, 'item')).toThrow('アイテムIDが必要です');
  });

  it('存在しない itemId はエラーを投げる', () => {
    const player = makePlayer();
    const state = makeActiveState();
    expect(() => processPlayerAction(state, player, 'item', 'fake_item')).toThrow('アイテムが見つかりません');
  });
});

// ─── processPlayerAction — flee ───────────────────────────────────────────────

describe('processPlayerAction / flee', () => {
  afterEach(() => vi.restoreAllMocks());

  it('逃走成功（通常モンスター: 50%）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1); // 0.1 < 0.5 → success
    const player = makePlayer();
    const state = makeActiveState();

    const result = processPlayerAction(state, player, 'flee');

    expect(result.finished).toBe(true);
    expect(result.winner).toBe('combatant');
    expect(result.state.phase).toBe('finished');
  });

  it('逃走失敗（通常モンスター）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9); // 0.9 >= 0.5 → fail
    const player = makePlayer();
    const state = makeActiveState();

    const result = processPlayerAction(state, player, 'flee');

    expect(result.finished).toBe(false);
    expect(result.state.phase).toBe('active');
  });

  it('ボス（ドラゴン）は逃走確率 10%', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.15); // 0.15 >= 0.1 → fail
    const player = makePlayer();
    const state = makeActiveState({
      opponentId: 'dragon',
      monster: { ...MONSTERS.dragon },
    });

    const result = processPlayerAction(state, player, 'flee');

    expect(result.finished).toBe(false); // 0.15 is NOT < 0.1
  });
});

// ─── processMonsterAttack ─────────────────────────────────────────────────────

describe('processMonsterAttack', () => {
  afterEach(() => vi.restoreAllMocks());

  it('プレイヤーにダメージを与え combatant turn になる', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // roll = 4
    const player = makePlayer({ defense: 5 });
    const state = makeActiveState({ turn: 'opponent', combatantHp: 100 });

    const result = processMonsterAttack(state, player, false);

    expect(result.finished).toBe(false);
    expect(result.state.combatantHp).toBeLessThan(100);
    expect(result.state.turn).toBe('combatant');
  });

  it('防御中はダメージが半減する', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // roll = 4, always same
    const player = makePlayer({ defense: 5 });
    const state = makeActiveState({ turn: 'opponent', combatantHp: 100 });

    const withDefend = processMonsterAttack({ ...state, log: [] }, player, true);
    const withoutDefend = processMonsterAttack({ ...state, log: [] }, player, false);

    expect(withDefend.state.combatantHp).toBeGreaterThan(withoutDefend.state.combatantHp);
  });

  it('プレイヤーHP が 0 になると finished:true で monster winner', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // roll = 6 → big damage
    const player = makePlayer({ defense: 0 });
    const state = makeActiveState({
      turn: 'opponent',
      combatantHp: 1,
      monster: { ...MONSTERS.orc },
    });

    const result = processMonsterAttack(state, player, false);

    expect(result.finished).toBe(true);
    expect(result.winner).toBe('monster');
    expect(result.state.phase).toBe('finished');
  });

  it('opponent の turn でない場合エラーを投げる', () => {
    const player = makePlayer();
    const state = makeActiveState({ turn: 'combatant' });
    expect(() => processMonsterAttack(state, player, false)).toThrow('モンスターのターンではありません');
  });

  it('ドラゴン Phase2 の round%3===0 でブレス攻撃ログが追加される', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const player = makePlayer({ defense: 5 });
    const state = makeActiveState({
      turn: 'opponent',
      combatantHp: 500,
      opponentHp: 200, // <= 250 → phase 2
      opponentId: 'dragon',
      monster: { ...MONSTERS.dragon },
      round: 3, // % 3 === 0 → breath turn
    });

    const result = processMonsterAttack(state, player, false);

    expect(result.state.log.some(e => e.action === 'breath_attack')).toBe(true);
  });

  it('ドラゴン Phase2 でも round%3 !== 0 は通常攻撃', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const player = makePlayer({ defense: 5 });
    const state = makeActiveState({
      turn: 'opponent',
      combatantHp: 500,
      opponentHp: 200,
      opponentId: 'dragon',
      monster: { ...MONSTERS.dragon },
      round: 4, // 4 % 3 === 1 → normal attack
    });

    const result = processMonsterAttack(state, player, false);

    expect(result.state.log.some(e => e.action === 'monster_attack')).toBe(true);
  });
});

// ─── applyCombatResult ────────────────────────────────────────────────────────

describe('applyCombatResult', () => {
  it('勝利時: ゴールドが加算されプレイヤーのHPが同期される', () => {
    const player = makePlayer({ id: 'p1', gold: 200, hp: 100 });
    const room = makeRoom([player]);
    const state = makeActiveState({ combatantHp: 60 });

    applyCombatResult(room, state, 'combatant', 100);

    expect(player.gold).toBe(300);
    expect(player.hp).toBe(60);
    expect(player.isAlive).toBe(true);
  });

  it('敗北時: isAlive が false になる', () => {
    const player = makePlayer({ id: 'p1', gold: 200 });
    const room = makeRoom([player]);
    const state = makeActiveState({ combatantHp: 0 });

    applyCombatResult(room, state, 'monster', 0);

    expect(player.isAlive).toBe(false);
  });

  it('勝利時: 使用アイテムがインベントリから消費される', () => {
    const player = makePlayer({
      id: 'p1',
      inventory: [{ itemId: 'potion', quantity: 2 }],
    });
    const room = makeRoom([player]);
    const state = makeActiveState();

    applyCombatResult(room, state, 'combatant', 0, 'potion');

    expect(player.inventory.find(i => i.itemId === 'potion')?.quantity).toBe(1);
  });

  it('勝利時: 最後のアイテムを消費するとインベントリから削除される', () => {
    const player = makePlayer({
      id: 'p1',
      inventory: [{ itemId: 'potion', quantity: 1 }],
    });
    const room = makeRoom([player]);
    const state = makeActiveState();

    applyCombatResult(room, state, 'combatant', 0, 'potion');

    expect(player.inventory.find(i => i.itemId === 'potion')).toBeUndefined();
  });

  it('存在しないプレイヤーIDはエラーを投げる', () => {
    const room = makeRoom([]);
    const state = makeActiveState();
    expect(() => applyCombatResult(room, state, 'combatant', 0)).toThrow('Player not found');
  });
});

// ─── wasLastActionDefend ──────────────────────────────────────────────────────

describe('wasLastActionDefend', () => {
  it('最後のプレイヤー行動が defend の場合 true を返す', () => {
    const state = makeActiveState({
      monster: { ...MONSTERS.slime },
      log: [
        { round: 1, actor: '勇者', action: 'defend', message: '防御' },
      ],
    });
    expect(wasLastActionDefend(state)).toBe(true);
  });

  it('最後のプレイヤー行動が attack の場合 false を返す', () => {
    const state = makeActiveState({
      monster: { ...MONSTERS.slime },
      log: [
        { round: 1, actor: '勇者', action: 'attack', damage: 10, message: '攻撃' },
      ],
    });
    expect(wasLastActionDefend(state)).toBe(false);
  });

  it('ログが空の場合 false を返す', () => {
    const state = makeActiveState({ log: [] });
    expect(wasLastActionDefend(state)).toBe(false);
  });

  it('モンスターの攻撃ログの後でも直前のプレイヤー行動を参照する', () => {
    const state = makeActiveState({
      monster: { ...MONSTERS.slime },
      log: [
        { round: 1, actor: '勇者', action: 'defend', message: '防御' },
        { round: 1, actor: 'スライム', action: 'monster_attack', damage: 5, message: '攻撃' },
      ],
    });
    // Last non-monster entry is 'defend'
    expect(wasLastActionDefend(state)).toBe(true);
  });
});
