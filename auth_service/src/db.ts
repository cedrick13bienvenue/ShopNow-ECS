import { Pool } from 'pg';

export const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME     || 'shopnow',
  user:     process.env.DB_USER     || 'shopnow',
  password: process.env.DB_PASSWORD || 'shopnow',
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
