import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@isekai/shared';
import { useAuthStore } from '../stores/authStore';

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

// Module-level reference for getSocket() (backward compat)
let socketInstance: AppSocket | null = null;

export function getSocket(): AppSocket | null {
  return socketInstance;
}

/**
 * Provides a socket.io connection tied to the current auth token.
 *
 * Uses React state so that when the socket is created the component
 * re-renders and sees the non-null socket. (Previously, the hook returned
 * the module-level `socketInstance` directly, which meant components captured
 * `null` on first render and never re-rendered when the socket connected.)
 */
export function useSocket() {
  const token = useAuthStore(s => s.token);
  const [socket, setSocket] = useState<AppSocket | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (!token || initialized.current) return;
    initialized.current = true;

    // VITE_SERVER_URL: 本番では同一オリジン（空文字）、開発では http://localhost:3001
    const serverUrl = import.meta.env.VITE_SERVER_URL ?? '';
    const newSocket = io(serverUrl, {
      auth: { token },
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketInstance = newSocket;
    setSocket(newSocket); // trigger re-render so components see the socket

    newSocket.on('connect', () => {
      console.log('Socket connected');
    });

    newSocket.on('connect_error', (err) => {
      console.error('Socket connect error:', err.message);
    });

    return () => {
      newSocket.disconnect();
      socketInstance = null;
      setSocket(null);
      initialized.current = false;
    };
  }, [token]);

  return socket;
}
