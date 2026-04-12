import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { pool } from '../config/db';
import { env } from '../config/env';
import type { AuthUser } from '@isekai/shared';

const SALT_ROUNDS = 12;
const JWT_EXPIRES_IN = '7d';

export interface RegisterInput {
  username: string;
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthResult {
  user: AuthUser;
  token: string;
}

export async function register(input: RegisterInput): Promise<AuthResult> {
  const { username, email, password } = input;

  const existing = await pool.query(
    'SELECT id FROM users WHERE email = $1 OR username = $2',
    [email, username]
  );
  if (existing.rowCount && existing.rowCount > 0) {
    throw new Error('メールアドレスまたはユーザー名は既に使用されています');
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const result = await pool.query<{ id: string; username: string; email: string }>(
    'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email',
    [username, email, passwordHash]
  );

  const user = result.rows[0];
  const token = jwt.sign({ userId: user.id }, env.jwtSecret, { expiresIn: JWT_EXPIRES_IN });
  return { user, token };
}

export async function login(input: LoginInput): Promise<AuthResult> {
  const { email, password } = input;

  const result = await pool.query<{ id: string; username: string; email: string; password_hash: string }>(
    'SELECT id, username, email, password_hash FROM users WHERE email = $1',
    [email]
  );

  if (!result.rows[0]) {
    throw new Error('メールアドレスまたはパスワードが正しくありません');
  }

  const row = result.rows[0];
  const valid = await bcrypt.compare(password, row.password_hash);
  if (!valid) {
    throw new Error('メールアドレスまたはパスワードが正しくありません');
  }

  const user: AuthUser = { id: row.id, username: row.username, email: row.email };
  const token = jwt.sign({ userId: user.id }, env.jwtSecret, { expiresIn: JWT_EXPIRES_IN });
  return { user, token };
}

export function verifyToken(token: string): { userId: string } {
  return jwt.verify(token, env.jwtSecret) as { userId: string };
}

export async function getUserById(userId: string): Promise<AuthUser | null> {
  const result = await pool.query<{ id: string; username: string; email: string }>(
    'SELECT id, username, email FROM users WHERE id = $1',
    [userId]
  );
  return result.rows[0] ?? null;
}
