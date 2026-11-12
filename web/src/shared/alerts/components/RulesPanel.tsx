"use client";

import { Bell, BellOff, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import { IconButton } from "@/shared/ui/IconButton";
import { ruleText } from "../describe";
import { removeRule, setRuleOn, updateSettings, useAlertSettings } from "../hooks";
import { launchpadAlerts } from "../mode";
import type { AlertRule, AlertSettings } from "../types";
import { Toggle } from "./Toggle";

const ROW = "flex items-center gap-3 py-2";

function SettingRow({ label, on, onChange }: { label: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <div className={ROW}>
      <Toggle on={on} onChange={onChange} label={label} />
      <span className="min-w-0 flex-1 text-[13px] text-text-2">{label}</span>
    </div>
  );
}

/** Browser notifications: switching on asks the browser's permission then, never on page load. */
function NotifyRow({ settings }: { settings: AlertSettings }) {
  const { t } = useI18n();
  const a = t.alerts;
  const [blocked, setBlocked] = useState(false);
  const supported = typeof window !== "undefined" && "Notification" in window;
  const turn = async (on: boolean) => {
    if (!on || !supported) return updateSettings({ notify: false });
    const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
    setBlocked(permission === "denied");
    updateSettings({ notify: permission === "granted" });
  };
  return (
    <div className="flex flex-col gap-1">
      <SettingRow label={a.notify} on={settings.notify} onChange={(on) => void turn(on)} />
      <p className="m-0 text-[12px] text-text-3">{a.notifyHint}</p>
      {blocked ? <p role="status" className="m-0 text-[12px] text-warn">{a.notifyBlocked}</p> : null}
    </div>
  );
}

/** The visitor's rules (each with a switch and Delete), tonkfun.fun's launchpad switches, and notifications. */
export function RulesPanel({ rules, onNavigate }: { rules: readonly AlertRule[]; onNavigate: () => void }) {
  const { t, href } = useI18n();
  const a = t.alerts;
  const settings = useAlertSettings();
  return (
    <div className="flex flex-col gap-5">
      {rules.length === 0 ? (
        <p className="m-0 py-4 text-center text-[13px] text-text-3">{a.emptyRules}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col divide-y divide-line p-0">
          {rules.map((rule) => {
            const symbol = rule.token.symbol || rule.token.name;
            const text = ruleText(a, rule);
            const Icon = rule.on ? Bell : BellOff;
            return (
              <li key={rule.id} className={ROW}>
                <Toggle on={rule.on} onChange={(on) => setRuleOn(rule.id, on)} label={fmt(a.ruleSwitch, { symbol, rule: text })} />
                <Link
                  href={href(`/token/${encodeURIComponent(rule.token.address)}`)}
                  onClick={onNavigate}
                  className={cn("flex min-w-0 flex-1 items-center gap-2 rounded-md text-[13px] hover:text-text", rule.on ? "text-text" : "text-text-3")}
                >
                  <Icon size={14} strokeWidth={1.9} className="flex-none" aria-hidden="true" />
                  <span className="flex-none font-mono font-semibold">{symbol}</span>
                  <span className="min-w-0 truncate text-text-2">{text}</span>
                </Link>
                <IconButton label={fmt(a.delete, { rule: `${symbol} ${text}` })} size={32} onClick={() => removeRule(rule.id)} className="flex-none rounded-[10px]">
                  <X size={14} strokeWidth={2} aria-hidden="true" />
                </IconButton>
              </li>
            );
          })}
        </ul>
      )}
      {launchpadAlerts() ? (
        <section aria-labelledby="alerts-launchpad" className="flex flex-col gap-1 border-t border-line pt-4">
          <h3 id="alerts-launchpad" className="m-0 text-[12px] font-semibold tracking-[0.04em] text-text-3 uppercase">{a.launchpad}</h3>
          <SettingRow label={a.launches} on={settings.launches} onChange={(on) => updateSettings({ launches: on })} />
          <SettingRow label={a.graduations} on={settings.graduations} onChange={(on) => updateSettings({ graduations: on })} />
          <SettingRow label={a.locks} on={settings.locks} onChange={(on) => updateSettings({ locks: on })} />
          <p className="m-0 text-[12px] text-text-3">{a.watchHint}</p>
        </section>
      ) : null}
      <section className="border-t border-line pt-4">
        <NotifyRow settings={settings} />
      </section>
    </div>
  );
}
