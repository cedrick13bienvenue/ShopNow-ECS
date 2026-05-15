import express, { Request, Response } from 'express';
import axios from 'axios';
import { pool } from './db';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3004;
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://auth_service:3001';
const CART_SERVICE_URL = process.env.CART_SERVICE_URL || 'http://cart_service:3003';

async function verifyToken(token: string): Promise<{ valid: boolean; user?: { userId: number; username: string } }> {
  try {
    const res = await axios.get(`${AUTH_SERVICE_URL}/api/auth/verify`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.data;
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

  const { valid, user } = await verifyToken(token);
  if (!valid || !user) return res.status(401).json({ error: 'Unauthorized' });

  // Cross-cluster call to Cart Service (Cluster 2 → Cluster 3 pattern)
  const cartRes = await axios.get(`${CART_SERVICE_URL}/api/cart/${user.userId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const cart = cartRes.data;

  if (!cart.items || cart.items.length === 0) {
    return res.status(400).json({ error: 'Cart is empty' });
  }

  const total = cart.items.reduce(
    (sum: number, item: { price: number; quantity: number }) => sum + item.price * item.quantity,
    0
  );

  const result = await pool.query(
    'INSERT INTO orders (user_id, items, total) VALUES ($1, $2, $3) RETURNING *',
    [user.userId, JSON.stringify(cart.items), total]
  );
  res.status(201).json(result.rows[0]);
});

app.get('/api/orders/:userId', async (req: Request, res: Response) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const { valid } = await verifyToken(token);
  if (!valid) return res.status(401).json({ error: 'Unauthorized' });

  const result = await pool.query(
    'SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC',
    [req.params.userId]
  );
  res.json(result.rows);
});

app.listen(PORT, () => console.log(`Order service running on port ${PORT}`));
