import type { Locale } from "@/shared/i18n/config";
import { LAUNCHPADS } from "@/shared/config/launchpads";
import { ageIn, formatAge, formatChange, formatUsdCompact } from "@/shared/lib/format";
import type { Token } from "@/shared/types/token";
import { words } from "./i18n";
import { exploreUrl, homeUrl } from "./links";
import { escapeHtml as esc, fill } from "./text";
import type { Button, View } from "./types";
import { nameLine } from "./views";

/** The launchpads with their own list, in tab order; then Trending, across every launchpad. */
export const PAD_TABS = ["tonk", "pons", "pump"] as const;
export type PadTab = (typeof PAD_TABS)[number];
export type LaunchTab = PadTab | "trend";
export const isLaunchTab = (value: string): value is LaunchTab => value === "trend" || (PAD_TABS as readonly string[]).includes(value);

/** How many tokens a list shows: enough to scan at a glance on a phone. */
export const LIST_SIZE = 5;

function itemLines(token: Token, index: number, tab: LaunchTab, lang: Locale): string[] {
  const d = words(lang);
  const lines = [`${index + 1}. ${nameLine(token)}`];
  if (tab === "trend") {
    const pad = LAUNCHPADS[token.launchpad]?.name ?? token.launchpad;
    lines.push(esc(`${pad} · ${formatUsdCompact(token.marketCap)} · ${formatChange(token.change24h)}`));
  }
  const age = token.ageMinutes < 1 ? ageIn(d.age.s, Math.floor(token.ageMinutes * 60)) : formatAge(token.ageMinutes, d.age);
  lines.push(fill(d.launches.row, { score: Math.round(token.score), level: esc(d.levels[token.level]), age: esc(age) }));
  return lines;
}

/**
 * The newest launches on tonkfun.fun, Pons or Pump.fun, or what's trending
 * across launchpads by Explore's own rule. Four tabs in a 2 × 2 grid switch in
 * place, like a segmented control, and each numbered button opens that token's card.
 */
export function launchesView(rows: readonly Token[], tab: LaunchTab, lang: Locale, site: string): View {
  const d = words(lang);
  const title = tab === "trend" ? d.launches.trendingTitle : d.launches.on.replace("{pad}", LAUNCHPADS[tab].name);
  const shown = rows.slice(0, LIST_SIZE);
  const body = shown.length === 0 ? [esc(tab === "trend" ? d.launches.trendingEmpty : d.launches.empty)] : shown.flatMap((t, i) => [...itemLines(t, i, tab, lang), ""]);
  const text = [`<b>${esc(title)}</b>`, "", ...body].join("\n").trimEnd();

  const tabButton = (to: LaunchTab, label: string): Button => ({ text: to === tab ? `✓ ${label}` : label, callback_data: `l:${to}` });
  const tabs: Button[][] = [
    [tabButton("tonk", LAUNCHPADS.tonk.name), tabButton("pons", LAUNCHPADS.pons.name)],
    [tabButton("pump", LAUNCHPADS.pump.name), tabButton("trend", d.launches.trending)],
  ];
  // One row of numbers, matching the numbered list above: compact, and never cut off on a phone.
  const picks: Button[] = shown.map((t, i) => ({ text: String(i + 1), callback_data: `c:${t.address}` }));
  const pickRows: Button[][] = picks.length > 0 ? [picks] : [];
  // Explore's New tab lists the last hour's launches; older ones would leave it empty, so then Explore itself.
  const explore = tab === "trend" ? exploreUrl(site, lang, "tab=trending") : shown[0] && shown[0].ageMinutes < 60 ? exploreUrl(site, lang, `pad=${tab}&tab=new`) : homeUrl(site, lang);
  const footer: Button[] = [{ text: d.launches.explore, url: explore }, { text: `‹ ${d.common.back}`, callback_data: "home" }];
  return { text, keyboard: { inline_keyboard: [...tabs, ...pickRows, footer] } };
}
