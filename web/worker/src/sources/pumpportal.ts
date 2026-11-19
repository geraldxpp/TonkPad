import { log } from "../config";
import { cleanName, cleanSymbol, type GraduationEvent, type LaunchEvent } from "../model";

/**
 * PumpPortal's free data feed: every new Pump.fun and Bonk.fun token, and
 * every graduation (migration to an AMM). Per-token trade streams need a
 * funded PumpPortal key, so market data comes from DexScreener instead.
 */
const URL = "wss://pumpportal.fun/api/data";
const TOTAL_SUPPLY = 1_000_000_000;

type Message = Record<string, unknown>;

const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Turns one feed message into a launch, a graduation or nothing. */
export function parsePumpPortal(raw: unknown, now: number): LaunchEvent | GraduationEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Message;
  const address = str(m.mint);
  if (!address) return null;

  if (m.txType === "create") {
    const pool = str(m.pool);
    if (pool !== "pump" && pool !== "bonk") return null;
    const initialBuy = num(m.initialBuy) ?? 0;
    return {
      address,
      chain: "sol",
      launchpad: pool,
      name: cleanName(str(m.name)),
      symbol: cleanSymbol(str(m.symbol)),
      creator: str(m.traderPublicKey),
      createdAt: now,
      creatorBuyShare: Math.min(1, Math.max(0, initialBuy / TOTAL_SUPPLY)),
      marketCapNative: num(m.marketCapSol),
    };
  }

  if (m.txType === "migrate" || m.txType === "migration") return { address, at: now };
  return null;
}

export function isLaunch(event: LaunchEvent | GraduationEvent): event is LaunchEvent {
  return "launchpad" in event;
}

interface Handlers {
  onLaunch: (event: LaunchEvent) => void;
  onGraduation: (event: GraduationEvent) => void;
}

/** The parts of a WebSocket the feed uses, so tests can stand in for it. */
export type FeedSocket = Pick<WebSocket, "send" | "close" | "onopen" | "onmessage" | "onclose" | "onerror">;

const newSocket = (url: string): FeedSocket => new WebSocket(url);

/**
 * Connects, subscribes, and reconnects with backoff whenever the socket drops.
 *
 * Each connection ends exactly once, on its first error or close: its handlers are detached before
 * it is closed, so nothing it fires afterwards can re-enter this code. (On 18 Nov 2026 the old
 * `onerror = () => socket.close()` re-entered undici's failure path, which fires `error` again,
 * until the stack overflowed and the worker crashed.)
 */
export function connectPumpPortal(handlers: Handlers, connect: (url: string) => FeedSocket = newSocket): { close: () => void } {
  let current: FeedSocket | null = null;
  let stopped = false;
  let attempt = 0;
  let retry: ReturnType<typeof setTimeout> | null = null;

  const detach = (ws: FeedSocket) => {
    ws.onopen = null;
    ws.onmessage = null;
    ws.onclose = null;
    ws.onerror = null;
    try {
      ws.close();
    } catch {
      // Already closed or never opened.
    }
  };

  const scheduleRetry = () => {
    if (stopped || retry) return;
    const delay = Math.min(30_000, 1_000 * 2 ** attempt++);
    log("pumpportal", `disconnected; retrying in ${delay / 1000}s`);
    retry = setTimeout(() => {
      retry = null;
      open();
    }, delay);
  };

  function open() {
    if (stopped) return;
    let ws: FeedSocket;
    try {
      ws = connect(URL);
    } catch {
      scheduleRetry();
      return;
    }
    current = ws;
    let ended = false;
    const end = () => {
      if (ended) return;
      ended = true;
      if (current === ws) current = null;
      detach(ws);
      scheduleRetry();
    };
    ws.onopen = () => {
      attempt = 0;
      ws.send(JSON.stringify({ method: "subscribeNewToken" }));
      ws.send(JSON.stringify({ method: "subscribeMigration" }));
      log("pumpportal", "connected");
    };
    ws.onmessage = (event) => {
      if (ended) return;
      let data: unknown;
      try {
        data = JSON.parse(String(event.data));
      } catch {
        return;
      }
      const parsed = parsePumpPortal(data, Date.now());
      if (!parsed) return;
      if (isLaunch(parsed)) handlers.onLaunch(parsed);
      else handlers.onGraduation(parsed);
    };
    ws.onclose = end;
    ws.onerror = end;
  }

  open();
  return {
    close: () => {
      stopped = true;
      if (retry) clearTimeout(retry);
      retry = null;
      const ws = current;
      current = null;
      if (ws) detach(ws);
    },
  };
}
