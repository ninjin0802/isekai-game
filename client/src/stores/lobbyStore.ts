import { create } from 'zustand';
import type { LobbyRoom, LobbyPlayer } from '@isekai/shared';

interface LobbyState {
  rooms: LobbyRoom[];
  currentRoom: LobbyRoom | null;
  currentRoomPlayers: LobbyPlayer[];
  error: string | null;
  setRooms: (rooms: LobbyRoom[]) => void;
  setCurrentRoom: (room: LobbyRoom, players: LobbyPlayer[]) => void;
  clearRoom: () => void;
  setError: (error: string | null) => void;
}

export const useLobbyStore = create<LobbyState>((set) => ({
  rooms: [],
  currentRoom: null,
  currentRoomPlayers: [],
  error: null,
  setRooms: (rooms) => set({ rooms }),
  setCurrentRoom: (room, players) => set({ currentRoom: room, currentRoomPlayers: players }),
  clearRoom: () => set({ currentRoom: null, currentRoomPlayers: [] }),
  setError: (error) => set({ error }),
}));
