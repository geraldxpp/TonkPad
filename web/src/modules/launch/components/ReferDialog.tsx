"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { referralLink } from "@/shared/tonk/referral";
import { Sheet } from "@/shared/ui/Sheet";

interface ReferDialogProps {
  open: boolean;
  onClose: () => void;
  /** The connected Robinhood Chain wallet, whose link this is. */
  owner: string | null;
}

/** "Refer a trader. Share the fee.": what the 25% is 25% of, an example, and the connected wallet's link. */
export function ReferDialog({ open, onClose, owner }: ReferDialogProps) {
  const { t, href } = useI18n();
  const f = t.launch.refer;
  const [copied, setCopied] = useState(false);
  const link = owner && typeof window !== "undefined" ? referralLink(window.location.origin, href("/"), owner) : null;
  const copy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link).catch(() => undefined);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2_000);
  };
  return (
    <Sheet open={open} onClose={onClose} title={f.title}>
      <p className="m-0 font-mono text-[56px] leading-none font-medium tracking-[-0.06em] text-gold">
        25<span className="ml-0.5 text-[28px]">%</span>
      </p>
      <p className="m-0 text-[13px] leading-[1.7] text-text-2">
        <strong className="font-semibold text-text">{f.earn}</strong> {f.body}
      </p>
      <dl className="m-0 grid grid-cols-[1fr_auto] gap-x-4 gap-y-3 rounded-xl border border-line bg-bg p-4 text-[13px]">
        <dt className="text-text-3">{f.example}</dt>
        <dd className="m-0 font-mono">1 ETH</dd>
        <dt className="text-text-3">{f.protocolFee}</dt>
        <dd className="m-0 font-mono">0.01 ETH</dd>
        <dt className="text-text-3">{f.yourShare}</dt>
        <dd className="m-0 font-mono text-gold">0.0025 ETH</dd>
      </dl>
      <p className="m-0 text-[11px] leading-[1.8] text-text-3">{f.rules}</p>
      {link ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="launch-refer-link" className="text-[12px] font-medium text-text-2">
            {f.link}
          </label>
          <div className="flex gap-2">
            <input id="launch-refer-link" readOnly value={link} onFocus={(event) => event.target.select()} className="min-w-0 flex-auto rounded-lg border border-line-strong bg-bg px-3 py-2.5 font-mono text-[12px] text-text-2" />
            <button type="button" onClick={() => void copy()} className="inline-flex min-h-11 flex-none items-center gap-1.5 rounded-lg border border-line-strong bg-raised px-3 text-[13px] font-semibold hover:bg-input">
              {copied ? <Check size={14} strokeWidth={2.4} aria-hidden="true" /> : <Copy size={14} strokeWidth={2} aria-hidden="true" />}
              <span aria-live="polite">{copied ? t.token.shared : f.copy}</span>
            </button>
          </div>
        </div>
      ) : (
        <p className="m-0 rounded-lg bg-raised p-3 text-[12px] text-text-2">{f.connect}</p>
      )}
      <p className="m-0 text-[11px] text-text-3">{f.soon}</p>
      <button type="button" onClick={onClose} className="min-h-11 rounded-lg border border-line-strong bg-raised px-4 text-[13px] font-semibold hover:bg-input">
        {f.gotIt}
      </button>
    </Sheet>
  );
}
