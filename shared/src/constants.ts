// Game constants
export const MAX_PLAYERS = 4;
export const START_GOLD = 500;
export const BOARD_SIZE = 40;
export const DICE_SIDES = 6;
export const MAX_INVENTORY = 8;
export const BETTING_WINDOW_SECONDS = 15;
export const ACTION_TIMEOUT_SECONDS = 30;
export const RECONNECT_TIMEOUT_SECONDS = 60;
export const HEARTBEAT_INTERVAL_MS = 30_000;

// Square distribution weights (must sum to 1)
export const SQUARE_WEIGHTS = {
  battle: 0.40,
  shop: 0.15,
  recovery: 0.20,
  event: 0.20,
  boss: 0.05,
} as const;

// Monster definitions
export const MONSTERS = {
  slime: {
    id: 'slime',
    name: 'スライム',
    hp: 30,
    maxHp: 30,
    attack: 5,
    defense: 2,
    tier: 1,
    goldReward: [20, 50] as [number, number],
    expReward: 10,
  },
  orc: {
    id: 'orc',
    name: 'オーク',
    hp: 80,
    maxHp: 80,
    attack: 15,
    defense: 5,
    tier: 2,
    goldReward: [60, 120] as [number, number],
    expReward: 30,
  },
  demon: {
    id: 'demon',
    name: 'デーモン',
    hp: 150,
    maxHp: 150,
    attack: 25,
    defense: 10,
    tier: 3,
    goldReward: [150, 300] as [number, number],
    expReward: 80,
  },
  dragon: {
    id: 'dragon',
    name: 'ドラゴン',
    hp: 500,
    maxHp: 500,
    attack: 40,
    defense: 20,
    tier: 4,
    goldReward: [1000, 2000] as [number, number],
    expReward: 500,
    isBoss: true,
  },
} as const;

export type MonsterId = keyof typeof MONSTERS;

// Item definitions
export const ITEMS = {
  wooden_sword: {
    id: 'wooden_sword',
    name: '木の剣',
    type: 'weapon' as const,
    attackBonus: 3,
    price: 100,
    tier: 1,
  },
  iron_sword: {
    id: 'iron_sword',
    name: '鉄の剣',
    type: 'weapon' as const,
    attackBonus: 8,
    price: 300,
    tier: 2,
  },
  holy_sword: {
    id: 'holy_sword',
    name: '聖剣',
    type: 'weapon' as const,
    attackBonus: 15,
    price: 800,
    tier: 3,
  },
  dragon_slayer: {
    id: 'dragon_slayer',
    name: 'ドラゴンスレイヤー',
    type: 'weapon' as const,
    attackBonus: 25,
    price: 1500,
    tier: 4,
  },
  potion: {
    id: 'potion',
    name: 'ポーション',
    type: 'potion' as const,
    healAmount: 30,
    price: 50,
    tier: 1,
  },
  hi_potion: {
    id: 'hi_potion',
    name: 'ハイポーション',
    type: 'potion' as const,
    healAmount: 80,
    price: 150,
    tier: 2,
  },
  elixir: {
    id: 'elixir',
    name: 'エリクサー',
    type: 'potion' as const,
    healAmount: 9999,
    price: 500,
    tier: 3,
  },
  smoke_bomb: {
    id: 'smoke_bomb',
    name: 'スモークボム',
    type: 'accessory' as const,
    effect: 'guaranteed_flee' as const,
    price: 200,
    tier: 2,
  },
} as const;

export type ItemId = keyof typeof ITEMS;

// Random event table
export const RANDOM_EVENTS = [
  { id: 'gold_gain_small', description: '宝箱を発見！', goldDelta: 100 },
  { id: 'gold_gain_large', description: '古代の財宝！', goldDelta: 300 },
  { id: 'gold_loss', description: '盗賊に遭遇した！', goldDelta: -150 },
  { id: 'heal_small', description: '泉を発見した！HP回復。', hpDelta: 20 },
  { id: 'heal_large', description: '聖域を発見！HP大回復。', hpDelta: 50 },
  { id: 'teleport_forward', description: '魔法陣を踏んだ！前方へ飛ばされる。', movesDelta: 5 },
  { id: 'teleport_backward', description: '魔法陣を踏んだ！後方へ飛ばされる。', movesDelta: -5 },
  { id: 'attack_up', description: '謎の石板を解読した！攻撃力UP。', attackDelta: 5 },
  { id: 'free_potion', description: '行商人と出会った！ポーションをもらった。', itemId: 'potion' as const },
  { id: 'nothing', description: '何もなかった...', goldDelta: 0 },
] as const;
