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

const SQUARE =
  "inline-flex size-9 flex-none items-center justify-center rounded-lg border border-line text-text-2 hover:bg-raised hover:text-text max-md:size-8 max-md:border-transparent";

type Notice = "copied" | "shared" | null;

/** Copies text and briefly confirms it (in a polite live region next to the control). */
function useCopyNotice() {
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
  return { notice, copy };
}

/** The shortened contract address; a click copies the full one. */
export function CopyAddress({ contract }: { contract: string }) {
  const { t } = useI18n();
  const { notice, copy } = useCopyNotice();
  const short = shortAddress(contract);
  return (
    <>
      <button
        type="button"
        onClick={() => copy(contract, "copied")}
        aria-label={fmt(t.token.copy, { address: short })}
        title={contract}
        className="inline-flex min-w-0 items-center gap-1.5 rounded-md font-mono text-[11px] text-text-3 hover:text-text"
      >
        <span className="truncate">{short}</span>
        {notice === "copied" ? (
          <Check size={12} strokeWidth={2.4} className="flex-none text-pos" aria-hidden="true" />
        ) : (
          <Copy size={12} strokeWidth={2} className="flex-none" aria-hidden="true" />
        )}
      </button>
      <span aria-live="polite" className="sr-only">
        {notice === "copied" ? t.token.copied : ""}
      </span>
    </>
  );
}

interface HeaderActionsProps {
  token: Pick<Token, "address" | "name" | "ticker">;
  links: { website: string | null; community: string | null };
}

/** The token's own links (only those it has), Share and the watchlist star. */
export function HeaderActions({ token, links }: HeaderActionsProps) {
  const { t } = useI18n();
  const { watched, toggle } = useWatchlist(token.address);
  const { notice, copy } = useCopyNotice();

  const share = async () => {
    // The view travels with the link; the sharer's own transaction in flight (`?tx=`, `?action=`) never does.
    const link = new URL(window.location.href);
    link.searchParams.delete("tx");
    link.searchParams.delete("action");
    const url = link.toString();
    if (typeof navigator.share === "function") {
      await navigator.share({ title: `${token.name} ($${token.ticker})`, url }).catch(() => undefined);
      return;
    }
    await copy(url, "shared");
  };

  const website = safeUrl(links.website);
  const community = safeUrl(links.community);
  return (
    <div className="flex flex-none items-center gap-1 max-md:gap-0">
      {website ? (
        <a href={website} target="_blank" rel="noopener noreferrer nofollow" aria-label={t.token.website} title={t.token.website} className={SQUARE}>
          <Globe size={16} strokeWidth={1.8} aria-hidden="true" />
        </a>
      ) : null}
      {community ? (
        <a href={community} target="_blank" rel="noopener noreferrer nofollow" aria-label={t.token.community} title={t.token.community} className={SQUARE}>
          <Send size={16} strokeWidth={1.8} aria-hidden="true" />
        </a>
      ) : null}
      <button
        type="button"
        onClick={toggle}
        aria-label={watched ? t.token.unwatch : t.token.watch}
        title={watched ? t.token.unwatch : t.token.watch}
        className={cn(SQUARE, watched && "bg-gold/10 text-gold hover:bg-gold/14 hover:text-gold")}
      >
        <Star size={16} strokeWidth={1.8} fill={watched ? "currentColor" : "none"} aria-hidden="true" />
      </button>
      <button type="button" onClick={share} aria-label={t.token.share} title={t.token.share} className={SQUARE}>
        {notice === "shared" ? (
          <Check size={16} strokeWidth={2.4} className="text-pos" aria-hidden="true" />
        ) : (
          <Share2 size={16} strokeWidth={1.8} aria-hidden="true" />
        )}
      </button>
      <span aria-live="polite" className="sr-only">
        {notice === "shared" ? t.token.shared : ""}
      </span>
    </div>
  );
}
