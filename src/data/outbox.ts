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

type Row = { id: number; type: string; payload: string; attempts: number; user_id: string };

const MAX_ATTEMPTS = 5;

async function execute(a: Action) {
  switch (a.type) {
    case 'LIKE': return api.likePost(a.postId);
    case 'UNLIKE': return api.unlikePost(a.postId);
    case 'COMMENT': return api.sendComment({ id: a.id, postId: a.postId, body: a.body });
    case 'FOLLOW': return api.follow(a.userId);
    case 'UNFOLLOW': return api.unfollow(a.userId);
  }
}

/**
 * Transitorio = fallo de red (sin `code`) o token caducado (PGRST3xx).
 * Permanente = error de BD / RLS con código PGRST4xx / PGRST5xx o código SQL.
 *
 * El error de PostgREST llega como objeto con `.code` (string) y `.message`.
 * El error de red llega como TypeError o similar, sin `.code`.
 */
const isTransient = (e: unknown): boolean => {
  if (!e || typeof e !== 'object') return true; // TypeError de red / sesión nula
  const code = (e as Record<string, unknown>).code;
  if (!code) return true;                        // sin code => red
  if (typeof code === 'string' && code.startsWith('PGRST3')) return true; // auth transitorio
  return false;
};

/**
 * Cola de sincronización persistente (SQLite).
 *  - Orden: estricto por id AUTOINCREMENT, una acción a la vez (mutex `flushing`).
 *  - Idempotencia: upsert/ignoreDuplicates + UUID de comentario generado en el cliente => reintentos seguros.
 *  - Conflictos: LIKE+UNLIKE pendientes del mismo post se anulan entre sí (coalescing).
 *  - Fallo permanente: se descarta la acción y se notifica para revertir la UI optimista.
 *  - Límite de reintentos: MAX_ATTEMPTS; superado => tratado como permanente.
 *  - Aislamiento: cada fila lleva user_id; flush sólo procesa filas del usuario activo.
 */
class Outbox {
  private flushing = false;
  private pendingFlush = false; // race-condition guard: enqueue llegó mientras flushing
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
    // Capturar user_id en el momento de la acción (no en el momento del flush)
    const session = (await import('@/state/auth')).useAuth.getState().session;
    if (!session) return; // sin sesión no encolar
    const userId = session.user.id;

    const db = await getDb();
    if (a.type === 'LIKE' || a.type === 'UNLIKE') {
      const opposite = a.type === 'LIKE' ? 'UNLIKE' : 'LIKE';
      const rows = await db.getAllAsync<Row>(
        `SELECT id, payload FROM outbox WHERE status='pending' AND type=? AND user_id=? ORDER BY id DESC`,
        [opposite, userId],
      );
      const hit = rows.find((r) => JSON.parse(r.payload).postId === a.postId);
      if (hit) { await db.runAsync('DELETE FROM outbox WHERE id=?', [hit.id]); return; }
    }
    await db.runAsync(
      'INSERT INTO outbox (type, payload, user_id, created_at) VALUES (?,?,?,?)',
      [a.type, JSON.stringify(a), userId, Date.now()],
    );
    // Corrección race condition: si flush está activo, marcar para reinicio inmediato
    if (this.flushing) { this.pendingFlush = true; } else { this.flush(); }
  }

  async pending(): Promise<Action[]> {
    const session = (await import('@/state/auth')).useAuth.getState().session;
    if (!session) return [];
    const db = await getDb();
    const rows = await db.getAllAsync<Row>(
      'SELECT id, type, payload FROM outbox WHERE user_id=? ORDER BY id ASC',
      [session.user.id],
    );
    return rows.map((r) => JSON.parse(r.payload) as Action);
  }

  /** Elimina toda la cola del usuario (llamar en signOut). */
  async clear(userId: string) {
    const db = await getDb();
    await db.runAsync('DELETE FROM outbox WHERE user_id=?', [userId]);
  }

  async flush() {
    if (this.flushing) return;
    this.flushing = true;
    this.pendingFlush = false;
    try {
      const net = await NetInfo.fetch();
      if (!net.isConnected) return;

      // Verificar sesión activa antes de procesar
      const session = (await import('@/state/auth')).useAuth.getState().session;
      if (!session) return;
      const userId = session.user.id;

      const db = await getDb();
      for (;;) {
        const row = await db.getFirstAsync<Row>(
          `SELECT id, type, payload, attempts, user_id FROM outbox WHERE status='pending' AND user_id=? ORDER BY id ASC LIMIT 1`,
          [userId],
        );
        if (!row) break;
        const action = JSON.parse(row.payload) as Action;
        const newAttempts = (row.attempts ?? 0) + 1;
        await db.runAsync(`UPDATE outbox SET status='inflight', attempts=? WHERE id=?`, [newAttempts, row.id]);
        try {
          await execute(action);
          await db.runAsync('DELETE FROM outbox WHERE id=?', [row.id]);
          this.synced.forEach((cb) => cb(action));
        } catch (e) {
          const transient = isTransient(e) && newAttempts < MAX_ATTEMPTS;
          if (transient) {
            await db.runAsync(`UPDATE outbox SET status='pending' WHERE id=?`, [row.id]);
            this.scheduleRetry();
            break; // conservar orden: no procesar nada posterior
          }
          // Permanente (o agotados reintentos): descartar
          await db.runAsync('DELETE FROM outbox WHERE id=?', [row.id]);
          this.failed.forEach((cb) => cb(action, e));
        }
      }
    } finally {
      this.flushing = false;
      // Corrección race condition: si llegó un enqueue mientras procesábamos, relanzar
      if (this.pendingFlush) {
        this.pendingFlush = false;
        this.flush();
      }
    }
  }

  private scheduleRetry() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 10_000);
  }
}

export const outbox = new Outbox();
