/**
 * Per-client allowances for the API routes that spend the owner's provider
 * quotas (Jupiter, 0x, Helius, Alchemy). Each client address gets a token
 * bucket per route group, kept in the server instance's memory. That stops a
 * script hammering from one address; each instance counts on its own, though,
 * so it's a floor rather than a wall (a shared limit needs Vercel's firewall
 * or a store). The allowances sit well above the app's own pace.
 */

/** A token bucket: `burst` requests at once, then `perSecond` earned back. */
export interface Allowance {
  burst: number;
  perSecond: number;
}

/**
 * The app's own pace, per open page: a swap card quotes every 15 s and as
 * you type (debounced); balances refresh every 15 s per wallet and token; a
 * swap builds and sends once, then checks its status every 2 s for up to 90 s.
 */
export const ALLOWANCES = {
  quote: { burst: 20, perSecond: 0.5 },
  balances: { burst: 20, perSecond: 0.5 },
  token: { burst: 10, perSecond: 0.2 },
  build: { burst: 6, perSecond: 0.1 },
  // Above build's, so a swap someone has just signed is never refused.
  send: { burst: 10, perSecond: 0.2 },
  // Two swaps confirming at once.
  status: { burst: 60, perSecond: 1 },
  // The launchpad's own routes: its settings refresh every 15 s, a launch builds once and its receipt is checked every 2 s.
  tonkSettings: { burst: 20, perSecond: 0.5 },
  tonkLaunch: { burst: 6, perSecond: 0.1 },
  tonkTx: { burst: 60, perSecond: 1 },
} as const satisfies Record<string, Allowance>;

export type RouteGroup = keyof typeof ALLOWANCES;

/** Takes one request from a client's allowance: 0 to go ahead, else the whole seconds until it may try again. */
export type Limiter = (client: string) => number;

/** Clients one limiter remembers; past this, those whose buckets have refilled are forgotten first. */
const MAX_CLIENTS = 10_000;

export function createLimiter({ burst, perSecond }: Allowance, now: () => number = Date.now): Limiter {
  const buckets = new Map<string, { tokens: number; at: number }>();
  const level = (bucket: { tokens: number; at: number }, time: number) =>
    Math.min(burst, bucket.tokens + ((time - bucket.at) / 1000) * perSecond);
  const forget = (time: number) => {
    for (const [client, bucket] of buckets) if (level(bucket, time) >= burst) buckets.delete(client);
    const oldest = buckets.keys().next();
    if (buckets.size >= MAX_CLIENTS && !oldest.done) buckets.delete(oldest.value);
  };
  return (client) => {
    const time = now();
    const bucket = buckets.get(client);
    if (!bucket && buckets.size >= MAX_CLIENTS) forget(time);
    const tokens = bucket ? level(bucket, time) : burst;
    if (tokens < 1) {
      buckets.set(client, { tokens, at: time });
      return Math.ceil((1 - tokens) / perSecond);
    }
    buckets.set(client, { tokens: tokens - 1, at: time });
    return 0;
  };
}

/** "2001:db8:1:2:aaaa::1" → "2001:db8:1:2::/64": the block one home or device controls. */
function ipv6Block(address: string): string {
  const [head, tail] = address.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups = tail === undefined ? left : [...left, ...Array<string>(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right];
  return `${groups
    .slice(0, 4)
    .map((group) => group.replace(/^0+(?=.)/, ""))
    .join(":")}::/64`;
}

/**
 * The client's address as Vercel's edge reports it (it overwrites these
 * headers, so a client can't pick its own). IPv6 clients count by their /64,
 * since one device can use any address in it. Null when there's none (tests,
 * the server itself) or it's local (development and e2e): those aren't limited.
 */
export function clientAddress(request: Request): string | null {
  const raw = request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0];
  const address = (raw ?? "").trim().toLowerCase().split("%")[0].replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/, "");
  if (!address || address === "::1" || address === "localhost" || address.startsWith("127.")) return null;
  return address.includes(":") ? ipv6Block(address) : address;
}

const limiters = Object.fromEntries(
  Object.entries(ALLOWANCES).map(([group, allowance]) => [group, createLimiter(allowance)]),
) as Record<RouteGroup, Limiter>;

/**
 * A 429 for a client past its allowance on a route group, or null to go
 * ahead. Never cached, so one client's limit can't be served to another.
 */
export function overLimit(request: Request, group: RouteGroup): Response | null {
  const client = clientAddress(request);
  const wait = client ? limiters[group](client) : 0;
  if (!wait) return null;
  return Response.json({ error: "busy" }, { status: 429, headers: { "cache-control": "no-store", "retry-after": String(wait) } });
}
