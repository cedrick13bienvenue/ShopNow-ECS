import { Pool } from 'pg';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://shopnow:shopnow@localhost:5432/shopnow',
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
