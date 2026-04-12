import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { env } from './config/env';
import { authRouter } from './auth/authRouter';
import { verifyToken, getUserById } from './auth/authService';
import { registerLobbyHandlers } from './socket/lobbyHandlers';
import { registerGameHandlers } from './socket/gameHandlers';
import type { ClientToServerEvents, ServerToClientEvents } from '@isekai/shared';

const app = express();
const httpServer = createServer(app);

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: env.clientUrl,
    credentials: true,
  },
  pingInterval: 25_000,
  pingTimeout: 10_000,
});

// Middleware
app.use(cors({ origin: env.clientUrl, credentials: true }));
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// REST routes
app.use('/api/auth', authRouter);

// Socket.io JWT auth middleware
io.use(async (socket, next) => {
  const token = socket.handshake.auth['token'] as string | undefined;
  if (!token) {
    return next(new Error('認証トークンが必要です'));
  }

  try {
    const { userId } = verifyToken(token);
    const user = await getUserById(userId);
    if (!user) return next(new Error('ユーザーが見つかりません'));

    socket.data = { userId: user.id, username: user.username };
    next();
  } catch {
    next(new Error('無効な認証トークンです'));
  }
});

// Socket.io connection handler
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id} (user: ${(socket.data as { username: string }).username})`);

  registerLobbyHandlers(io, socket);
  registerGameHandlers(io, socket);

  socket.on('disconnect', (reason) => {
    console.log(`Socket disconnected: ${socket.id} — ${reason}`);
  });
});

httpServer.listen(env.port, () => {
  console.log(`Server running on port ${env.port} (${env.nodeEnv})`);
});
