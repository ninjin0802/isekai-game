import React from 'react';
import type { Player } from '@isekai/shared';
import { ITEMS } from '@isekai/shared';

const PLAYER_COLORS = ['#f5a623', '#e94560', '#00bcd4', '#9c27b0'];

interface Props {
  players: Player[];
  currentTurnPlayerId: string | null;
  myPlayerId: string | null;
}

export default function PlayerHUD({ players, currentTurnPlayerId, myPlayerId }: Props) {
  return (
    <div style={styles.container}>
      {players.map(player => {
        const isActive = player.id === currentTurnPlayerId;
        const isMe = player.id === myPlayerId;
        const color = PLAYER_COLORS[player.turnOrder % PLAYER_COLORS.length];
        const hpPct = Math.max(0, (player.hp / player.maxHp) * 100);
        const weapon = player.equippedWeaponId ? ITEMS[player.equippedWeaponId] : null;

        return (
          <div
            key={player.id}
            style={{
              ...styles.card,
              borderColor: isActive ? color : '#2a4a6a',
              boxShadow: isActive ? `0 0 8px ${color}40` : undefined,
              opacity: player.isAlive ? 1 : 0.5,
            }}
          >
            {/* Header */}
            <div style={styles.header}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ ...styles.avatar, background: color }}>
                  {player.username.slice(0, 2)}
                </div>
                <div>
                  <div style={styles.name}>
                    {player.username}
                    {isMe && <span style={styles.meTag}> (あなた)</span>}
                    {!player.isAlive && <span style={styles.deadTag}> 💀</span>}
                  </div>
                  <div style={styles.position}>マス {player.position}</div>
                </div>
              </div>
              {isActive && <span style={{ ...styles.turnBadge, background: color }}>ターン中</span>}
            </div>

            {/* HP Bar */}
            <div style={styles.hpRow}>
              <span style={styles.statLabel}>HP</span>
              <div style={styles.hpBar}>
                <div
                  style={{
                    ...styles.hpFill,
                    width: `${hpPct}%`,
                    background: hpPct > 50 ? '#4caf50' : hpPct > 25 ? '#ff9800' : '#e53935',
                  }}
                />
              </div>
              <span style={styles.hpText}>{player.hp}/{player.maxHp}</span>
            </div>

            {/* Stats row */}
            <div style={styles.statsRow}>
              <span style={styles.stat}>⚔️ {player.attack + player.attackBonus}</span>
              <span style={styles.stat}>🛡️ {player.defense}</span>
              <span style={{ ...styles.stat, color: '#f5a623' }}>💰 {player.gold}G</span>
            </div>

            {/* Weapon */}
            {weapon && (
              <div style={styles.weapon}>
                🗡️ {weapon.name}
                {'attackBonus' in weapon && <span style={styles.weaponBonus}> +{weapon.attackBonus}</span>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    width: '220px',
    flexShrink: 0,
  },
  card: {
    background: 'rgba(15, 52, 96, 0.7)',
    border: '1px solid',
    borderRadius: '8px',
    padding: '12px',
    transition: 'border-color 0.2s, box-shadow 0.2s',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '10px',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.7rem',
    fontWeight: 'bold',
    color: '#000',
    flexShrink: 0,
  },
  name: {
    fontWeight: 'bold',
    fontSize: '0.9rem',
  },
  meTag: {
    color: '#f5a623',
    fontSize: '0.75rem',
  },
  deadTag: {
    fontSize: '0.9rem',
  },
  position: {
    color: '#8899aa',
    fontSize: '0.75rem',
  },
  turnBadge: {
    padding: '2px 8px',
    borderRadius: '12px',
    fontSize: '0.7rem',
    fontWeight: 'bold',
    color: '#000',
  },
  hpRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginBottom: '8px',
  },
  statLabel: {
    fontSize: '0.75rem',
    color: '#8899aa',
    width: '20px',
    flexShrink: 0,
  },
  hpBar: {
    flex: 1,
    height: '8px',
    background: '#1a1a2e',
    borderRadius: '4px',
    overflow: 'hidden',
  },
  hpFill: {
    height: '100%',
    borderRadius: '4px',
    transition: 'width 0.4s ease, background 0.4s ease',
  },
  hpText: {
    fontSize: '0.75rem',
    color: '#eaeaea',
    minWidth: '46px',
    textAlign: 'right',
  },
  statsRow: {
    display: 'flex',
    gap: '10px',
    marginBottom: '6px',
  },
  stat: {
    fontSize: '0.8rem',
    color: '#eaeaea',
  },
  weapon: {
    fontSize: '0.75rem',
    color: '#8899aa',
    marginTop: '4px',
  },
  weaponBonus: {
    color: '#4caf50',
  },
};
