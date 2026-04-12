import type { Player, GameRoom } from '@isekai/shared';
import { ITEMS, BOARD_SIZE, MAX_INVENTORY } from '@isekai/shared';

type ItemId = keyof typeof ITEMS;

/**
 * Returns item IDs available at a shop square based on the player's position.
 * Tier filtering: position-based so early/mid/late maps to item tiers.
 */
export function getShopInventory(position: number): ItemId[] {
  const pct = position / BOARD_SIZE;

  // Determine max tier available based on position
  let maxTier: number;
  if (pct < 0.34) maxTier = 1;
  else if (pct < 0.67) maxTier = 2;
  else maxTier = 3;

  return (Object.keys(ITEMS) as ItemId[]).filter(id => {
    const item = ITEMS[id];
    return 'tier' in item && item.tier <= maxTier;
  });
}

export interface PurchaseResult {
  player: Player;
  equippedWeaponChanged: boolean;
}

/**
 * Validate and apply a purchase. Throws on any invalid state.
 */
export function purchaseItem(room: GameRoom, playerId: string, itemId: string): PurchaseResult {
  const player = room.players.find(p => p.id === playerId);
  if (!player) throw new Error('プレイヤーが見つかりません');
  if (!player.isAlive) throw new Error('死亡中のプレイヤーは購入できません');

  const item = ITEMS[itemId as ItemId];
  if (!item) throw new Error('存在しないアイテムです');

  // Check item is in shop inventory for this position
  const available = getShopInventory(player.position);
  if (!available.includes(itemId as ItemId)) {
    throw new Error('このアイテムはここでは購入できません');
  }

  if (player.gold < item.price) {
    throw new Error(`ゴールドが足りません (必要: ${item.price}G, 所持: ${player.gold}G)`);
  }

  // Inventory cap — weapons don't stack, potions do
  const totalItems = player.inventory.reduce((sum, i) => sum + i.quantity, 0);
  if (totalItems >= MAX_INVENTORY && !player.inventory.find(i => i.itemId === itemId)) {
    throw new Error(`インベントリが満杯です (最大 ${MAX_INVENTORY} 個)`);
  }

  // Deduct gold
  player.gold -= item.price;

  let equippedWeaponChanged = false;

  if (item.type === 'weapon') {
    // Weapons go straight to equipped slot (replace old one, refund nothing)
    const oldWeapon = player.equippedWeaponId;
    player.equippedWeaponId = itemId as ItemId;
    player.attackBonus = (item as { attackBonus: number }).attackBonus;
    equippedWeaponChanged = true;

    // If there was a previous weapon, put it in inventory (don't lose it)
    if (oldWeapon && oldWeapon !== itemId) {
      const existing = player.inventory.find(i => i.itemId === oldWeapon);
      if (existing) {
        existing.quantity++;
      } else {
        player.inventory.push({ itemId: oldWeapon, quantity: 1 });
      }
    }
  } else {
    // Consumables stack in inventory
    const existing = player.inventory.find(i => i.itemId === itemId);
    if (existing) {
      existing.quantity++;
    } else {
      player.inventory.push({ itemId: itemId as ItemId, quantity: 1 });
    }
  }

  return { player, equippedWeaponChanged };
}

/**
 * Equip a weapon already in inventory (swap equipped weapon).
 */
export function equipWeapon(room: GameRoom, playerId: string, itemId: string): Player {
  const player = room.players.find(p => p.id === playerId);
  if (!player) throw new Error('プレイヤーが見つかりません');

  const item = ITEMS[itemId as ItemId];
  if (!item || item.type !== 'weapon') throw new Error('武器ではありません');

  const inInventory = player.inventory.find(i => i.itemId === itemId);
  if (!inInventory) throw new Error('インベントリに存在しません');

  // Unequip current weapon → put in inventory
  if (player.equippedWeaponId && player.equippedWeaponId !== itemId) {
    const old = player.inventory.find(i => i.itemId === player.equippedWeaponId);
    if (old) old.quantity++;
    else player.inventory.push({ itemId: player.equippedWeaponId, quantity: 1 });
  }

  // Equip new weapon → remove from inventory
  inInventory.quantity--;
  if (inInventory.quantity <= 0) {
    player.inventory = player.inventory.filter(i => i.itemId !== itemId);
  }

  player.equippedWeaponId = itemId as ItemId;
  player.attackBonus = (item as { attackBonus: number }).attackBonus;

  return player;
}
