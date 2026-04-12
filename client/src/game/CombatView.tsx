import React, { useState } from 'react';
import type { CombatState, Player, CombatAction } from '@isekai/shared';
import { ITEMS } from '@isekai/shared';
import BettingCountdown from './BettingCountdown';

interface Props {
  combat: CombatState;
  myPlayer: Player;
  allPlayers: Player[];
  isCombatant: boolean;
  bettingOpen: boolean;
  bettingExpiresAt: number | null;
  onAction: (action: CombatAction, itemId?: string) => void;
  onBet: (betOn: 'player_wins' | 'monster_wins', amount: number) => void;
}

export default function CombatView({
  combat,
  myPlayer,
  allPlayers,
  isCombatant,
  bettingOpen,
  bettingExpiresAt,
  onAction,
  onBet,
}: Props) {
  const [showItems, setShowItems] = useState(false);
  const [betAmount, setBetAmount] = useState(50);

  const isPvP = combat.type === 'pvp';

  // PvE fields
  const monster = combat.monster;
  const isDragonPhase2 = !isPvP && monster?.id === 'dragon' && combat.opponentHp <= 250;

  // PvP fields
  const combatantPlayer = allPlayers.find(p => p.id === combat.combatantId);
  const opponentPlayer = isPvP ? allPlayers.find(p => p.id === combat.opponentId) : null;

  const isMyTurnInPvP = isPvP && combat.phase === 'active' && (
    (combat.turn === 'combatant' && myPlayer.id === combat.combatantId) ||
    (combat.turn === 'opponent' && myPlayer.id === combat.opponentId)
  );
  const isParticipant = isCombatant || (isPvP && myPlayer.id === combat.opponentId);

  const combatantHpPct = isPvP
    ? Math.max(0, (combat.combatantHp / (combatantPlayer?.maxHp ?? 100)) * 100)
    : Math.max(0, (combat.combatantHp / myPlayer.maxHp) * 100);
  const opponentHpPct = isPvP
    ? Math.max(0, (combat.opponentHp / (opponentPlayer?.maxHp ?? 100)) * 100)
    : Math.max(0, (combat.opponentHp / (monster?.maxHp ?? 1)) * 100);

  const activePlayer = isCombatant ? myPlayer : (isPvP ? opponentPlayer ?? myPlayer : myPlayer);
  const usableItems = activePlayer.inventory.filter(inv => {
    const item = ITEMS[inv.itemId];
    return item.type === 'potion' || (item.type === 'accessory' && 'effect' in item);
  });

  function handleAction(action: CombatAction) {
    if (action === 'item') {
      setShowItems(true);
    } else {
      onAction(action);
    }
  }

  function handleItemUse(itemId: string) {
    setShowItems(false);
    onAction('item', itemId);
  }

  const showCommandMenu = isParticipant && combat.phase === 'active' && !showItems &&
    (isPvP ? isMyTurnInPvP : isCombatant);

  return (
    <div style={styles.overlay}>
      <div style={styles.window}>
        {/* Header */}
        <div style={styles.header}>
          <span style={styles.headerTitle}>{isPvP ? '⚔️ コロシアム PvP' : '⚔️ バトル'}</span>
          {isDragonPhase2 && (
            <span style={styles.phase2Badge}>🐉 PHASE 2 — ブレス攻撃！</span>
          )}
          {isPvP && <span style={styles.pvpBadge}>🏆 +200G</span>}
          {bettingOpen && (
            <span style={styles.bettingBadge}>🎰 賭け受付中</span>
          )}
        </div>

        {/* Arena */}
        <div style={styles.arena}>
          {/* Left side: always combatant player */}
          <div style={styles.side}>
            <div style={styles.playerEmoji}>
              {isPvP ? '🧙' : '🧙'}
            </div>
            <div style={styles.unitName}>
              {combatantPlayer?.username ?? myPlayer.username}
              {isPvP && combat.turn === 'combatant' && combat.phase === 'active' && (
                <span style={styles.activeTurnDot}> ●</span>
              )}
            </div>
            <HPBar current={combat.combatantHp} max={combatantPlayer?.maxHp ?? myPlayer.maxHp} pct={combatantHpPct} color="#4caf50" />
            <div style={styles.statLine}>
              ⚔️ ATK {(combatantPlayer?.attack ?? myPlayer.attack) + (combatantPlayer?.attackBonus ?? 0)}
              &nbsp;🛡️ DEF {combatantPlayer?.defense ?? myPlayer.defense}
            </div>
          </div>

          <div style={styles.vsText}>VS</div>

          {/* Right side: monster or opponent player */}
          <div style={styles.side}>
            {isPvP ? (
              <>
                <div style={styles.playerEmoji}>⚔️</div>
                <div style={styles.unitName}>
                  {opponentPlayer?.username ?? '?'}
                  {combat.turn === 'opponent' && combat.phase === 'active' && (
                    <span style={styles.activeTurnDot}> ●</span>
                  )}
                </div>
                <HPBar current={combat.opponentHp} max={opponentPlayer?.maxHp ?? 100} pct={opponentHpPct} color="#e94560" />
                <div style={styles.statLine}>
                  ⚔️ ATK {(opponentPlayer?.attack ?? 0) + (opponentPlayer?.attackBonus ?? 0)}
                  &nbsp;🛡️ DEF {opponentPlayer?.defense ?? 0}
                </div>
              </>
            ) : (
              <>
                <div style={styles.monsterEmoji}>
                  {monster?.id === 'slime' && '🟢'}
                  {monster?.id === 'orc' && '👹'}
                  {monster?.id === 'demon' && '😈'}
                  {monster?.id === 'dragon' && '🐉'}
                </div>
                <div style={styles.unitName}>{monster?.name ?? '???'}</div>
                <HPBar current={combat.opponentHp} max={monster?.maxHp ?? 1} pct={opponentHpPct} color="#e53935" />
                <div style={styles.statLine}>
                  ⚔️ ATK {monster?.attack ?? 0} &nbsp; 🛡️ DEF {monster?.defense ?? 0}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Battle log */}
        <div style={styles.log}>
          {combat.log.slice(-6).map((entry, i) => (
            <div key={i} style={{ ...styles.logLine, color: logColor(entry.action) }}>
              {entry.message}
            </div>
          ))}
        </div>

        {/* PvP turn indicator */}
        {isPvP && combat.phase === 'active' && (
          <div style={styles.turnIndicator}>
            {isMyTurnInPvP ? '🟢 あなたのターン！' : '⏳ 相手のターン...'}
          </div>
        )}

        {/* Commands */}
        {showCommandMenu && (
          <div style={styles.commands}>
            <CommandBtn icon="⚔️" label="攻撃" onClick={() => handleAction('attack')} color="#e94560" />
            <CommandBtn icon="🛡️" label="防御" onClick={() => handleAction('defend')} color="#2980b9" />
            <CommandBtn
              icon="🎒"
              label="アイテム"
              onClick={() => handleAction('item')}
              color="#8e44ad"
              disabled={usableItems.length === 0}
            />
            <CommandBtn icon="🏃" label="逃げる" onClick={() => handleAction('flee')} color="#8899aa" />
          </div>
        )}

        {/* Item submenu */}
        {isParticipant && showItems && (
          <div style={styles.itemMenu}>
            <div style={styles.itemMenuTitle}>
              アイテムを選択
              <button style={styles.cancelBtn} onClick={() => setShowItems(false)}>キャンセル</button>
            </div>
            {usableItems.length === 0 ? (
              <p style={{ color: '#8899aa', fontSize: '0.9rem' }}>使えるアイテムがありません</p>
            ) : (
              <div style={styles.itemGrid}>
                {usableItems.map(inv => {
                  const item = ITEMS[inv.itemId];
                  return (
                    <button key={inv.itemId} style={styles.itemBtn} onClick={() => handleItemUse(inv.itemId)}>
                      <div style={styles.itemName}>{item.name}</div>
                      <div style={styles.itemCount}>×{inv.quantity}</div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Spectator betting panel */}
        {!isCombatant && bettingOpen && (
          <div style={styles.bettingPanel}>
            <div style={styles.bettingTitle}>🎰 賭けよう！</div>
            {bettingExpiresAt && <BettingCountdown expiresAt={bettingExpiresAt} />}
            <div style={styles.betRow}>
              <label style={styles.betLabel}>賭け金: </label>
              <input
                type="number"
                min={10}
                max={myPlayer.gold}
                value={betAmount}
                onChange={e => setBetAmount(Math.max(10, Math.min(myPlayer.gold, Number(e.target.value))))}
                style={styles.betInput}
              />
              <span style={styles.goldLabel}>G (所持: {myPlayer.gold}G)</span>
            </div>
            <div style={styles.betButtons}>
              <button
                style={{ ...styles.betBtn, background: '#4caf50' }}
                onClick={() => onBet('player_wins', betAmount)}
                disabled={myPlayer.gold < 10}
              >
                👤 {myPlayer.username} に賭ける
              </button>
              <button
                style={{ ...styles.betBtn, background: '#e53935' }}
                onClick={() => onBet('monster_wins', betAmount)}
                disabled={myPlayer.gold < 10}
              >
                👹 {monster?.name ?? 'モンスター'} に賭ける
              </button>
            </div>
          </div>
        )}

        {/* Waiting message for spectators after betting closes */}
        {!isCombatant && !bettingOpen && (
          <div style={styles.spectatorMsg}>
            👁️ 観戦中... 戦闘の行方を見守れ！
          </div>
        )}

        {/* Combatant waiting for betting window */}
        {isCombatant && combat.phase === 'betting' && (
          <div style={styles.spectatorMsg}>
            🎰 観客が賭けを行っています...
            {bettingExpiresAt && <BettingCountdown expiresAt={bettingExpiresAt} />}
          </div>
        )}
      </div>
    </div>
  );
}

function HPBar({ current, max, pct, color }: { current: number; max: number; pct: number; color: string }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#8899aa', marginBottom: 3 }}>
        <span>HP</span>
        <span>{current}/{max}</span>
      </div>
      <div style={{ background: '#1a1a2e', borderRadius: 4, height: 10, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.4s ease' }} />
      </div>
    </div>
  );
}

function CommandBtn({ icon, label, onClick, color, disabled }: {
  icon: string; label: string; onClick: () => void; color: string; disabled?: boolean;
}) {
  return (
    <button
      style={{ ...styles.cmdBtn, background: disabled ? '#333' : color, opacity: disabled ? 0.5 : 1 }}
      onClick={onClick}
      disabled={disabled}
    >
      <span style={{ fontSize: '1.4rem' }}>{icon}</span>
      <span style={{ fontSize: '0.8rem', marginTop: 2 }}>{label}</span>
    </button>
  );
}

function logColor(action: string): string {
  if (action === 'attack') return '#e94560';
  if (action === 'monster_attack' || action === 'breath_attack') return '#ff9800';
  if (action === 'item' || action === 'heal') return '#4caf50';
  if (action === 'defend') return '#2980b9';
  if (action === 'flee') return '#8899aa';
  return '#eaeaea';
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
    border: '2px solid #e94560',
    borderRadius: 12,
    width: '100%',
    maxWidth: 600,
    padding: 24,
    boxShadow: '0 0 32px rgba(233,69,96,0.4)',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  headerTitle: {
    fontSize: '1.2rem',
    fontWeight: 'bold',
    color: '#e94560',
  },
  phase2Badge: {
    padding: '3px 10px',
    background: '#e67e22',
    borderRadius: 12,
    fontSize: '0.75rem',
    fontWeight: 'bold',
    animation: 'pulse 1s ease-in-out infinite',
  },
  bettingBadge: {
    padding: '3px 10px',
    background: '#8e44ad',
    borderRadius: 12,
    fontSize: '0.75rem',
  },
  arena: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-around',
    padding: '16px 0',
    background: 'rgba(26,26,46,0.5)',
    borderRadius: 8,
  },
  side: {
    flex: 1,
    textAlign: 'center',
    padding: '0 16px',
  },
  monsterEmoji: {
    fontSize: '3.5rem',
    marginBottom: 8,
  },
  playerEmoji: {
    fontSize: '3.5rem',
    marginBottom: 8,
  },
  unitName: {
    fontWeight: 'bold',
    marginBottom: 8,
    fontSize: '1rem',
  },
  statLine: {
    fontSize: '0.75rem',
    color: '#8899aa',
    marginTop: 4,
  },
  vsText: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    color: '#e94560',
    padding: '0 8px',
    flexShrink: 0,
  },
  log: {
    background: '#0f1a2e',
    borderRadius: 6,
    padding: '10px 12px',
    minHeight: 80,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  logLine: {
    fontSize: '0.82rem',
    lineHeight: 1.4,
  },
  commands: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 10,
  },
  cmdBtn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '12px 8px',
    border: 'none',
    borderRadius: 8,
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 'bold',
    transition: 'transform 0.1s',
  },
  itemMenu: {
    background: 'rgba(26,26,46,0.8)',
    borderRadius: 8,
    padding: 12,
  },
  itemMenuTitle: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    fontWeight: 'bold',
    color: '#8e44ad',
  },
  cancelBtn: {
    padding: '4px 12px',
    background: 'none',
    border: '1px solid #8899aa',
    borderRadius: 6,
    color: '#8899aa',
    cursor: 'pointer',
    fontSize: '0.8rem',
  },
  itemGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 8,
  },
  itemBtn: {
    padding: '10px 8px',
    background: '#1a1a2e',
    border: '1px solid #2a4a6a',
    borderRadius: 6,
    color: '#eaeaea',
    cursor: 'pointer',
    textAlign: 'center',
  },
  itemName: {
    fontSize: '0.8rem',
    marginBottom: 4,
  },
  itemCount: {
    fontSize: '0.75rem',
    color: '#f5a623',
  },
  bettingPanel: {
    background: 'rgba(142,68,173,0.2)',
    border: '1px solid #8e44ad',
    borderRadius: 8,
    padding: 14,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  bettingTitle: {
    fontWeight: 'bold',
    color: '#8e44ad',
  },
  betRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  betLabel: {
    color: '#8899aa',
    fontSize: '0.85rem',
  },
  betInput: {
    width: 80,
    padding: '4px 8px',
    background: '#1a1a2e',
    border: '1px solid #2a4a6a',
    borderRadius: 4,
    color: '#eaeaea',
    fontSize: '0.9rem',
  },
  goldLabel: {
    color: '#f5a623',
    fontSize: '0.8rem',
  },
  betButtons: {
    display: 'flex',
    gap: 8,
  },
  betBtn: {
    flex: 1,
    padding: '10px 8px',
    border: 'none',
    borderRadius: 6,
    color: '#fff',
    fontWeight: 'bold',
    cursor: 'pointer',
    fontSize: '0.85rem',
  },
  spectatorMsg: {
    textAlign: 'center',
    color: '#8899aa',
    padding: '12px',
    fontSize: '0.9rem',
  },
  pvpBadge: {
    padding: '3px 10px',
    background: '#f5a623',
    borderRadius: 12,
    fontSize: '0.75rem',
    fontWeight: 'bold',
    color: '#1a1a2e',
  },
  activeTurnDot: {
    color: '#4caf50',
    fontSize: '0.8rem',
  },
  turnIndicator: {
    textAlign: 'center',
    padding: '8px 12px',
    background: 'rgba(26,26,46,0.6)',
    borderRadius: 6,
    fontSize: '0.9rem',
    color: '#eaeaea',
  },
};
