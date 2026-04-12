import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  startGame,
  getGame,
  removeGame,
  currentPlayer,
  rollAndMove,
  resolveSquareEvent,
  advanceTurn,
  applyDeathPenalty,
  finishGame,
} from '../engine';
import type { GameRoom, MapSquare, Player } from '@isekai/shared';
import { BOARD_SIZE, START_GOLD } from '@isekai/shared';

// ─── Helpers ─────────────────────────────────────────────────────────────────

let roomCounter = 0;

function uniqueRoomId(): string {
  return `test-room-${++roomCounter}`;
}

function makeTestRoom(playerCount = 2): GameRoom {
  const roomId = uniqueRoomId();
  const room = startGame({
    roomId,
    players: Array.from({ length: playerCount }, (_, i) => ({
      userId: `user-${i}`,
      username: `プレイヤー${i + 1}`,
    })),
  });
  return room;
}

function makeSimpleMap(squares: Partial<MapSquare>[]): MapSquare[] {
  return squares.map((s, i) => ({ index: i, type: 'recovery' as const, ...s }));
}

// ─── startGame ────────────────────────────────────────────────────────────────

describe('startGame', () => {
  it('指定した人数のプレイヤーが作成される', () => {
    const room = makeTestRoom(3);
    expect(room.players).toHaveLength(3);
  });

  it('各プレイヤーが初期ゴールドを持つ', () => {
    const room = makeTestRoom(2);
    for (const p of room.players) {
      expect(p.gold).toBe(START_GOLD);
    }
  });

  it('全プレイヤーの初期 HP が正しい', () => {
    const room = makeTestRoom(2);
    for (const p of room.players) {
      expect(p.hp).toBe(100);
      expect(p.maxHp).toBe(100);
      expect(p.isAlive).toBe(true);
    }
  });

  it('マップが BOARD_SIZE のマス数で生成される', () => {
    const room = makeTestRoom(2);
    expect(room.map).toHaveLength(BOARD_SIZE);
  });

  it('status が playing になる', () => {
    const room = makeTestRoom(2);
    expect(room.status).toBe('playing');
  });

  it('currentTurnIndex が 0 で開始する', () => {
    const room = makeTestRoom(2);
    expect(room.currentTurnIndex).toBe(0);
  });

  it('getGame で作成したルームを取得できる', () => {
    const room = makeTestRoom(2);
    const found = getGame(room.id);
    expect(found).toBeDefined();
    expect(found?.id).toBe(room.id);
  });
});

// ─── getGame / removeGame ─────────────────────────────────────────────────────

describe('getGame / removeGame', () => {
  it('存在しない roomId は undefined を返す', () => {
    expect(getGame('nonexistent')).toBeUndefined();
  });

  it('removeGame でルームが削除される', () => {
    const room = makeTestRoom(2);
    removeGame(room.id);
    expect(getGame(room.id)).toBeUndefined();
  });
});

// ─── currentPlayer ────────────────────────────────────────────────────────────

describe('currentPlayer', () => {
  it('currentTurnIndex に対応するプレイヤーを返す', () => {
    const room = makeTestRoom(2);
    const player = currentPlayer(room);
    expect(player.turnOrder).toBe(0);
  });

  it('currentTurnIndex が 1 なら 2 番目のプレイヤーを返す', () => {
    const room = makeTestRoom(2);
    room.currentTurnIndex = 1;
    const player = currentPlayer(room);
    expect(player.turnOrder).toBe(1);
  });
});

// ─── rollAndMove ──────────────────────────────────────────────────────────────

describe('rollAndMove', () => {
  afterEach(() => vi.restoreAllMocks());

  it('サイコロを振ってプレイヤーの位置が前進する', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // roll=4
    const room = makeTestRoom(2);
    const before = currentPlayer(room).position;

    const result = rollAndMove(room);

    expect(result.roll).toBe(4);
    expect(result.newPosition).toBe(before + 4);
    expect(currentPlayer(room).position).toBe(before + 4);
  });

  it('BOARD_SIZE - 1 を超えてもボスマスで止まる', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // roll=6
    const room = makeTestRoom(2);
    currentPlayer(room).position = BOARD_SIZE - 2; // 1マス手前

    const result = rollAndMove(room);

    expect(result.newPosition).toBe(BOARD_SIZE - 1);
  });

  it('到達したマスの MapSquare を返す', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // roll=4
    const room = makeTestRoom(2);

    const result = rollAndMove(room);

    expect(result.square).toBeDefined();
    expect(result.square.index).toBe(result.newPosition);
  });

  it('同じマスに別のプレイヤーがいると pvpTargetId が設定される', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // roll=4
    const room = makeTestRoom(2);
    // 2番目のプレイヤーをロール先の4番マスに配置
    room.players[1].position = 4;

    const result = rollAndMove(room);

    expect(result.pvpTargetId).toBe(room.players[1].id);
  });

  it('死亡プレイヤーはサイコロを振れない', () => {
    const room = makeTestRoom(2);
    currentPlayer(room).isAlive = false;

    expect(() => rollAndMove(room)).toThrow('死亡しているプレイヤーはサイコロを振れません');
  });
});

// ─── resolveSquareEvent ───────────────────────────────────────────────────────

describe('resolveSquareEvent', () => {
  function makeRoomWithPlayer(
    playerOverrides: Partial<Player> = {},
    mapOverride?: MapSquare[]
  ): GameRoom {
    const room = makeTestRoom(1);
    Object.assign(room.players[0], playerOverrides);
    if (mapOverride) room.map = mapOverride;
    return room;
  }

  it('battle マスはモンスターIDを返す', () => {
    const room = makeRoomWithPlayer();
    const square: MapSquare = { index: 1, type: 'battle', monsterId: 'slime' };

    const result = resolveSquareEvent(room, square);

    expect(result.kind).toBe('battle');
    if (result.kind === 'battle') expect(result.monsterId).toBe('slime');
  });

  it('boss マスは dragon を返す', () => {
    const room = makeRoomWithPlayer();
    const square: MapSquare = { index: BOARD_SIZE - 1, type: 'boss' };

    const result = resolveSquareEvent(room, square);

    expect(result.kind).toBe('boss');
    if (result.kind === 'boss') expect(result.monsterId).toBe('dragon');
  });

  it('shop マスは kind: shop を返す', () => {
    const room = makeRoomWithPlayer();
    const square: MapSquare = { index: 5, type: 'shop' };

    const result = resolveSquareEvent(room, square);

    expect(result.kind).toBe('shop');
  });

  it('recovery マス（index > 0）でプレイヤーのHPが回復する', () => {
    const room = makeRoomWithPlayer({ hp: 40, maxHp: 100 });
    const square: MapSquare = { index: 5, type: 'recovery' };

    const result = resolveSquareEvent(room, square);

    expect(result.kind).toBe('recovery');
    if (result.kind === 'recovery') expect(result.hpGained).toBeGreaterThan(0);
    // HP should have increased
    expect(room.players[0].hp).toBeGreaterThan(40);
  });

  it('recovery HP が maxHp を超えない', () => {
    const room = makeRoomWithPlayer({ hp: 100, maxHp: 100 });
    const square: MapSquare = { index: 5, type: 'recovery' };

    resolveSquareEvent(room, square);

    expect(room.players[0].hp).toBe(100);
  });

  it('index 0 の recovery マスは kind: start を返す（スタートマス）', () => {
    const room = makeRoomWithPlayer();
    const square: MapSquare = { index: 0, type: 'recovery' };

    const result = resolveSquareEvent(room, square);

    expect(result.kind).toBe('start');
  });

  it('event マスは kind: event でエフェクトを返す', () => {
    const room = makeRoomWithPlayer();
    const square: MapSquare = { index: 10, type: 'event' };

    const result = resolveSquareEvent(room, square);

    expect(result.kind).toBe('event');
    if (result.kind === 'event') {
      expect(typeof result.description).toBe('string');
      expect(result.effects).toBeDefined();
    }
  });
});

// ─── advanceTurn ──────────────────────────────────────────────────────────────

describe('advanceTurn', () => {
  it('次のプレイヤーにターンが移る', () => {
    const room = makeTestRoom(3);
    expect(room.currentTurnIndex).toBe(0);

    advanceTurn(room);

    expect(room.currentTurnIndex).toBe(1);
    expect(room.turnNumber).toBe(2);
  });

  it('最後のプレイヤーから最初に折り返す', () => {
    const room = makeTestRoom(2);
    advanceTurn(room); // 0 → 1
    advanceTurn(room); // 1 → 0

    expect(room.currentTurnIndex).toBe(0);
  });

  it('死亡プレイヤーをスキップする', () => {
    const room = makeTestRoom(3);
    room.players[1].isAlive = false; // player with turnOrder 1 is dead

    advanceTurn(room); // should skip 1, land on 2

    expect(room.currentTurnIndex).toBe(2);
  });

  it('全プレイヤー死亡でも無限ループしない', () => {
    const room = makeTestRoom(2);
    room.players.forEach(p => (p.isAlive = false));

    // Should not throw or loop infinitely
    expect(() => advanceTurn(room)).not.toThrow();
  });

  it('turnNumber が毎ターン増加する', () => {
    const room = makeTestRoom(2);
    advanceTurn(room);
    advanceTurn(room);

    expect(room.turnNumber).toBe(3); // starts at 1, +2
  });
});

// ─── applyDeathPenalty ────────────────────────────────────────────────────────

describe('applyDeathPenalty', () => {
  it('lose_gold: ゴールドが 0 になり HP が全快して isAlive が true になる', () => {
    const room = makeTestRoom(1);
    const player = room.players[0];
    player.gold = 999;
    player.hp = 0;
    player.isAlive = false;

    applyDeathPenalty(room, player.id, 'lose_gold');

    expect(player.gold).toBe(0);
    expect(player.hp).toBe(player.maxHp);
    expect(player.isAlive).toBe(true);
  });

  it('return_start: 位置が 0 になり HP が全快して isAlive が true になる', () => {
    const room = makeTestRoom(1);
    const player = room.players[0];
    player.position = 25;
    player.hp = 0;
    player.isAlive = false;

    applyDeathPenalty(room, player.id, 'return_start');

    expect(player.position).toBe(0);
    expect(player.hp).toBe(player.maxHp);
    expect(player.isAlive).toBe(true);
  });

  it('存在しないプレイヤーIDはエラーを投げる', () => {
    const room = makeTestRoom(1);
    expect(() => applyDeathPenalty(room, 'ghost', 'lose_gold')).toThrow('Player not found');
  });
});

// ─── finishGame ───────────────────────────────────────────────────────────────

describe('finishGame', () => {
  it('status が finished になり winnerId が設定される', () => {
    const room = makeTestRoom(2);
    const winner = room.players[0];

    finishGame(room, winner.id);

    expect(room.status).toBe('finished');
    expect(room.winnerId).toBe(winner.id);
  });
});
