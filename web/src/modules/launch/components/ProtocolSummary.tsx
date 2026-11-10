import { GraduationCap, Layers, LineChart, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { formatEth } from "@/shared/tonk/format";
import { Logo } from "@/modules/shell/components/Logo";
import type { StudioProps } from "./types";

function Fact({ icon, title, sub }: { icon: ReactNode; title: string; sub: string }) {
  return (
    <div className="flex min-w-0 gap-2.5">
      <span aria-hidden="true" className="mt-0.5 flex-none text-accent-text">
        {icon}
      </span>
      <div className="min-w-0">
        <strong className="block text-[12px] font-medium">{title}</strong>
        <small className="mt-0.5 block text-[11px] leading-[1.6] text-text-3">{sub}</small>
      </div>
    </div>
  );
}

/** What every native launch gets, with the launchpad's own figures: fee, pair, starting cap, launch-block tax and graduation. */
export function ProtocolSummary({ view, settings, unit, note }: Pick<StudioProps, "view" | "settings" | "unit"> & { note: string }) {
  const { t } = useI18n();
  const b = t.launch.basics;
  const eth = (wei: bigint) => `${formatEth(wei)} ${unit}`;
  return (
    <div className="mb-6 rounded-xl border border-line-strong bg-bg px-4 pt-4 [background-image:linear-gradient(115deg,rgb(var(--accent-rgb)/0.045),transparent_70%)]">
      <div className="flex items-center gap-3 border-b border-line pb-4">
        <span aria-hidden="true" className="flex h-[38px] w-[34px] flex-none items-center justify-center rounded-lg border border-accent/15 bg-accent/6">
          <Logo size={16} />
        </span>
        <div className="min-w-0 flex-auto">
          <strong className="block text-[14px] font-semibold">Tonkfun Native</strong>
          <small className="mt-0.5 block text-[11px] text-text-3">{b.nativeSub}</small>
        </div>
        <div className="flex-none text-right">
          <span className="block font-mono text-[14px] font-medium">{eth(settings.launchFee)}</span>
          <small className="mt-0.5 block text-[10px] text-text-3">{b.launchFee}</small>
        </div>
      </div>
      <div className="grid gap-x-3 gap-y-4 py-4 sm:grid-cols-2">
        <Fact icon={<Layers size={16} strokeWidth={1.8} />} title={b.pair} sub={b.pairSub} />
        <Fact icon={<LineChart size={16} strokeWidth={1.8} />} title={eth(view.startCap)} sub={fmt(b.startCapSub, { reserve: eth(settings.virtualEth) })} />
        <Fact icon={<ShieldCheck size={16} strokeWidth={1.8} />} title={b.tax} sub={b.taxSub} />
        <Fact icon={<GraduationCap size={16} strokeWidth={1.8} />} title={b.graduation} sub={fmt(b.graduationSub, { target: eth(view.target) })} />
      </div>
      <p className="-mx-4 m-0 border-t border-line px-4 py-2.5 text-[11px] text-text-3">{note}</p>
    </div>
  );
}
