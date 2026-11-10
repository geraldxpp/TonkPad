"use client";

import { LoaderCircle, Search, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CHAINS } from "@/shared/config/chains";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { isChainAddress, shortAddress } from "@/shared/lib/address";
import { formatChange, formatUsdCompact } from "@/shared/lib/format";
import { fetchToken } from "@/shared/swap/api";
import { BASE_TOKENS } from "@/shared/swap/tokens";
import type { ChainId } from "@/shared/types/chain";
import type { SwapToken } from "@/shared/types/swap";
import { IconButton } from "@/shared/ui/IconButton";
import { TokenArt } from "@/shared/ui/TokenArt";
import type { SwapListing } from "../data/get-swap-data";

interface TokenPickerProps {
  open: boolean;
  title: string;
  chain: ChainId;
  listings: readonly SwapListing[];
  onPick: (token: SwapToken) => void;
  onClose: () => void;
}

interface Row {
  address: string;
  symbol: string;
  name: string;
  art: string;
  detail: string | null;
  base?: SwapToken;
}

/**
 * Picks a token on the chosen network: the base coins as shortcuts, then
 * trending tokens, filtered by name, ticker or address. A pasted address not
 * in the list is looked up. Listed tokens are looked up for their decimals.
 */
export function TokenPicker({ open, title, chain, listings, onPick, onClose }: TokenPickerProps) {
  const { t } = useI18n();
  const s = t.swap;
  const ref = useRef<HTMLDialogElement>(null);
  const searchId = useId();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setQuery("");
      setProblem(null);
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const rows = useMemo<Row[]>(() => {
    const base: Row[] = BASE_TOKENS[chain].map((token) => ({ address: token.address, symbol: token.symbol, name: token.name, art: token.icon ?? "", detail: null, base: token }));
    const listed: Row[] = listings.map((item) => ({
      address: item.address,
      symbol: item.symbol,
      name: item.name,
      art: item.art,
      detail: `${formatUsdCompact(item.marketCap)} · ${formatChange(item.change24h)}`,
    }));
    const q = query.trim().toLowerCase();
    const all = [...base, ...listed];
    if (!q) return all;
    const found = all.filter((row) => row.symbol.toLowerCase().includes(q) || row.name.toLowerCase().includes(q) || row.address.toLowerCase() === q);
    const pasted = query.trim();
    if (!found.length && isChainAddress(chain, pasted)) return [{ address: pasted, symbol: shortAddress(pasted), name: s.lookup, art: "", detail: null }];
    return found;
  }, [chain, listings, query, s.lookup]);

  const choose = async (row: Row) => {
    if (row.base) return onPick(row.base);
    setBusy(row.address);
    setProblem(null);
    try {
      const token = await fetchToken(chain, row.address);
      onPick({ ...token, icon: row.art || token.icon });
    } catch {
      setProblem(fmt(s.unknownToken, { chain: CHAINS[chain].name }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <dialog
      ref={ref}
      aria-labelledby={`${searchId}-title`}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="m-auto max-h-[min(640px,88dvh)] w-[calc(100%-32px)] max-w-[440px] overflow-hidden open:flex open:flex-col rounded-2xl border border-line-strong bg-surface p-0 text-text shadow-menu backdrop:bg-[var(--scrim)] max-md:mb-0 max-md:w-full max-md:max-w-none max-md:rounded-b-none"
    >
      <div className="flex flex-col gap-3.5 border-b border-line p-5 max-md:p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 id={`${searchId}-title`} className="font-display text-[20px] leading-6 font-extrabold tracking-[-0.03em]">
            {title}
          </h2>
          <IconButton label={t.prefs.close} size={32} onClick={onClose} className="rounded-[10px]">
            <X size={16} strokeWidth={2} aria-hidden="true" />
          </IconButton>
        </div>
        <label htmlFor={searchId} className="flex h-11 items-center gap-2.5 rounded-xl border border-line-strong bg-bg px-3.5 has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-cta has-[input:focus-visible]:outline-solid">
          <Search size={16} strokeWidth={2} className="flex-none text-text-3" aria-hidden="true" />
          <span className="sr-only">{s.search}</span>
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={s.search}
            autoComplete="off"
            spellCheck={false}
            className="h-full min-w-0 flex-auto bg-transparent text-[14px] text-text outline-none placeholder:text-text-3 max-md:text-[16px]"
          />
        </label>
        <div className="flex flex-wrap gap-1.5">
          {BASE_TOKENS[chain].map((token) => (
            <button key={token.address} type="button" onClick={() => onPick(token)} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-raised pr-3 pl-1 text-[12px] font-semibold hover:border-accent/45">
              <TokenArt src={token.icon ?? ""} label={token.symbol} size={22} className="size-[22px] rounded-full" />
              {token.symbol}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between px-5 pt-3 pb-1 text-[11px] text-text-3 max-md:px-4">
        <span>{fmt(s.tokensOn, { chain: CHAINS[chain].name })}</span>
      </div>
      <ul className="m-0 min-h-0 flex-1 list-none overflow-y-auto p-0 pb-2">
        {rows.map((row) => (
          <li key={row.address}>
            <button
              type="button"
              onClick={() => void choose(row)}
              disabled={busy !== null}
              className="flex w-full items-center gap-3 px-5 py-2.5 text-left hover:bg-raised disabled:cursor-wait max-md:px-4 focus-visible:[outline-offset:-2px]"
            >
              <TokenArt src={row.art} label={row.symbol} size={36} className="size-9 flex-none rounded-full object-cover" />
              <span className="flex min-w-0 flex-auto flex-col">
                <span className="truncate font-mono text-[13px] font-semibold">{row.symbol}</span>
                <span className="truncate text-[12px] text-text-3">{row.name}</span>
              </span>
              {busy === row.address ? <LoaderCircle size={16} strokeWidth={2} className="tk-spin flex-none text-text-3" aria-hidden="true" /> : null}
              {row.detail ? <span className="flex-none font-mono text-[11px] text-text-3">{row.detail}</span> : null}
            </button>
          </li>
        ))}
        {!rows.length ? <li className="px-5 py-8 text-center text-[13px] text-text-3">{s.noResults}</li> : null}
      </ul>
      <p role="status" className="m-0 border-t border-line px-5 py-3 text-[12px] text-text-3 empty:hidden max-md:px-4 max-md:pb-[calc(12px+env(safe-area-inset-bottom))]">
        {problem ?? ""}
      </p>
    </dialog>
  );
}

