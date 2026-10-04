import * as SQLite from 'expo-sqlite';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/** Base embebida única: cola de sincronización, índice del caché de disco, historias vistas y feed offline. */
export function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('app.db');
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS outbox (
          id INTEGER PRIMARY KEY AUTOINCREMENT,   -- el orden del id ES el orden cronológico
          type TEXT NOT NULL, payload TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending', -- pending | inflight
          attempts INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS img_index (
          key TEXT PRIMARY KEY, url TEXT NOT NULL, path TEXT NOT NULL, size INTEGER NOT NULL, last_access INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS story_seen (story_id TEXT PRIMARY KEY, seen_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS recent_searches (user_id TEXT PRIMARY KEY, json TEXT NOT NULL, ts INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS saved_posts (post_id TEXT PRIMARY KEY, json TEXT NOT NULL, saved_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS feed_cache (scope TEXT PRIMARY KEY, json TEXT NOT NULL, updated_at INTEGER NOT NULL);
      `);
      return db;
    })();
  }
  return dbPromise;
}
