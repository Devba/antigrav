import mysql from 'mysql2/promise';
import { envConfig } from '../config/index.js';

// Patrones de escritura bloqueados (solo lectura permitida)
const WRITE_PATTERNS = [
  /^\s*(UPDATE|DELETE|DROP|INSERT|ALTER|TRUNCATE|REPLACE|CREATE|RENAME|GRANT|REVOKE)\b/i,
];

const ALLOWED_PREFIXES = /^\s*(SELECT|SHOW|DESCRIBE|DESC|EXPLAIN)\b/i;

let pool: mysql.Pool | null = null;

function getPool(): mysql.Pool {
  if (!pool) {
    if (!envConfig.dbHost || !envConfig.dbUser || !envConfig.dbName) {
      throw new Error('Configuración de base de datos incompleta. Verifica DB_HOST, DB_USER, DB_NAME en .env');
    }
    pool = mysql.createPool({
      host: envConfig.dbHost,
      port: envConfig.dbPort,
      user: envConfig.dbUser,
      password: envConfig.dbPass,
      database: envConfig.dbName,
      waitForConnections: true,
      connectionLimit: 5,
      connectTimeout: 10000,
    });
  }
  return pool;
}

export const dbService = {
  async consultar(sql: string): Promise<string> {
    const trimmed = sql.trim();

    // Seguridad: bloquear cualquier operación de escritura
    for (const pattern of WRITE_PATTERNS) {
      if (pattern.test(trimmed)) {
        throw new Error(`⛔ Operación bloqueada por seguridad: solo se permiten consultas de lectura (SELECT, SHOW, DESCRIBE).`);
      }
    }

    // Solo permitir prefijos de lectura explícitos
    if (!ALLOWED_PREFIXES.test(trimmed)) {
      throw new Error(`⛔ Consulta no permitida. Debe comenzar con SELECT, SHOW o DESCRIBE.`);
    }

    const connection = await getPool().getConnection();
    try {
      const [rows] = await connection.query(trimmed);
      const data = rows as any[];

      if (!data || data.length === 0) {
        return '📭 La consulta no devolvió resultados.';
      }

      // Formatear resultados como tabla de texto
      const headers = Object.keys(data[0]);
      const separator = headers.map(h => '─'.repeat(Math.min(h.length + 4, 30))).join('┼');
      const headerRow = headers.map(h => h.padEnd(Math.min(h.length + 4, 30))).join('│');
      const dataRows = data.map(row =>
        headers.map(h => {
          const val = row[h] === null ? 'NULL' : String(row[h]);
          return val.substring(0, 30).padEnd(Math.min(h.length + 4, 30));
        }).join('│')
      );

      return [
        `📊 *${data.length} resultado(s):*`,
        '```',
        headerRow,
        separator,
        ...dataRows,
        '```',
      ].join('\n');
    } finally {
      connection.release();
    }
  },

  async testConexion(): Promise<string> {
    const connection = await getPool().getConnection();
    try {
      const [rows] = await connection.query('SHOW TABLES');
      const tables = (rows as any[]).map(r => Object.values(r)[0] as string);
      return `✅ Conexión exitosa. ${tables.length} tablas encontradas: ${tables.join(', ')}`;
    } finally {
      connection.release();
    }
  },
};
