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

  CREATE TABLE IF NOT EXISTS scheduled_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    instruction TEXT NOT NULL,
    notification_text TEXT NOT NULL,
    next_run_at INTEGER NOT NULL,
    interval_ms INTEGER,
    occurrence_count INTEGER,
    runs_done INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

// ── Scheduled Tasks ───────────────────────────────────────────────────────────

export interface ScheduledTask {
    id: number;
    user_id: string;
    instruction: string;
    notification_text: string;
    next_run_at: number;
    interval_ms: number | null;
    occurrence_count: number | null;
    runs_done: number;
    active: number;
}

export const createTask = (
    userId: string,
    instruction: string,
    notificationText: string,
    nextRunAt: number,
    intervalMs: number | null,
    occurrenceCount: number | null,
): number => {
    const stmt = db.prepare(`
        INSERT INTO scheduled_tasks (user_id, instruction, notification_text, next_run_at, interval_ms, occurrence_count)
        VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(userId, instruction, notificationText, nextRunAt, intervalMs, occurrenceCount);
    return result.lastInsertRowid as number;
};

export const getActiveTasks = (): ScheduledTask[] => {
    return db.prepare('SELECT * FROM scheduled_tasks WHERE active = 1').all() as ScheduledTask[];
};

export const getPendingTasks = (now: number): ScheduledTask[] => {
    return db.prepare('SELECT * FROM scheduled_tasks WHERE active = 1 AND next_run_at <= ?').all(now) as ScheduledTask[];
};

export const updateTaskAfterRun = (id: number, nextRunAt: number | null) => {
    if (nextRunAt === null) {
        db.prepare('UPDATE scheduled_tasks SET active = 0, runs_done = runs_done + 1 WHERE id = ?').run(id);
    } else {
        db.prepare('UPDATE scheduled_tasks SET next_run_at = ?, runs_done = runs_done + 1 WHERE id = ?').run(nextRunAt, id);
    }
};

export const cancelTask = (id: number) => {
    db.prepare('UPDATE scheduled_tasks SET active = 0 WHERE id = ?').run(id);
};

export const listUserTasks = (userId: string): ScheduledTask[] => {
    return db.prepare('SELECT * FROM scheduled_tasks WHERE user_id = ? AND active = 1 ORDER BY next_run_at ASC').all(userId) as ScheduledTask[];
};
