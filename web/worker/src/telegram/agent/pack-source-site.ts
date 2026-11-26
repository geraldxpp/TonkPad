import type { Fetch } from "../../alerts/deliver";
import type { SiteFacts } from "./types";

/**
 * Reading the deployed site's GET /api/bot/site. Only its four fields are
 * taken, each checked: the version, a 64-hex hash, a boolean inviteOnly and
 * a contact the Security page could have made. No other text from the site
 * ever reaches the model (prompts/15-community-agent.md, decision 9).
 */

/** Why a read was refused, as the log names it. */
export type SiteFailure = "timeout" | "network" | `http ${number}` | "size" | "json" | "version" | "hash" | "invite" | "contact";

export const SITE_FACTS_PATH = "/api/bot/site";
const TIMEOUT_MS = 5_000;
/** The route answers about 200 bytes; anything far larger isn't it. */
const MAX_BODY = 4_096;
const MAX_TEXT = 200;
const HASH = /^[0-9a-f]{64}$/i;
/** An e-mail address as the Security page accepts one (EMAIL in modules/security/lib/contact.ts). */
const EMAIL = /^[A-Za-z0-9.!$'*+/=^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

type Contact = NonNullable<SiteFacts["contact"]>;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** What the page shows for a link: the address without https:// (as parseContact writes it). */
const linkText = (url: URL) => `${url.host}${url.pathname === "/" ? "" : url.pathname}${url.search}${url.hash}`;

/**
 * The contact, null when the site has none, or undefined when it isn't one:
 * an e-mail address with its mailto: link, or an https link without
 * credentials whose text is that same address. So its text, which the
 * bot's prompt quotes, can only ever name where the button goes.
 */
function contactOf(value: unknown): Contact | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  const { kind, text, href } = value;
  if (typeof text !== "string" || typeof href !== "string" || text.length === 0 || text.length > MAX_TEXT) return undefined;
  if (kind === "email") return EMAIL.test(text) && href === `mailto:${text}` ? { kind, text, href } : undefined;
  if (kind !== "link" || !/^https:\/\//i.test(href)) return undefined;
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return undefined;
  }
  const clean = url.protocol === "https:" && !url.username && !url.password && url.hostname.includes(".");
  return clean && url.href === href && linkText(url) === text ? { kind, text, href } : undefined;
}

/** The site's facts from the route's JSON, or why they were refused. */
export function parseSiteFacts(body: unknown, readAt: number): SiteFacts | SiteFailure {
  if (!isRecord(body) || body.v !== 1) return "version";
  if (typeof body.hash !== "string" || !HASH.test(body.hash)) return "hash";
  if (typeof body.inviteOnly !== "boolean") return "invite";
  const contact = contactOf(body.contact);
  if (contact === undefined) return "contact";
  return { hash: body.hash.toLowerCase(), inviteOnly: body.inviteOnly, contact, readAt };
}

/** GET <site>/api/bot/site within 5 seconds: the facts, or why there are none. Never throws. */
export async function readSiteFacts(site: string, fetchFn: Fetch, now: () => number): Promise<SiteFacts | SiteFailure> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const failed = (): SiteFailure => (controller.signal.aborted ? "timeout" : "network");
  try {
    let res: Response;
    try {
      res = await fetchFn(`${site.replace(/\/+$/, "")}${SITE_FACTS_PATH}`, { headers: { accept: "application/json" }, signal: controller.signal });
    } catch {
      return failed();
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      return `http ${res.status}`;
    }
    let text: string;
    try {
      text = await res.text();
    } catch {
      return failed();
    }
    if (text.length > MAX_BODY) return "size";
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return "json";
    }
    return parseSiteFacts(body, now());
  } finally {
    clearTimeout(timer);
  }
}
