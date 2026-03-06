import pg from 'pg';
import dotenv from 'dotenv';
import logger from '../utils/logger.js';

dotenv.config();

const { Pool } = pg;

const isProduction = process.env.NODE_ENV === 'production';

const sslConfig = () => {
  if (!isProduction) return false;

  // Em produção: SSL obrigatório com validação de certificado
  const config = { rejectUnauthorized: true };
  if (process.env.DB_CA_CERT) {
    config.ca = process.env.DB_CA_CERT;
  }
  return config;
};

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslConfig(),
  // Pool sizing — configurável via env, com defaults seguros
  min: parseInt(process.env.DB_POOL_MIN || '2', 10),
  max: parseInt(process.env.DB_POOL_MAX || '20', 10),
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000', 10),
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECT_TIMEOUT || '5000', 10),
  statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT || '30000', 10),
});

pool.on('connect', () => {
  logger.debug('Pool: nova conexão estabelecida');
});

pool.on('error', (err) => {
  logger.error({ err }, 'Erro inesperado no pool de conexões');
});

export default pool;
