"use client";

import { BellRing } from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { formatAge } from "@/shared/lib/format";
import { feedText } from "../describe";
import { clearFeed } from "../hooks";
import type { FeedItem } from "../types";

function subscribeClock(onTick: () => void) {
  const timer = setInterval(onTick, 30_000);
  return () => clearInterval(timer);
}
/** The time to the half minute, so ages move on while the panel is open (0 while server-rendering). */
const clock = () => Math.floor(Date.now() / 30_000) * 30_000;

/** What fired, newest first; each item opens its token. */
export function FeedList({ feed, onNavigate }: { feed: readonly FeedItem[]; onNavigate: () => void }) {
  const { t, href } = useI18n();
  const a = t.alerts;
  const now = useSyncExternalStore(subscribeClock, clock, () => 0);
  if (feed.length === 0) return <p className="m-0 py-6 text-center text-[13px] text-text-3">{a.emptyFeed}</p>;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-end">
        <button type="button" onClick={clearFeed} className="rounded-md px-2 py-1 text-[12px] font-semibold text-text-2 hover:bg-raised hover:text-text">
          {a.clear}
        </button>
      </div>
      <ul className="m-0 flex list-none flex-col p-0">
        {feed.map((item) => (
          <li key={item.id}>
            <Link
              href={href(`/token/${encodeURIComponent(item.token.address)}`)}
              onClick={onNavigate}
              className="flex items-start gap-3 rounded-lg px-2 py-2.5 hover:bg-raised"
            >
              <BellRing size={16} strokeWidth={1.9} className="mt-0.5 flex-none text-accent-text" aria-hidden="true" />
              <span className="min-w-0 flex-1 text-[13px] leading-5 break-words text-text">{feedText(a, item)}</span>
              <time dateTime={new Date(item.at).toISOString()} className="flex-none pt-0.5 font-mono text-[11px] text-text-3">
                {fmt(t.token.trades.ago, { time: formatAge((now - item.at) / 60_000, t.token.trades.units) })}
              </time>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
