import React from 'react';
import type { Player, ItemId } from '@isekai/shared';
import { ITEMS } from '@isekai/shared';

interface Props {
  items: ItemId[];
  player: Player;
  onBuy: (itemId: ItemId) => void;
  onLeave: () => void;
}

const TYPE_ICON: Record<string, string> = {
  weapon: '⚔️',
  potion: '🧪',
  accessory: '✨',
};

const TYPE_LABEL: Record<string, string> = {
  weapon: '武器',
  potion: 'ポーション',
  accessory: 'アクセサリー',
};

export default function ShopView({ items, player, onBuy, onLeave }: Props) {
  function getItemDetail(id: ItemId): string {
    const item = ITEMS[id];
    if (item.type === 'weapon' && 'attackBonus' in item) return `ATK +${item.attackBonus}`;
    if (item.type === 'potion' && 'healAmount' in item) {
      return item.healAmount >= 9999 ? 'HP 全回復' : `HP +${item.healAmount}`;
    }
    if (item.type === 'accessory' && 'effect' in item && item.effect === 'guaranteed_flee') return '確実逃走';
    return '';
  }

  function isEquipped(id: ItemId): boolean {
    return player.equippedWeaponId === id;
  }

  function ownedCount(id: ItemId): number {
    return player.inventory.find(i => i.itemId === id)?.quantity ?? 0;
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.window}>
        {/* Header */}
        <div style={styles.header}>
          <span style={styles.title}>🛒 ショップ</span>
          <span style={styles.gold}>💰 {player.gold}G</span>
        </div>

        {/* Item grid */}
        <div style={styles.grid}>
          {items.map(id => {
            const item = ITEMS[id];
            const canAfford = player.gold >= item.price;
            const owned = ownedCount(id);
            const equipped = isEquipped(id);

            return (
              <div
                key={id}
                style={{
                  ...styles.card,
                  borderColor: equipped ? '#4caf50' : canAfford ? '#2a4a6a' : '#1a1a2e',
                  opacity: canAfford ? 1 : 0.6,
                }}
              >
                <div style={styles.cardTop}>
                  <span style={styles.typeIcon}>{TYPE_ICON[item.type]}</span>
                  <span style={styles.typeTag}>{TYPE_LABEL[item.type]}</span>
                  {equipped && <span style={styles.equippedTag}>装備中</span>}
                  {owned > 0 && !equipped && <span style={styles.ownedTag}>×{owned}</span>}
                </div>

                <div style={styles.itemName}>{item.name}</div>
                <div style={styles.itemDetail}>{getItemDetail(id)}</div>

                <div style={styles.cardBottom}>
                  <span style={{ ...styles.price, color: canAfford ? '#f5a623' : '#e53935' }}>
                    {item.price}G
                  </span>
                  <button
                    style={{
                      ...styles.buyBtn,
                      background: canAfford ? '#e94560' : '#333',
                      cursor: canAfford ? 'pointer' : 'not-allowed',
                    }}
                    onClick={() => canAfford && onBuy(id)}
                    disabled={!canAfford}
                  >
                    {equipped ? '買う（上書き）' : '購入'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Player inventory */}
        {player.inventory.length > 0 && (
          <div style={styles.inventory}>
            <div style={styles.invTitle}>🎒 所持アイテム</div>
            <div style={styles.invList}>
              {player.inventory.map(inv => {
                const item = ITEMS[inv.itemId];
                return (
                  <div key={inv.itemId} style={styles.invItem}>
                    {TYPE_ICON[item.type]} {item.name} ×{inv.quantity}
                  </div>
                );
              })}
              {player.equippedWeaponId && (
                <div style={styles.invItem}>
                  ⚔️ {ITEMS[player.equippedWeaponId].name}（装備中）
                </div>
              )}
            </div>
          </div>
        )}

        <button style={styles.leaveBtn} onClick={onLeave}>
          ショップを出る
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.85)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  window: {
    background: '#16213e',
    border: '2px solid #8e44ad',
    borderRadius: 12,
    width: '100%',
    maxWidth: 640,
    maxHeight: '90vh',
    overflowY: 'auto',
    padding: 24,
    boxShadow: '0 0 32px rgba(142,68,173,0.4)',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: '1.3rem',
    fontWeight: 'bold',
    color: '#8e44ad',
  },
  gold: {
    fontSize: '1.1rem',
    color: '#f5a623',
    fontWeight: 'bold',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
    gap: 12,
  },
  card: {
    background: 'rgba(26,26,46,0.8)',
    border: '1px solid',
    borderRadius: 8,
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    transition: 'border-color 0.2s',
  },
  cardTop: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  typeIcon: {
    fontSize: '1.1rem',
  },
  typeTag: {
    fontSize: '0.7rem',
    color: '#8899aa',
  },
  equippedTag: {
    padding: '1px 6px',
    background: '#4caf50',
    borderRadius: 10,
    fontSize: '0.65rem',
    color: '#fff',
    marginLeft: 'auto',
  },
  ownedTag: {
    padding: '1px 6px',
    background: '#2980b9',
    borderRadius: 10,
    fontSize: '0.65rem',
    color: '#fff',
    marginLeft: 'auto',
  },
  itemName: {
    fontWeight: 'bold',
    fontSize: '0.9rem',
  },
  itemDetail: {
    fontSize: '0.8rem',
    color: '#4caf50',
    flex: 1,
  },
  cardBottom: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  price: {
    fontWeight: 'bold',
    fontSize: '0.9rem',
  },
  buyBtn: {
    padding: '5px 10px',
    border: 'none',
    borderRadius: 5,
    color: '#fff',
    fontSize: '0.75rem',
    fontWeight: 'bold',
  },
  inventory: {
    background: 'rgba(26,26,46,0.5)',
    borderRadius: 8,
    padding: 12,
  },
  invTitle: {
    color: '#8899aa',
    fontSize: '0.85rem',
    marginBottom: 8,
  },
  invList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
  },
  invItem: {
    padding: '4px 10px',
    background: '#1a1a2e',
    borderRadius: 6,
    fontSize: '0.8rem',
    color: '#eaeaea',
  },
  leaveBtn: {
    padding: '12px',
    background: 'none',
    border: '1px solid #8e44ad',
    borderRadius: 8,
    color: '#8e44ad',
    fontSize: '1rem',
    fontWeight: 'bold',
    cursor: 'pointer',
    width: '100%',
  },
};
