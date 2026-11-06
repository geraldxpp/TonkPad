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

/** Connects, subscribes, and reconnects with backoff whenever the socket drops. */
export function connectPumpPortal(handlers: Handlers): { close: () => void } {
  let socket: WebSocket | null = null;
  let closed = false;
  let attempt = 0;

  const open = () => {
    socket = new WebSocket(URL);
    socket.onopen = () => {
      attempt = 0;
      socket?.send(JSON.stringify({ method: "subscribeNewToken" }));
      socket?.send(JSON.stringify({ method: "subscribeMigration" }));
      log("pumpportal", "connected");
    };
    socket.onmessage = (event) => {
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
    socket.onclose = () => {
      if (closed) return;
      const delay = Math.min(30_000, 1_000 * 2 ** attempt++);
      log("pumpportal", `disconnected; retrying in ${delay / 1000}s`);
      setTimeout(open, delay);
    };
    socket.onerror = () => socket?.close();
  };

  open();
  return {
    close: () => {
      closed = true;
      socket?.close();
    },
  };
}
