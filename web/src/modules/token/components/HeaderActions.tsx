"use client";

import { Check, Copy, Globe, Send, Share2, Star } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import type { Token } from "@/shared/types/token";
import { useWatchlist } from "../hooks/useWatchlist";
import { safeUrl } from "../lib/display";
import { shortAddress } from "../lib/format";

const SQUARE = "inline-flex size-8 flex-none items-center justify-center rounded-[10px] border border-line bg-raised text-text-2 hover:text-text";

interface HeaderActionsProps {
  token: Pick<Token, "address" | "name" | "ticker">;
  /** The full contract address. */
  contract: string;
  links: { website: string | null; community: string | null };
}

type Notice = "copied" | "shared" | null;

/** CA copy, the token's own links (only those it has), Share and the watchlist star. */
export function HeaderActions({ token, contract, links }: HeaderActionsProps) {
  const { t } = useI18n();
  const { watched, toggle } = useWatchlist(token.address);
  const [notice, setNotice] = useState<Notice>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async (text: string, done: Exclude<Notice, null>) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return; // Clipboard blocked: nothing to confirm.
    }
    setNotice(done);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setNotice(null), 1600);
  };

  const share = async () => {
    const url = window.location.href;
    if (typeof navigator.share === "function") {
      await navigator.share({ title: `${token.name} ($${token.ticker})`, url }).catch(() => undefined);
      return;
    }
    await copy(url, "shared");
  };

  const short = shortAddress(contract);
  const website = safeUrl(links.website);
  const community = safeUrl(links.community);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => copy(contract, "copied")}
        aria-label={fmt(t.token.copy, { address: short })}
        title={contract}
        className="inline-flex h-8 items-center gap-2 rounded-[10px] border border-line bg-raised px-2.5 text-text"
      >
        <span className="text-[11px] font-semibold tracking-[0.04em] text-text-3">{t.token.ca}</span>
        <span className="font-mono text-[12px]">{short}</span>
        {notice === "copied" ? (
          <Check size={14} strokeWidth={2.4} className="text-pos" aria-hidden="true" />
        ) : (
          <Copy size={14} strokeWidth={2} className="text-text-2" aria-hidden="true" />
        )}
      </button>
      {website ? (
        <a href={website} target="_blank" rel="noopener noreferrer nofollow" aria-label={t.token.website} title={t.token.website} className={SQUARE}>
          <Globe size={15} strokeWidth={1.8} aria-hidden="true" />
        </a>
      ) : null}
      {community ? (
        <a href={community} target="_blank" rel="noopener noreferrer nofollow" aria-label={t.token.community} title={t.token.community} className={SQUARE}>
          <Send size={15} strokeWidth={1.8} aria-hidden="true" />
        </a>
      ) : null}
      <button type="button" onClick={share} aria-label={t.token.share} title={t.token.share} className={SQUARE}>
        {notice === "shared" ? (
          <Check size={15} strokeWidth={2.4} className="text-pos" aria-hidden="true" />
        ) : (
          <Share2 size={15} strokeWidth={1.8} aria-hidden="true" />
        )}
      </button>
      <button
        type="button"
        onClick={toggle}
        aria-label={watched ? t.token.unwatch : t.token.watch}
        title={watched ? t.token.unwatch : t.token.watch}
        className={cn(SQUARE, watched && "text-gold hover:text-gold")}
      >
        <Star size={15} strokeWidth={1.8} fill={watched ? "currentColor" : "none"} aria-hidden="true" />
      </button>
      <span aria-live="polite" className="sr-only">
        {notice === "copied" ? t.token.copied : notice === "shared" ? t.token.shared : ""}
      </span>
    </div>
  );
}
