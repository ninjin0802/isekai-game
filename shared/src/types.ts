import type { ItemId, MonsterId } from './constants';

// ─── Enums / Literal Unions ───────────────────────────────────────────────────

export type SquareType = 'battle' | 'shop' | 'recovery' | 'event' | 'boss';
export type GameStatus = 'waiting' | 'playing' | 'finished';
export type ItemType = 'weapon' | 'potion' | 'accessory';
export type CombatAction = 'attack' | 'defend' | 'item' | 'flee';
export type BetTarget = 'player_wins' | 'monster_wins';
export type BetResult = 'won' | 'lost' | 'pending';
export type DeathPenaltyChoice = 'lose_gold' | 'return_start';

// ─── Map ──────────────────────────────────────────────────────────────────────

export interface MapSquare {
  index: number;
  type: SquareType;
  monsterId?: MonsterId;
}

// ─── Player ───────────────────────────────────────────────────────────────────

export interface InventoryItem {
  itemId: ItemId;
  quantity: number;
}

export interface Player {
  id: string;           // game_players.id
  userId: string;
  username: string;
  position: number;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  gold: number;
  isAlive: boolean;
  turnOrder: number;
  equippedWeaponId?: ItemId;
  inventory: InventoryItem[];
  attackBonus: number;  // from equipped weapon
}

// ─── Monster ─────────────────────────────────────────────────────────────────

export interface Monster {
  id: MonsterId;
  name: string;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
}

// ─── Combat ──────────────────────────────────────────────────────────────────

export type CombatType = 'pve' | 'pvp';

export interface CombatState {
  battleId: string;
  type: CombatType;
  phase: 'betting' | 'active' | 'finished';
  combatantId: string;        // player ID
  opponentId: string;         // player ID (pvp) or monster ID (pve)
  monster?: Monster;          // pve only
  combatantHp: number;
  opponentHp: number;
  turn: 'combatant' | 'opponent';
  round: number;
  log: CombatLogEntry[];
}

export interface CombatLogEntry {
  round: number;
  actor: string;
  action: CombatAction | 'monster_attack' | 'breath_attack';
  damage?: number;
  heal?: number;
  message: string;
}

// ─── Betting ─────────────────────────────────────────────────────────────────

export interface Bet {
  bettorId: string;
  bettorUsername: string;
  betOn: BetTarget;
  amount: number;
  result: BetResult;
}

export interface BettingState {
  battleId: string;
  bets: Bet[];
  totalPot: number;
  windowOpen: boolean;
  expiresAt: number; // epoch ms
}

// ─── Game Room ────────────────────────────────────────────────────────────────

export interface GameRoom {
  id: string;
  status: GameStatus;
  players: Player[];
  currentTurnIndex: number;
  turnNumber: number;
  mapSeed: number;
  map: MapSquare[];
  combat?: CombatState;
  betting?: BettingState;
  winnerId?: string;
}

// ─── Lobby ────────────────────────────────────────────────────────────────────

export interface LobbyRoom {
  id: string;
  playerCount: number;
  maxPlayers: number;
  status: GameStatus;
  hostUsername: string;
}

export interface LobbyPlayer {
  userId: string;
  username: string;
  ready: boolean;
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  username: string;
  email: string;
}

// ─── Socket Events ───────────────────────────────────────────────────────────

// Client → Server
export interface ClientToServerEvents {
  'lobby:join': () => void;
  'lobby:create_room': () => void;
  'lobby:join_room': (data: { roomId: string }) => void;
  'lobby:leave_room': (data: { roomId: string }) => void;
  'lobby:ready': (data: { roomId: string; ready: boolean }) => void;
  'game:roll_dice': (data: { roomId: string }) => void;
  'game:move_confirm': (data: { roomId: string }) => void;
  'combat:action': (data: { roomId: string; battleId: string; action: CombatAction; itemId?: ItemId }) => void;
  'shop:buy': (data: { roomId: string; itemId: ItemId }) => void;
  'shop:skip': (data: { roomId: string }) => void;
  'bet:place': (data: { roomId: string; battleId: string; betOn: BetTarget; amount: number }) => void;
  'death:choose': (data: { roomId: string; choice: DeathPenaltyChoice }) => void;
}

// Server → Client
export interface ServerToClientEvents {
  'lobby:room_list': (data: { rooms: LobbyRoom[] }) => void;
  'lobby:room_update': (data: { room: LobbyRoom; players: LobbyPlayer[] }) => void;
  'lobby:error': (data: { message: string }) => void;
  'game:start': (data: { gameRoom: GameRoom }) => void;
  'game:turn_start': (data: { playerId: string; turnNumber: number }) => void;
  'game:dice_result': (data: { playerId: string; roll: number; newPosition: number; squareType: SquareType }) => void;
  'game:square_event': (data: { type: SquareType; payload: unknown }) => void;
  'combat:start': (data: { combat: CombatState; betting: BettingState }) => void;
  'combat:update': (data: { combat: CombatState }) => void;
  'combat:end': (data: { battleId: string; winnerId: string; rewards: { gold: number } }) => void;
  'bet:window_open': (data: { battleId: string; expiresAt: number }) => void;
  'bet:window_close': (data: { battleId: string; totalPot: number; bets: Bet[] }) => void;
  'bet:result': (data: { battleId: string; payouts: { playerId: string; delta: number }[] }) => void;
  'shop:open': (data: { items: ItemId[]; roomId: string }) => void;
  'player:update': (data: { player: Player }) => void;
  'player:death': (data: { playerId: string }) => void;
  'death:choose_prompt': (data: { playerId: string }) => void;
  'pvp:trigger': (data: { combat: CombatState; betting: BettingState }) => void;
  'game:winner': (data: { winnerId: string; username: string; stats: GameStats }) => void;
  'game:reconnect_state': (data: { gameRoom: GameRoom }) => void;
  'game:error': (data: { message: string }) => void;
}

export interface GameStats {
  totalGoldEarned: number;
  monstersDefeated: number;
  betsWon: number;
  turnsPlayed: number;
}
