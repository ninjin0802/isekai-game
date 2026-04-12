import React from 'react';
import type { DeathPenaltyChoice } from '@isekai/shared';

interface Props {
  playerName: string;
  isMe: boolean;
  onChoose: (choice: DeathPenaltyChoice) => void;
}

export default function DeathPenaltyModal({ playerName, isMe, onChoose }: Props) {
  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.skull}>💀</div>
        <h2 style={styles.title}>{playerName} は倒れた！</h2>

        {isMe ? (
          <>
            <p style={styles.prompt}>復活の代償を選んでください</p>
            <div style={styles.choices}>
              <button
                style={{ ...styles.choiceBtn, borderColor: '#e53935' }}
                onClick={() => onChoose('lose_gold')}
              >
                <div style={styles.choiceIcon}>💸</div>
                <div style={styles.choiceLabel}>所持ゴールド全ロスト</div>
                <div style={styles.choiceDesc}>その場で復活。ゴールドはすべて失う。</div>
              </button>

              <button
                style={{ ...styles.choiceBtn, borderColor: '#2980b9' }}
                onClick={() => onChoose('return_start')}
              >
                <div style={styles.choiceIcon}>🏠</div>
                <div style={styles.choiceLabel}>スタートへ戻る</div>
                <div style={styles.choiceDesc}>ゴールドは保持。スタートマスから再出発。</div>
              </button>
            </div>
          </>
        ) : (
          <p style={styles.prompt}>ペナルティを選択中...</p>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.9)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 200,
  },
  modal: {
    background: '#16213e',
    border: '2px solid #9c27b0',
    borderRadius: 12,
    padding: 32,
    width: '100%',
    maxWidth: 480,
    textAlign: 'center',
    boxShadow: '0 0 32px rgba(156,39,176,0.4)',
  },
  skull: {
    fontSize: '4rem',
    marginBottom: 12,
  },
  title: {
    fontSize: '1.5rem',
    color: '#9c27b0',
    marginBottom: 8,
  },
  prompt: {
    color: '#8899aa',
    marginBottom: 24,
  },
  choices: {
    display: 'flex',
    gap: 16,
  },
  choiceBtn: {
    flex: 1,
    padding: 20,
    background: 'rgba(26,26,46,0.8)',
    border: '2px solid',
    borderRadius: 10,
    color: '#eaeaea',
    cursor: 'pointer',
    textAlign: 'center',
    transition: 'transform 0.1s',
  },
  choiceIcon: {
    fontSize: '2rem',
    marginBottom: 8,
  },
  choiceLabel: {
    fontWeight: 'bold',
    marginBottom: 8,
  },
  choiceDesc: {
    fontSize: '0.8rem',
    color: '#8899aa',
    lineHeight: 1.4,
  },
};
