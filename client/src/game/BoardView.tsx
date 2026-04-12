import React, { useRef, useEffect } from 'react';
import type { MapSquare, Player } from '@isekai/shared';

const SQUARE_SIZE = 60;
const COLS = 10;

const SQUARE_COLORS: Record<string, string> = {
  battle: '#c0392b',
  shop: '#8e44ad',
  recovery: '#27ae60',
  event: '#2980b9',
  boss: '#e67e22',
};

const SQUARE_LABELS: Record<string, string> = {
  battle: '⚔️',
  shop: '🛒',
  recovery: '💚',
  event: '🎲',
  boss: '🐉',
};

const PLAYER_COLORS = ['#f5a623', '#e94560', '#00bcd4', '#9c27b0'];

interface Props {
  map: MapSquare[];
  players: Player[];
  currentTurnPlayerId: string | null;
  myPlayerId: string | null;
}

export default function BoardView({ map, players, currentTurnPlayerId, myPlayerId }: Props) {
  const rows = Math.ceil(map.length / COLS);
  const boardWidth = COLS * SQUARE_SIZE;
  const boardHeight = rows * SQUARE_SIZE;

  // Snake layout: even rows go left→right, odd rows go right→left
  function squarePosition(index: number): { col: number; row: number } {
    const row = Math.floor(index / COLS);
    const posInRow = index % COLS;
    const col = row % 2 === 0 ? posInRow : COLS - 1 - posInRow;
    return { col, row };
  }

  function playerColor(i: number) {
    return PLAYER_COLORS[i % PLAYER_COLORS.length];
  }

  return (
    <div style={{ overflowX: 'auto', width: '100%' }}>
      <div
        style={{
          position: 'relative',
          width: boardWidth,
          height: boardHeight,
          margin: '0 auto',
        }}
      >
        {/* Squares */}
        {map.map((sq) => {
          const { col, row } = squarePosition(sq.index);
          const x = col * SQUARE_SIZE;
          const y = row * SQUARE_SIZE;
          const isBoss = sq.type === 'boss';

          return (
            <div
              key={sq.index}
              title={sq.type}
              style={{
                position: 'absolute',
                left: x,
                top: y,
                width: SQUARE_SIZE - 2,
                height: SQUARE_SIZE - 2,
                background: SQUARE_COLORS[sq.type] ?? '#555',
                border: isBoss ? '2px solid #f5a623' : '1px solid rgba(255,255,255,0.1)',
                borderRadius: 4,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: isBoss ? '1.4rem' : '1rem',
                userSelect: 'none',
                boxShadow: isBoss ? '0 0 8px #f5a623' : undefined,
              }}
            >
              <span>{SQUARE_LABELS[sq.type]}</span>
              <span style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.7)', marginTop: 1 }}>
                {sq.index}
              </span>
            </div>
          );
        })}

        {/* Player tokens */}
        {players.filter(p => p.isAlive).map((player, i) => {
          const { col, row } = squarePosition(player.position);
          const offset = i * 12;
          const x = col * SQUARE_SIZE + 4 + (i % 2) * 26;
          const y = row * SQUARE_SIZE + 4 + Math.floor(i / 2) * 22;
          const isActive = player.id === currentTurnPlayerId;
          const isMe = player.id === myPlayerId;

          return (
            <div
              key={player.id}
              title={player.username}
              style={{
                position: 'absolute',
                left: x,
                top: y,
                width: 22,
                height: 22,
                background: playerColor(player.turnOrder),
                borderRadius: '50%',
                border: isMe ? '2px solid #fff' : '1px solid rgba(255,255,255,0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.6rem',
                fontWeight: 'bold',
                color: '#000',
                transition: 'left 0.3s ease, top 0.3s ease',
                zIndex: 10,
                boxShadow: isActive ? `0 0 6px ${playerColor(player.turnOrder)}` : undefined,
                animation: isActive ? 'pulse 1s ease-in-out infinite' : undefined,
              }}
            >
              {player.username.slice(0, 2)}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
}
