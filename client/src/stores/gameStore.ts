import { create } from 'zustand';
import type { GameRoom, Player, CombatState, BettingState, ItemId } from '@isekai/shared';

interface SquareEvent {
  type: string;
  payload: unknown;
}

interface GameState {
  gameRoom: GameRoom | null;
  myPlayerId: string | null;
  currentTurnPlayerId: string | null;
  turnNumber: number;
  lastDiceRoll: number | null;
  lastSquareEvent: SquareEvent | null;
  combat: CombatState | null;
  betting: BettingState | null;
  bettingOpen: boolean;
  bettingExpiresAt: number | null;
  deathPromptPlayerId: string | null;
  shopItems: ItemId[] | null;
  winner: { playerId: string; username: string } | null;

  setGameRoom: (room: GameRoom) => void;
  setMyPlayerId: (id: string) => void;
  updatePlayer: (player: Player) => void;
  setTurnStart: (playerId: string, turnNumber: number) => void;
  setDiceResult: (playerId: string, roll: number, newPosition: number) => void;
  setSquareEvent: (type: string, payload: unknown) => void;
  setCombat: (combat: CombatState | null) => void;
  setBetting: (betting: BettingState | null) => void;
  setBettingWindow: (open: boolean, expiresAt?: number) => void;
  setDeathPrompt: (playerId: string | null) => void;
  setShopItems: (items: ItemId[] | null) => void;
  setWinner: (playerId: string, username: string) => void;
  reset: () => void;
}

const initialState = {
  gameRoom: null,
  myPlayerId: null,
  currentTurnPlayerId: null,
  turnNumber: 1,
  lastDiceRoll: null,
  lastSquareEvent: null,
  combat: null,
  betting: null,
  bettingOpen: false,
  bettingExpiresAt: null,
  deathPromptPlayerId: null,
  shopItems: null,
  winner: null,
};

export const useGameStore = create<GameState>((set, get) => ({
  ...initialState,

  setGameRoom: (room) => set({ gameRoom: room }),

  setMyPlayerId: (id) => set({ myPlayerId: id }),

  updatePlayer: (player) => {
    const room = get().gameRoom;
    if (!room) return;
    const players = room.players.map(p => p.id === player.id ? player : p);
    set({ gameRoom: { ...room, players } });
  },

  setTurnStart: (playerId, turnNumber) =>
    set({ currentTurnPlayerId: playerId, turnNumber, lastDiceRoll: null, lastSquareEvent: null }),

  setDiceResult: (playerId, roll, newPosition) => {
    set({ lastDiceRoll: roll });
    const room = get().gameRoom;
    if (!room) return;
    const players = room.players.map(p =>
      p.id === playerId ? { ...p, position: newPosition } : p
    );
    set({ gameRoom: { ...room, players } });
  },

  setSquareEvent: (type, payload) => set({ lastSquareEvent: { type, payload } }),

  setCombat: (combat) => set({ combat }),

  setBetting: (betting) => set({ betting }),

  setBettingWindow: (open, expiresAt) => set({ bettingOpen: open, bettingExpiresAt: expiresAt ?? null }),

  setDeathPrompt: (playerId) => set({ deathPromptPlayerId: playerId }),

  setShopItems: (items) => set({ shopItems: items }),

  setWinner: (playerId, username) => set({ winner: { playerId, username } }),

  reset: () => set(initialState),
}));
