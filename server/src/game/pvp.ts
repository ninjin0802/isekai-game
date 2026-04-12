import { v4 as uuidv4 } from 'uuid';
import type { CombatState, CombatLogEntry, Player, GameRoom } from '@isekai/shared';
import { DICE_SIDES } from '@isekai/shared';

const PVP_GOLD_REWARD = 200;

// ─── Factory ─────────────────────────────────────────────────────────────────

/**
 * Create a PvP CombatState between two players.
 * Both dice rolls determine who goes first.
 */
export function createPvPCombat(
  attacker: Player,
  defender: Player
): { state: CombatState; attackerRoll: number; defenderRoll: number } {
  const attackerRoll = rollD6();
  const defenderRoll = rollD6();

  // Higher roll goes first; ties go to attacker
  const firstTurn: 'combatant' | 'opponent' =
    attackerRoll >= defenderRoll ? 'combatant' : 'opponent';

  const state: CombatState = {
    battleId: uuidv4(),
    type: 'pvp',
    phase: 'betting',
    combatantId: attacker.id,
    opponentId: defender.id,
    combatantHp: attacker.hp,
    opponentHp: defender.hp,
    turn: firstTurn,
    round: 1,
    log: [],
  };

  return { state, attackerRoll, defenderRoll };
}

// ─── Action ───────────────────────────────────────────────────────────────────

export interface PvPActionResult {
  state: CombatState;
  finished: boolean;
  winnerId?: string;
  loserId?: string;
}

/**
 * Process one player's action in a PvP fight.
 * `actingPlayerId` must match the current turn holder.
 */
export function processPvPAction(
  state: CombatState,
  actingPlayer: Player,
  targetPlayer: Player,
  action: 'attack' | 'defend' | 'item' | 'flee',
  itemId?: string
): PvPActionResult {
  if (state.phase !== 'active') throw new Error('戦闘はまだ開始されていません');

  const isAttacker = actingPlayer.id === state.combatantId;
  const expectedTurn: 'combatant' | 'opponent' = isAttacker ? 'combatant' : 'opponent';
  if (state.turn !== expectedTurn) throw new Error('あなたのターンではありません');

  const s = cloneState(state);
  s.round++;

  switch (action) {
    case 'attack': {
      const roll = rollD6();
      const rawDmg = Math.floor(roll * (actingPlayer.attack + actingPlayer.attackBonus));
      const dmg = Math.max(1, rawDmg - targetPlayer.defense);

      if (isAttacker) {
        s.opponentHp = Math.max(0, s.opponentHp - dmg);
      } else {
        s.combatantHp = Math.max(0, s.combatantHp - dmg);
      }

      addLog(s, s.round - 1, actingPlayer.username, 'attack', dmg, undefined,
        `${actingPlayer.username} の攻撃！ [🎲${roll}] → ${targetPlayer.username} に ${dmg} ダメージ！`);
      break;
    }

    case 'defend': {
      addLog(s, s.round - 1, actingPlayer.username, 'defend', undefined, undefined,
        `${actingPlayer.username} は防御態勢をとった！`);
      break;
    }

    case 'item': {
      if (!itemId) throw new Error('アイテムIDが必要です');
      const { ITEMS } = require('@isekai/shared') as typeof import('@isekai/shared');
      const item = ITEMS[itemId as keyof typeof ITEMS];
      if (!item) throw new Error('アイテムが見つかりません');

      if (item.type === 'potion' && 'healAmount' in item) {
        const heal = Math.min(item.healAmount, actingPlayer.maxHp - actingPlayer.hp);
        if (isAttacker) {
          s.combatantHp = Math.min(actingPlayer.maxHp, s.combatantHp + heal);
        } else {
          s.opponentHp = Math.min(actingPlayer.maxHp, s.opponentHp + heal);
        }
        addLog(s, s.round - 1, actingPlayer.username, 'item', undefined, heal,
          `${actingPlayer.username} は ${item.name} を使った！ HP +${heal}`);
      } else if (item.type === 'accessory' && 'effect' in item && item.effect === 'guaranteed_flee') {
        addLog(s, s.round - 1, actingPlayer.username, 'flee', undefined, undefined,
          `${actingPlayer.username} はスモークボムで逃げた！`);
        s.phase = 'finished';
        // Flee in PvP = draw, no winner (no penalty either)
        return { state: s, finished: true };
      }
      break;
    }

    case 'flee': {
      // 30% flee chance in PvP (harder than PvE)
      if (Math.random() < 0.3) {
        addLog(s, s.round - 1, actingPlayer.username, 'flee', undefined, undefined,
          `${actingPlayer.username} は逃げ出した！`);
        s.phase = 'finished';
        return { state: s, finished: true };
      }
      addLog(s, s.round - 1, actingPlayer.username, 'flee', undefined, undefined,
        `${actingPlayer.username} は逃げようとしたが失敗した！`);
      break;
    }
  }

  // Check KO
  const attackerKO = s.combatantHp <= 0;
  const defenderKO = s.opponentHp <= 0;

  if (attackerKO || defenderKO) {
    s.phase = 'finished';
    const winnerId = attackerKO ? state.opponentId : state.combatantId;
    const loserId = attackerKO ? state.combatantId : state.opponentId;
    addLog(s, s.round - 1, '', 'attack', undefined, undefined,
      `⚔️ コロシアム終了！ 勝者はプレイヤーID: ${winnerId}`);
    return { state: s, finished: true, winnerId, loserId };
  }

  // Switch turn
  s.turn = isAttacker ? 'opponent' : 'combatant';
  return { state: s, finished: false };
}

// ─── Apply result ─────────────────────────────────────────────────────────────

export function applyPvPResult(
  room: GameRoom,
  state: CombatState,
  winnerId: string | undefined,
  loserId: string | undefined,
  usedItemId?: string
): { winner: Player | null; loser: Player | null } {
  if (!winnerId || !loserId) {
    // Draw / flee — restore HP, no penalty
    const attacker = room.players.find(p => p.id === state.combatantId);
    const defender = room.players.find(p => p.id === state.opponentId);
    if (attacker) attacker.hp = Math.max(1, state.combatantHp);
    if (defender) defender.hp = Math.max(1, state.opponentHp);
    return { winner: null, loser: null };
  }

  const winner = room.players.find(p => p.id === winnerId) ?? null;
  const loser = room.players.find(p => p.id === loserId) ?? null;

  if (winner) {
    winner.hp = winnerId === state.combatantId ? state.combatantHp : state.opponentHp;
    winner.gold += PVP_GOLD_REWARD;
  }

  if (loser) {
    loser.hp = 0;
    loser.isAlive = false;
    // Consume item if used
    if (usedItemId) {
      const inv = loser.inventory.find(i => i.itemId === usedItemId);
      if (inv) {
        inv.quantity--;
        if (inv.quantity <= 0) loser.inventory = loser.inventory.filter(i => i.itemId !== usedItemId);
      }
    }
  }

  return { winner, loser };
}

export const PVP_GOLD_REWARD_AMOUNT = PVP_GOLD_REWARD;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function rollD6(): number {
  return Math.floor(Math.random() * DICE_SIDES) + 1;
}

function cloneState(s: CombatState): CombatState {
  return { ...s, log: [...s.log] };
}

function addLog(
  s: CombatState,
  round: number,
  actor: string,
  action: CombatLogEntry['action'],
  damage?: number,
  heal?: number,
  message?: string
) {
  s.log.push({ round, actor, action, damage, heal, message: message ?? '' });
  if (s.log.length > 50) s.log = s.log.slice(-50);
}
