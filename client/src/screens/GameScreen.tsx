import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useGameStore } from '../stores/gameStore';
import { useLobbyStore } from '../stores/lobbyStore';
import { useSocket } from '../hooks/useSocket';
import BoardView from '../game/BoardView';
import DiceRoller from '../game/DiceRoller';
import PlayerHUD from '../game/PlayerHUD';
import GameLog, { type LogEntry } from '../game/GameLog';
import CombatView from '../game/CombatView';
import DeathPenaltyModal from '../game/DeathPenaltyModal';
import ShopView from '../game/ShopView';
import PayoutToast, { type PayoutEntry } from '../game/PayoutToast';
import { v4 as uuidv4 } from 'uuid';
import type { Player, GameRoom, CombatState, CombatAction, ItemId } from '@isekai/shared';

export default function GameScreen() {
  const socket = useSocket();
  const user = useAuthStore(s => s.user);
  const navigate = useNavigate();
  const currentRoom = useLobbyStore(s => s.currentRoom);

  const {
    gameRoom,
    myPlayerId,
    currentTurnPlayerId,
    turnNumber,
    lastDiceRoll,
    lastSquareEvent,
    combat,
    bettingOpen,
    bettingExpiresAt,
    deathPromptPlayerId,
    shopItems,
    winner,
    setGameRoom,
    setMyPlayerId,
    updatePlayer,
    setTurnStart,
    setDiceResult,
    setSquareEvent,
    setCombat,
    setBettingWindow,
    setDeathPrompt,
    setShopItems,
    setWinner,
    reset,
  } = useGameStore();

  const [rolling, setRolling] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [payoutToast, setPayoutToast] = useState<PayoutEntry[] | null>(null);

  const addLog = useCallback((text: string, type: LogEntry['type'] = 'info') => {
    setLog(prev => [...prev.slice(-99), { id: uuidv4(), text, type }]);
  }, []);

  useEffect(() => {
    if (!socket) return;

    socket.on('game:start', ({ gameRoom }: { gameRoom: GameRoom }) => {
      setGameRoom(gameRoom);
      const me = gameRoom.players.find(p => p.userId === user?.id);
      if (me) setMyPlayerId(me.id);
      addLog('ゲーム開始！', 'turn');
    });

    socket.on('game:turn_start', ({ playerId, turnNumber }) => {
      setTurnStart(playerId, turnNumber);
      const room = useGameStore.getState().gameRoom;
      const player = room?.players.find(p => p.id === playerId);
      addLog(`ターン ${turnNumber}: ${player?.username ?? '?'} のターン`, 'turn');
    });

    socket.on('game:dice_result', ({ playerId, roll, newPosition, squareType }) => {
      setRolling(false);
      setDiceResult(playerId, roll, newPosition);
      const room = useGameStore.getState().gameRoom;
      const player = room?.players.find(p => p.id === playerId);
      addLog(`${player?.username ?? '?'} が ${roll} を出してマス ${newPosition} へ移動 (${squareType})`, 'info');
    });

    socket.on('game:square_event', ({ type, payload }) => {
      setSquareEvent(type, payload);
      const p = payload as Record<string, unknown>;
      if (type === 'recovery' && p['hpGained']) addLog(`💚 HP が ${p['hpGained']} 回復！`, 'event');
      else if (type === 'event' && p['description']) addLog(`🎲 ${p['description']}`, 'event');
      else if (type === 'battle' || type === 'boss') addLog(`⚔️ ${p['message'] ?? 'モンスターが現れた！'}`, 'battle');
      else if (type === 'shop') addLog('🛒 ショップに立ち寄った！', 'gold');
    });

    socket.on('player:update', ({ player }: { player: Player }) => {
      updatePlayer(player);
    });

    socket.on('player:death', ({ playerId }) => {
      const room = useGameStore.getState().gameRoom;
      const player = room?.players.find(p => p.id === playerId);
      addLog(`💀 ${player?.username ?? '?'} が倒れた！`, 'death');
    });

    socket.on('death:choose_prompt', ({ playerId }) => {
      setDeathPrompt(playerId);
    });

    // ── Combat events ──────────────────────────────────────────────────────
    socket.on('combat:start', ({ combat }: { combat: CombatState }) => {
      setCombat(combat);
      const monster = combat.monster;
      const room = useGameStore.getState().gameRoom;
      const combatant = room?.players.find(p => p.id === combat.combatantId);
      addLog(`⚔️ ${combatant?.username ?? '?'} vs ${monster?.name ?? '?'} の戦闘！`, 'battle');
    });

    socket.on('combat:update', ({ combat }: { combat: CombatState }) => {
      setCombat(combat);
      const last = combat.log.at(-1);
      if (last?.message) addLog(last.message, last.action === 'monster_attack' || last.action === 'breath_attack' ? 'battle' : 'info');
    });

    socket.on('combat:end', ({ battleId, winnerId, rewards }) => {
      const state = useGameStore.getState();
      setCombat(null);
      setBettingWindow(false);
      const room = state.gameRoom;
      const winner = room?.players.find(p => p.id === winnerId);
      if (rewards.gold > 0) addLog(`💰 ${winner?.username ?? '?'} が ${rewards.gold}G 獲得！`, 'gold');
    });

    socket.on('bet:window_open', ({ expiresAt }) => {
      setBettingWindow(true, expiresAt);
    });

    socket.on('bet:window_close', () => {
      setBettingWindow(false);
    });

    socket.on('shop:open', ({ items }: { items: ItemId[]; roomId: string }) => {
      setShopItems(items);
    });

    socket.on('bet:result', ({ payouts }: { battleId: string; payouts: Array<{ playerId: string; delta: number }> }) => {
      const room = useGameStore.getState().gameRoom;
      const entries: PayoutEntry[] = payouts.map(p => {
        const player = room?.players.find(pl => pl.id === p.playerId);
        return { playerId: p.playerId, username: player?.username ?? '?', delta: p.delta };
      });
      if (entries.length > 0) {
        setPayoutToast(entries);
        // Log payouts
        for (const e of entries) {
          if (e.delta > 0) addLog(`🎰 ${e.username} +${e.delta}G（賭け的中！）`, 'gold');
        }
      }
    });

    socket.on('game:winner', ({ winnerId, username }) => {
      setWinner(winnerId, username);
      addLog(`🏆 ${username} がドラゴンを討伐してゲームに勝利！`, 'turn');
    });

    socket.on('game:reconnect_state', ({ gameRoom }: { gameRoom: GameRoom }) => {
      setGameRoom(gameRoom);
      const me = gameRoom.players.find(p => p.userId === user?.id);
      if (me) setMyPlayerId(me.id);
      addLog('再接続しました', 'info');
    });

    return () => {
      socket.off('game:start');
      socket.off('game:turn_start');
      socket.off('game:dice_result');
      socket.off('game:square_event');
      socket.off('player:update');
      socket.off('player:death');
      socket.off('death:choose_prompt');
      socket.off('combat:start');
      socket.off('combat:update');
      socket.off('combat:end');
      socket.off('bet:window_open');
      socket.off('bet:window_close');
      socket.off('shop:open');
      socket.off('bet:result');
      socket.off('game:winner');
      socket.off('game:reconnect_state');
    };
  }, [socket, user, addLog, setGameRoom, setMyPlayerId, updatePlayer, setTurnStart,
    setDiceResult, setSquareEvent, setCombat, setBettingWindow, setDeathPrompt, setWinner]);

  function handleRoll() {
    if (!gameRoom || !currentRoom) return;
    setRolling(true);
    socket?.emit('game:roll_dice', { roomId: currentRoom.id });
  }

  function handleCombatAction(action: CombatAction, itemId?: string) {
    if (!currentRoom || !combat) return;
    socket?.emit('combat:action', {
      roomId: currentRoom.id,
      battleId: combat.battleId,
      action,
      itemId: itemId as ItemId | undefined,
    });
  }

  function handleBet(betOn: 'player_wins' | 'monster_wins', amount: number) {
    if (!currentRoom || !combat) return;
    socket?.emit('bet:place', {
      roomId: currentRoom.id,
      battleId: combat.battleId,
      betOn,
      amount,
    });
  }

  function handleShopBuy(itemId: ItemId) {
    if (!currentRoom) return;
    socket?.emit('shop:buy', { roomId: currentRoom.id, itemId });
  }

  function handleShopLeave() {
    if (!currentRoom) return;
    setShopItems(null);
    socket?.emit('shop:skip', { roomId: currentRoom.id });
  }

  function handleDeathChoice(choice: 'lose_gold' | 'return_start') {
    if (!currentRoom) return;
    socket?.emit('death:choose', { roomId: currentRoom.id, choice });
    setDeathPrompt(null);
  }

  const myPlayer = gameRoom?.players.find(p => p.id === myPlayerId);
  const isMyTurn = currentTurnPlayerId === myPlayerId;
  const isCombatant = combat?.combatantId === myPlayerId;
  const deathPlayer = deathPromptPlayerId
    ? gameRoom?.players.find(p => p.id === deathPromptPlayerId)
    : null;

  // ── Winner screen ──────────────────────────────────────────────────────────
  if (winner) {
    return (
      <div style={styles.winScreen}>
        <div style={styles.winCard}>
          <div style={styles.winEmoji}>🏆</div>
          <h1 style={styles.winTitle}>{winner.username} の勝利！</h1>
          <p style={styles.winSub}>ドラゴンを討伐した！</p>
          <button style={styles.returnBtn} onClick={() => { reset(); navigate('/lobby'); }}>
            ロビーに戻る
          </button>
        </div>
      </div>
    );
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (!gameRoom) {
    return (
      <div style={styles.loading}>
        <p>ゲームを読み込み中...</p>
      </div>
    );
  }

  const squareEvent = lastSquareEvent as { type: string; payload: Record<string, unknown> } | null;

  return (
    <div style={styles.container}>
      {/* Overlays */}
      {combat && myPlayer && (
        <CombatView
          combat={combat}
          myPlayer={myPlayer}
          allPlayers={gameRoom?.players ?? []}
          isCombatant={!!isCombatant}
          bettingOpen={bettingOpen}
          bettingExpiresAt={bettingExpiresAt}
          onAction={handleCombatAction}
          onBet={handleBet}
        />
      )}

      {shopItems && myPlayer && (
        <ShopView
          items={shopItems}
          player={myPlayer}
          onBuy={handleShopBuy}
          onLeave={handleShopLeave}
        />
      )}

      {payoutToast && (
        <PayoutToast
          payouts={payoutToast}
          onDone={() => setPayoutToast(null)}
        />
      )}

      {deathPlayer && (
        <DeathPenaltyModal
          playerName={deathPlayer.username}
          isMe={deathPlayer.id === myPlayerId}
          onChoose={handleDeathChoice}
        />
      )}

      {/* Header */}
      <header style={styles.header}>
        <span style={styles.headerTitle}>⚔️ 異世界転生サイコロRPG</span>
        <span style={styles.turnInfo}>ターン {turnNumber}</span>
      </header>

      {/* Square event banner */}
      {squareEvent && squareEvent.type !== 'battle' && squareEvent.type !== 'boss' && (
        <div style={styles.eventBanner}>
          {squareEvent.type === 'recovery' && `💚 HP +${squareEvent.payload['hpGained'] ?? ''} 回復！`}
          {squareEvent.type === 'event' && `🎲 ${squareEvent.payload['description'] ?? ''}`}
          {squareEvent.type === 'shop' && '🛒 ショップに到着！'}
          {squareEvent.type === 'start' && '🏠 スタート地点！'}
        </div>
      )}

      <div style={styles.main}>
        {/* Left: Player HUD */}
        <PlayerHUD
          players={gameRoom.players}
          currentTurnPlayerId={currentTurnPlayerId}
          myPlayerId={myPlayerId}
        />

        {/* Center: Board + Dice + Log */}
        <div style={styles.center}>
          <BoardView
            map={gameRoom.map}
            players={gameRoom.players}
            currentTurnPlayerId={currentTurnPlayerId}
            myPlayerId={myPlayerId}
          />
          <DiceRoller
            isMyTurn={isMyTurn && !combat && !shopItems}
            lastRoll={lastDiceRoll}
            rolling={rolling}
            onRoll={handleRoll}
          />
          <GameLog entries={log} />
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 20px',
    borderBottom: '1px solid #2a4a6a',
    background: 'rgba(15, 52, 96, 0.5)',
  },
  headerTitle: {
    color: '#f5a623',
    fontWeight: 'bold',
    fontSize: '1.1rem',
  },
  turnInfo: {
    color: '#8899aa',
    fontSize: '0.9rem',
  },
  eventBanner: {
    padding: '10px 20px',
    background: 'rgba(41, 128, 185, 0.3)',
    borderBottom: '1px solid #2980b9',
    color: '#eaeaea',
    textAlign: 'center',
    fontSize: '0.95rem',
  },
  main: {
    display: 'flex',
    flex: 1,
    gap: '16px',
    padding: '16px',
    alignItems: 'flex-start',
    overflowX: 'auto',
  },
  center: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    minWidth: 0,
  },
  loading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    color: '#8899aa',
  },
  winScreen: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
  },
  winCard: {
    textAlign: 'center',
    padding: '48px',
    background: 'rgba(15, 52, 96, 0.8)',
    border: '1px solid #f5a623',
    borderRadius: '16px',
    boxShadow: '0 0 24px rgba(245, 166, 35, 0.3)',
  },
  winEmoji: {
    fontSize: '4rem',
    marginBottom: '16px',
  },
  winTitle: {
    fontSize: '2rem',
    color: '#f5a623',
    marginBottom: '8px',
  },
  winSub: {
    color: '#8899aa',
    marginBottom: '32px',
  },
  returnBtn: {
    padding: '12px 28px',
    background: '#e94560',
    border: 'none',
    borderRadius: '8px',
    color: '#fff',
    fontSize: '1rem',
    fontWeight: 'bold',
    cursor: 'pointer',
  },
};
