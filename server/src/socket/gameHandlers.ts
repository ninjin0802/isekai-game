import type { Server, Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  GameRoom,
  CombatState,
  BettingState,
} from '@isekai/shared';
import { BETTING_WINDOW_SECONDS, ACTION_TIMEOUT_SECONDS } from '@isekai/shared';
import * as engine from '../game/engine';
import * as combat from '../game/combat';
import * as shop from '../game/shop';
import * as betting from '../game/betting';
import * as pvp from '../game/pvp';

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
type AppServer = Server<ClientToServerEvents, ServerToClientEvents>;

// ─── In-memory game state ─────────────────────────────────────────────────────
// roomId → active CombatState
const activeCombats = new Map<string, CombatState>();
// roomId → active BettingState
const activeBets = new Map<string, BettingState>();
// roomId → action timeout handle
const actionTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
// roomId → whether combatant was defending this round
const defendingState = new Map<string, boolean>();

// ─── Registration ─────────────────────────────────────────────────────────────

export function registerGameHandlers(io: AppServer, socket: AppSocket) {
  const userId: string = (socket.data as { userId: string; username: string }).userId;

  // ── Roll dice ──────────────────────────────────────────────────────────────
  socket.on('game:roll_dice', ({ roomId }) => {
    const room = engine.getGame(roomId);
    if (!room) return socket.emit('game:error', { message: 'ゲームが見つかりません' });
    if (activeCombats.has(roomId)) return socket.emit('game:error', { message: '戦闘中はサイコロを振れません' });

    const player = engine.currentPlayer(room);
    if (player.userId !== userId) {
      return socket.emit('game:error', { message: 'あなたのターンではありません' });
    }

    try {
      const { roll, newPosition, square, pvpTargetId } = engine.rollAndMove(room);

      io.to(roomId).emit('game:dice_result', {
        playerId: player.id,
        roll,
        newPosition,
        squareType: square.type,
      });
      io.to(roomId).emit('player:update', { player });

      if (pvpTargetId) {
        const defender = room.players.find(p => p.id === pvpTargetId);
        if (defender) {
          io.to(roomId).emit('game:square_event', {
            type: 'battle',
            payload: { message: `⚔️ ${player.username} vs ${defender.username} — コロシアム発生！` },
          });
          startPvPBattle(io, room, roomId, player.id, defender.id);
        } else {
          engine.advanceTurn(room);
          emitTurnStart(io, room, roomId);
        }
        return;
      }

      const result = engine.resolveSquareEvent(room, square);

      switch (result.kind) {
        case 'start':
          io.to(roomId).emit('game:square_event', { type: 'recovery', payload: { message: 'スタート地点！' } });
          engine.advanceTurn(room);
          emitTurnStart(io, room, roomId);
          break;

        case 'recovery':
          io.to(roomId).emit('game:square_event', {
            type: 'recovery',
            payload: { hpGained: result.hpGained, message: `HPが${result.hpGained}回復した！` },
          });
          io.to(roomId).emit('player:update', { player });
          engine.advanceTurn(room);
          emitTurnStart(io, room, roomId);
          break;

        case 'event':
          io.to(roomId).emit('game:square_event', {
            type: 'event',
            payload: { description: result.description, effects: result.effects },
          });
          io.to(roomId).emit('player:update', { player });
          engine.advanceTurn(room);
          emitTurnStart(io, room, roomId);
          break;

        case 'shop': {
          io.to(roomId).emit('game:square_event', { type: 'shop', payload: {} });
          const items = shop.getShopInventory(player.position);
          // Only the current player opens the shop; others see the event
          socket.emit('shop:open', { items, roomId });
          // Turn advances when player emits shop:buy or shop:skip
          break;
        }

        case 'battle':
        case 'boss':
          startBattle(io, room, roomId, player.id, result.monsterId as string);
          break;
      }
    } catch (err) {
      socket.emit('game:error', { message: err instanceof Error ? err.message : 'エラーが発生しました' });
    }
  });

  // ── Combat action (PvE + PvP) ──────────────────────────────────────────────
  socket.on('combat:action', ({ roomId, battleId, action, itemId }) => {
    const room = engine.getGame(roomId);
    if (!room) return socket.emit('game:error', { message: 'ゲームが見つかりません' });

    const combatState = activeCombats.get(roomId);
    if (!combatState || combatState.battleId !== battleId) {
      return socket.emit('game:error', { message: '戦闘が見つかりません' });
    }
    if (combatState.phase !== 'active') {
      return socket.emit('game:error', { message: '戦闘はアクティブではありません' });
    }

    const player = room.players.find(p => p.userId === userId);
    if (!player) return socket.emit('game:error', { message: 'プレイヤーが見つかりません' });

    // ── PvP branch ────────────────────────────────────────────────────────────
    if (combatState.type === 'pvp') {
      const isAttacker = player.id === combatState.combatantId;
      const isDefender = player.id === combatState.opponentId;
      if (!isAttacker && !isDefender) {
        return socket.emit('game:error', { message: 'あなたはこの戦闘に参加していません' });
      }

      const expectedTurn: 'combatant' | 'opponent' = isAttacker ? 'combatant' : 'opponent';
      if (combatState.turn !== expectedTurn) {
        return socket.emit('game:error', { message: '相手のターンです' });
      }

      clearActionTimeout(roomId);

      try {
        const targetPlayer = isAttacker
          ? room.players.find(p => p.id === combatState.opponentId)!
          : room.players.find(p => p.id === combatState.combatantId)!;

        const usedItem = action === 'item' ? itemId : undefined;
        const result = pvp.processPvPAction(combatState, player, targetPlayer, action as 'attack' | 'defend' | 'item' | 'flee', itemId);
        activeCombats.set(roomId, result.state);
        io.to(roomId).emit('combat:update', { combat: result.state });

        if (result.finished) {
          return finishPvPBattle(io, room, roomId, result.state, result.winnerId, result.loserId, usedItem);
        }

        scheduleActionTimeout(io, room, roomId);
      } catch (err) {
        socket.emit('game:error', { message: err instanceof Error ? err.message : 'エラーが発生しました' });
      }
      return;
    }

    // ── PvE branch ────────────────────────────────────────────────────────────
    if (player.id !== combatState.combatantId) {
      return socket.emit('game:error', { message: 'あなたは戦闘中ではありません' });
    }

    clearActionTimeout(roomId);

    try {
      const defending = action === 'defend';
      defendingState.set(roomId, defending);

      const playerResult = combat.processPlayerAction(combatState, player, action, itemId);
      activeCombats.set(roomId, playerResult.state);

      const usedItem = action === 'item' ? itemId : undefined;

      if (playerResult.finished) {
        return finishBattle(io, room, roomId, playerResult.state, playerResult.winner!, playerResult.goldReward ?? 0, usedItem);
      }

      const wasDefending = combat.wasLastActionDefend(playerResult.state);
      const monsterResult = combat.processMonsterAttack(playerResult.state, player, wasDefending);
      activeCombats.set(roomId, monsterResult.state);
      io.to(roomId).emit('combat:update', { combat: monsterResult.state });

      if (monsterResult.finished) {
        return finishBattle(io, room, roomId, monsterResult.state, monsterResult.winner!, 0, usedItem);
      }

      scheduleActionTimeout(io, room, roomId);
    } catch (err) {
      socket.emit('game:error', { message: err instanceof Error ? err.message : 'エラーが発生しました' });
    }
  });

  // ── Bet: place ────────────────────────────────────────────────────────────
  socket.on('bet:place', ({ roomId, battleId, betOn, amount }) => {
    const room = engine.getGame(roomId);
    if (!room) return socket.emit('game:error', { message: 'ゲームが見つかりません' });

    const bettingState = activeBets.get(roomId);
    if (!bettingState || !bettingState.windowOpen || bettingState.battleId !== battleId) {
      return socket.emit('game:error', { message: '賭け受付は終了しています' });
    }

    const player = room.players.find(p => p.userId === userId);
    if (!player) return socket.emit('game:error', { message: 'プレイヤーが見つかりません' });

    // Combatant cannot bet on their own fight
    const combatState = activeCombats.get(roomId);
    if (combatState && combatState.combatantId === player.id) {
      return socket.emit('game:error', { message: '自分の戦闘には賭けられません' });
    }

    if (amount < 10) return socket.emit('game:error', { message: '最低賭け金は 10G です' });
    if (player.gold < amount) {
      return socket.emit('game:error', { message: `ゴールドが足りません (所持: ${player.gold}G)` });
    }

    // Refund previous bet if replacing
    const existing = bettingState.bets.find(b => b.bettorId === player.id);
    if (existing) {
      betting.refundPreviousBet(room, player.id, existing.amount);
    }

    // Deduct new bet amount
    const ok = betting.deductBetFromPlayer(room, player.id, amount);
    if (!ok) return socket.emit('game:error', { message: 'ゴールドが足りません' });

    // Place bet
    try {
      betting.placeBet(bettingState, {
        battleId,
        bettorPlayerId: player.id,
        bettorUsername: player.username,
        betOn,
        amount,
      });
    } catch (err) {
      // Refund on error
      betting.refundPreviousBet(room, player.id, amount);
      return socket.emit('game:error', { message: err instanceof Error ? err.message : '賭けに失敗しました' });
    }

    // Broadcast updated pot to room
    io.to(roomId).emit('player:update', { player });
    io.to(roomId).emit('bet:window_open', { battleId, expiresAt: bettingState.expiresAt });
  });

  // ── Shop: buy ─────────────────────────────────────────────────────────────
  socket.on('shop:buy', ({ roomId, itemId }) => {
    const room = engine.getGame(roomId);
    if (!room) return socket.emit('game:error', { message: 'ゲームが見つかりません' });

    const player = room.players.find(p => p.userId === userId);
    if (!player) return socket.emit('game:error', { message: 'プレイヤーが見つかりません' });

    // Only the current turn player can shop
    const current = engine.currentPlayer(room);
    if (current.id !== player.id) {
      return socket.emit('game:error', { message: 'あなたのターンではありません' });
    }

    try {
      const { player: updated } = shop.purchaseItem(room, player.id, itemId);
      io.to(roomId).emit('player:update', { player: updated });

      // Re-open shop with updated gold (player can buy again if they want)
      const items = shop.getShopInventory(player.position);
      socket.emit('shop:open', { items, roomId });
    } catch (err) {
      socket.emit('game:error', { message: err instanceof Error ? err.message : '購入に失敗しました' });
    }
  });

  // ── Shop: skip / leave ────────────────────────────────────────────────────
  socket.on('shop:skip', ({ roomId }) => {
    const room = engine.getGame(roomId);
    if (!room) return;

    const player = room.players.find(p => p.userId === userId);
    if (!player) return;

    const current = engine.currentPlayer(room);
    if (current.id !== player.id) return;

    engine.advanceTurn(room);
    emitTurnStart(io, room, roomId);
  });

  // ── Death penalty choice ───────────────────────────────────────────────────
  socket.on('death:choose', ({ roomId, choice }) => {
    const room = engine.getGame(roomId);
    if (!room) return;

    const player = room.players.find(p => p.userId === userId);
    if (!player) return;

    try {
      const updated = engine.applyDeathPenalty(room, player.id, choice);
      io.to(roomId).emit('player:update', { player: updated });
      engine.advanceTurn(room);
      emitTurnStart(io, room, roomId);
    } catch (err) {
      socket.emit('game:error', { message: err instanceof Error ? err.message : 'エラーが発生しました' });
    }
  });

  socket.on('disconnect', () => {
    // Cleanup handled per-room, not per-socket
  });
}

// ─── Battle lifecycle ─────────────────────────────────────────────────────────

function startBattle(
  io: AppServer,
  room: GameRoom,
  roomId: string,
  combatantId: string,
  monsterId: string
) {
  const combatState = combat.createPvECombat(room, combatantId, monsterId as keyof typeof import('@isekai/shared').MONSTERS);
  activeCombats.set(roomId, combatState);

  const bettingState = betting.createBettingState(combatState.battleId);
  activeBets.set(roomId, bettingState);

  io.to(roomId).emit('combat:start', { combat: combatState, betting: bettingState });
  io.to(roomId).emit('bet:window_open', { battleId: combatState.battleId, expiresAt: bettingState.expiresAt });

  // After betting window closes, activate combat
  setTimeout(() => {
    const current = activeCombats.get(roomId);
    if (!current || current.battleId !== combatState.battleId) return;

    current.phase = 'active';
    activeCombats.set(roomId, current);

    const bs = activeBets.get(roomId);
    if (bs) betting.closeBettingWindow(bs);

    io.to(roomId).emit('bet:window_close', {
      battleId: combatState.battleId,
      totalPot: bs?.totalPot ?? 0,
      bets: bs?.bets ?? [],
    });
    io.to(roomId).emit('combat:update', { combat: current });

    scheduleActionTimeout(io, room, roomId);
  }, BETTING_WINDOW_SECONDS * 1000);
}

function finishBattle(
  io: AppServer,
  room: GameRoom,
  roomId: string,
  state: CombatState,
  winner: 'combatant' | 'monster',
  goldReward: number,
  usedItemId?: string
) {
  clearActionTimeout(roomId);
  activeCombats.delete(roomId);
  defendingState.delete(roomId);

  // Apply combat result to player
  const player = combat.applyCombatResult(room, state, winner, goldReward, usedItemId);

  // ── Resolve bets ────────────────────────────────────────────────────────────
  const bettingState = activeBets.get(roomId);
  activeBets.delete(roomId);

  if (bettingState && bettingState.bets.length > 0) {
    const combatResult: 'player_wins' | 'monster_wins' =
      winner === 'combatant' ? 'player_wins' : 'monster_wins';

    const resolution = betting.resolveBets(bettingState, combatResult, player.id);

    // Apply payouts (winners) — losers already had gold deducted on placement
    const updatedPlayers = betting.applyPayouts(room, resolution.payouts);

    // Combatant bonus if all bettors were wrong
    if (resolution.combatantBonus > 0) {
      player.gold += resolution.combatantBonus;
    }

    // Broadcast each updated player
    for (const p of updatedPlayers) {
      if (p.id !== player.id) {
        io.to(roomId).emit('player:update', { player: p });
      }
    }

    io.to(roomId).emit('bet:result', {
      battleId: state.battleId,
      payouts: resolution.payouts,
    });
  }

  // Check dragon kill → game win
  if (winner === 'combatant' && state.monster?.id === 'dragon') {
    engine.finishGame(room, player.id);
    io.to(roomId).emit('combat:end', {
      battleId: state.battleId,
      winnerId: player.id,
      rewards: { gold: goldReward },
    });
    io.to(roomId).emit('player:update', { player });
    io.to(roomId).emit('game:winner', {
      winnerId: player.id,
      username: player.username,
      stats: {
        totalGoldEarned: player.gold,
        monstersDefeated: 1,
        betsWon: 0,
        turnsPlayed: room.turnNumber,
      },
    });
    return;
  }

  io.to(roomId).emit('combat:end', {
    battleId: state.battleId,
    winnerId: winner === 'combatant' ? player.id : state.opponentId,
    rewards: { gold: goldReward },
  });
  io.to(roomId).emit('player:update', { player });

  if (!player.isAlive) {
    io.to(roomId).emit('player:death', { playerId: player.id });
    io.to(roomId).emit('death:choose_prompt', { playerId: player.id });
    return;
  }

  engine.advanceTurn(room);
  emitTurnStart(io, room, roomId);
}

// ─── Action timeout ───────────────────────────────────────────────────────────

function scheduleActionTimeout(io: AppServer, room: GameRoom, roomId: string) {
  clearActionTimeout(roomId);
  const handle = setTimeout(() => {
    const state = activeCombats.get(roomId);
    if (!state || state.phase !== 'active') return;

    try {
      if (state.type === 'pvp') {
        // Auto-attack for whichever PvP player's turn it is
        const actingId = state.turn === 'combatant' ? state.combatantId : state.opponentId;
        const actingPlayer = room.players.find(p => p.id === actingId);
        const targetId = state.turn === 'combatant' ? state.opponentId : state.combatantId;
        const targetPlayer = room.players.find(p => p.id === targetId);
        if (!actingPlayer || !targetPlayer) return;

        const result = pvp.processPvPAction(state, actingPlayer, targetPlayer, 'attack');
        activeCombats.set(roomId, result.state);
        io.to(roomId).emit('combat:update', { combat: result.state });

        if (result.finished) {
          return finishPvPBattle(io, room, roomId, result.state, result.winnerId, result.loserId);
        }
        scheduleActionTimeout(io, room, roomId);
      } else {
        // PvE auto-attack
        const player = room.players.find(p => p.id === state.combatantId);
        if (!player) return;

        defendingState.set(roomId, false);
        const playerResult = combat.processPlayerAction(state, player, 'attack');
        activeCombats.set(roomId, playerResult.state);

        if (playerResult.finished) {
          return finishBattle(io, room, roomId, playerResult.state, playerResult.winner!, playerResult.goldReward ?? 0);
        }

        const monsterResult = combat.processMonsterAttack(playerResult.state, player, false);
        activeCombats.set(roomId, monsterResult.state);
        io.to(roomId).emit('combat:update', { combat: monsterResult.state });

        if (monsterResult.finished) {
          return finishBattle(io, room, roomId, monsterResult.state, monsterResult.winner!, 0);
        }
        scheduleActionTimeout(io, room, roomId);
      }
    } catch {
      // Ignore timeout errors
    }
  }, ACTION_TIMEOUT_SECONDS * 1000);

  actionTimeouts.set(roomId, handle);
}

function clearActionTimeout(roomId: string) {
  const h = actionTimeouts.get(roomId);
  if (h) { clearTimeout(h); actionTimeouts.delete(roomId); }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function emitTurnStart(io: AppServer, room: GameRoom, roomId: string) {
  const next = engine.currentPlayer(room);
  io.to(roomId).emit('game:turn_start', { playerId: next.id, turnNumber: room.turnNumber });
}

// ─── PvP Battle lifecycle ─────────────────────────────────────────────────────

function startPvPBattle(
  io: AppServer,
  room: GameRoom,
  roomId: string,
  attackerId: string,
  defenderId: string
) {
  const attacker = room.players.find(p => p.id === attackerId)!;
  const defender = room.players.find(p => p.id === defenderId)!;

  const { state: combatState, attackerRoll, defenderRoll } = pvp.createPvPCombat(attacker, defender);
  activeCombats.set(roomId, combatState);

  const bettingState = betting.createBettingState(combatState.battleId);
  activeBets.set(roomId, bettingState);

  const firstTurnMsg = attackerRoll >= defenderRoll
    ? `${attacker.username}(🎲${attackerRoll}) が先攻！`
    : `${defender.username}(🎲${defenderRoll}) が先攻！`;

  // Emit pvp:trigger to room
  io.to(roomId).emit('pvp:trigger', { combat: combatState, betting: bettingState });
  io.to(roomId).emit('combat:start', { combat: { ...combatState, log: [{ round: 0, actor: '', action: 'attack', message: `⚔️ コロシアム！ ${firstTurnMsg}` }] }, betting: bettingState });
  io.to(roomId).emit('bet:window_open', { battleId: combatState.battleId, expiresAt: bettingState.expiresAt });

  setTimeout(() => {
    const current = activeCombats.get(roomId);
    if (!current || current.battleId !== combatState.battleId) return;

    current.phase = 'active';
    activeCombats.set(roomId, current);

    const bs = activeBets.get(roomId);
    if (bs) betting.closeBettingWindow(bs);

    io.to(roomId).emit('bet:window_close', {
      battleId: combatState.battleId,
      totalPot: bs?.totalPot ?? 0,
      bets: bs?.bets ?? [],
    });
    io.to(roomId).emit('combat:update', { combat: current });

    scheduleActionTimeout(io, room, roomId);
  }, BETTING_WINDOW_SECONDS * 1000);
}

function finishPvPBattle(
  io: AppServer,
  room: GameRoom,
  roomId: string,
  state: CombatState,
  winnerId: string | undefined,
  loserId: string | undefined,
  usedItemId?: string
) {
  clearActionTimeout(roomId);
  activeCombats.delete(roomId);
  defendingState.delete(roomId);

  const { winner, loser } = pvp.applyPvPResult(room, state, winnerId, loserId, usedItemId);

  // Resolve bets (use player_wins if there's a winner, monster_wins otherwise is N/A for pvp)
  const bettingState = activeBets.get(roomId);
  activeBets.delete(roomId);

  if (bettingState && bettingState.bets.length > 0 && winnerId) {
    // Reuse 'player_wins' to mean "combatant wins" in PvP context
    const combatResult: 'player_wins' | 'monster_wins' =
      winnerId === state.combatantId ? 'player_wins' : 'monster_wins';

    const resolution = betting.resolveBets(bettingState, combatResult, winnerId);
    const updatedPlayers = betting.applyPayouts(room, resolution.payouts);

    if (resolution.combatantBonus > 0 && winner) {
      winner.gold += resolution.combatantBonus;
    }

    for (const p of updatedPlayers) {
      io.to(roomId).emit('player:update', { player: p });
    }

    io.to(roomId).emit('bet:result', {
      battleId: state.battleId,
      payouts: resolution.payouts,
    });
  }

  io.to(roomId).emit('combat:end', {
    battleId: state.battleId,
    winnerId: winnerId ?? state.combatantId,
    rewards: { gold: winnerId ? pvp.PVP_GOLD_REWARD_AMOUNT : 0 },
  });

  if (winner) io.to(roomId).emit('player:update', { player: winner });

  if (loser) {
    io.to(roomId).emit('player:update', { player: loser });
    io.to(roomId).emit('player:death', { playerId: loser.id });
    io.to(roomId).emit('death:choose_prompt', { playerId: loser.id });
    return;
  }

  // Draw / both fled
  engine.advanceTurn(room);
  emitTurnStart(io, room, roomId);
}

export function triggerGameStart(
  io: AppServer,
  roomId: string,
  players: Array<{ userId: string; username: string }>
) {
  const room = engine.startGame({ roomId, players });
  io.to(roomId).emit('game:start', { gameRoom: room });
  const first = engine.currentPlayer(room);
  io.to(roomId).emit('game:turn_start', { playerId: first.id, turnNumber: 1 });
}
