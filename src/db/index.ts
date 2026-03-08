import Database from 'better-sqlite3';
import { envConfig } from '../config/index.js';

const db = new Database(envConfig.dbPath);
db.pragma('journal_mode = WAL'); // Optimización para sqlite

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, key)
  );
`);

export const saveMessage = (userId: string, role: 'user' | 'assistant' | 'system', content: string) => {
    const stmt = db.prepare('INSERT INTO messages (user_id, role, content) VALUES (?, ?, ?)');
    stmt.run(userId, role, content);
};

export const getHistory = (userId: string, limit: number = 20) => {
    const stmt = db.prepare('SELECT role, content FROM (SELECT role, content, timestamp FROM messages WHERE user_id = ? ORDER BY timestamp DESC LIMIT ?) ORDER BY timestamp ASC');
    const rows = stmt.all(userId, limit) as { role: string, content: string }[];
    return rows;
};

export const clearHistory = (userId: string) => {
    const stmt = db.prepare('DELETE FROM messages WHERE user_id = ?');
    stmt.run(userId);
};

// ── Memories ──────────────────────────────────────────────────────────────────

export const saveMemory = (userId: string, key: string, value: string) => {
    const stmt = db.prepare(`
        INSERT INTO memories (user_id, key, value, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `);
    stmt.run(userId, key.toLowerCase().trim(), value.trim());
};

export const deleteMemory = (userId: string, key: string) => {
    const stmt = db.prepare('DELETE FROM memories WHERE user_id = ? AND key = ?');
    const result = stmt.run(userId, key.toLowerCase().trim());
    return (result.changes ?? 0) > 0;
};

export const getMemories = (userId: string): Record<string, string> => {
    const stmt = db.prepare('SELECT key, value FROM memories WHERE user_id = ? ORDER BY key ASC');
    const rows = stmt.all(userId) as { key: string, value: string }[];
    return Object.fromEntries(rows.map(r => [r.key, r.value]));
};
