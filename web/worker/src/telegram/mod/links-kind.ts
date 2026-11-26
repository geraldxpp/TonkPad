import type { AllowList } from "../community/types";
import { brandLookalike, normalHost, under } from "./names-fold";

/**
 * What one link is (links.ts finds them). allowed: on the allow-list (an X
 * link only on an official handle's own path); official_telegram: t.me,
 * telegram.me or telegram.dog to an official username; telegram_invite: an
 * invite (t.me/+…, /joinchat/…, /addlist/…, tg://join); telegram: any
 * other Telegram link; obfuscated: written with a hidden dot ("name dot
 * tld", "name[.]tld", hxxp); lookalike: a domain posing as a brand
 * (names-fold.ts brandLookalike); unknown: anything else.
 */
export type LinkKind = "allowed" | "official_telegram" | "telegram_invite" | "telegram" | "lookalike" | "obfuscated" | "unknown";

/**
 * `key` names what a link points at, as the rules and the edit memory compare
 * it: its host, "@username" (the same as a mention), "t.me/+invite" or
 * "x.com/handle". `raid` is the link as a link raid compares copies of it:
 * its normalized host and path, without the query or the fragment, so
 * "claim.xyz/go?ref=1" and "?ref=2" are one link while two pages of one site
 * are two; every Telegram host reads as t.me, a username in lower case, and
 * a YouTube video keeps its id.
 */
export interface FoundLink {
  domain: string | null;
  kind: LinkKind;
  key: string;
  raid: string;
}

const TELEGRAM = ["t.me", "telegram.me", "telegram.dog"];
const X = ["x.com", "twitter.com"];
const USERNAME = /^[a-z][a-z0-9_]{3,31}$/;

export const isTelegramHost = (host: string) => under(host, TELEGRAM);

const decode = (part: string) => {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
};
const segments = (path: string) => path.split("/").filter(Boolean).map(decode);
/** Path segments as a raid key's tail: "/a/b", or nothing. */
const tail = (path: readonly string[]) => (path.length > 0 ? `/${path.join("/")}` : "");
const official = (allow: AllowList, name: string) => allow.telegram.some((t) => t.toLowerCase() === name);

function parse(text: string): URL | null {
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `http://${text}`);
  } catch {
    return null;
  }
}

/** A host even when the URL won't parse: what stands between the scheme and the path, without a user or port. */
const fallbackHost = (text: string) => (text.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").split(/[/?#\\]/)[0].split("@").pop() ?? "").split(":")[0];

/** A Telegram username link; `rest` is the path after the username (a post number). */
function username(name: string, domain: string | null, allow: AllowList, rest: readonly string[] = []): FoundLink | null {
  const lower = name.toLowerCase();
  if (!USERNAME.test(lower)) return null;
  return { domain, kind: official(allow, lower) ? "official_telegram" : "telegram", key: `@${lower}`, raid: `t.me/${lower}${tail(rest)}` };
}

const invite = (domain: string | null, key: string): FoundLink => ({ domain, kind: "telegram_invite", key, raid: key });

function telegramLink(host: string, path: readonly string[], allow: AllowList): FoundLink {
  const sub = TELEGRAM.map((t) => (host.endsWith(`.${t}`) ? host.slice(0, -t.length - 1) : "")).find(Boolean);
  const first = path[0] ?? "";
  if (!sub) {
    // t.me/+<digits> opens a chat by phone number; any other + is an invite.
    if (first.startsWith("+") && !/^\+\d+$/.test(first)) return invite(host, `t.me/+${first.slice(1)}`);
    if (/^joinchat$/i.test(first)) return invite(host, `t.me/+${path[1] ?? ""}`);
    if (/^addlist$/i.test(first)) return invite(host, `t.me/addlist/${path[1] ?? ""}`);
  }
  const preview = !sub && /^s$/i.test(first);
  const named = sub ? username(sub, host, allow, path) : username(preview ? (path[1] ?? "") : first, host, allow, path.slice(preview ? 2 : 1));
  return named ?? { domain: host, kind: "telegram", key: `t.me/${path.slice(0, 2).join("/").toLowerCase()}`.replace(/\/$/, ""), raid: `t.me${tail(path)}` };
}


function tgLink(text: string, allow: AllowList): FoundLink {
  const m = /^tg:\/\/([a-z_]+)\/?(?:\?(.*))?$/i.exec(text);
  const action = m?.[1].toLowerCase() ?? "";
  const query = new URLSearchParams(m?.[2] ?? "");
  if (action === "join") return invite(null, `t.me/+${query.get("invite") ?? ""}`);
  if (action === "addlist") return invite(null, `t.me/addlist/${query.get("slug") ?? ""}`);
  const named = action === "resolve" ? username(query.get("domain") ?? "", null, allow) : null;
  return named ?? { domain: null, kind: "telegram", key: `tg://${action}`, raid: `tg://${action}` };
}

/** A web link's raid key: host and path; a YouTube video keeps its id, the one query a page is known by. */
function webRaid(host: string, path: readonly string[], url: URL | null): string {
  const video = under(host, ["youtube.com"]) && path.length === 1 && path[0] === "watch" ? (url?.searchParams.get("v") ?? "") : "";
  return /^[\w-]{1,32}$/.test(video) ? `${host}/watch?v=${video}` : `${host}${tail(path)}`;
}

/** One link written as `raw` (an address, or a host with or without a path), classified; null when it names no host at all. */
export function classifyLink(raw: string, hidden: boolean, allow: AllowList): FoundLink | null {
  const text = raw.trim().replace(/^hxxp/i, "http");
  if (/^tg:/i.test(text)) return tgLink(text, allow);
  const url = parse(text);
  const host = normalHost(url ? url.hostname : fallbackHost(text));
  if (host === "") return null;
  const path = url ? segments(url.pathname) : [];
  if (isTelegramHost(host)) return telegramLink(host, path, allow);
  if (under(host, X)) {
    const handle = (path[0] ?? "").toLowerCase();
    const allowed = handle !== "" && allow.x.some((x) => x.toLowerCase() === handle);
    const key = handle ? `x.com/${handle}` : "x.com";
    return { domain: host, kind: allowed ? "allowed" : hidden ? "obfuscated" : "unknown", key, raid: `${key}${tail(path.slice(1))}` };
  }
  const raid = webRaid(host, path, url);
  if (under(host, allow.domains)) return { domain: host, kind: "allowed", key: host, raid };
  return { domain: host, kind: hidden ? "obfuscated" : brandLookalike(host) ? "lookalike" : "unknown", key: host, raid };
}
