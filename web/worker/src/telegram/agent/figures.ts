import { isSettings, SETTINGS_PATH } from "@/shared/tonk/api";
import { docsFigures, figureStrings } from "@/shared/tonk/figures";
import { MAINNET_RECORD } from "@/shared/tonk/mainnet-record";
import { mainnetNetwork } from "@/shared/tonk/networks";
import type { TonkSettingsJson } from "@/shared/tonk/types";
import type { Fetch } from "../../alerts/deliver";
import type { LaunchFigures } from "./types";

/**
 * launchpad_figures' data (prompts/15-community-agent.md, The tools): the
 * launchpad's settings from the site's own GET /api/tonk/settings, worked
 * out with the Docs page's docsFigures and written with its figureStrings,
 * so the bot says exactly what the page shows. Only Robinhood Chain
 * mainnet's figures count: the bot's knowledge is about that launchpad.
 */

export interface FiguresOptions {
  /** The site's origin, as the bot links it: "https://www.tonkfun.fun". */
  site: string;
  fetchFn?: Fetch;
  /** The worker's ETH price in dollars, or null without one. */
  ethUsd: () => number | null;
  now: () => number;
}

const TIMEOUT_MS = 5_000;
export const FIGURES_CACHE_MS = 60_000;
/** The route answers about 200 bytes; anything far larger isn't it. */
const MAX_BODY = 4_096;
const DAY_MS = 86_400_000;

/** The chain the knowledge pack describes: the deployment record's own network. */
const MAINNET_CHAIN_ID = mainnetNetwork({ launchpad: MAINNET_RECORD.launchpad, migrator: MAINNET_RECORD.migrator, block: String(MAINNET_RECORD.block) })?.chainId ?? null;

/** The settings, or null: not mainnet's, or not what the route answers. docsFigures checks the wei strings themselves. */
function settingsOf(body: unknown): TonkSettingsJson | null {
  return isSettings(body) && MAINNET_CHAIN_ID !== null && body.chainId === MAINNET_CHAIN_ID ? body : null;
}

/** GET <site>/api/tonk/settings within 5 seconds: mainnet's settings, or null. Never throws. */
async function readSettings(site: string, fetchFn: Fetch): Promise<TonkSettingsJson | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchFn(`${site.replace(/\/+$/, "")}${SETTINGS_PATH}`, { headers: { accept: "application/json" }, signal: controller.signal });
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      return null;
    }
    const text = await res.text();
    return text.length > MAX_BODY ? null : settingsOf(JSON.parse(text));
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** When the settings were read, to the second, in UTC: the site's own time when it is believable, else now. */
function readAtOf(readAt: unknown, now: number): string {
  const at = typeof readAt === "number" && Number.isFinite(readAt) && readAt > 0 && Math.abs(readAt - now) <= DAY_MS ? readAt : now;
  return new Date(at).toISOString().replace(/\.\d{3}Z$/, "Z");
}

/**
 * The figures, read at most once a minute: a good answer is kept 60
 * seconds (by `now`), and calls while a read is under way share it. Null
 * when the site can't be reached within 5 seconds, answers with an error or
 * anything but mainnet's settings, or the settings fit no curve; a failure
 * isn't kept, so the next question asks again. Never rejects.
 */
export function createFigures(options: FiguresOptions): () => Promise<LaunchFigures | null> {
  const fetchFn = options.fetchFn ?? fetch;
  let kept: { at: number; value: LaunchFigures } | null = null;
  let reading: Promise<LaunchFigures | null> | null = null;

  const price = (): number | null => {
    try {
      const value = options.ethUsd();
      return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
    } catch {
      return null;
    }
  };

  const read = async (): Promise<LaunchFigures | null> => {
    try {
      const settings = await readSettings(options.site, fetchFn);
      const figures = settings ? docsFigures(settings) : null;
      if (!settings || !figures) return null;
      const now = options.now();
      const value: LaunchFigures = { ...figureStrings(figures, price(), "ETH"), readAt: readAtOf(settings.readAt, now) };
      kept = { at: now, value };
      return value;
    } catch {
      return null;
    }
  };

  return async () => {
    try {
      const now = options.now();
      if (kept && now >= kept.at && now - kept.at < FIGURES_CACHE_MS) return kept.value;
      reading ??= read().finally(() => {
        reading = null;
      });
      return await reading;
    } catch {
      return null;
    }
  };
}
