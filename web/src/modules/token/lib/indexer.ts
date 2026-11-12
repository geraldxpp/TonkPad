import type { TokenDetail } from "@/shared/types/token-detail";
import { isLiveTokenDetail } from "./live-token";

/** A launch's holders, top traders and top-10 share as the live-data worker counts them. */
export type IndexerView =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "ok"; holders: TokenDetail["holders"]; topTraders: TokenDetail["topTraders"]; holderCount: number | null; top10Share: number | null };

/** The worker's answer for `address`, or "unavailable" for anything else (an error, another token, a malformed body). */
export function indexerViewOf(body: unknown, address: string): IndexerView {
  if (!isLiveTokenDetail(body, address) || body.token.launchpad !== "tonk") return { status: "unavailable" };
  return { status: "ok", holders: body.holders, topTraders: body.topTraders, holderCount: body.token.holders, top10Share: body.stats.top10Share };
}

/** The mission page's figures with the worker's holders, top traders, holder count and top-10 share, once it has answered. */
export function withIndexer(detail: TokenDetail, view: IndexerView): TokenDetail {
  if (view.status !== "ok") return detail;
  return {
    ...detail,
    token: { ...detail.token, holders: view.holderCount },
    stats: { ...detail.stats, top10Share: view.top10Share },
    holders: view.holders,
    topTraders: view.topTraders,
  };
}
