import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@isekai/shared';
import * as lobby from '../lobby/lobbyManager';
import { triggerGameStart } from './gameHandlers';

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
type AppServer = Server<ClientToServerEvents, ServerToClientEvents>;

export function registerLobbyHandlers(io: AppServer, socket: AppSocket) {
  const userId: string = (socket.data as { userId: string; username: string }).userId;
  const username: string = (socket.data as { userId: string; username: string }).username;

  // Send current room list on join
  socket.on('lobby:join', () => {
    console.log(`[lobby:join] user=${username} socket=${socket.id}`);
    socket.join('lobby');
    socket.emit('lobby:room_list', { rooms: lobby.listRooms() });
  });

  socket.on('lobby:create_room', async () => {
    console.log(`[lobby:create_room] user=${username} socket=${socket.id}`);
    try {
      // Leave any existing room first
      const existingRoomId = lobby.getPlayerRoom(userId);
      if (existingRoomId) {
        leaveAndNotify(io, socket, userId, existingRoomId);
      }

      const state = lobby.createRoom(userId, username);
      await socket.join(state.room.id);
      console.log(`[lobby:room_update] emitting to socket=${socket.id} room=${state.room.id}`);
      socket.emit('lobby:room_update', { room: state.room, players: state.players });
      broadcastRoomList(io);
    } catch (err) {
      console.error(`[lobby:create_room] error: ${err instanceof Error ? err.message : err}`);
      socket.emit('lobby:error', { message: err instanceof Error ? err.message : 'ルーム作成に失敗しました' });
    }
  });

  socket.on('lobby:join_room', async ({ roomId }) => {
    try {
      const existingRoomId = lobby.getPlayerRoom(userId);
      if (existingRoomId && existingRoomId !== roomId) {
        leaveAndNotify(io, socket, userId, existingRoomId);
      }

      const state = lobby.joinRoom(roomId, userId, username);
      await socket.join(roomId);
      io.to(roomId).emit('lobby:room_update', { room: state.room, players: state.players });
      broadcastRoomList(io);
    } catch (err) {
      socket.emit('lobby:error', { message: err instanceof Error ? err.message : 'ルームへの参加に失敗しました' });
    }
  });

  socket.on('lobby:leave_room', ({ roomId }) => {
    leaveAndNotify(io, socket, userId, roomId);
  });

  socket.on('lobby:ready', ({ roomId, ready }) => {
    try {
      const state = lobby.setReady(roomId, userId, ready);
      io.to(roomId).emit('lobby:room_update', { room: state.room, players: state.players });

      if (lobby.isAllReady(roomId)) {
        lobby.markRoomPlaying(roomId);
        broadcastRoomList(io);
        const roomState = lobby.getRoom(roomId);
        if (roomState) {
          triggerGameStart(
            io,
            roomId,
            roomState.players.map(p => ({ userId: p.userId, username: p.username }))
          );
        }
      }
    } catch (err) {
      socket.emit('lobby:error', { message: err instanceof Error ? err.message : 'レディ状態の更新に失敗しました' });
    }
  });

  socket.on('disconnect', () => {
    const roomId = lobby.getPlayerRoom(userId);
    if (roomId) leaveAndNotify(io, socket, userId, roomId);
  });
}

function leaveAndNotify(io: AppServer, socket: AppSocket, userId: string, roomId: string) {
  const state = lobby.leaveRoom(roomId, userId);
  socket.leave(roomId);
  if (state) {
    io.to(roomId).emit('lobby:room_update', { room: state.room, players: state.players });
  }
  broadcastRoomList(io);
}

function broadcastRoomList(io: AppServer) {
  io.to('lobby').emit('lobby:room_list', { rooms: lobby.listRooms() });
}
