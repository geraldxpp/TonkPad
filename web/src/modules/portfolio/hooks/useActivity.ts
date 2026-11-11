"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChainId } from "@/shared/types/chain";
import { activityPath, isActivityPage } from "../lib/api";
import type { PortfolioActivity } from "../lib/types";

interface ChainFeed {
  items: PortfolioActivity[];
  next: string | null;
  loading: boolean;
  failed: boolean;
}

const START: ChainFeed = { items: [], next: null, loading: true, failed: false };

async function loadPage(chain: ChainId, owner: string, cursor: string | null, signal: AbortSignal) {
  const res = await fetch(activityPath(chain, owner, cursor), { signal, headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body: unknown = await res.json();
  if (!isActivityPage(body, chain, owner)) throw new Error("bad response");
  return body;
}

export interface ActivityView {
  /** Newest first, across the chains. */
  items: PortfolioActivity[];
  loading: boolean;
  /** A chain couldn't be read. */
  failed: boolean;
  hasMore: boolean;
  /** Loading further back. */
  loadingMore: boolean;
  loadMore: () => void;
  /** ms; when the newest page arrived, for "Today" and "Yesterday". */
  loadedAt: number;
}

/**
 * A wallet's history on each connected chain, read only once `enabled` (the
 * Activity tab has been opened). `owners` are read together and merged by time;
 * `refreshes` going up reads the newest page again.
 */
export function useActivity(owners: readonly (readonly [ChainId, string])[], enabled: boolean, refreshes: number): ActivityView {
  const key = owners.map(([chain, owner]) => `${chain}:${owner}`).join("|");
  const [feeds, setFeeds] = useState<Record<string, ChainFeed>>({});
  const [loadedAt, setLoadedAt] = useState(0);
  const controller = useRef<AbortController | null>(null);
  const latestOwners = useRef(owners);
  const latestFeeds = useRef(feeds);
  useEffect(() => {
    latestOwners.current = owners;
    latestFeeds.current = feeds;
  });

  useEffect(() => {
    if (!enabled || !key) return;
    const current = new AbortController();
    controller.current = current;
    for (const [chain, owner] of latestOwners.current) {
      const id = `${chain}:${owner}`;
      setFeeds((prev) => ({ ...prev, [id]: prev[id] ?? START }));
      loadPage(chain, owner, null, current.signal).then(
        (page) => {
          setFeeds((prev) => ({ ...prev, [id]: { items: page.items, next: page.next, loading: false, failed: false } }));
          setLoadedAt(Date.now());
        },
        () => {
          if (!current.signal.aborted) setFeeds((prev) => ({ ...prev, [id]: { ...(prev[id] ?? START), loading: false, failed: true } }));
        },
      );
    }
    return () => current.abort();
  }, [key, enabled, refreshes]);

  const loadMore = useCallback(() => {
    const signal = controller.current?.signal;
    if (!signal) return;
    for (const [chain, owner] of latestOwners.current) {
      const id = `${chain}:${owner}`;
      const feed = latestFeeds.current[id];
      if (!feed?.next || feed.loading) continue;
      setFeeds((prev) => ({ ...prev, [id]: { ...feed, ...prev[id], loading: true } }));
      loadPage(chain, owner, feed.next, signal).then(
        (page) =>
          setFeeds((prev) => {
            const held = prev[id]?.items ?? [];
            const seen = new Set(held.map((item) => item.id));
            return { ...prev, [id]: { items: [...held, ...page.items.filter((item) => !seen.has(item.id))], next: page.next, loading: false, failed: false } };
          }),
        () => {
          if (!signal.aborted) setFeeds((prev) => ({ ...prev, [id]: { ...(prev[id] ?? START), loading: false, failed: true } }));
        },
      );
    }
  }, []);

  return useMemo(() => {
    const active = owners.map(([chain, owner]) => feeds[`${chain}:${owner}`] ?? (enabled ? START : { ...START, loading: false }));
    const hasItems = active.some((feed) => feed.items.length > 0);
    const busy = active.some((feed) => feed.loading);
    return {
      items: active.flatMap((feed) => feed.items).sort((a, b) => b.time - a.time),
      loading: busy && !hasItems,
      failed: active.some((feed) => feed.failed),
      hasMore: active.some((feed) => feed.next !== null),
      loadingMore: busy && hasItems,
      loadMore,
      loadedAt,
    };
    // `owners` is rebuilt each render; `key` says when it really changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, feeds, enabled, loadMore, loadedAt]);
}
