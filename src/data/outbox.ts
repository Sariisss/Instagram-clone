import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import { getDb } from './db';
import * as api from './api';

export type Action =
  | { type: 'LIKE'; postId: string }
  | { type: 'UNLIKE'; postId: string }
  | { type: 'COMMENT'; id: string; postId: string; body: string }
  | { type: 'FOLLOW'; userId: string }
  | { type: 'UNFOLLOW'; userId: string };

type Row = { id: number; type: string; payload: string };

async function execute(a: Action) {
  switch (a.type) {
    case 'LIKE': return api.likePost(a.postId);
    case 'UNLIKE': return api.unlikePost(a.postId);
    case 'COMMENT': return api.sendComment({ id: a.id, postId: a.postId, body: a.body });
    case 'FOLLOW': return api.follow(a.userId);
    case 'UNFOLLOW': return api.unfollow(a.userId);
  }
}

/** Transitorio = sin conectividad / 5xx / sesión por refrescar => se reintenta. Con código SQL/RLS => permanente. */
const isTransient = (e: any) => e?.status === 401 || e?.status >= 500 || !e?.code;

/**
 * Cola de sincronización persistente (SQLite).
 *  - Orden: estricto por id AUTOINCREMENT, una acción a la vez (mutex `flushing`).
 *  - Idempotencia: upsert/ignoreDuplicates + UUID de comentario generado en el cliente => reintentos seguros.
 *  - Conflictos: LIKE+UNLIKE pendientes del mismo post se anulan entre sí (coalescing).
 *  - Fallo permanente: se descarta la acción y se notifica para revertir la UI optimista.
 */
class Outbox {
  private flushing = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private synced = new Set<(a: Action) => void>();
  private failed = new Set<(a: Action, e: unknown) => void>();
  private started = false;

  onSynced(cb: (a: Action) => void) { this.synced.add(cb); }
  onFailed(cb: (a: Action, e: unknown) => void) { this.failed.add(cb); }

  async start() {
    if (this.started) return;
    this.started = true;
    const db = await getDb();
    await db.runAsync(`UPDATE outbox SET status='pending' WHERE status='inflight'`); // recuperar tras cierre abrupto
    NetInfo.addEventListener((s) => { if (s.isConnected && s.isInternetReachable !== false) this.flush(); });
    AppState.addEventListener('change', (s) => { if (s === 'active') this.flush(); });
    this.flush();
  }

  async enqueue(a: Action) {
    const db = await getDb();
    if (a.type === 'LIKE' || a.type === 'UNLIKE') {
      const opposite = a.type === 'LIKE' ? 'UNLIKE' : 'LIKE';
      const rows = await db.getAllAsync<Row>(`SELECT id, payload FROM outbox WHERE status='pending' AND type=? ORDER BY id DESC`, [opposite]);
      const hit = rows.find((r) => JSON.parse(r.payload).postId === a.postId);
      if (hit) { await db.runAsync('DELETE FROM outbox WHERE id=?', [hit.id]); return; }
    }
    await db.runAsync('INSERT INTO outbox (type, payload, created_at) VALUES (?,?,?)', [a.type, JSON.stringify(a), Date.now()]);
    this.flush();
  }

  async pending(): Promise<Action[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<Row>('SELECT id, type, payload FROM outbox ORDER BY id ASC');
    return rows.map((r) => JSON.parse(r.payload) as Action);
  }

  async flush() {
    if (this.flushing) return;
    this.flushing = true;
    try {
      const net = await NetInfo.fetch();
      if (!net.isConnected) return;
      const db = await getDb();
      for (;;) {
        const row = await db.getFirstAsync<Row>(`SELECT id, type, payload FROM outbox WHERE status='pending' ORDER BY id ASC LIMIT 1`);
        if (!row) break;
        const action = JSON.parse(row.payload) as Action;
        await db.runAsync(`UPDATE outbox SET status='inflight', attempts=attempts+1 WHERE id=?`, [row.id]);
        try {
          await execute(action);
          await db.runAsync('DELETE FROM outbox WHERE id=?', [row.id]);
          this.synced.forEach((cb) => cb(action));
        } catch (e) {
          if (isTransient(e)) {
            await db.runAsync(`UPDATE outbox SET status='pending' WHERE id=?`, [row.id]);
            this.scheduleRetry();
            break; // se conserva el orden: no se procesa nada posterior hasta que esta pase
          }
          await db.runAsync('DELETE FROM outbox WHERE id=?', [row.id]);
          this.failed.forEach((cb) => cb(action, e));
        }
      }
    } finally {
      this.flushing = false;
    }
  }

  private scheduleRetry() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 10000);
  }
}

export const outbox = new Outbox();
