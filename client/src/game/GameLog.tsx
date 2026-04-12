import React, { useEffect, useRef } from 'react';

export interface LogEntry {
  id: string;
  text: string;
  type: 'info' | 'battle' | 'event' | 'gold' | 'death' | 'turn';
}

interface Props {
  entries: LogEntry[];
}

const LOG_COLORS: Record<LogEntry['type'], string> = {
  info: '#8899aa',
  battle: '#e94560',
  event: '#2980b9',
  gold: '#f5a623',
  death: '#9c27b0',
  turn: '#4caf50',
};

export default function GameLog({ entries }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries]);

  return (
    <div style={styles.container}>
      <h3 style={styles.title}>📜 ゲームログ</h3>
      <div style={styles.log}>
        {entries.map(entry => (
          <div key={entry.id} style={{ ...styles.entry, color: LOG_COLORS[entry.type] }}>
            {entry.text}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    background: 'rgba(15, 52, 96, 0.5)',
    border: '1px solid #2a4a6a',
    borderRadius: '8px',
    padding: '12px',
    height: '180px',
  },
  title: {
    fontSize: '0.85rem',
    color: '#8899aa',
    marginBottom: '8px',
  },
  log: {
    flex: 1,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  entry: {
    fontSize: '0.8rem',
    lineHeight: 1.4,
  },
};
