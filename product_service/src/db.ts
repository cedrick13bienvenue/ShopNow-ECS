import { Pool } from 'pg';

export const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME     || 'shopnow',
  user:     process.env.DB_USER     || 'shopnow',
  password: process.env.DB_PASSWORD || 'shopnow',
});

pool.query(`
  CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    stock INTEGER DEFAULT 0,
    image_url VARCHAR(500),
    created_at TIMESTAMP DEFAULT NOW()
  )
`)
.then(() => pool.query(`
  ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url VARCHAR(500)
`))
.catch(console.error);
