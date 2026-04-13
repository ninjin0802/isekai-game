/**
 * useSocket hook - TDD tests
 *
 * Bug: useSocket returns module-level `socketInstance` directly.
 * After mount, the effect creates the socket but the component never
 * re-renders, so `socket` stays null and all emit/on calls are no-ops.
 *
 * Fix: useSocket must use React state so that when the socket is
 * created, components re-render and see the non-null socket.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAuthStore } from '../stores/authStore';

// ─── Mock socket.io-client ────────────────────────────────────────────────────
const mockSocket = {
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
  disconnect: vi.fn(),
  connected: false,
};

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => mockSocket),
}));

// ─── Tests ────────────────────────────────────────────────────────────────────
describe('useSocket', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset auth store
    useAuthStore.setState({ user: null, token: null });
  });

  afterEach(() => {
    useAuthStore.setState({ user: null, token: null });
  });

  it('returns null when no token is set', async () => {
    const { useSocket } = await import('../hooks/useSocket');
    const { result } = renderHook(() => useSocket());
    expect(result.current).toBeNull();
  });

  it('returns a socket instance after token is set (triggers re-render)', async () => {
    const { useSocket } = await import('../hooks/useSocket');
    const { result } = renderHook(() => useSocket());

    expect(result.current).toBeNull();

    // Set token (simulates login)
    act(() => {
      useAuthStore.setState({
        token: 'test-jwt-token',
        user: { id: 'user-1', username: 'testuser', email: 'test@test.com' },
      });
    });

    // The hook must trigger a re-render so the component sees the socket
    await waitFor(() => {
      expect(result.current).not.toBeNull();
    });
  });

  it('socket returned by hook is the same instance as io() created', async () => {
    const { io } = await import('socket.io-client');
    const { useSocket } = await import('../hooks/useSocket');
    const { result } = renderHook(() => useSocket());

    act(() => {
      useAuthStore.setState({
        token: 'test-jwt-token',
        user: { id: 'user-1', username: 'testuser', email: 'test@test.com' },
      });
    });

    await waitFor(() => {
      expect(result.current).not.toBeNull();
    });

    expect(io).toHaveBeenCalledOnce();
    expect(result.current).toBe(mockSocket);
  });

  it('disconnects and returns null when token is cleared (logout)', async () => {
    const { useSocket } = await import('../hooks/useSocket');
    const { result } = renderHook(() => useSocket());

    act(() => {
      useAuthStore.setState({
        token: 'test-jwt-token',
        user: { id: 'user-1', username: 'testuser', email: 'test@test.com' },
      });
    });

    await waitFor(() => expect(result.current).not.toBeNull());

    act(() => {
      useAuthStore.setState({ token: null, user: null });
    });

    await waitFor(() => expect(result.current).toBeNull());
    expect(mockSocket.disconnect).toHaveBeenCalled();
  });
});
