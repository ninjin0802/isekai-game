import type { Bet, BettingState, BetTarget, GameRoom, Player } from '@isekai/shared';
import { BETTING_WINDOW_SECONDS } from '@isekai/shared';

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createBettingState(battleId: string): BettingState {
  return {
    battleId,
    bets: [],
    totalPot: 0,
    windowOpen: true,
    expiresAt: Date.now() + BETTING_WINDOW_SECONDS * 1000,
  };
}

// ─── Place a bet ──────────────────────────────────────────────────────────────

export interface PlaceBetInput {
  battleId: string;
  bettorPlayerId: string;
  bettorUsername: string;
  betOn: BetTarget;
  amount: number;
}

export function placeBet(state: BettingState, input: PlaceBetInput): BettingState {
  if (!state.windowOpen) throw new Error('賭け受付は終了しています');
  if (state.battleId !== input.battleId) throw new Error('戦闘IDが一致しません');
  if (input.amount < 10) throw new Error('最低賭け金は 10G です');

  // One bet per bettor per battle — replace if exists
  const existing = state.bets.find(b => b.bettorId === input.bettorPlayerId);
  if (existing) {
    // Replace existing bet (refund old amount implicitly via net gold tracking in handler)
    existing.betOn = input.betOn;
    existing.amount = input.amount;
    existing.result = 'pending';
  } else {
    const bet: Bet = {
      bettorId: input.bettorPlayerId,
      bettorUsername: input.bettorUsername,
      betOn: input.betOn,
      amount: input.amount,
      result: 'pending',
    };
    state.bets.push(bet);
  }

  state.totalPot = state.bets.reduce((sum, b) => sum + b.amount, 0);
  return state;
}

// ─── Close betting window ─────────────────────────────────────────────────────

export function closeBettingWindow(state: BettingState): BettingState {
  state.windowOpen = false;
  return state;
}

// ─── Resolve bets ─────────────────────────────────────────────────────────────

export interface BetPayout {
  playerId: string;
  delta: number; // positive = gain, negative = loss (already deducted on place)
}

export interface BetResolution {
  payouts: BetPayout[];
  updatedBets: Bet[];
  /** Gold the combatant receives from an all-wrong pot (0 if normal) */
  combatantBonus: number;
}

/**
 * Resolve all bets based on combat outcome.
 *
 * Rules:
 * - Winners split the total pot proportionally to their stake.
 * - If ALL bettors picked wrong → combatant receives the entire pot.
 * - If NO bets placed → nothing happens.
 * - Integer math: remainder goes to the highest-stake winner.
 */
export function resolveBets(
  state: BettingState,
  combatResult: 'player_wins' | 'monster_wins',
  combatantPlayerId: string
): BetResolution {
  if (state.bets.length === 0) {
    return { payouts: [], updatedBets: [], combatantBonus: 0 };
  }

  const winners = state.bets.filter(b => b.betOn === combatResult);
  const losers = state.bets.filter(b => b.betOn !== combatResult);

  const payouts: BetPayout[] = [];
  let combatantBonus = 0;

  // Mark results
  for (const b of state.bets) {
    b.result = b.betOn === combatResult ? 'won' : 'lost';
  }

  if (winners.length === 0) {
    // All bettors were wrong → combatant takes the pot
    combatantBonus = state.totalPot;
    payouts.push({ playerId: combatantPlayerId, delta: combatantBonus });
  } else {
    const totalWinnerStake = winners.reduce((s, b) => s + b.amount, 0);
    let distributed = 0;

    // Proportional payout: winner gets back their stake + share of loser pot
    const loserPot = losers.reduce((s, b) => s + b.amount, 0);

    // Sort by stake descending so remainder goes to biggest winner
    const sortedWinners = [...winners].sort((a, b) => b.amount - a.amount);

    for (let i = 0; i < sortedWinners.length; i++) {
      const w = sortedWinners[i];
      const share = i < sortedWinners.length - 1
        ? Math.floor((w.amount / totalWinnerStake) * loserPot)
        : loserPot - distributed; // last winner gets the remainder

      distributed += share;
      // Net delta: winner gets their stake back + share of loser pot
      // (stake was already deducted when bet was placed, so delta = stake + share)
      payouts.push({ playerId: w.bettorId, delta: w.amount + share });
    }
  }

  return { payouts, updatedBets: state.bets, combatantBonus };
}

// ─── Apply payouts to GameRoom players ────────────────────────────────────────

export function applyPayouts(room: GameRoom, payouts: BetPayout[]): Player[] {
  const updated: Player[] = [];
  for (const payout of payouts) {
    const player = room.players.find(p => p.id === payout.playerId);
    if (player) {
      player.gold = Math.max(0, player.gold + payout.delta);
      updated.push(player);
    }
  }
  return updated;
}

/**
 * Deduct the bet amount from the bettor's gold immediately when placing.
 * Returns false if the player cannot afford it.
 */
export function deductBetFromPlayer(room: GameRoom, playerId: string, amount: number): boolean {
  const player = room.players.find(p => p.id === playerId);
  if (!player) return false;
  if (player.gold < amount) return false;
  player.gold -= amount;
  return true;
}

/**
 * Refund a previous bet when player replaces it.
 */
export function refundPreviousBet(room: GameRoom, playerId: string, previousAmount: number): void {
  const player = room.players.find(p => p.id === playerId);
  if (player) player.gold += previousAmount;
}
