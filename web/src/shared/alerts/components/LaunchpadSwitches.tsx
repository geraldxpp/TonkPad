"use client";

import { LAUNCHPADS } from "@/shared/config/launchpads";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { ALERT_LAUNCHPADS } from "@/shared/types/live";
import { PadMark } from "@/shared/ui/PadMark";
import { setPadSwitch, updateSettings } from "../hooks";
import { launchpadAlerts } from "../mode";
import type { AlertSettings } from "../types";
import { ToggleRow } from "./Toggle";

const HEADING = "m-0 text-[12px] font-semibold tracking-[0.04em] text-text-3 uppercase";

/**
 * Watched tokens' switches, then one block per launchpad the worker follows:
 * graduations and hot launches on each, plus every new launch on tonkfun.fun
 * (busier launchpads launch several tokens a minute, so they don't offer it).
 */
export function LaunchpadSwitches({ settings }: { settings: AlertSettings }) {
  const { t } = useI18n();
  const a = t.alerts;
  const tonk = launchpadAlerts();
  const pads = ALERT_LAUNCHPADS.filter((pad) => pad !== "tonk" || tonk);
  return (
    <>
      <section aria-labelledby="alerts-watching" className="flex flex-col gap-0.5 border-t border-line pt-4">
        <h3 id="alerts-watching" className={HEADING}>{a.watching}</h3>
        <ToggleRow label={a.graduations} on={settings.graduations} onChange={(on) => updateSettings({ graduations: on })} />
        {tonk ? <ToggleRow label={a.locks} on={settings.locks} onChange={(on) => updateSettings({ locks: on })} /> : null}
        <p className="m-0 text-[12px] text-text-3">{a.watchHint}</p>
      </section>
      <section aria-labelledby="alerts-launchpads" className="flex flex-col gap-3 border-t border-line pt-4">
        <h3 id="alerts-launchpads" className={HEADING}>{a.launchpads}</h3>
        {pads.map((pad) => {
          const name = LAUNCHPADS[pad].name;
          const label = (what: string) => fmt(a.padSwitch, { pad: name, what });
          return (
            <div key={pad} role="group" aria-label={name} className="flex flex-col rounded-xl border border-line px-3 py-1.5">
              <div className="flex items-center gap-2 pt-1.5 pb-0.5">
                <PadMark pad={pad} size={16} decorative />
                <span className="text-[13px] font-semibold text-text">{name}</span>
              </div>
              {pad === "tonk" ? <ToggleRow label={label(a.launches)} text={a.launches} on={settings.launches} onChange={(on) => updateSettings({ launches: on })} /> : null}
              <ToggleRow label={label(a.padGraduations)} text={a.padGraduations} on={settings.pads[pad].graduations} onChange={(on) => setPadSwitch(pad, "graduations", on)} />
              <ToggleRow label={label(a.padHot)} text={a.padHot} on={settings.pads[pad].hot} onChange={(on) => setPadSwitch(pad, "hot", on)} />
            </div>
          );
        })}
        <p className="m-0 text-[12px] text-text-3">{a.hotHint}</p>
      </section>
    </>
  );
}
