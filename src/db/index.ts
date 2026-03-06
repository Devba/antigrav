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
