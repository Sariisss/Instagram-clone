import * as SQLite from 'expo-sqlite';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function migrate(db: SQLite.SQLiteDatabase) {
  const ensureColumn = async (table: string, column: string, definition: string) => {
    try {
      const info = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
      const exists = info.some((col) => col.name === column);
      if (!exists) {
        await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      }
    } catch {
      // Ignorar si la columna ya existía o falla la alteración
    }
  };

  await ensureColumn('outbox', 'user_id', "TEXT NOT NULL DEFAULT ''");
  await ensureColumn('outbox', 'status', "TEXT NOT NULL DEFAULT 'pending'");
  await ensureColumn('outbox', 'attempts', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn('story_seen', 'user_id', "TEXT NOT NULL DEFAULT ''");
  await ensureColumn('recent_searches', 'owner_id', "TEXT NOT NULL DEFAULT ''");
  await ensureColumn('saved_posts', 'user_id', "TEXT NOT NULL DEFAULT ''");
}

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
          user_id TEXT NOT NULL DEFAULT '',        -- aislamiento multi-usuario
          status TEXT NOT NULL DEFAULT 'pending',  -- pending | inflight
          attempts INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS img_index (
          key TEXT PRIMARY KEY, url TEXT NOT NULL, path TEXT NOT NULL, size INTEGER NOT NULL, last_access INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS story_seen (
          user_id TEXT NOT NULL DEFAULT '',        -- aislamiento multi-usuario
          story_id TEXT NOT NULL,
          seen_at INTEGER NOT NULL,
          PRIMARY KEY (user_id, story_id));
        CREATE TABLE IF NOT EXISTS recent_searches (
          owner_id TEXT NOT NULL DEFAULT '',       -- usuario que hizo la búsqueda
          user_id TEXT NOT NULL,                   -- perfil buscado
          json TEXT NOT NULL, ts INTEGER NOT NULL,
          PRIMARY KEY (owner_id, user_id));
        CREATE TABLE IF NOT EXISTS saved_posts (
          user_id TEXT NOT NULL DEFAULT '',        -- aislamiento multi-usuario
          post_id TEXT NOT NULL,
          json TEXT NOT NULL, saved_at INTEGER NOT NULL,
          PRIMARY KEY (user_id, post_id));
        CREATE TABLE IF NOT EXISTS feed_cache (
          scope TEXT PRIMARY KEY, json TEXT NOT NULL, updated_at INTEGER NOT NULL);
      `);
      await migrate(db);
      return db;
    })();
  }
  return dbPromise;
}
