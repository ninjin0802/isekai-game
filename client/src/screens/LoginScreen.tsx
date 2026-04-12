import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import type { AuthUser } from '@isekai/shared';

type Mode = 'login' | 'register';

export default function LoginScreen() {
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const setAuth = useAuthStore(s => s.setAuth);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body = mode === 'login'
        ? { email, password }
        : { username, email, password };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json() as { user?: AuthUser; token?: string; error?: string };

      if (!res.ok || !data.user || !data.token) {
        setError(data.error ?? 'エラーが発生しました');
        return;
      }

      setAuth(data.user, data.token);
      navigate('/lobby');
    } catch {
      setError('サーバーへの接続に失敗しました');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>⚔️ 異世界転生サイコロRPG</h1>
        <p style={styles.subtitle}>運と戦略で勇者を目指せ！</p>

        <div style={styles.tabs}>
          <button
            style={{ ...styles.tab, ...(mode === 'login' ? styles.tabActive : {}) }}
            onClick={() => setMode('login')}
          >
            ログイン
          </button>
          <button
            style={{ ...styles.tab, ...(mode === 'register' ? styles.tabActive : {}) }}
            onClick={() => setMode('register')}
          >
            新規登録
          </button>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          {mode === 'register' && (
            <div style={styles.field}>
              <label style={styles.label}>ユーザー名</label>
              <input
                style={styles.input}
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="2〜32文字"
                required
                minLength={2}
                maxLength={32}
              />
            </div>
          )}

          <div style={styles.field}>
            <label style={styles.label}>メールアドレス</label>
            <input
              style={styles.input}
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="example@email.com"
              required
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>パスワード</label>
            <input
              style={styles.input}
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={mode === 'register' ? '6文字以上' : ''}
              required
              minLength={mode === 'register' ? 6 : undefined}
            />
          </div>

          {error && <p style={styles.error}>{error}</p>}

          <button style={styles.button} type="submit" disabled={loading}>
            {loading ? '処理中...' : mode === 'login' ? 'ログイン' : '登録する'}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
    padding: '20px',
  },
  card: {
    background: 'rgba(15, 52, 96, 0.8)',
    border: '1px solid #2a4a6a',
    borderRadius: '12px',
    padding: '40px',
    width: '100%',
    maxWidth: '400px',
    backdropFilter: 'blur(10px)',
  },
  title: {
    fontSize: '1.8rem',
    textAlign: 'center',
    color: '#f5a623',
    marginBottom: '8px',
  },
  subtitle: {
    textAlign: 'center',
    color: '#8899aa',
    marginBottom: '24px',
    fontSize: '0.9rem',
  },
  tabs: {
    display: 'flex',
    marginBottom: '24px',
    borderBottom: '1px solid #2a4a6a',
  },
  tab: {
    flex: 1,
    padding: '10px',
    background: 'none',
    border: 'none',
    color: '#8899aa',
    fontSize: '1rem',
    transition: 'color 0.2s',
  },
  tabActive: {
    color: '#f5a623',
    borderBottom: '2px solid #f5a623',
    marginBottom: '-1px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    color: '#8899aa',
    fontSize: '0.85rem',
  },
  input: {
    padding: '10px 14px',
    background: '#1a1a2e',
    border: '1px solid #2a4a6a',
    borderRadius: '6px',
    color: '#eaeaea',
    fontSize: '1rem',
    outline: 'none',
  },
  error: {
    color: '#e53935',
    fontSize: '0.85rem',
    textAlign: 'center',
  },
  button: {
    padding: '12px',
    background: '#e94560',
    border: 'none',
    borderRadius: '6px',
    color: '#fff',
    fontSize: '1rem',
    fontWeight: 'bold',
    transition: 'opacity 0.2s',
    marginTop: '8px',
  },
};
