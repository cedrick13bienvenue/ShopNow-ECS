import { Pool } from 'pg';

const DB_HOST     = process.env.DB_HOST     || 'localhost';
const DB_PORT     = parseInt(process.env.DB_PORT || '5432');
const DB_NAME     = process.env.DB_NAME     || 'shopnow';
const DB_USER     = process.env.DB_USER     || 'shopnow';
const DB_PASSWORD = process.env.DB_PASSWORD || 'shopnow';
const SSL         = DB_HOST !== 'localhost' ? { rejectUnauthorized: false } : false;

async function ensureDatabase() {
  const bootstrap = new Pool({ host: DB_HOST, port: DB_PORT, database: 'postgres', user: DB_USER, password: DB_PASSWORD, ssl: SSL });
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

  pool = new Pool({ host: DB_HOST, port: DB_PORT, database: DB_NAME, user: DB_USER, password: DB_PASSWORD, ssl: SSL });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id         SERIAL PRIMARY KEY,
      user_id    INTEGER NOT NULL,
      items      JSONB NOT NULL,
      total      DECIMAL(10,2) NOT NULL,
      status     VARCHAR(50) DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
}
