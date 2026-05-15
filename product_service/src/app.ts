import express, { Request, Response } from 'express';
import axios from 'axios';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { pool } from './db';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3002;
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://auth_service:3001';

const uploadsDir = '/app/uploads';
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

app.use('/uploads', express.static(uploadsDir));

type AuthResult = { valid: boolean; user?: { userId: number; username: string; role: string } };

async function verifyToken(token: string): Promise<AuthResult> {
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
  res.json({ status: 'ok', service: 'product' });
});

app.get('/api/products', async (req: Request, res: Response) => {
  const token = req.headers.authorization?.split(' ')[1];
  const { valid } = token ? await verifyToken(token) : { valid: false };
  if (!valid) return res.status(401).json({ error: 'Unauthorized' });
  const result = await pool.query('SELECT * FROM products ORDER BY id');
  res.json(result.rows);
});

app.get('/api/products/:id', async (req: Request, res: Response) => {
  const token = req.headers.authorization?.split(' ')[1];
  const { valid } = token ? await verifyToken(token) : { valid: false };
  if (!valid) return res.status(401).json({ error: 'Unauthorized' });
  const result = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Product not found' });
  res.json(result.rows[0]);
});

app.post('/api/products', upload.single('image'), async (req: Request, res: Response) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const { valid, user } = await verifyToken(token);
  if (!valid) return res.status(401).json({ error: 'Unauthorized' });
  if (user?.role !== 'admin') return res.status(403).json({ error: 'Admins only' });
  if (!req.file) return res.status(400).json({ error: 'Image is required' });

  const { name, price, stock } = req.body;
  const image_url = `/uploads/${req.file.filename}`;
  const result = await pool.query(
    'INSERT INTO products (name, price, stock, image_url) VALUES ($1, $2, $3, $4) RETURNING *',
    [name, price, stock, image_url]
  );
  res.status(201).json(result.rows[0]);
});

app.listen(PORT, () => console.log(`Product service running on port ${PORT}`));
