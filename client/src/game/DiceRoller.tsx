import React, { useState, useEffect } from 'react';

const DICE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

interface Props {
  isMyTurn: boolean;
  lastRoll: number | null;
  rolling: boolean;
  onRoll: () => void;
}

export default function DiceRoller({ isMyTurn, lastRoll, rolling, onRoll }: Props) {
  const [displayFace, setDisplayFace] = useState(0);

  // Animate dice faces while rolling
  useEffect(() => {
    if (!rolling) {
      if (lastRoll !== null) setDisplayFace(lastRoll - 1);
      return;
    }
    const interval = setInterval(() => {
      setDisplayFace(Math.floor(Math.random() * 6));
    }, 80);
    return () => clearInterval(interval);
  }, [rolling, lastRoll]);

  const face = DICE_FACES[displayFace] ?? '⚀';

  return (
    <div style={styles.container}>
      <div
        style={{
          ...styles.die,
          ...(rolling ? styles.dieRolling : {}),
          ...(lastRoll !== null && !rolling ? styles.dieResult : {}),
        }}
      >
        {face}
      </div>

      {lastRoll !== null && !rolling && (
        <div style={styles.result}>
          {lastRoll} が出た！
        </div>
      )}

      {isMyTurn && (
        <button
          style={{ ...styles.button, ...(rolling ? styles.buttonDisabled : {}) }}
          onClick={onRoll}
          disabled={rolling}
        >
          {rolling ? 'ロール中...' : '🎲 サイコロを振る'}
        </button>
      )}

      {!isMyTurn && (
        <p style={styles.waiting}>他のプレイヤーのターンです...</p>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    padding: '20px',
  },
  die: {
    fontSize: '4rem',
    lineHeight: 1,
    transition: 'transform 0.1s',
    userSelect: 'none',
  },
  dieRolling: {
    animation: 'spin 0.1s linear infinite',
  },
  dieResult: {
    filter: 'drop-shadow(0 0 8px #f5a623)',
  },
  result: {
    fontSize: '1.1rem',
    color: '#f5a623',
    fontWeight: 'bold',
  },
  button: {
    padding: '12px 24px',
    background: '#e94560',
    border: 'none',
    borderRadius: '8px',
    color: '#fff',
    fontSize: '1.1rem',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'transform 0.1s',
  },
  buttonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  waiting: {
    color: '#8899aa',
    fontSize: '0.9rem',
  },
};
