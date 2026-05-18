import express, { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { pool, initDb } from './db';

const app = express();
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'shopnow-secret';
const PORT = process.env.PORT || 3001;

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'auth' });
});

app.post('/api/auth/register', async (req: Request, res: Response) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id, username',
      [username, password]
    );
    res.status(201).json(result.rows[0]);
  } catch {
    res.status(400).json({ error: 'Username already exists' });
  }
});

app.post('/api/auth/login', async (req: Request, res: Response) => {
  const { username, password } = req.body;
  const result = await pool.query(
    'SELECT id, username, role FROM users WHERE username = $1 AND password = $2',
    [username, password]
  );
  if (result.rows.length === 0) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const { id, username: uname, role } = result.rows[0];
  const token = jwt.sign({ userId: id, username: uname, role }, JWT_SECRET, { expiresIn: '1h' });
  res.json({ token });
});

app.get('/api/auth/verify', (req: Request, res: Response) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ valid: false, error: 'No token' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ valid: true, user: decoded });
  } catch {
    res.status(401).json({ valid: false, error: 'Invalid token' });
  }
});

initDb()
  .then(() => app.listen(PORT, () => console.log(`Auth service running on port ${PORT}`)))
  .catch((err) => { console.error('DB init failed:', err); process.exit(1); });
