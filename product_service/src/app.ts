import express, { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import multerS3 from 'multer-s3';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import path from 'path';
import fs from 'fs';
import { pool } from './db';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3002;
const JWT_SECRET = process.env.JWT_SECRET || 'shopnow-dev-secret';
const S3_BUCKET = process.env.S3_BUCKET || '';
const AWS_REGION = process.env.AWS_REGION || 'eu-west-1';
const CLOUDFRONT_DOMAIN = process.env.CLOUDFRONT_DOMAIN || '';

interface S3File extends Express.Multer.File {
  key: string;
}

const uploadsDir = '/app/uploads';
let s3: S3Client | null = null;
let upload: multer.Multer;

if (S3_BUCKET) {
  s3 = new S3Client({ region: AWS_REGION });
  upload = multer({
    storage: multerS3({
      s3,
      bucket: S3_BUCKET,
      key: (_req: Request, file: Express.Multer.File, cb: (err: Error | null, key: string) => void) => {
        const ext = path.extname(file.originalname);
        cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
      },
    }),
    limits: { fileSize: 15 * 1024 * 1024 },
    fileFilter: (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
      if (file.mimetype.startsWith('image/')) cb(null, true);
      else cb(new Error('Only image files are allowed'));
    },
  });
} else {
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  app.use('/uploads', express.static(uploadsDir));
  upload = multer({
    storage: multer.diskStorage({
      destination: uploadsDir,
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
      },
    }),
    limits: { fileSize: 15 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (file.mimetype.startsWith('image/')) cb(null, true);
      else cb(new Error('Only image files are allowed'));
    },
  });
}

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

  let image_url: string;
  if (S3_BUCKET) {
    const key = (req.file as S3File).key;
    image_url = CLOUDFRONT_DOMAIN
      ? `https://${CLOUDFRONT_DOMAIN}/${key}`
      : `https://${S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com/${key}`;
  } else {
    image_url = `/uploads/${req.file.filename}`;
  }

  const { name, price, stock } = req.body;
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
    if (S3_BUCKET && s3) {
      try {
        const key = new URL(imageUrl).pathname.slice(1);
        await s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }));
      } catch {}
    } else {
      const filePath = path.join(uploadsDir, path.basename(imageUrl));
      fs.unlink(filePath, () => {});
    }
  }

  res.json({ success: true });
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => console.log(`Product service running on port ${PORT}`));
