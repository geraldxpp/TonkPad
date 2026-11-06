import { createHash, timingSafeEqual } from "node:crypto";
import { createServer, type Server } from "node:http";
import { isChainId } from "@/shared/config/chains";
import { isLaunchpadId } from "@/shared/config/launchpads";
import type { LiveList, LiveListQuery, LiveOverview, LiveShell, LiveTabId, LiveTimeframe } from "@/shared/types/live";

export interface Api {
  list: (query: LiveListQuery) => LiveList;
  overview: () => LiveOverview;
  shell: () => LiveShell;
  health: () => Record<string, unknown>;
}

const TABS: readonly LiveTabId[] = ["trending", "new", "graduating", "graduated", "gainers", "smart", "locked"];
const TIMEFRAMES: readonly LiveTimeframe[] = ["5m", "1h", "6h", "24h"];

/** Reads a list view from query params; anything unknown falls back to the defaults. */
export function parseListQuery(params: URLSearchParams): LiveListQuery {
  const chain = params.get("chain");
  const pad = params.get("pad");
  const tab = params.get("tab");
  const tf = params.get("tf");
  const limit = Number(params.get("limit") ?? 10);
  return {
    chain: isChainId(chain) ? chain : "all",
    pad: isLaunchpadId(pad) ? pad : "all",
    tab: TABS.find((t) => t === tab) ?? "trending",
    tf: TIMEFRAMES.find((t) => t === tf) ?? "24h",
    q: (params.get("q") ?? "").slice(0, 64),
    limit: Number.isFinite(limit) ? limit : 10,
  };
}

/** True when `sent` matches the worker token; compared in constant time. */
export function tokenMatches(sent: string | string[] | undefined, token: string): boolean {
  if (typeof sent !== "string") return false;
  const digest = (text: string) => createHash("sha256").update(text).digest();
  return timingSafeEqual(digest(sent), digest(token));
}

/** GET /health (public, for the host's health check), /v1/list, /v1/overview, /v1/shell. JSON only. */
export function startServer(port: number, token: string | null, api: Api): Server {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://worker");
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      res.end(JSON.stringify(body));
    };
    if (req.method !== "GET") return send(405, { error: "method not allowed" });
    if (url.pathname === "/health") return send(200, api.health());
    if (token && !tokenMatches(req.headers["x-worker-token"], token)) return send(401, { error: "unauthorized" });
    try {
      switch (url.pathname) {
        case "/v1/list":
          return send(200, api.list(parseListQuery(url.searchParams)));
        case "/v1/overview":
          return send(200, api.overview());
        case "/v1/shell":
          return send(200, api.shell());
        default:
          return send(404, { error: "not found" });
      }
    } catch (error) {
      console.error(error);
      return send(500, { error: "internal error" });
    }
  });
  server.listen(port);
  return server;
}
