import express, { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { pool } from './db';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3002;
const JWT_SECRET = process.env.JWT_SECRET || 'shopnow-dev-secret';

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
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

app.use('/uploads', express.static(uploadsDir));

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
  res.json({ status: 'ok', service: 'product' });
});

app.get('/api/products', async (req: Request, res: Response) => {
  const token = req.headers.authorization?.split(' ')[1];
  const { valid } = token ? verifyToken(token) : { valid: false };
  if (!valid) return res.status(401).json({ error: 'Unauthorized' });
  const result = await pool.query('SELECT * FROM products ORDER BY id');
  res.json(result.rows);
});

app.get('/api/products/:id', async (req: Request, res: Response) => {
  const token = req.headers.authorization?.split(' ')[1];
  const { valid } = token ? verifyToken(token) : { valid: false };
  if (!valid) return res.status(401).json({ error: 'Unauthorized' });
  const result = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Product not found' });
  res.json(result.rows[0]);
});

app.post('/api/products', upload.single('image'), async (req: Request, res: Response) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const { valid, user } = verifyToken(token);
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

app.delete('/api/products/:id', async (req: Request, res: Response) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const { valid, user } = verifyToken(token);
  if (!valid) return res.status(401).json({ error: 'Unauthorized' });
  if (user?.role !== 'admin') return res.status(403).json({ error: 'Admins only' });

  const result = await pool.query('DELETE FROM products WHERE id = $1 RETURNING image_url', [req.params.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Product not found' });

  const imageUrl: string | null = result.rows[0].image_url;
  if (imageUrl) {
    const filePath = path.join(uploadsDir, path.basename(imageUrl));
    fs.unlink(filePath, () => {});
  }

  res.json({ success: true });
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => console.log(`Product service running on port ${PORT}`));
