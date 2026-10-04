/**
 * LRU O(1): un Map de JS conserva el orden de inserción.
 * get() borra y reinserta la clave => queda como "más recientemente usada" (al final).
 * Al exceder el presupuesto de bytes se desaloja desde el principio del Map (la menos usada).
 */
export class LruCache<V> {
  private map = new Map<string, { value: V; size: number }>();
  private total = 0;
  constructor(private maxBytes: number, private onEvict?: (key: string, value: V) => void) {}

  get(key: string): V | undefined {
    const e = this.map.get(key);
    if (!e) return undefined;
    this.map.delete(key);
    this.map.set(key, e);
    return e.value;
  }
  set(key: string, value: V, size: number) {
    const old = this.map.get(key);
    if (old) { this.total -= old.size; this.map.delete(key); }
    this.map.set(key, { value, size });
    this.total += size;
    while (this.total > this.maxBytes && this.map.size > 1) {
      const [oldestKey, oldest] = this.map.entries().next().value as [string, { value: V; size: number }];
      this.map.delete(oldestKey);
      this.total -= oldest.size;
      this.onEvict?.(oldestKey, oldest.value);
    }
  }
  clear() { this.map.clear(); this.total = 0; }
  get bytes() { return this.total; }
}
