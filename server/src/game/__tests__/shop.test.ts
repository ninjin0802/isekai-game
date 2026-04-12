import { describe, it, expect } from 'vitest';
import { getShopInventory, purchaseItem, equipWeapon } from '../shop';
import type { Player, GameRoom } from '@isekai/shared';
import { ITEMS, BOARD_SIZE, MAX_INVENTORY } from '@isekai/shared';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'p1',
    userId: 'u1',
    username: '勇者',
    position: 5,
    hp: 100,
    maxHp: 100,
    attack: 10,
    defense: 5,
    gold: 1000,
    isAlive: true,
    turnOrder: 0,
    inventory: [],
    attackBonus: 0,
    ...overrides,
  };
}

function makeRoom(players: Player[] = []): GameRoom {
  return {
    id: 'room1',
    status: 'playing',
    players,
    currentTurnIndex: 0,
    turnNumber: 1,
    mapSeed: 42,
    map: [],
  };
}

// ─── getShopInventory ─────────────────────────────────────────────────────────

describe('getShopInventory', () => {
  it('序盤（position < 40*0.34=13.6）はティア1のアイテムのみ', () => {
    const items = getShopInventory(5); // early zone

    // Tier 1 items should be included
    expect(items).toContain('wooden_sword');
    expect(items).toContain('potion');
    // Tier 2 items should NOT be included
    expect(items).not.toContain('iron_sword');
    expect(items).not.toContain('smoke_bomb');
    // Tier 3 items should NOT be included
    expect(items).not.toContain('holy_sword');
  });

  it('中盤（position >= 14, < 27）はティア1+2のアイテム', () => {
    const items = getShopInventory(20); // mid zone

    expect(items).toContain('wooden_sword'); // tier 1
    expect(items).toContain('potion');        // tier 1
    expect(items).toContain('iron_sword');    // tier 2
    expect(items).toContain('smoke_bomb');    // tier 2
    // Tier 3 NOT available yet
    expect(items).not.toContain('holy_sword');
    expect(items).not.toContain('elixir');
  });

  it('終盤（position >= 27）はティア1+2+3のアイテム', () => {
    const items = getShopInventory(35); // late zone

    expect(items).toContain('wooden_sword'); // tier 1
    expect(items).toContain('iron_sword');   // tier 2
    expect(items).toContain('holy_sword');   // tier 3
    expect(items).toContain('elixir');       // tier 3
    // Tier 4 (dragon_slayer) is never in shop
    expect(items).not.toContain('dragon_slayer');
  });

  it('position 0 はティア1のみ（スタートマス）', () => {
    const items = getShopInventory(0);
    expect(items).toContain('potion');
    expect(items).not.toContain('iron_sword');
  });

  it('ドラゴンスレイヤー（ティア4）はどの位置でも購入不可', () => {
    const atStart = getShopInventory(0);
    const atEnd = getShopInventory(BOARD_SIZE - 1);
    expect(atStart).not.toContain('dragon_slayer');
    expect(atEnd).not.toContain('dragon_slayer');
  });
});

// ─── purchaseItem ─────────────────────────────────────────────────────────────

describe('purchaseItem', () => {
  it('ポーション購入でゴールドが差し引かれインベントリに追加される', () => {
    const player = makePlayer({ gold: 200, position: 5 });
    const room = makeRoom([player]);

    purchaseItem(room, 'p1', 'potion');

    expect(player.gold).toBe(200 - ITEMS.potion.price);
    expect(player.inventory.find(i => i.itemId === 'potion')?.quantity).toBe(1);
  });

  it('同じポーションを 2 回購入するとスタックされる（quantity: 2）', () => {
    const player = makePlayer({ gold: 500, position: 5 });
    const room = makeRoom([player]);

    purchaseItem(room, 'p1', 'potion');
    purchaseItem(room, 'p1', 'potion');

    expect(player.inventory.find(i => i.itemId === 'potion')?.quantity).toBe(2);
  });

  it('武器購入で equippedWeaponId と attackBonus が設定される', () => {
    const player = makePlayer({ gold: 500, position: 5 });
    const room = makeRoom([player]);

    purchaseItem(room, 'p1', 'wooden_sword');

    expect(player.equippedWeaponId).toBe('wooden_sword');
    expect(player.attackBonus).toBe(ITEMS.wooden_sword.attackBonus);
    // Weapon should NOT be in inventory (it goes to equipped slot)
    expect(player.inventory.find(i => i.itemId === 'wooden_sword')).toBeUndefined();
  });

  it('武器を新しい武器に置き換えると古い武器がインベントリに移動する', () => {
    const player = makePlayer({
      gold: 2000,
      position: 25,
      equippedWeaponId: 'wooden_sword',
      attackBonus: ITEMS.wooden_sword.attackBonus,
    });
    const room = makeRoom([player]);

    purchaseItem(room, 'p1', 'iron_sword');

    expect(player.equippedWeaponId).toBe('iron_sword');
    expect(player.attackBonus).toBe(ITEMS.iron_sword.attackBonus);
    expect(player.inventory.find(i => i.itemId === 'wooden_sword')?.quantity).toBe(1);
  });

  it('死亡プレイヤーは購入できない', () => {
    const player = makePlayer({ isAlive: false });
    const room = makeRoom([player]);
    expect(() => purchaseItem(room, 'p1', 'potion')).toThrow('死亡中のプレイヤーは購入できません');
  });

  it('ゴールド不足の場合エラーを投げる', () => {
    const player = makePlayer({ gold: 10 }); // potion costs 50
    const room = makeRoom([player]);
    expect(() => purchaseItem(room, 'p1', 'potion')).toThrow('ゴールドが足りません');
  });

  it('存在しないアイテムIDはエラーを投げる', () => {
    const player = makePlayer({ gold: 1000 });
    const room = makeRoom([player]);
    expect(() => purchaseItem(room, 'p1', 'fake_sword' as never)).toThrow('存在しないアイテムです');
  });

  it('位置に対してアンロックされていないアイテムは購入不可', () => {
    // Player at position 5 (tier 1 zone) cannot buy tier 2 iron_sword
    const player = makePlayer({ gold: 1000, position: 5 });
    const room = makeRoom([player]);
    expect(() => purchaseItem(room, 'p1', 'iron_sword')).toThrow('このアイテムはここでは購入できません');
  });

  it('インベントリ満杯（8個）で新規アイテムを購入するとエラーを投げる', () => {
    const player = makePlayer({
      gold: 2000,
      position: 5,
      inventory: Array.from({ length: MAX_INVENTORY }, (_, i) => ({
        itemId: 'potion' as const,
        quantity: 1,
      })),
    });
    // Flatten: player already has 8 inventory slots taken (as unique entries)
    // The check is totalItems >= MAX_INVENTORY for a NEW itemId
    // Let's create 8 stacks of hi_potion (mid-zone item) at position 20
    const midPlayer = makePlayer({
      gold: 2000,
      position: 20,
      inventory: [
        { itemId: 'potion', quantity: MAX_INVENTORY },
      ],
    });
    const room = makeRoom([midPlayer]);
    // Buying iron_sword (new item, not in inventory) with 8 total items
    expect(() => purchaseItem(room, midPlayer.id, 'iron_sword')).toThrow('インベントリが満杯です');
  });

  it('存在しないプレイヤーIDはエラーを投げる', () => {
    const room = makeRoom([]);
    expect(() => purchaseItem(room, 'ghost', 'potion')).toThrow('プレイヤーが見つかりません');
  });
});

// ─── equipWeapon ─────────────────────────────────────────────────────────────

describe('equipWeapon', () => {
  it('インベントリ内の武器を装備できる', () => {
    const player = makePlayer({
      gold: 0,
      inventory: [{ itemId: 'wooden_sword', quantity: 1 }],
    });
    const room = makeRoom([player]);

    equipWeapon(room, 'p1', 'wooden_sword');

    expect(player.equippedWeaponId).toBe('wooden_sword');
    expect(player.attackBonus).toBe(ITEMS.wooden_sword.attackBonus);
    // Weapon consumed from inventory
    expect(player.inventory.find(i => i.itemId === 'wooden_sword')).toBeUndefined();
  });

  it('装備中の武器と交換すると古い武器がインベントリに戻る', () => {
    const player = makePlayer({
      equippedWeaponId: 'wooden_sword' as const,
      attackBonus: ITEMS.wooden_sword.attackBonus,
      inventory: [{ itemId: 'iron_sword', quantity: 1 }],
    });
    const room = makeRoom([player]);

    equipWeapon(room, 'p1', 'iron_sword');

    expect(player.equippedWeaponId).toBe('iron_sword');
    expect(player.attackBonus).toBe(ITEMS.iron_sword.attackBonus);
    // Old weapon should be in inventory now
    expect(player.inventory.find(i => i.itemId === 'wooden_sword')?.quantity).toBe(1);
  });

  it('武器でないアイテムはエラーを投げる', () => {
    const player = makePlayer({ inventory: [{ itemId: 'potion', quantity: 1 }] });
    const room = makeRoom([player]);
    expect(() => equipWeapon(room, 'p1', 'potion')).toThrow('武器ではありません');
  });

  it('インベントリにない武器はエラーを投げる', () => {
    const player = makePlayer({ inventory: [] });
    const room = makeRoom([player]);
    expect(() => equipWeapon(room, 'p1', 'wooden_sword')).toThrow('インベントリに存在しません');
  });

  it('存在しないプレイヤーIDはエラーを投げる', () => {
    const room = makeRoom([]);
    expect(() => equipWeapon(room, 'ghost', 'wooden_sword')).toThrow('プレイヤーが見つかりません');
  });
});
