/** Where alert messages go. Every channel sends plain text: nothing in a message is markup or a mention. */
export interface Channel {
  name: string;
  /** The longest message the channel takes. */
  maxLength: number;
  send(text: string): Promise<void>;
}

export type Fetch = typeof fetch;

/** A channel refused or couldn't be reached; the message never carries a token or URL. */
export class DeliveryFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeliveryFailure";
  }
}

async function post(fetchFn: Fetch, url: string, body: unknown, what: string): Promise<Response> {
  try {
    return await fetchFn(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new DeliveryFailure(`${what} unreachable`);
  }
}

/** Telegram's Bot API: sendMessage to one chat, as plain text (no parse mode), without link previews. */
export function telegramChannel(token: string, chatId: string, fetchFn: Fetch = fetch): Channel {
  return {
    name: "telegram",
    maxLength: 4096,
    async send(text) {
      const res = await post(fetchFn, `https://api.telegram.org/bot${token}/sendMessage`, { chat_id: chatId, text, disable_web_page_preview: true }, "telegram");
      if (res.ok) return;
      // Telegram's own description ("chat not found", "bot was blocked") holds neither the token nor the chat.
      const description = await res
        .json()
        .then((body: { description?: unknown }) => (typeof body.description === "string" ? body.description.slice(0, 120) : ""))
        .catch(() => "");
      throw new DeliveryFailure(`telegram HTTP ${res.status}${description ? `: ${description}` : ""}`);
    },
  };
}

/** A Discord-compatible webhook: { content }, with mentions turned off so no text can ping anyone. */
export function webhookChannel(url: string, fetchFn: Fetch = fetch): Channel {
  return {
    name: "webhook",
    maxLength: 2000,
    async send(text) {
      const res = await post(fetchFn, url, { content: text, allowed_mentions: { parse: [] } }, "webhook");
      if (!res.ok) throw new DeliveryFailure(`webhook HTTP ${res.status}`);
    },
  };
}

/** A dead man's switch (healthchecks.io and the like): a GET it expects every minute; it alerts the owner itself when the pings stop. */
export async function ping(url: string, fetchFn: Fetch = fetch): Promise<void> {
  let res: Response;
  try {
    res = await fetchFn(url, { method: "GET", signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new DeliveryFailure("heartbeat unreachable");
  }
  if (!res.ok) throw new DeliveryFailure(`heartbeat HTTP ${res.status}`);
}

/** Replaces every secret (tokens, webhook and RPC URLs) in a line before it is logged. */
export function redactor(secrets: readonly string[]): (text: string) => string {
  const sorted = [...secrets].filter((s) => s.length >= 6).sort((a, b) => b.length - a.length);
  return (text) => sorted.reduce((out, secret) => out.split(secret).join("(hidden)"), text);
}

/** Splits a message at line breaks into pieces a channel takes, cutting a single overlong line only as a last resort. */
export function split(text: string, max: number): string[] {
  const pieces: string[] = [];
  let current = "";
  for (const line of text.split("\n")) {
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length <= max) {
      current = candidate;
      continue;
    }
    if (current) pieces.push(current);
    current = line.length <= max ? line : "";
    for (let i = 0; line.length > max && i < line.length; i += max) pieces.push(line.slice(i, i + max));
  }
  if (current) pieces.push(current);
  return pieces;
}
