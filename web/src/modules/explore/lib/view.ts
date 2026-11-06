import { isChainId } from "@/shared/config/chains";
import { isLaunchpadId } from "@/shared/config/launchpads";
import type { ParamUpdates } from "@/shared/lib/url-params";
import type { ChainId } from "@/shared/types/chain";
import type { LaunchpadId } from "@/shared/types/launchpad";

/** Token list tabs, in order. Each id is also its label's key in the `tabs` messages. */
export const TABS = ["trending", "new", "graduating", "graduated", "gainers", "smart", "locked"] as const;

export type TabId = (typeof TABS)[number];

export const TIMEFRAMES = [
  { id: "5m", label: "5m" },
  { id: "1h", label: "1h" },
  { id: "6h", label: "6h" },
  { id: "24h", label: "24h" },
] as const;

export type Timeframe = (typeof TIMEFRAMES)[number]["id"];

/** Everything about the token list a URL can carry. */
export interface ExploreView {
  chain: "all" | ChainId;
  pad: "all" | LaunchpadId;
  tab: TabId;
  tf: Timeframe;
  q: string;
}

export const DEFAULT_VIEW: ExploreView = { chain: "all", pad: "all", tab: "trending", tf: "24h", q: "" };

interface ReadableParams {
  get(key: string): string | null;
}

const isTab = (v: string | null): v is TabId => TABS.some((t) => t === v);
const isTimeframe = (v: string | null): v is Timeframe => TIMEFRAMES.some((t) => t.id === v);

/** Reads the view from search params. Unknown or missing values fall back to defaults. */
export function parseView(params: ReadableParams): ExploreView {
  const chain = params.get("chain");
  const pad = params.get("pad");
  const tab = params.get("tab");
  const tf = params.get("tf");
  return {
    chain: isChainId(chain) ? chain : DEFAULT_VIEW.chain,
    pad: isLaunchpadId(pad) ? pad : DEFAULT_VIEW.pad,
    tab: isTab(tab) ? tab : DEFAULT_VIEW.tab,
    tf: isTimeframe(tf) ? tf : DEFAULT_VIEW.tf,
    q: params.get("q") ?? DEFAULT_VIEW.q,
  };
}

/** URL updates for part of a view; defaults become null so they drop out of the URL. */
export function viewUpdates(patch: Partial<ExploreView>): ParamUpdates {
  const updates: ParamUpdates = {};
  for (const key of Object.keys(patch) as Array<keyof ExploreView>) {
    const value = patch[key];
    if (value === undefined) continue;
    updates[key] = value === DEFAULT_VIEW[key] ? null : value;
  }
  return updates;
}

/** The filters "Reset filters" clears (the timeframe stays, as in the reference). */
export const RESET_PATCH: Partial<ExploreView> = { tab: "trending", pad: "all", chain: "all", q: "" };
