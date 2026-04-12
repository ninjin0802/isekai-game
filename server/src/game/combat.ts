import { v4 as uuidv4 } from 'uuid';
import type {
  CombatState,
  CombatAction,
  CombatLogEntry,
  Monster,
  Player,
  GameRoom,
} from '@isekai/shared';
import { MONSTERS, ITEMS, DICE_SIDES } from '@isekai/shared';
import { randomInt } from '../utils/seededRandom';

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createPvECombat(
  room: GameRoom,
  combatantId: string,
  monsterId: keyof typeof MONSTERS
): CombatState {
  const combatant = room.players.find(p => p.id === combatantId);
  if (!combatant) throw new Error('Combatant not found');

  const template = MONSTERS[monsterId];
  const monster: Monster = { ...template };

  return {
    battleId: uuidv4(),
    type: 'pve',
    phase: 'betting',
    combatantId,
    opponentId: monsterId,
    monster,
    combatantHp: combatant.hp,
    opponentHp: monster.maxHp,
    turn: 'combatant',
    round: 1,
    log: [],
  };
}

// ─── Player Action ────────────────────────────────────────────────────────────

export interface ActionResult {
  state: CombatState;
  /** True when the combat is resolved (someone won/fled). */
  finished: boolean;
  /** 'combatant' if player won, 'monster' if player lost. */
  winner?: 'combatant' | 'monster';
  goldReward?: number;
}

export function processPlayerAction(
  state: CombatState,
  player: Player,
  action: CombatAction,
  itemId?: string
): ActionResult {
  if (state.phase !== 'active') throw new Error('戦闘はまだ開始されていません');
  if (state.turn !== 'combatant') throw new Error('プレイヤーのターンではありません');

  const s = cloneState(state);
  s.round++;

  switch (action) {
    case 'attack': {
      const roll = rollD6();
      const weaponBonus = player.attackBonus;
      const rawDmg = Math.floor(roll * (player.attack + weaponBonus));
      const def = s.monster!.defense;
      const dmg = Math.max(1, rawDmg - def);
      s.opponentHp = Math.max(0, s.opponentHp - dmg);
      addLog(s, s.round - 1, player.username, 'attack', dmg, undefined,
        `${player.username} の攻撃！ [🎲${roll}] → ${s.monster!.name} に ${dmg} ダメージ！`);
      break;
    }

    case 'defend': {
      // Defending halves incoming damage this turn (tracked via phase flag hack: store in log)
      addLog(s, s.round - 1, player.username, 'defend', undefined, undefined,
        `${player.username} は防御態勢をとった！（次の被ダメージ 50% カット）`);
      break;
    }

    case 'item': {
      if (!itemId) throw new Error('アイテムIDが必要です');
      const itemDef = ITEMS[itemId as keyof typeof ITEMS];
      if (!itemDef) throw new Error('アイテムが見つかりません');

      if (itemDef.type === 'potion') {
        const heal = (itemDef as { healAmount: number }).healAmount;
        const actualHeal = Math.min(heal, player.maxHp - player.hp);
        s.combatantHp = Math.min(player.maxHp, s.combatantHp + actualHeal);
        // Remove item from inventory (caller must sync player)
        addLog(s, s.round - 1, player.username, 'item', undefined, actualHeal,
          `${player.username} は ${itemDef.name} を使った！ HP +${actualHeal}`);
      } else if (itemDef.type === 'accessory' && 'effect' in itemDef && itemDef.effect === 'guaranteed_flee') {
        addLog(s, s.round - 1, player.username, 'flee', undefined, undefined,
          `${player.username} はスモークボムで逃げた！`);
        s.phase = 'finished';
        return { state: s, finished: true, winner: 'combatant', goldReward: 0 };
      }
      break;
    }

    case 'flee': {
      const isBoss = s.monster?.id === 'dragon';
      const fleeChance = isBoss ? 0.1 : 0.5;
      if (Math.random() < fleeChance) {
        addLog(s, s.round - 1, player.username, 'flee', undefined, undefined,
          `${player.username} は逃げ出した！`);
        s.phase = 'finished';
        return { state: s, finished: true, winner: 'combatant', goldReward: 0 };
      } else {
        addLog(s, s.round - 1, player.username, 'flee', undefined, undefined,
          `${player.username} は逃げようとしたが失敗した！`);
      }
      break;
    }
  }

  // Check if monster died
  if (s.opponentHp <= 0) {
    s.phase = 'finished';
    const monster = MONSTERS[s.opponentId as keyof typeof MONSTERS];
    const [minGold, maxGold] = monster.goldReward;
    const goldReward = randomInt(minGold, maxGold, Math.random);
    addLog(s, s.round - 1, s.monster!.name, 'attack', undefined, undefined,
      `${s.monster!.name} を倒した！ +${goldReward}G`);
    return { state: s, finished: true, winner: 'combatant', goldReward };
  }

  // Monster's turn
  s.turn = 'opponent';
  return { state: s, finished: false };
}

export function processMonsterAttack(
  state: CombatState,
  player: Player,
  wasDefending: boolean
): ActionResult {
  if (state.turn !== 'opponent') throw new Error('モンスターのターンではありません');

  const s = cloneState(state);
  const monster = s.monster!;

  // Dragon phase 2: breath attack every 3 rounds
  const isDragonPhase2 = monster.id === 'dragon' && s.opponentHp <= 250;
  const isBreathTurn = isDragonPhase2 && s.round % 3 === 0;

  let dmg: number;
  let message: string;

  if (isBreathTurn) {
    const roll = rollD6();
    dmg = Math.floor(roll * monster.attack * 1.5);
    if (wasDefending) dmg = Math.floor(dmg * 0.5);
    dmg = Math.max(1, dmg - player.defense);
    s.combatantHp = Math.max(0, s.combatantHp - dmg);
    message = `🐉 ${monster.name} のブレス攻撃！ [🎲${roll}] → ${dmg} ダメージ！${wasDefending ? '（防御中）' : ''}`;
    addLog(s, s.round, monster.name, 'breath_attack', dmg, undefined, message);
  } else {
    const roll = rollD6();
    const rawDmg = Math.floor(roll * monster.attack);
    dmg = wasDefending ? Math.max(1, Math.floor(rawDmg * 0.5) - player.defense) : Math.max(1, rawDmg - player.defense);
    s.combatantHp = Math.max(0, s.combatantHp - dmg);
    message = `${monster.name} の攻撃！ [🎲${roll}] → ${dmg} ダメージ！${wasDefending ? '（防御中）' : ''}`;
    addLog(s, s.round, monster.name, 'monster_attack', dmg, undefined, message);
  }

  // Check if player died
  if (s.combatantHp <= 0) {
    s.phase = 'finished';
    return { state: s, finished: true, winner: 'monster' };
  }

  s.turn = 'combatant';
  return { state: s, finished: false };
}

/** Sync player HP/gold from combat resolution back into GameRoom. */
export function applyCombatResult(
  room: GameRoom,
  state: CombatState,
  winner: 'combatant' | 'monster',
  goldReward: number,
  usedItemId?: string
): Player {
  const player = room.players.find(p => p.id === state.combatantId);
  if (!player) throw new Error('Player not found');

  player.hp = Math.max(0, state.combatantHp);

  if (winner === 'combatant') {
    player.gold += goldReward;
    if (usedItemId) {
      const inv = player.inventory.find(i => i.itemId === usedItemId);
      if (inv) {
        inv.quantity--;
        if (inv.quantity <= 0) {
          player.inventory = player.inventory.filter(i => i.itemId !== usedItemId);
        }
      }
    }
  } else {
    player.isAlive = false;
  }

  return player;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function rollD6(): number {
  return Math.floor(Math.random() * DICE_SIDES) + 1;
}

function cloneState(s: CombatState): CombatState {
  return {
    ...s,
    monster: s.monster ? { ...s.monster } : undefined,
    log: [...s.log],
  };
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
  // Keep last 50 log entries to avoid unbounded growth
  if (s.log.length > 50) s.log = s.log.slice(-50);
}

/** Check if the last player action was 'defend' (for monster damage calculation). */
export function wasLastActionDefend(state: CombatState): boolean {
  const last = [...state.log].reverse().find(e => e.actor !== state.monster?.name);
  return last?.action === 'defend';
}
