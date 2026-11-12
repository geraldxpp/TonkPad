import { LAUNCHPADS } from "@/shared/config/launchpads";
import { fmt } from "@/shared/i18n/config";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import { formatPrice, formatUsdCompact } from "@/shared/lib/format";
import type { AlertRule, FeedItem, LevelKind } from "./types";

type AlertCopy = Dictionary["alerts"];

/** A level as the screens show it: a price to three significant digits, a market cap compact. */
export const levelText = (kind: LevelKind, value: number) => (kind === "price" ? formatPrice(value) : formatUsdCompact(value));

const percentText = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 1 });

/** "Price above $0.0000582", "Moves 20% within 1 hour". */
export function ruleText(a: AlertCopy, rule: AlertRule): string {
  if (rule.kind === "move") return fmt(rule.window === "1h" ? a.rule.move1h : a.rule.move24h, { percent: percentText(rule.percent) });
  const template = rule.kind === "price" ? (rule.direction === "above" ? a.rule.priceAbove : a.rule.priceBelow) : rule.direction === "above" ? a.rule.mcapAbove : a.rule.mcapBelow;
  return fmt(template, { value: levelText(rule.kind, rule.value) });
}

/** What fired, in a sentence: "PEPE rose above $0.0000582". The ticker is the token's own text, shown as text. */
export function feedText(a: AlertCopy, item: FeedItem): string {
  const symbol = item.token.symbol || item.token.name || item.token.address.slice(0, 8);
  const value = item.value ?? 0;
  switch (item.kind) {
    case "priceAbove":
    case "priceBelow":
      return fmt(a.fired[item.kind], { symbol, value: levelText("price", value) });
    case "mcapAbove":
    case "mcapBelow":
      return fmt(a.fired[item.kind], { symbol, value: levelText("mcap", value) });
    case "moveUp":
    case "moveDown": {
      const template = item.kind === "moveUp" ? (item.window === "24h" ? a.fired.moveUp24h : a.fired.moveUp1h) : item.window === "24h" ? a.fired.moveDown24h : a.fired.moveDown1h;
      return fmt(template, { symbol, percent: percentText(value) });
    }
    case "graduated":
      return item.pad ? fmt(a.fired.graduatedOn, { symbol, pad: LAUNCHPADS[item.pad].name }) : fmt(a.fired.graduated, { symbol });
    case "hot":
      return fmt(a.fired.hot, { symbol, pad: LAUNCHPADS[item.pad ?? "pump"].name });
    default:
      return fmt(a.fired[item.kind], { symbol });
  }
}
