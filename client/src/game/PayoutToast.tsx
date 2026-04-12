import React, { useEffect, useState } from 'react';

export interface PayoutEntry {
  playerId: string;
  username: string;
  delta: number;
}

interface Props {
  payouts: PayoutEntry[];
  onDone: () => void;
}

export default function PayoutToast({ payouts, onDone }: Props) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      setVisible(false);
      setTimeout(onDone, 300);
    }, 3500);
    return () => clearTimeout(t);
  }, [onDone]);

  if (payouts.length === 0) return null;

  return (
    <div style={{ ...styles.container, opacity: visible ? 1 : 0, transition: 'opacity 0.3s' }}>
      <div style={styles.title}>🎰 賭けの結果</div>
      {payouts.map(p => (
        <div key={p.playerId} style={styles.row}>
          <span style={styles.name}>{p.username}</span>
          <span style={{ ...styles.delta, color: p.delta > 0 ? '#4caf50' : '#e53935' }}>
            {p.delta > 0 ? `+${p.delta}G` : `${p.delta}G`}
          </span>
        </div>
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'fixed',
    bottom: 24,
    right: 24,
    background: '#16213e',
    border: '1px solid #8e44ad',
    borderRadius: 10,
    padding: '14px 18px',
    boxShadow: '0 4px 20px rgba(142,68,173,0.4)',
    zIndex: 300,
    minWidth: 200,
  },
  title: {
    color: '#8e44ad',
    fontWeight: 'bold',
    marginBottom: 8,
    fontSize: '0.9rem',
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 16,
    fontSize: '0.85rem',
    marginBottom: 4,
  },
  name: {
    color: '#eaeaea',
  },
  delta: {
    fontWeight: 'bold',
  },
};
