"use client";

import { ChevronDown, LoaderCircle, Wallet } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { CHAINS } from "@/shared/config/chains";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { shortAddress } from "@/shared/lib/address";
import { cn } from "@/shared/lib/cn";
import { buttonClasses } from "@/shared/ui/Button";
import { ChainMark } from "@/shared/ui/ChainMark";
import { useWallet, wallet } from "@/shared/wallet/wallet";
import { useTheme } from "../hooks/useTheme";
import { WalletPanel } from "./WalletPanel";

/**
 * The connect button on phones. It and its wrapper have a flex basis of 0, so
 * they can never push the row into wrapping: they grow up to the full label
 * (no further, so the logo's auto margin keeps the free space) and, if a big
 * system font leaves too little room, the label ends in an ellipsis instead.
 * Under 340 px it is a 32 px wallet icon. (The 340 px split uses ranges so no
 * two breakpoints set the same property.)
 */
const PHONE_CTA = [
  "md:flex-none md:rounded-lg md:shadow-none",
  "max-md:h-8 max-md:min-w-0 max-md:flex-[1_1_0%] max-md:text-[13px]",
  "min-[340px]:max-md:max-w-max min-[340px]:max-md:px-3",
  "max-[339px]:max-w-8 max-[339px]:px-0",
].join(" ");

/** The connected chip: chain mark, short address and chevron; under 340 px just the mark. */
const ACCOUNT = cn(
  "inline-flex h-10 min-w-0 items-center gap-2 rounded-xl border border-line bg-surface pr-2.5 pl-2 text-text hover:bg-raised md:rounded-lg",
  "max-md:h-8 max-md:flex-[0_1_auto] max-md:gap-1.5 max-md:pr-2 max-md:pl-1.5",
);

/** Runs `task` once the page is idle, so restoring a wallet never competes with the first paint. */
function whenIdle(task: () => void): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(task, { timeout: 2_000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(task, 200);
  return () => window.clearTimeout(id);
}

/**
 * "Connect wallet" in the top bar, or the connected wallet's chain and
 * address. Either one opens the wallet menu (WalletPanel). On desktop the menu
 * hangs from the button's right edge; on phones the root isn't positioned, so
 * it spans the sticky top bar just below it. Escape, a click outside or
 * tabbing away closes it.
 */
export function WalletButton() {
  const { t } = useI18n();
  const view = useWallet();
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => whenIdle(() => wallet.restore()), []);
  useEffect(() => wallet.setTheme(theme), [theme]);

  useEffect(() => {
    if (!open) return;
    rootRef.current?.querySelector<HTMLButtonElement>(`[id="${panelId}"] button`)?.focus();
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, panelId]);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const chain = view.chain;
  const label = view.address && chain
    ? fmt(t.wallet.account, { address: shortAddress(view.address), chain: CHAINS[chain].name })
    : view.pending ? t.wallet.connecting : t.header.connectWallet;

  return (
    <div
      ref={rootRef}
      className="flex min-w-0 max-md:max-w-max max-md:flex-[1_1_0%] md:relative"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          close();
        }
      }}
      onBlur={(event) => {
        const next = event.relatedTarget as Node | null;
        if (open && next && !rootRef.current?.contains(next)) setOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-busy={view.pending || undefined}
        onClick={() => setOpen(!open)}
        className={view.address && chain ? ACCOUNT : buttonClasses("cta", "md", PHONE_CTA)}
      >
        {view.address && chain ? (
          <>
            <ChainMark chain={chain} size={20} letterSize={9} decorative className="max-md:size-[18px]" />
            <span className="min-w-0 truncate font-mono text-[13px] font-semibold max-[339px]:hidden">{shortAddress(view.address)}</span>
            <ChevronDown size={14} strokeWidth={2} className="flex-none text-text-2" aria-hidden="true" />
          </>
        ) : (
          <>
            {view.pending ? (
              <LoaderCircle size={16} strokeWidth={2} className="tk-spin flex-none" aria-hidden="true" />
            ) : (
              <Wallet size={16} strokeWidth={2} className="hidden flex-none max-[339px]:block md:block" aria-hidden="true" />
            )}
            <span className="max-md:hidden">{t.header.connectWallet}</span>
            <span className="min-w-0 truncate md:hidden max-[339px]:hidden">{t.header.connect}</span>
          </>
        )}
      </button>
      {open ? (
        <div
          id={panelId}
          className={cn(
            "absolute inset-x-3 top-full z-20 mt-1.5 rounded-[14px] border border-line-strong bg-raised p-1.5 shadow-menu",
            "md:top-[46px] md:right-0 md:left-auto md:mt-0 md:w-[300px]",
          )}
        >
          <WalletPanel onClose={close} />
        </div>
      ) : null}
    </div>
  );
}
