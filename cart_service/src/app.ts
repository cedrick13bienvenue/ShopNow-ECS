import express, { Request, Response } from 'express';
import axios from 'axios';
import { redis } from './redis';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3003;
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://auth_service:3001';

async function verifyToken(token: string): Promise<boolean> {
  try {
    const res = await axios.get(`${AUTH_SERVICE_URL}/api/auth/verify`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.data.valid;
  } catch {
    return false;
  }
}

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'cart' });
});

app.get('/api/cart/:userId', async (req: Request, res: Response) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token || !(await verifyToken(token))) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const data = await redis.get(`cart:${req.params.userId}`);
  res.json(data ? JSON.parse(data) : { items: [] });
});

app.post('/api/cart/:userId', async (req: Request, res: Response) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token || !(await verifyToken(token))) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { productId, quantity, price, name } = req.body;
  const data = await redis.get(`cart:${req.params.userId}`);
  const cart = data ? JSON.parse(data) : { items: [] };

  const existing = cart.items.find((i: { productId: string }) => i.productId === productId);
  if (existing) {
    existing.quantity += quantity;
  } else {
    cart.items.push({ productId, quantity, price, name });
  }

  await redis.set(`cart:${req.params.userId}`, JSON.stringify(cart), 'EX', 3600);
  res.json(cart);
});

app.delete('/api/cart/:userId/:productId', async (req: Request, res: Response) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token || !(await verifyToken(token))) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const data = await redis.get(`cart:${req.params.userId}`);
  if (!data) return res.json({ items: [] });

  const cart = JSON.parse(data);
  cart.items = cart.items.filter((i: { productId: string }) => i.productId !== req.params.productId);
  await redis.set(`cart:${req.params.userId}`, JSON.stringify(cart), 'EX', 3600);
  res.json(cart);
});

app.listen(PORT, () => console.log(`Cart service running on port ${PORT}`));
