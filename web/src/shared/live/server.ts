/**
 * Server-side access to the live-data worker. Live mode is on when WORKER_URL
 * is set (Vercel and `npm run dev` with web/.env.development.local); without
 * it the app shows its mock data, which is what the tests run against.
 */
export function workerUrl(): string | null {
  const url = process.env.WORKER_URL?.trim();
  return url ? url.replace(/\/+$/, "") : null;
}

export function isLiveMode(): boolean {
  return workerUrl() !== null;
}

/** Raw JSON text from the worker, e.g. fetchWorkerText("/v1/overview"). */
export async function fetchWorkerText(path: string): Promise<string> {
  const base = workerUrl();
  if (!base) throw new Error("WORKER_URL is not set");
  const token = process.env.WORKER_TOKEN?.trim();
  const res = await fetch(`${base}${path}`, {
    headers: token ? { "x-worker-token": token } : {},
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`worker HTTP ${res.status}`);
  return res.text();
}

export async function fetchWorker<T>(path: string): Promise<T> {
  return JSON.parse(await fetchWorkerText(path)) as T;
}
