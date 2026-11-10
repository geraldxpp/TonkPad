/**
 * What a mission stores beside its fees and lock: the launchpad keeps two
 * text fields per token, `metadataUri` and `agentPrompt`. The app writes
 * compact JSON into both and reads it back. Anyone can call the contract
 * directly, so text from the chain is untrusted: every field is checked
 * again on the way out, links are limited to http(s), and nothing here is
 * ever rendered as HTML.
 */
export interface MissionLinks {
  description: string;
  /** An X handle without the @, e.g. "astropup". */
  x: string;
  /** A full https://t.me/… link. */
  telegram: string;
  /** A full http(s) link. */
  website: string;
}

export const AGENT_VOICES = ["tactical", "hype", "analytical", "meme"] as const;
export type AgentVoice = (typeof AGENT_VOICES)[number];

export interface AgentSettings {
  name: string;
  role: string;
  voice: AgentVoice;
  brief: string;
}

export const LIMITS = { name: 32, ticker: 10, description: 280, link: 300, agentName: 32, agentRole: 50, agentBrief: 400 } as const;

const X_HANDLE = /^[A-Za-z0-9_]{1,15}$/;
const X_HOSTS = ["x.com", "www.x.com", "twitter.com", "www.twitter.com"];
const TELEGRAM_HOSTS = ["t.me", "www.t.me", "telegram.me"];
const HOSTNAME = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i;

/** A typed link as a URL: http(s) only, no credentials, "https://" assumed when no scheme is given. */
function toUrl(value: string): URL | null {
  if (/\s/.test(value) || value.length > LIMITS.link) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`);
    return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password ? url : null;
  } catch {
    return null;
  }
}

/** "@astropup" or an x.com / twitter.com profile link → "astropup". Null when it is neither; "" stays "". */
export function normalizeX(value: string): string | null {
  const text = value.trim();
  if (!text) return "";
  const handle = text.replace(/^@/, "");
  if (X_HANDLE.test(handle)) return handle;
  const url = toUrl(text);
  const match = url && X_HOSTS.includes(url.hostname.toLowerCase()) ? /^\/([A-Za-z0-9_]{1,15})\/?$/.exec(url.pathname) : null;
  return match ? match[1] : null;
}

/** "t.me/astropup" → "https://t.me/astropup". Null for anything that isn't a Telegram link; "" stays "". */
export function normalizeTelegram(value: string): string | null {
  const text = value.trim();
  if (!text) return "";
  const url = toUrl(text);
  const match = url && TELEGRAM_HOSTS.includes(url.hostname.toLowerCase()) ? /^\/([A-Za-z0-9_+-]+)\/?$/.exec(url.pathname) : null;
  return match ? `https://t.me/${match[1]}` : null;
}

/** "astropup.fun" → "https://astropup.fun/". Null for anything that isn't a web address; "" stays "". */
export function normalizeWebsite(value: string): string | null {
  const text = value.trim();
  if (!text) return "";
  const url = toUrl(text);
  return url && HOSTNAME.test(url.hostname) ? url.href : null;
}

/** Printable characters plus tabs and line breaks; control characters are dropped. */
const printable = (character: string) => {
  const code = character.charCodeAt(0);
  return code >= 32 ? code !== 127 : code === 9 || code === 10;
};
const text = (value: unknown, max: number) => (typeof value === "string" ? [...value].filter(printable).join("").trim().slice(0, max) : "");
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

function parse(json: string): Record<string, unknown> | null {
  if (!json.trim().startsWith("{")) return null;
  try {
    const value: unknown = JSON.parse(json);
    return record(value) ? value : null;
  } catch {
    return null;
  }
}

/** The mission's `metadataUri`: compact JSON with the empty fields left out, or "" when there is nothing to store. */
export function encodeMetadata(links: MissionLinks): string {
  const fields: Record<string, string> = {};
  const description = text(links.description, LIMITS.description);
  if (description) fields.description = description;
  const x = normalizeX(links.x);
  if (x) fields.x = x;
  const telegram = normalizeTelegram(links.telegram);
  if (telegram) fields.telegram = telegram;
  const website = normalizeWebsite(links.website);
  if (website) fields.website = website;
  return Object.keys(fields).length ? JSON.stringify({ v: 1, ...fields }) : "";
}

/** A mission's `metadataUri` read back from the chain; anything malformed or unsafe comes back empty. */
export function decodeMetadata(metadataUri: string): MissionLinks {
  const fields = parse(metadataUri) ?? {};
  return {
    description: text(fields.description, LIMITS.description),
    x: normalizeX(text(fields.x, LIMITS.link)) ?? "",
    telegram: normalizeTelegram(text(fields.telegram, LIMITS.link)) ?? "",
    website: normalizeWebsite(text(fields.website, LIMITS.link)) ?? "",
  };
}

const isVoice = (value: unknown): value is AgentVoice => AGENT_VOICES.includes(value as AgentVoice);

/** The mission's `agentPrompt`: the agent's settings as JSON, or "" when the agent is off. */
export function encodeAgent(agent: AgentSettings | null): string {
  if (!agent) return "";
  return JSON.stringify({ v: 1, name: text(agent.name, LIMITS.agentName), role: text(agent.role, LIMITS.agentRole), voice: agent.voice, brief: text(agent.brief, LIMITS.agentBrief) });
}

/** A mission's `agentPrompt` read back; null when it has no agent or the text isn't ours. */
export function decodeAgent(agentPrompt: string): AgentSettings | null {
  const fields = parse(agentPrompt);
  const name = fields ? text(fields.name, LIMITS.agentName) : "";
  if (!fields || !name) return null;
  return { name, role: text(fields.role, LIMITS.agentRole), voice: isVoice(fields.voice) ? fields.voice : "tactical", brief: text(fields.brief, LIMITS.agentBrief) };
}
