import { v4 as uuidv4 } from 'uuid';
import type { LobbyRoom, LobbyPlayer } from '@isekai/shared';
import { MAX_PLAYERS } from '@isekai/shared';

interface RoomState {
  room: LobbyRoom;
  players: LobbyPlayer[];
}

// In-memory lobby state (rooms waiting for game start)
const rooms = new Map<string, RoomState>();

export function createRoom(hostUserId: string, hostUsername: string): RoomState {
  const roomId = uuidv4();
  const room: LobbyRoom = {
    id: roomId,
    playerCount: 1,
    maxPlayers: MAX_PLAYERS,
    status: 'waiting',
    hostUsername,
  };
  const state: RoomState = {
    room,
    players: [{ userId: hostUserId, username: hostUsername, ready: false }],
  };
  rooms.set(roomId, state);
  return state;
}

export function joinRoom(roomId: string, userId: string, username: string): RoomState {
  const state = rooms.get(roomId);
  if (!state) throw new Error('ルームが見つかりません');
  if (state.room.status !== 'waiting') throw new Error('ゲームは既に開始されています');
  if (state.players.length >= MAX_PLAYERS) throw new Error('ルームが満員です');
  if (state.players.some(p => p.userId === userId)) throw new Error('既にルームに参加しています');

  state.players.push({ userId, username, ready: false });
  state.room.playerCount = state.players.length;
  return state;
}

export function leaveRoom(roomId: string, userId: string): RoomState | null {
  const state = rooms.get(roomId);
  if (!state) return null;

  state.players = state.players.filter(p => p.userId !== userId);
  state.room.playerCount = state.players.length;

  if (state.players.length === 0) {
    rooms.delete(roomId);
    return null;
  }

  // Reassign host if needed
  if (state.room.hostUsername === state.players[0]?.username) {
    // host is already first remaining player — fine
  }
  state.room.hostUsername = state.players[0].username;

  return state;
}

export function setReady(roomId: string, userId: string, ready: boolean): RoomState {
  const state = rooms.get(roomId);
  if (!state) throw new Error('ルームが見つかりません');

  const player = state.players.find(p => p.userId === userId);
  if (!player) throw new Error('ルームに参加していません');

  player.ready = ready;
  return state;
}

export function isAllReady(roomId: string): boolean {
  const state = rooms.get(roomId);
  if (!state || state.players.length < 2) return false;
  return state.players.every(p => p.ready);
}

export function getRoom(roomId: string): RoomState | undefined {
  return rooms.get(roomId);
}

export function listRooms(): LobbyRoom[] {
  return Array.from(rooms.values())
    .filter(s => s.room.status === 'waiting')
    .map(s => s.room);
}

export function markRoomPlaying(roomId: string): void {
  const state = rooms.get(roomId);
  if (state) state.room.status = 'playing';
}

export function removeRoom(roomId: string): void {
  rooms.delete(roomId);
}

export function getPlayerRoom(userId: string): string | undefined {
  for (const [roomId, state] of rooms) {
    if (state.players.some(p => p.userId === userId)) return roomId;
  }
  return undefined;
}
