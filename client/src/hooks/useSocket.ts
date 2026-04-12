import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@isekai/shared';
import { useAuthStore } from '../stores/authStore';

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socketInstance: AppSocket | null = null;

export function getSocket(): AppSocket | null {
  return socketInstance;
}

export function useSocket() {
  const token = useAuthStore(s => s.token);
  const initialized = useRef(false);

  useEffect(() => {
    if (!token || initialized.current) return;
    initialized.current = true;

    // VITE_SERVER_URL: 本番では同一オリジン（空文字）、開発では http://localhost:3001
    const serverUrl = import.meta.env.VITE_SERVER_URL ?? '';
    socketInstance = io(serverUrl, {
      auth: { token },
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketInstance.on('connect', () => {
      console.log('Socket connected');
    });

    socketInstance.on('connect_error', (err) => {
      console.error('Socket connect error:', err.message);
    });

    return () => {
      socketInstance?.disconnect();
      socketInstance = null;
      initialized.current = false;
    };
  }, [token]);

  return socketInstance;
}
