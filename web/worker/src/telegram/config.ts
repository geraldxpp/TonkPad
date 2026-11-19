import { dirname, join } from "node:path";
import { isLocale, type Locale } from "@/shared/i18n/config";

export interface TelegramConfig {
  token: string;
  /** The official channel (@name or -100… id), or null for no channel. */
  channelId: string | null;
  channelLang: Locale;
  /** The site's origin every link points at. */
  site: string;
  statePath: string;
  /** Creator wallets the channel lets use the brand in a token's name (the owner's own coin), lower-cased. */
  brandCreators: Set<string>;
  /** Token addresses the channel never posts, lower-cased. */
  channelSkip: Set<string>;
}

/** Comma-separated 0x addresses, lower-cased; anything else is reported. */
function addresses(value: string | null, name: string, notes: string[]): Set<string> {
  const out = new Set<string>();
  for (const part of (value ?? "").split(",").map((p) => p.trim()).filter(Boolean)) {
    if (/^0x[0-9a-fA-F]{40}$/.test(part)) out.add(part.toLowerCase());
    else notes.push(`${name}: ignored an entry that isn't a 0x address`);
  }
  return out;
}

const text = (value: string | undefined) => {
  const v = value?.trim();
  return v ? v : null;
};

/**
 * The bot's settings from the worker's environment. It runs only when
 * TELEGRAM_BOT_TOKEN is set; every other value has a safe default. The note
 * says why it is off, or what was ignored, and never holds the token.
 */
export function loadTelegramConfig(env: Readonly<Record<string, string | undefined>>, snapshotPath: string): { config: TelegramConfig | null; note: string } {
  const token = text(env.TELEGRAM_BOT_TOKEN);
  if (!token) return { config: null, note: "off: TELEGRAM_BOT_TOKEN isn't set" };
  if (!/^\d{5,}:[A-Za-z0-9_-]{30,}$/.test(token)) return { config: null, note: "off: TELEGRAM_BOT_TOKEN doesn't look like a bot token from @BotFather" };

  const notes: string[] = [];
  let channelId = text(env.TELEGRAM_CHANNEL_ID);
  if (channelId && !/^@[A-Za-z][A-Za-z0-9_]{4,31}$/.test(channelId) && !/^-100\d{5,}$/.test(channelId)) {
    notes.push("TELEGRAM_CHANNEL_ID ignored (use @name or the -100… id)");
    channelId = null;
  }
  const lang = text(env.TELEGRAM_CHANNEL_LANG);
  if (lang && !isLocale(lang)) notes.push("TELEGRAM_CHANNEL_LANG ignored (one of the site's language codes)");

  let site = "https://www.tonkfun.fun";
  const custom = text(env.TELEGRAM_SITE_URL);
  if (custom) {
    try {
      const url = new URL(custom);
      if (url.protocol === "https:" && !url.username && !url.password) site = url.origin;
      else notes.push("TELEGRAM_SITE_URL ignored (an https origin)");
    } catch {
      notes.push("TELEGRAM_SITE_URL ignored (an https origin)");
    }
  }

  return {
    config: {
      token,
      channelId,
      channelLang: lang && isLocale(lang) ? lang : "en",
      site,
      statePath: text(env.TELEGRAM_STATE_PATH) ?? join(dirname(snapshotPath), "telegram.json"),
      brandCreators: addresses(text(env.TELEGRAM_BRAND_CREATORS), "TELEGRAM_BRAND_CREATORS", notes),
      channelSkip: addresses(text(env.TELEGRAM_CHANNEL_SKIP), "TELEGRAM_CHANNEL_SKIP", notes),
    },
    note: ["on", channelId ? `channel ${channelId}` : "no channel", ...notes].join("; "),
  };
}
