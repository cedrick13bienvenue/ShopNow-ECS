import { Pool } from 'pg';

const DB_HOST     = process.env.DB_HOST     || 'localhost';
const DB_PORT     = parseInt(process.env.DB_PORT || '5432');
const DB_NAME     = process.env.DB_NAME     || 'shopnow';
const DB_USER     = process.env.DB_USER     || 'shopnow';
const DB_PASSWORD = process.env.DB_PASSWORD || 'shopnow';

async function ensureDatabase() {
  const bootstrap = new Pool({ host: DB_HOST, port: DB_PORT, database: 'postgres', user: DB_USER, password: DB_PASSWORD });
  try {
    await bootstrap.query(`CREATE DATABASE "${DB_NAME}"`);
  } catch (err: any) {
    if (err.code !== '42P04') throw err;
  } finally {
    await bootstrap.end();
  }
}

export let pool: Pool;

export async function initDb() {
  await ensureDatabase();

  pool = new Pool({ host: DB_HOST, port: DB_PORT, database: DB_NAME, user: DB_USER, password: DB_PASSWORD });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id         SERIAL PRIMARY KEY,
      username   VARCHAR(100) UNIQUE NOT NULL,
      password   VARCHAR(255) NOT NULL,
      role       VARCHAR(20) DEFAULT 'user' NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user' NOT NULL
  `);

  await pool.query(`
    INSERT INTO users (username, password, role)
    VALUES ('admin', 'admin123', 'admin')
    ON CONFLICT (username) DO NOTHING
  `);
}
