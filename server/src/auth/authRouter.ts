import { Router, Request, Response } from 'express';
import { register, login } from './authService';

export const authRouter = Router();

authRouter.post('/register', async (req: Request, res: Response) => {
  const { username, email, password } = req.body as Record<string, unknown>;

  if (typeof username !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: '入力値が不正です' });
    return;
  }
  if (username.length < 2 || username.length > 32) {
    res.status(400).json({ error: 'ユーザー名は2〜32文字で入力してください' });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: 'パスワードは6文字以上で入力してください' });
    return;
  }

  try {
    const result = await register({ username, email, password });
    res.status(201).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : '登録に失敗しました';
    res.status(409).json({ error: message });
  }
});

authRouter.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body as Record<string, unknown>;

  if (typeof email !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: '入力値が不正です' });
    return;
  }

  try {
    const result = await login({ email, password });
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'ログインに失敗しました';
    res.status(401).json({ error: message });
  }
});
