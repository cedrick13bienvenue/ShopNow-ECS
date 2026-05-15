import { Pool } from 'pg';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://shopnow:shopnow@localhost:5432/shopnow',
});

pool.query(`
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'user' NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
  )
`)
.then(() => pool.query(`
  ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user' NOT NULL
`))
.then(() => pool.query(`
  INSERT INTO users (username, password, role)
  VALUES ('admin', 'admin123', 'admin')
  ON CONFLICT (username) DO NOTHING
`))
.catch(console.error);
