import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useLobbyStore } from '../stores/lobbyStore';
import { useSocket } from '../hooks/useSocket';
import type { LobbyRoom, LobbyPlayer } from '@isekai/shared';

export default function LobbyScreen() {
  const socket = useSocket();
  const user = useAuthStore(s => s.user);
  const logout = useAuthStore(s => s.logout);
  const { rooms, currentRoom, setRooms, setCurrentRoom, clearRoom, setError, error } = useLobbyStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (!socket) return;

    // Join lobby room and request room list. Also re-join after reconnect
    // (socket.io reuses the same socket object, so React effect doesn't re-run).
    const joinLobby = () => socket.emit('lobby:join');
    joinLobby();
    socket.on('connect', joinLobby);

    socket.on('lobby:room_list', ({ rooms }) => setRooms(rooms));
    socket.on('lobby:room_update', ({ room, players }: { room: LobbyRoom; players: LobbyPlayer[] }) => {
      setCurrentRoom(room, players);
    });
    socket.on('lobby:error', ({ message }) => setError(message));
    socket.on('game:start', () => navigate('/game'));

    return () => {
      socket.off('connect', joinLobby);
      socket.off('lobby:room_list');
      socket.off('lobby:room_update');
      socket.off('lobby:error');
      socket.off('game:start');
    };
  }, [socket, navigate, setRooms, setCurrentRoom, setError]);

  function handleCreateRoom() {
    socket?.emit('lobby:create_room');
  }

  function handleJoinRoom(roomId: string) {
    socket?.emit('lobby:join_room', { roomId });
  }

  function handleLeaveRoom() {
    if (currentRoom) {
      socket?.emit('lobby:leave_room', { roomId: currentRoom.id });
      clearRoom();
    }
  }

  function handleReady(ready: boolean) {
    if (currentRoom) {
      socket?.emit('lobby:ready', { roomId: currentRoom.id, ready });
    }
  }

  function handleLogout() {
    logout();
    navigate('/');
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>⚔️ 異世界転生サイコロRPG</h1>
        <div style={styles.headerRight}>
          <span style={styles.username}>👤 {user?.username}</span>
          <button style={styles.logoutBtn} onClick={handleLogout}>ログアウト</button>
        </div>
      </header>

      {error && (
        <div style={styles.errorBanner}>
          {error}
          <button style={styles.closeBtn} onClick={() => setError(null)}>✕</button>
        </div>
      )}

      <div style={styles.content}>
        {!currentRoom ? (
          <>
            <div style={styles.section}>
              <button style={styles.createBtn} onClick={handleCreateRoom}>
                ＋ ルームを作成する
              </button>
            </div>

            <div style={styles.section}>
              <h2 style={styles.sectionTitle}>参加可能なルーム</h2>
              {rooms.length === 0 ? (
                <p style={styles.empty}>現在参加可能なルームはありません</p>
              ) : (
                <div style={styles.roomList}>
                  {rooms.map(room => (
                    <div key={room.id} style={styles.roomCard}>
                      <div>
                        <div style={styles.roomHost}>{room.hostUsername} のルーム</div>
                        <div style={styles.roomCount}>
                          {room.playerCount} / {room.maxPlayers} 人
                        </div>
                      </div>
                      <button
                        style={styles.joinBtn}
                        onClick={() => handleJoinRoom(room.id)}
                        disabled={room.playerCount >= room.maxPlayers}
                      >
                        参加
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <WaitingRoom
            room={currentRoom}
            userId={user?.id ?? ''}
            onLeave={handleLeaveRoom}
            onReady={handleReady}
          />
        )}
      </div>
    </div>
  );
}

function WaitingRoom({
  room,
  userId,
  onLeave,
  onReady,
}: {
  room: LobbyRoom;
  userId: string;
  onLeave: () => void;
  onReady: (ready: boolean) => void;
}) {
  const { currentRoomPlayers } = useLobbyStore();
  const me = currentRoomPlayers.find(p => p.userId === userId);

  return (
    <div style={styles.waitingRoom}>
      <h2 style={styles.sectionTitle}>{room.hostUsername} のルーム</h2>
      <p style={styles.roomCount}>{room.playerCount} / {room.maxPlayers} 人</p>

      <div style={styles.playerList}>
        {currentRoomPlayers.map(player => (
          <div key={player.userId} style={styles.playerCard}>
            <span>👤 {player.username}</span>
            <span style={player.ready ? styles.readyBadge : styles.waitBadge}>
              {player.ready ? '準備完了' : '待機中'}
            </span>
          </div>
        ))}
      </div>

      <div style={styles.waitingActions}>
        {me && (
          <button
            style={me.ready ? styles.unreadyBtn : styles.readyBtn}
            onClick={() => onReady(!me.ready)}
          >
            {me.ready ? '準備解除' : '準備完了'}
          </button>
        )}
        <button style={styles.leaveBtn} onClick={onLeave}>
          ルームを離れる
        </button>
      </div>

      <p style={styles.hint}>
        全員が準備完了になるとゲームが開始されます
      </p>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 24px',
    borderBottom: '1px solid #2a4a6a',
    background: 'rgba(15, 52, 96, 0.5)',
  },
  title: {
    fontSize: '1.4rem',
    color: '#f5a623',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  username: {
    color: '#8899aa',
  },
  logoutBtn: {
    padding: '6px 14px',
    background: 'none',
    border: '1px solid #2a4a6a',
    borderRadius: '6px',
    color: '#8899aa',
    fontSize: '0.85rem',
  },
  errorBanner: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 24px',
    background: '#e53935',
    color: '#fff',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: '#fff',
    fontSize: '1rem',
  },
  content: {
    maxWidth: '800px',
    margin: '0 auto',
    padding: '32px 24px',
  },
  section: {
    marginBottom: '32px',
  },
  sectionTitle: {
    color: '#f5a623',
    marginBottom: '16px',
    fontSize: '1.2rem',
  },
  createBtn: {
    padding: '14px 28px',
    background: '#e94560',
    border: 'none',
    borderRadius: '8px',
    color: '#fff',
    fontSize: '1rem',
    fontWeight: 'bold',
  },
  empty: {
    color: '#8899aa',
    textAlign: 'center',
    padding: '24px',
  },
  roomList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  roomCard: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    background: 'rgba(15, 52, 96, 0.6)',
    border: '1px solid #2a4a6a',
    borderRadius: '8px',
  },
  roomHost: {
    fontWeight: 'bold',
    marginBottom: '4px',
  },
  roomCount: {
    color: '#8899aa',
    fontSize: '0.9rem',
  },
  joinBtn: {
    padding: '8px 20px',
    background: '#4caf50',
    border: 'none',
    borderRadius: '6px',
    color: '#fff',
    fontWeight: 'bold',
  },
  waitingRoom: {
    background: 'rgba(15, 52, 96, 0.6)',
    border: '1px solid #2a4a6a',
    borderRadius: '12px',
    padding: '32px',
  },
  playerList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    margin: '20px 0',
  },
  playerCard: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    background: 'rgba(26, 26, 46, 0.8)',
    borderRadius: '6px',
  },
  readyBadge: {
    padding: '4px 12px',
    background: '#4caf50',
    borderRadius: '20px',
    fontSize: '0.85rem',
  },
  waitBadge: {
    padding: '4px 12px',
    background: '#8899aa',
    borderRadius: '20px',
    fontSize: '0.85rem',
  },
  waitingActions: {
    display: 'flex',
    gap: '12px',
    marginTop: '20px',
  },
  readyBtn: {
    flex: 1,
    padding: '12px',
    background: '#4caf50',
    border: 'none',
    borderRadius: '6px',
    color: '#fff',
    fontWeight: 'bold',
    fontSize: '1rem',
  },
  unreadyBtn: {
    flex: 1,
    padding: '12px',
    background: '#8899aa',
    border: 'none',
    borderRadius: '6px',
    color: '#fff',
    fontWeight: 'bold',
    fontSize: '1rem',
  },
  leaveBtn: {
    padding: '12px 20px',
    background: 'none',
    border: '1px solid #e53935',
    borderRadius: '6px',
    color: '#e53935',
    fontSize: '1rem',
  },
  hint: {
    color: '#8899aa',
    fontSize: '0.85rem',
    textAlign: 'center',
    marginTop: '16px',
  },
};
