import React, { useState, useEffect } from 'react';

interface Props {
  expiresAt: number; // epoch ms
}

export default function BettingCountdown({ expiresAt }: Props) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    function tick() {
      setRemaining(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
    }
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [expiresAt]);

  const pct = Math.min(100, (remaining / 15) * 100);
  const color = remaining > 8 ? '#4caf50' : remaining > 4 ? '#ff9800' : '#e53935';

  return (
    <div style={styles.container}>
      <div style={{ ...styles.bar }}>
        <div style={{ ...styles.fill, width: `${pct}%`, background: color }} />
      </div>
      <span style={{ ...styles.label, color }}>
        {remaining > 0 ? `賭け受付中 ${remaining}秒` : '締め切り！'}
      </span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  bar: {
    height: 6,
    background: '#1a1a2e',
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
    transition: 'width 0.2s linear, background 0.3s',
  },
  label: {
    fontSize: '0.75rem',
    fontWeight: 'bold',
    textAlign: 'center',
  },
};
