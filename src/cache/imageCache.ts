import { Directory, File, Paths } from 'expo-file-system';
import { getDb } from '@/data/db';
import { LruCache } from './lru';

const RAM_BUDGET = 32 * 1024 * 1024;   // Nivel 1: RAM (data-URIs listas para pintar)
const DISK_BUDGET = 120 * 1024 * 1024; // Nivel 2: disco (archivos en cache dir + índice en SQLite)

type Job = { promise: Promise<string>; controller: AbortController; refs: number };

function hash(s: string) {
  let h1 = 0x811c9dc5, h2 = 5381;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 ^= c; h1 = Math.imul(h1, 16777619);
    h2 = (Math.imul(h2, 33) ^ c) >>> 0;
  }
  return (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16) + s.length.toString(16);
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function bytesToBase64(b: Uint8Array) {
  let out = '', i = 0;
  for (; i + 2 < b.length; i += 3) {
    const n = (b[i] << 16) | (b[i + 1] << 8) | b[i + 2];
    out += B64[n >> 18] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
  }
  const r = b.length - i;
  if (r > 0) {
    const n = (b[i] << 16) | (r === 2 ? b[i + 1] << 8 : 0);
    out += B64[n >> 18] + B64[(n >> 12) & 63] + (r === 2 ? B64[(n >> 6) & 63] : '=') + '=';
  }
  return out;
}

class ImageCache {
  private ram = new LruCache<string>(RAM_BUDGET);
  private jobs = new Map<string, Job>();      // peticiones en vuelo (deduplicadas por URL)
  private dir = new Directory(Paths.cache, 'img');

  /** Lectura síncrona del nivel RAM (evita parpadeo en celdas recicladas). */
  peek(url: string) { return this.ram.get(url); }

  /**
   * Pide una imagen. Cada consumidor recibe un `release`; cuando el último consumidor
   * se va (la celda salió del viewport / se desmontó) se aborta la descarga con AbortController.
   */
  acquire(url: string): { promise: Promise<string>; release: () => void } {
    const hit = this.ram.get(url);
    if (hit) {
      // Actualizar last_access en disco en background para que el LRU de disco sea preciso
      const key = hash(url);
      getDb().then((db) => db.runAsync('UPDATE img_index SET last_access = ? WHERE key = ?', [Date.now(), key])).catch(() => {});
      return { promise: Promise.resolve(hit), release() {} };
    }

    let job = this.jobs.get(url);
    if (!job) {
      const controller = new AbortController();
      const created: Job = { controller, refs: 0, promise: undefined as unknown as Promise<string> };
      created.promise = this.load(url, controller.signal).finally(() => {
        if (this.jobs.get(url) === created) this.jobs.delete(url);
      });
      created.promise.catch(() => {});
      this.jobs.set(url, created);
      job = created;
    }
    job.refs++;
    const j = job;
    let released = false;
    return {
      promise: j.promise,
      release: () => {
        if (released) return;
        released = true;
        j.refs--;
        if (j.refs <= 0) {
          if (this.jobs.get(url) === j) this.jobs.delete(url);
          j.controller.abort();
        }
      },
    };
  }

  private async load(url: string, signal: AbortSignal): Promise<string> {
    const db = await getDb();
    const key = hash(url);

    // --- Nivel 2: disco ---
    const row = await db.getFirstAsync<{ path: string; url: string }>('SELECT path, url FROM img_index WHERE key = ?', [key]);
    if (row && row.url === url) {
      const f = new File(row.path);
      if (f.exists) {
        const uri = await this.fromFile(f);
        this.ram.set(url, uri, uri.length);                 // promoción a RAM
        db.runAsync('UPDATE img_index SET last_access = ? WHERE key = ?', [Date.now(), key]).catch(() => {});
        return uri;
      }
      await db.runAsync('DELETE FROM img_index WHERE key = ?', [key]);
    }

    // --- Red (cancelable) ---
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (signal.aborted) throw new Error('aborted');

    let uri: string;
    try { // escribir a disco (nivel 2); si falla, igual mostramos la imagen desde los bytes
      if (!this.dir.exists) this.dir.create();
      const file = new File(this.dir, `${key}.img`);
      if (file.exists) file.delete();
      file.create();
      file.write(bytes);
      await db.runAsync('INSERT OR REPLACE INTO img_index (key, url, path, size, last_access) VALUES (?,?,?,?,?)',
        [key, url, file.uri, bytes.byteLength, Date.now()]);
      this.evictDisk().catch(() => {});
      uri = await this.fromFile(file);
    } catch {
      uri = this.toDataUri(bytesToBase64(bytes));
    }
    this.ram.set(url, uri, uri.length);
    return uri;
  }

  private async fromFile(f: File) {
    try { return this.toDataUri(await f.base64()); } catch { return f.uri; }
  }

  // Todas las imágenes se suben como JPEG comprimido; RN decodifica por contenido.
  private toDataUri(b64: string) { return `data:image/jpeg;base64,${b64}`; }

  /** Desalojo LRU en disco: borra los archivos con last_access más antiguo hasta bajar del presupuesto. */
  private async evictDisk() {
    const db = await getDb();
    for (;;) {
      const t = await db.getFirstAsync<{ s: number }>('SELECT COALESCE(SUM(size),0) AS s FROM img_index');
      if (!t || t.s <= DISK_BUDGET) return;
      const old = await db.getAllAsync<{ key: string; path: string }>('SELECT key, path FROM img_index ORDER BY last_access ASC LIMIT 20');
      if (!old.length) return;
      for (const o of old) { try { const f = new File(o.path); if (f.exists) f.delete(); } catch {} }
      await db.runAsync(`DELETE FROM img_index WHERE key IN (${old.map(() => '?').join(',')})`, old.map((o) => o.key));
    }
  }
}

export const imageCache = new ImageCache();
