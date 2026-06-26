// sqlite db setup for backend

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'cf-companion.db');

const db = new Database(DB_PATH);

// wal mode helps when server and cron both read/write
db.pragma('journal_mode = WAL');

// create tables if they dont exist yet
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        telegram_id  TEXT PRIMARY KEY,
        cf_handle    TEXT,
        created_at   TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS friends (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id        TEXT NOT NULL,
        friend_handle  TEXT NOT NULL,
        UNIQUE(user_id, friend_handle),
        FOREIGN KEY(user_id) REFERENCES users(telegram_id)
    );

    CREATE TABLE IF NOT EXISTS contests (
        cf_id           INTEGER PRIMARY KEY,
        name            TEXT NOT NULL,
        start_time      INTEGER NOT NULL,
        duration        INTEGER NOT NULL,
        phase           TEXT NOT NULL,
        fetched_at      TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sent_reminders (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_id  TEXT NOT NULL,
        contest_id   INTEGER NOT NULL,
        reminder_type TEXT NOT NULL,
        sent_at      TEXT DEFAULT (datetime('now')),
        UNIQUE(telegram_id, contest_id, reminder_type)
    );
`);

export default db;
