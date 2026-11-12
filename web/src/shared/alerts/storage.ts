import { ALERT_LAUNCHPADS, type AlertLaunchpad } from "@/shared/types/live";
import type { AlertRule, AlertSettings, AlertToken, FeedItem, FeedKind, LaunchSeen, PadSwitches } from "./types";

/**
 * Alerts live in this browser only (localStorage), like the watchlist: no
 * account and nothing on our servers. Anything unreadable or out of shape is
 * dropped quietly, so an old or edited value can never break the page.
 */
export const RULES_KEY = "tonkpad-alerts";
export const FEED_KEY = "tonkpad-alerts-feed";
export const SETTINGS_KEY = "tonkpad-alerts-settings";
export const SEEN_KEY = "tonkpad-alerts-seen";
/** Fired in this tab when alerts change; other tabs hear the storage event. */
export const ALERTS_CHANGED = "tonkpad-alerts-change";

export const MAX_RULES = 25;
export const MAX_FEED = 100;
/** Names and tickers from the chain are cut to this many characters. */
export const MAX_TEXT = 40;
/** How many launches the launchpad alerts remember between checks. */
export const MAX_SEEN = 300;

const OFF: PadSwitches = { graduations: false, hot: false };
const padsOff = () => Object.fromEntries(ALERT_LAUNCHPADS.map((pad) => [pad, OFF])) as Record<AlertLaunchpad, PadSwitches>;
export const DEFAULT_SETTINGS: AlertSettings = { launches: false, graduations: false, locks: false, notify: false, pads: padsOff() };
const isPad = (value: unknown): value is AlertLaunchpad => typeof value === "string" && (ALERT_LAUNCHPADS as readonly string[]).includes(value);

const FEED_KINDS: readonly FeedKind[] = ["priceAbove", "priceBelow", "mcapAbove", "mcapBelow", "moveUp", "moveDown", "launch", "graduated", "hot", "unlocked", "claimed", "extended"];

type Loose = Record<string, unknown>;
const isObject = (value: unknown): value is Loose => typeof value === "object" && value !== null && !Array.isArray(value);
const positive = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;
const text = (value: unknown): string => (typeof value === "string" ? value.slice(0, MAX_TEXT) : "");

export function tokenFrom(value: unknown): AlertToken | null {
  if (!isObject(value) || typeof value.address !== "string" || !value.address || value.address.length > 64) return null;
  if (value.chain !== "sol" && value.chain !== "rh") return null;
  return { address: value.address, chain: value.chain, symbol: text(value.symbol), name: text(value.name) };
}

function ruleFrom(value: unknown): AlertRule | null {
  if (!isObject(value) || typeof value.id !== "string" || typeof value.createdAt !== "number") return null;
  const token = tokenFrom(value.token);
  if (!token) return null;
  const base = { id: value.id, token, on: value.on !== false, armed: value.armed !== false, createdAt: value.createdAt };
  if ((value.kind === "price" || value.kind === "mcap") && (value.direction === "above" || value.direction === "below") && positive(value.value)) {
    return { ...base, kind: value.kind, direction: value.direction, value: value.value };
  }
  if (value.kind === "move" && (value.window === "1h" || value.window === "24h") && positive(value.percent)) {
    return { ...base, kind: "move", window: value.window, percent: value.percent };
  }
  return null;
}

function feedFrom(value: unknown): FeedItem | null {
  if (!isObject(value) || typeof value.id !== "string" || typeof value.at !== "number") return null;
  const token = tokenFrom(value.token);
  if (!token || !FEED_KINDS.includes(value.kind as FeedKind)) return null;
  return {
    id: value.id,
    at: value.at,
    kind: value.kind as FeedKind,
    token,
    ...(positive(value.value) ? { value: value.value } : {}),
    ...(value.window === "1h" || value.window === "24h" ? { window: value.window } : {}),
    ...(isPad(value.pad) ? { pad: value.pad } : {}),
    read: value.read === true,
  };
}

function readJson(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null");
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    return; // Storage blocked (private mode): alerts last as long as the page.
  }
  window.dispatchEvent(new Event(ALERTS_CHANGED));
}

const list = <T,>(value: unknown, parse: (item: unknown) => T | null): T[] =>
  Array.isArray(value) ? value.map(parse).filter((item): item is T => item !== null) : [];

export const readRules = (): AlertRule[] => list(readJson(RULES_KEY), ruleFrom).slice(0, MAX_RULES);
export const writeRules = (rules: readonly AlertRule[]) => writeJson(RULES_KEY, rules.slice(0, MAX_RULES));

export const readFeed = (): FeedItem[] => list(readJson(FEED_KEY), feedFrom).slice(0, MAX_FEED);
export const writeFeed = (feed: readonly FeedItem[]) => writeJson(FEED_KEY, feed.slice(0, MAX_FEED));

export function readSettings(): AlertSettings {
  const value = readJson(SETTINGS_KEY);
  if (!isObject(value)) return DEFAULT_SETTINGS;
  const stored = isObject(value.pads) ? value.pads : {};
  const pads = padsOff();
  for (const pad of ALERT_LAUNCHPADS) {
    const entry = stored[pad];
    if (isObject(entry)) pads[pad] = { graduations: entry.graduations === true, hot: entry.hot === true };
  }
  return { launches: value.launches === true, graduations: value.graduations === true, locks: value.locks === true, notify: value.notify === true, pads };
}
export const writeSettings = (settings: AlertSettings) => writeJson(SETTINGS_KEY, settings);

export function readSeen(): LaunchSeen | null {
  const value = readJson(SEEN_KEY);
  if (!isObject(value) || typeof value.newest !== "number" || typeof value.checkedAt !== "number" || !isObject(value.tokens)) return null;
  const tokens: LaunchSeen["tokens"] = {};
  for (const [address, entry] of Object.entries(value.tokens).slice(0, MAX_SEEN)) {
    if (!isObject(entry)) continue;
    tokens[address] = {
      graduatedAt: typeof entry.graduatedAt === "number" ? entry.graduatedAt : null,
      lockEnd: typeof entry.lockEnd === "number" ? entry.lockEnd : null,
      lockClaimed: typeof entry.lockClaimed === "string" && /^\d{1,78}$/.test(entry.lockClaimed) ? entry.lockClaimed : null,
    };
  }
  const graduated: LaunchSeen["graduated"] = {};
  if (isObject(value.graduated)) {
    for (const pad of ALERT_LAUNCHPADS) if (typeof value.graduated[pad] === "number") graduated[pad] = value.graduated[pad] as number;
  }
  const hot = Array.isArray(value.hot) ? value.hot.filter((a): a is string => typeof a === "string" && a.length <= 64).slice(-MAX_SEEN) : [];
  return { newest: value.newest, checkedAt: value.checkedAt, tokens, graduated, hot };
}
export const writeSeen = (seen: LaunchSeen) => writeJson(SEEN_KEY, seen);
/** Forgets what the launchpad alerts saw, so the next check only records (a switch was just turned on). */
export function clearSeen(): void {
  try {
    localStorage.removeItem(SEEN_KEY);
  } catch {
    // Storage blocked: nothing was remembered either.
  }
}

export function subscribeAlerts(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(ALERTS_CHANGED, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(ALERTS_CHANGED, onChange);
  };
}

/** A short random id for rules and feed items. */
export const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
