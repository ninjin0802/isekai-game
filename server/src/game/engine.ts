import { v4 as uuidv4 } from 'uuid';
import type {
  GameRoom,
  Player,
  MapSquare,
  SquareType,
} from '@isekai/shared';
import {
  START_GOLD,
  BOARD_SIZE,
  DICE_SIDES,
  RANDOM_EVENTS,
} from '@isekai/shared';
import { generateMap } from './map';
import { seededRandom, rollDie, randomInt } from '../utils/seededRandom';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GameStartInput {
  roomId: string;
  players: Array<{ userId: string; username: string }>;
}

export type SquareEventResult =
  | { kind: 'battle'; monsterId: string }
  | { kind: 'boss'; monsterId: string }
  | { kind: 'shop' }
  | { kind: 'recovery'; hpGained: number }
  | { kind: 'event'; description: string; effects: EventEffects }
  | { kind: 'start' };

interface EventEffects {
  goldDelta?: number;
  hpDelta?: number;
  movesDelta?: number;
  attackDelta?: number;
  itemId?: string;
}

// ─── Engine ───────────────────────────────────────────────────────────────────

const games = new Map<string, GameRoom>();

/** Create a new GameRoom and store it. Returns the initial state. */
export function startGame(input: GameStartInput): GameRoom {
  const seed = Math.floor(Math.random() * 2 ** 31);
  const map = generateMap(seed);

  const players: Player[] = input.players.map((p, i) => ({
    id: uuidv4(),
    userId: p.userId,
    username: p.username,
    position: 0,
    hp: 100,
    maxHp: 100,
    attack: 10,
    defense: 5,
    gold: START_GOLD,
    isAlive: true,
    turnOrder: i,
    inventory: [],
    attackBonus: 0,
  }));

  const room: GameRoom = {
    id: input.roomId,
    status: 'playing',
    players,
    currentTurnIndex: 0,
    turnNumber: 1,
    mapSeed: seed,
    map,
  };

  games.set(input.roomId, room);
  return room;
}

export function getGame(roomId: string): GameRoom | undefined {
  return games.get(roomId);
}

export function removeGame(roomId: string): void {
  games.delete(roomId);
}

/** Returns the player whose turn it currently is. */
export function currentPlayer(room: GameRoom): Player {
  const p = room.players.find(p => p.turnOrder === room.currentTurnIndex);
  if (!p) throw new Error('Current player not found');
  return p;
}

/**
 * Roll dice and move the current player.
 * Returns the roll value, new position, the square landed on, and any
 * position collision (PVP trigger).
 */
export function rollAndMove(room: GameRoom): {
  roll: number;
  newPosition: number;
  square: MapSquare;
  pvpTargetId?: string;
} {
  const player = currentPlayer(room);
  if (!player.isAlive) {
    throw new Error('死亡しているプレイヤーはサイコロを振れません');
  }

  // Cryptographically random roll for live gameplay (not seeded)
  const roll = Math.floor(Math.random() * DICE_SIDES) + 1;
  const newPosition = Math.min(player.position + roll, BOARD_SIZE - 1);
  player.position = newPosition;

  const square = room.map[newPosition];
  if (!square) throw new Error(`Invalid position ${newPosition}`);

  // Check PVP: another alive player on the same square
  const pvpTarget = room.players.find(
    p => p.id !== player.id && p.position === newPosition && p.isAlive
  );

  return { roll, newPosition, square, pvpTargetId: pvpTarget?.id };
}

/**
 * Resolve the landing square event.
 * For battle/boss: caller is responsible for starting combat.
 * For recovery/event: applies effects immediately and returns result.
 */
export function resolveSquareEvent(room: GameRoom, square: MapSquare): SquareEventResult {
  const player = currentPlayer(room);

  switch (square.type) {
    case 'battle':
      return { kind: 'battle', monsterId: square.monsterId! };

    case 'boss':
      return { kind: 'boss', monsterId: 'dragon' };

    case 'shop':
      return { kind: 'shop' };

    case 'recovery': {
      if (square.index === 0) return { kind: 'start' };
      const hpGained = Math.floor(player.maxHp * 0.5);
      player.hp = Math.min(player.hp + hpGained, player.maxHp);
      return { kind: 'recovery', hpGained };
    }

    case 'event': {
      const rng = seededRandom(Date.now() ^ player.turnOrder);
      const roll = Math.floor(rng() * RANDOM_EVENTS.length);
      const ev = RANDOM_EVENTS[roll];
      const effects: EventEffects = {};

      if ('goldDelta' in ev && ev.goldDelta !== 0) {
        effects.goldDelta = ev.goldDelta;
        player.gold = Math.max(0, player.gold + ev.goldDelta);
      }
      if ('hpDelta' in ev) {
        effects.hpDelta = ev.hpDelta;
        player.hp = Math.min(player.maxHp, Math.max(1, player.hp + ev.hpDelta));
      }
      if ('movesDelta' in ev) {
        effects.movesDelta = ev.movesDelta;
        player.position = Math.min(
          BOARD_SIZE - 1,
          Math.max(0, player.position + ev.movesDelta)
        );
      }
      if ('attackDelta' in ev) {
        effects.attackDelta = ev.attackDelta;
        player.attack += ev.attackDelta;
      }
      if ('itemId' in ev) {
        effects.itemId = ev.itemId;
        const existing = player.inventory.find(i => i.itemId === ev.itemId);
        if (existing) {
          existing.quantity++;
        } else {
          player.inventory.push({ itemId: ev.itemId as never, quantity: 1 });
        }
      }

      return { kind: 'event', description: ev.description, effects };
    }
  }
}

/** Advance to the next player's turn. Skips dead players. */
export function advanceTurn(room: GameRoom): void {
  const alivePlayers = room.players.filter(p => p.isAlive);
  if (alivePlayers.length === 0) return;

  let next = (room.currentTurnIndex + 1) % room.players.length;
  // Skip dead players
  let attempts = 0;
  while (!room.players.find(p => p.turnOrder === next)?.isAlive) {
    next = (next + 1) % room.players.length;
    if (++attempts > room.players.length) break;
  }
  room.currentTurnIndex = next;
  room.turnNumber++;
}

/** Apply death penalty choice to a player. */
export function applyDeathPenalty(
  room: GameRoom,
  playerId: string,
  choice: 'lose_gold' | 'return_start'
): Player {
  const player = room.players.find(p => p.id === playerId);
  if (!player) throw new Error('Player not found');

  if (choice === 'lose_gold') {
    player.gold = 0;
  } else {
    player.position = 0;
  }

  // Restore HP
  player.hp = player.maxHp;
  player.isAlive = true;

  return player;
}

/** Mark the game as finished with a winner. */
export function finishGame(room: GameRoom, winnerId: string): void {
  room.status = 'finished';
  room.winnerId = winnerId;
}

/** Snapshot the full game state for reconnection. */
export function getReconnectState(roomId: string): GameRoom | undefined {
  return games.get(roomId);
}
