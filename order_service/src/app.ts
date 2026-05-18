import express, { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import { pool, initDb } from './db';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3004;
const JWT_SECRET = process.env.JWT_SECRET || 'shopnow-dev-secret';
const CART_SERVICE_URL = process.env.CART_SERVICE_URL || 'http://cart-service:3003';

type JwtPayload = { userId: number; username: string; role: string };

function verifyToken(token: string): { valid: boolean; user?: JwtPayload } {
  try {
    const user = jwt.verify(token, JWT_SECRET) as JwtPayload;
    return { valid: true, user };
  } catch {
    return { valid: false };
  }
}

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'order' });
});

app.post('/api/orders', async (req: Request, res: Response) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const { valid, user } = verifyToken(token);
  if (!valid || !user) return res.status(401).json({ error: 'Unauthorized' });

  const cartRes = await axios.get(`${CART_SERVICE_URL}/api/cart/${user.userId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const cart = cartRes.data;

  if (!cart.items || cart.items.length === 0) {
    return res.status(400).json({ error: 'Cart is empty' });
  }

  const total = cart.items.reduce(
    (sum: number, item: { price: number; quantity: number }) => sum + Number(item.price) * item.quantity,
    0
  );

  const result = await pool.query(
    'INSERT INTO orders (user_id, items, total) VALUES ($1, $2, $3) RETURNING *',
    [user.userId, JSON.stringify(cart.items), total]
  );

  await axios.delete(`${CART_SERVICE_URL}/api/cart/${user.userId}`, {
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => {});

  res.status(201).json(result.rows[0]);
});

app.get('/api/orders/:userId', async (req: Request, res: Response) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const { valid } = verifyToken(token);
  if (!valid) return res.status(401).json({ error: 'Unauthorized' });

  const result = await pool.query(
    'SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC',
    [req.params.userId]
  );
  res.json(result.rows);
});

app.delete('/api/orders/:orderId', async (req: Request, res: Response) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const { valid, user } = verifyToken(token);
  if (!valid || !user) return res.status(401).json({ error: 'Unauthorized' });

  const result = await pool.query(
    'DELETE FROM orders WHERE id = $1 AND user_id = $2 RETURNING id',
    [req.params.orderId, user.userId]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
  res.json({ success: true });
});

initDb()
  .then(() => app.listen(PORT, () => console.log(`Order service running on port ${PORT}`)))
  .catch((err) => { console.error('DB init failed:', err); process.exit(1); });
