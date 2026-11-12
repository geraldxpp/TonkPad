"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { Sheet } from "@/shared/ui/Sheet";
import { Tabs } from "@/shared/ui/Tabs";
import { markAllRead, useAlertFeed, useAlertRules } from "../hooks";
import { alertsOn } from "../mode";
import { FeedList } from "./FeedList";
import { RulesPanel } from "./RulesPanel";

type PanelTab = "feed" | "rules";

/** A side sheet on desktop (the shared Sheet is a bottom sheet on phones). */
const SIDE = "md:my-0 md:mr-0 md:ml-auto md:h-dvh md:max-h-dvh md:max-w-[420px] md:rounded-none md:rounded-l-2xl";
const COUNT = "rounded border border-line bg-raised px-[5px] py-0.5 font-mono text-[10px] text-text-3";

interface AlertsPanelProps {
  open: boolean;
  onClose: () => void;
  /** False while live prices can't be read. */
  available: boolean;
}

/** The Alerts panel: what fired (Feed) and the visitor's rules (My alerts). Opening it marks the feed read. */
export function AlertsPanel({ open, onClose, available }: AlertsPanelProps) {
  const { t } = useI18n();
  const a = t.alerts;
  const [tab, setTab] = useState<PanelTab>("feed");
  const feed = useAlertFeed();
  const rules = useAlertRules();
  useEffect(() => {
    if (open) markAllRead();
  }, [open, feed]);
  return (
    <Sheet open={open} onClose={onClose} title={a.title} subtitle={alertsOn() ? a.subtitle : undefined} className={SIDE}>
      {alertsOn() ? (
        <>
          {available ? null : (
            <p role="status" className="m-0 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-[12px] text-warn">
              {a.unavailable}
            </p>
          )}
          <Tabs
            size="underline"
            label={a.tabs}
            panelId="alerts-panel"
            idPrefix="alerts-tab"
            value={tab}
            onChange={setTab}
            tabs={[
              { id: "feed", label: a.feed },
              { id: "rules", label: a.rules, trailing: rules.length > 0 ? <span className={COUNT}>{rules.length}</span> : undefined },
            ]}
          />
          <div id="alerts-panel" role="tabpanel" aria-labelledby={`alerts-tab-${tab}`}>
            {tab === "feed" ? <FeedList feed={feed} onNavigate={onClose} /> : <RulesPanel rules={rules} onNavigate={onClose} />}
          </div>
        </>
      ) : (
        <p className="m-0 py-6 text-center text-[13px] text-text-3">{a.testnet}</p>
      )}
    </Sheet>
  );
}
