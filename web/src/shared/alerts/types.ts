import type { ChainId } from "@/shared/types/chain";
import type { AlertLaunchpad } from "@/shared/types/live";

export type LevelKind = "price" | "mcap";
export type AlertDirection = "above" | "below";
export type AlertWindow = "1h" | "24h";

/** The token an alert is about, as its page showed it. Names and tickers come from the chain: untrusted, bounded, shown as text. */
export interface AlertToken {
  address: string;
  chain: ChainId;
  symbol: string;
  name: string;
}

interface RuleBase {
  id: string;
  token: AlertToken;
  on: boolean;
  /** Fires the next time its condition holds; false from firing until the condition has cleared again. */
  armed: boolean;
  createdAt: number;
}

/** Price or market cap crossing a level, in USD. */
export interface LevelRule extends RuleBase {
  kind: LevelKind;
  direction: AlertDirection;
  value: number;
}

/** A move of at least `percent` either way within the window. */
export interface MoveRule extends RuleBase {
  kind: "move";
  window: AlertWindow;
  percent: number;
}

export type AlertRule = LevelRule | MoveRule;

export type FeedKind =
  | "priceAbove"
  | "priceBelow"
  | "mcapAbove"
  | "mcapBelow"
  | "moveUp"
  | "moveDown"
  | "launch"
  | "graduated"
  | "hot"
  | "unlocked"
  | "claimed"
  | "extended";

/** One alert that fired. `value` is the level in USD, or the move in percent; `pad` names the launchpad of a launchpad-wide alert. */
export interface FeedItem {
  id: string;
  at: number;
  kind: FeedKind;
  token: AlertToken;
  pad?: AlertLaunchpad;
  value?: number;
  window?: AlertWindow;
  read: boolean;
}

/** One launchpad's switches: each of its graduations, and each launch of the hour that turns hot. */
export interface PadSwitches {
  graduations: boolean;
  hot: boolean;
}

/**
 * The launchpad switches, and browser notifications. `launches` is every new
 * tonkfun.fun launch; `graduations` and `locks` are about watched tokens
 * (graduation on any launchpad; locks, which only tonkfun.fun launches have).
 */
export interface AlertSettings {
  launches: boolean;
  graduations: boolean;
  locks: boolean;
  notify: boolean;
  pads: Record<AlertLaunchpad, PadSwitches>;
}

/** What the launchpad alerts saw last time, to tell what has changed since. */
export interface LaunchSeen {
  /** The newest tonkfun.fun launch time seen, ms. */
  newest: number;
  /** Per launchpad, the newest graduation time seen, ms: a launchpad missing here is recorded first, not reported. */
  graduated: Partial<Record<AlertLaunchpad, number>>;
  /** Launches already seen hot, so each is reported once. */
  hot: string[];
  /** When the last check ran, ms: a lock ending after it and by now has just ended. */
  checkedAt: number;
  tokens: Record<string, { graduatedAt: number | null; lockEnd: number | null; lockClaimed: string | null }>;
}
