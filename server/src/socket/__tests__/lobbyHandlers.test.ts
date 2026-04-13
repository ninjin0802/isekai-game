/**
 * lobbyHandlers - disconnect isolation tests
 *
 * Bug (fixed): the disconnect handler called lobby.getPlayerRoom(userId),
 * which found ANY room the user was in — even rooms created by a different
 * socket (e.g. another browser tab). This destroyed rooms that should stay alive.
 *
 * Fix: each socket tracks its own joined room via `myRoomId`. Disconnect only
 * removes the user from that socket's room, not from rooms owned by other sockets.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@isekai/shared';
import { registerLobbyHandlers } from '../lobbyHandlers';
import { getPlayerRoom, getRoom, removeRoom } from '../../lobby/lobbyManager';

// ─── Mock helpers ─────────────────────────────────────────────────────────────

type MockSocket = {
  id: string;
  data: { userId: string; username: string };
  on: ReturnType<typeof vi.fn>;
  emit: ReturnType<typeof vi.fn>;
  join: ReturnType<typeof vi.fn>;
  leave: ReturnType<typeof vi.fn>;
  /** Fire a registered event handler by name */
  _trigger: (event: string, ...args: unknown[]) => unknown;
};

type MockIo = {
  to: ReturnType<typeof vi.fn>;
};

function createMockSocket(userId: string, username: string, id = 'mock-socket'): MockSocket {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();

  const socket: MockSocket = {
    id,
    data: { userId, username },
    on: vi.fn((event: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(event, handler);
    }),
    emit: vi.fn(),
    join: vi.fn(() => Promise.resolve()),
    leave: vi.fn(),
    _trigger: (event, ...args) => {
      const handler = handlers.get(event);
      if (!handler) throw new Error(`No handler for event: ${event}`);
      return handler(...args);
    },
  };
  return socket;
}

function createMockIo(): MockIo {
  return {
    to: vi.fn().mockReturnValue({ emit: vi.fn() }),
  };
}

// ─── Test-local cleanup ───────────────────────────────────────────────────────

const createdRooms: string[] = [];

afterEach(() => {
  for (const id of createdRooms) removeRoom(id);
  createdRooms.length = 0;
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('lobby:create_room', () => {
  it('creates a room and the player appears in it', async () => {
    const socket = createMockSocket('u1', 'Alice', 'A');
    const io = createMockIo();

    registerLobbyHandlers(
      io as unknown as Server<ClientToServerEvents, ServerToClientEvents>,
      socket as unknown as Socket<ClientToServerEvents, ServerToClientEvents>
    );

    await socket._trigger('lobby:create_room');

    const roomId = getPlayerRoom('u1');
    expect(roomId).toBeDefined();
    if (roomId) createdRooms.push(roomId);

    expect(socket.emit).toHaveBeenCalledWith('lobby:room_update', expect.objectContaining({
      room: expect.objectContaining({ playerCount: 1, status: 'waiting' }),
      players: expect.arrayContaining([expect.objectContaining({ userId: 'u1' })]),
    }));
  });
});

describe('disconnect isolation (the myRoomId fix)', () => {
  it('socket B disconnect does NOT remove user from room created by socket A (same userId)', async () => {
    const userId = 'shared-user';
    const socketA = createMockSocket(userId, 'Tester', 'A');
    const socketB = createMockSocket(userId, 'Tester', 'B');
    const io = createMockIo();

    registerLobbyHandlers(io as unknown as Server, socketA as unknown as Socket);
    registerLobbyHandlers(io as unknown as Server, socketB as unknown as Socket);

    // Socket A creates a room
    await socketA._trigger('lobby:create_room');
    const roomId = getPlayerRoom(userId);
    expect(roomId).toBeDefined();
    if (roomId) createdRooms.push(roomId);

    // Socket B disconnects WITHOUT having joined any room
    socketB._trigger('disconnect');

    // Room still exists — socket B must NOT have destroyed it
    expect(getPlayerRoom(userId)).toBe(roomId);
    expect(getRoom(roomId!)).toBeDefined();
  });

  it('socket A disconnect DOES remove user from its own room', async () => {
    const userId = 'solo-user';
    const socket = createMockSocket(userId, 'Solo', 'A');
    const io = createMockIo();

    registerLobbyHandlers(io as unknown as Server, socket as unknown as Socket);

    await socket._trigger('lobby:create_room');
    const roomId = getPlayerRoom(userId);
    expect(roomId).toBeDefined();

    socket._trigger('disconnect');

    // Room should be gone (last player left on disconnect)
    expect(getPlayerRoom(userId)).toBeUndefined();
    expect(getRoom(roomId!)).toBeUndefined();
    // No need to push to createdRooms — room was deleted by handler
  });

  it('disconnect after lobby:leave_room does not double-leave', async () => {
    const userId = 'leave-then-disconnect';
    const socket = createMockSocket(userId, 'Leaver', 'A');
    const io = createMockIo();

    registerLobbyHandlers(io as unknown as Server, socket as unknown as Socket);

    await socket._trigger('lobby:create_room');
    const roomId = getPlayerRoom(userId);
    expect(roomId).toBeDefined();

    // Manually leave the room
    socket._trigger('lobby:leave_room', { roomId: roomId! });

    // Room is gone (solo player left)
    expect(getPlayerRoom(userId)).toBeUndefined();

    // Now disconnect — should be a no-op, not throw
    expect(() => socket._trigger('disconnect')).not.toThrow();
  });
});

describe('lobby:join_room', () => {
  it('joining a room sets myRoomId so disconnect removes the player', async () => {
    const hostId = 'host';
    const guestId = 'guest';
    const hostSocket = createMockSocket(hostId, 'Host', 'H');
    const guestSocket = createMockSocket(guestId, 'Guest', 'G');
    const io = createMockIo();

    registerLobbyHandlers(io as unknown as Server, hostSocket as unknown as Socket);
    registerLobbyHandlers(io as unknown as Server, guestSocket as unknown as Socket);

    // Host creates room
    await hostSocket._trigger('lobby:create_room');
    const roomId = getPlayerRoom(hostId);
    expect(roomId).toBeDefined();
    if (roomId) createdRooms.push(roomId);

    // Guest joins
    await guestSocket._trigger('lobby:join_room', { roomId: roomId! });
    expect(getRoom(roomId!)?.players).toHaveLength(2);

    // Guest disconnects → should be removed from room but room stays (host is still there)
    guestSocket._trigger('disconnect');

    const room = getRoom(roomId!);
    expect(room).toBeDefined();
    expect(room?.players).toHaveLength(1);
    expect(room?.players[0].userId).toBe(hostId);
  });
});

describe('lobby:create_room (second call replaces first room)', () => {
  it('creating a second room leaves the first one', async () => {
    const userId = 'multi-room';
    const socket = createMockSocket(userId, 'Creator', 'A');
    const io = createMockIo();

    registerLobbyHandlers(io as unknown as Server, socket as unknown as Socket);

    await socket._trigger('lobby:create_room');
    const roomId1 = getPlayerRoom(userId);
    expect(roomId1).toBeDefined();

    await socket._trigger('lobby:create_room');
    const roomId2 = getPlayerRoom(userId);
    expect(roomId2).toBeDefined();

    // Different rooms
    expect(roomId2).not.toBe(roomId1);

    // First room is gone (player left)
    expect(getRoom(roomId1!)).toBeUndefined();

    if (roomId2) createdRooms.push(roomId2);
  });
});
