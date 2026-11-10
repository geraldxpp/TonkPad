interface Entry {
  until: number;
  value: Promise<unknown>;
}

const store = new Map<string, Entry>();
const MAX_ENTRIES = 2_000;

/**
 * A small in-memory cache for one server instance: the loader runs once per
 * key until `ttlMs` passes; failures are not kept. Bounded, oldest first out.
 */
export function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.until > now) return hit.value as Promise<T>;
  const value = load();
  store.set(key, { until: now + ttlMs, value });
  value.catch(() => store.delete(key));
  if (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
  return value;
}

/** For tests. */
export function clearCache() {
  store.clear();
}
