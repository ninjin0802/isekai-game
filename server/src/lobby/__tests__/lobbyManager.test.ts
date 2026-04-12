import { describe, it, expect, beforeEach } from 'vitest';
import {
  createRoom,
  joinRoom,
  leaveRoom,
  setReady,
  isAllReady,
  getRoom,
  listRooms,
  markRoomPlaying,
  removeRoom,
  getPlayerRoom,
} from '../lobbyManager';
import { MAX_PLAYERS } from '@isekai/shared';

// lobbyManager uses a module-level Map that persists across tests,
// so we track created roomIds and clean up in each test via removeRoom.

// ─── createRoom ───────────────────────────────────────────────────────────────

describe('createRoom', () => {
  it('ホストをメンバーとして新しいルームを作成する', () => {
    const state = createRoom('u1', '太郎');
    removeRoom(state.room.id);

    expect(state.room.id).toBeTruthy();
    expect(state.room.status).toBe('waiting');
    expect(state.room.playerCount).toBe(1);
    expect(state.room.maxPlayers).toBe(MAX_PLAYERS);
    expect(state.room.hostUsername).toBe('太郎');
    expect(state.players).toHaveLength(1);
    expect(state.players[0].userId).toBe('u1');
    expect(state.players[0].ready).toBe(false);
  });

  it('作成したルームは getRoom で取得できる', () => {
    const state = createRoom('u1', '太郎');
    const found = getRoom(state.room.id);
    removeRoom(state.room.id);

    expect(found).toBeDefined();
    expect(found?.room.id).toBe(state.room.id);
  });
});

// ─── joinRoom ─────────────────────────────────────────────────────────────────

describe('joinRoom', () => {
  it('プレイヤーがルームに参加できる', () => {
    const state = createRoom('host', 'ホスト');
    const result = joinRoom(state.room.id, 'p2', '花子');
    removeRoom(state.room.id);

    expect(result.players).toHaveLength(2);
    expect(result.room.playerCount).toBe(2);
    expect(result.players.find(p => p.userId === 'p2')).toBeDefined();
  });

  it('存在しないルームIDはエラーを投げる', () => {
    expect(() => joinRoom('nonexistent', 'u1', '太郎')).toThrow('ルームが見つかりません');
  });

  it('既に開始済みのゲームには参加できない', () => {
    const state = createRoom('host', 'ホスト');
    markRoomPlaying(state.room.id);
    expect(() => joinRoom(state.room.id, 'p2', '花子')).toThrow('ゲームは既に開始されています');
    removeRoom(state.room.id);
  });

  it('満員ルームには参加できない', () => {
    const state = createRoom('host', 'ホスト');
    for (let i = 1; i < MAX_PLAYERS; i++) {
      joinRoom(state.room.id, `u${i}`, `プレイヤー${i}`);
    }
    expect(() => joinRoom(state.room.id, 'extra', '余分')).toThrow('ルームが満員です');
    removeRoom(state.room.id);
  });

  it('既に参加中のプレイヤーは再参加できない', () => {
    const state = createRoom('host', 'ホスト');
    expect(() => joinRoom(state.room.id, 'host', 'ホスト')).toThrow('既にルームに参加しています');
    removeRoom(state.room.id);
  });
});

// ─── leaveRoom ────────────────────────────────────────────────────────────────

describe('leaveRoom', () => {
  it('プレイヤーがルームから退出できる', () => {
    const state = createRoom('host', 'ホスト');
    joinRoom(state.room.id, 'p2', '花子');

    const result = leaveRoom(state.room.id, 'p2');
    removeRoom(state.room.id);

    expect(result?.players).toHaveLength(1);
    expect(result?.room.playerCount).toBe(1);
  });

  it('最後のプレイヤーが退出するとルームが削除され null を返す', () => {
    const state = createRoom('host', 'ホスト');
    const roomId = state.room.id;

    const result = leaveRoom(roomId, 'host');

    expect(result).toBeNull();
    expect(getRoom(roomId)).toBeUndefined();
  });

  it('存在しない roomId は null を返す', () => {
    expect(leaveRoom('nonexistent', 'u1')).toBeNull();
  });

  it('ホストが退出するとホストが次のプレイヤーに移る', () => {
    const state = createRoom('host', 'ホスト');
    joinRoom(state.room.id, 'p2', '花子');

    const result = leaveRoom(state.room.id, 'host');
    removeRoom(state.room.id);

    expect(result?.room.hostUsername).toBe('花子');
  });
});

// ─── setReady ─────────────────────────────────────────────────────────────────

describe('setReady', () => {
  it('プレイヤーの準備状態を切り替えられる', () => {
    const state = createRoom('u1', '太郎');

    setReady(state.room.id, 'u1', true);
    expect(state.players[0].ready).toBe(true);

    setReady(state.room.id, 'u1', false);
    expect(state.players[0].ready).toBe(false);
    removeRoom(state.room.id);
  });

  it('存在しない roomId はエラーを投げる', () => {
    expect(() => setReady('nonexistent', 'u1', true)).toThrow('ルームが見つかりません');
  });

  it('ルームに参加していないプレイヤーはエラーを投げる', () => {
    const state = createRoom('u1', '太郎');
    expect(() => setReady(state.room.id, 'ghost', true)).toThrow('ルームに参加していません');
    removeRoom(state.room.id);
  });
});

// ─── isAllReady ───────────────────────────────────────────────────────────────

describe('isAllReady', () => {
  it('全員 ready の場合 true を返す', () => {
    const state = createRoom('u1', '太郎');
    joinRoom(state.room.id, 'u2', '花子');
    setReady(state.room.id, 'u1', true);
    setReady(state.room.id, 'u2', true);

    const result = isAllReady(state.room.id);
    removeRoom(state.room.id);

    expect(result).toBe(true);
  });

  it('1 人でも未準備がいると false を返す', () => {
    const state = createRoom('u1', '太郎');
    joinRoom(state.room.id, 'u2', '花子');
    setReady(state.room.id, 'u1', true);
    // u2 is NOT ready

    const result = isAllReady(state.room.id);
    removeRoom(state.room.id);

    expect(result).toBe(false);
  });

  it('プレイヤーが 1 人のみでは false を返す（最低 2 人必要）', () => {
    const state = createRoom('u1', '太郎');
    setReady(state.room.id, 'u1', true);

    const result = isAllReady(state.room.id);
    removeRoom(state.room.id);

    expect(result).toBe(false);
  });

  it('存在しない roomId は false を返す', () => {
    expect(isAllReady('nonexistent')).toBe(false);
  });
});

// ─── listRooms ────────────────────────────────────────────────────────────────

describe('listRooms', () => {
  it('waiting 状態のルームのみ一覧に含まれる', () => {
    const r1 = createRoom('u1', '太郎');
    const r2 = createRoom('u2', '花子');
    markRoomPlaying(r2.room.id); // r2 is now playing

    const list = listRooms();
    removeRoom(r1.room.id);
    removeRoom(r2.room.id);

    const ids = list.map(r => r.id);
    expect(ids).toContain(r1.room.id);
    expect(ids).not.toContain(r2.room.id);
  });
});

// ─── markRoomPlaying ─────────────────────────────────────────────────────────

describe('markRoomPlaying', () => {
  it('ルームのステータスを playing に変更する', () => {
    const state = createRoom('u1', '太郎');
    markRoomPlaying(state.room.id);
    const found = getRoom(state.room.id);
    removeRoom(state.room.id);

    expect(found?.room.status).toBe('playing');
  });
});

// ─── getPlayerRoom ────────────────────────────────────────────────────────────

describe('getPlayerRoom', () => {
  it('プレイヤーが参加しているルームIDを返す', () => {
    const state = createRoom('u1', '太郎');
    joinRoom(state.room.id, 'u2', '花子');

    const roomId = getPlayerRoom('u2');
    removeRoom(state.room.id);

    expect(roomId).toBe(state.room.id);
  });

  it('どのルームにも参加していない場合 undefined を返す', () => {
    expect(getPlayerRoom('nobody')).toBeUndefined();
  });
});
