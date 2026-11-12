"use client";

import { BellRing } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { feedText } from "../describe";
import { alertsOn, launchpadAlerts } from "../mode";
import { setAlertsPanel, useAlertsPanel } from "../panel";
import { readSettings } from "../storage";
import type { FeedItem } from "../types";
import { useAlertsEngine } from "../useAlertsEngine";
import { AlertsPanel } from "./AlertsPanel";

const TOAST_MS = 6_000;

/**
 * Mounted once in the app shell: runs the checks, holds the Alerts panel and
 * shows what fires as a toast (and, if the visitor turned them on, as a
 * browser notification).
 */
export function AlertsHost() {
  const { t, href } = useI18n();
  const open = useAlertsPanel();
  const [available, setAvailable] = useState(true);
  const [toast, setToast] = useState<FeedItem | null>(null);
  const tokenHref = useCallback((item: FeedItem) => href(`/token/${encodeURIComponent(item.token.address)}`), [href]);

  const onFired = useCallback(
    (items: FeedItem[]) => {
      setToast(items[0]);
      if (!readSettings().notify || !("Notification" in window) || Notification.permission !== "granted") return;
      for (const item of items.slice(0, 3)) {
        const note = new Notification("tonkfun.fun", { body: feedText(t.alerts, item), tag: item.id, icon: "/icon.png" });
        note.onclick = () => {
          window.focus();
          window.location.assign(tokenHref(item));
          note.close();
        };
      }
    },
    [t, tokenHref],
  );
  useAlertsEngine({ enabled: alertsOn(), launchpad: launchpadAlerts(), onFired, onStatus: setAvailable });

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <>
      <AlertsPanel open={open} onClose={() => setAlertsPanel(false)} available={available} />
      <div
        role="status"
        aria-label={t.alerts.toast}
        className="pointer-events-none fixed right-4 bottom-12 z-50 flex max-w-[360px] justify-end max-md:right-3 max-md:bottom-[calc(84px+env(safe-area-inset-bottom))] max-md:left-3 max-md:max-w-none"
      >
        {toast ? (
          <Link
            href={tokenHref(toast)}
            onClick={() => setToast(null)}
            className="pointer-events-auto flex items-start gap-2.5 rounded-xl border border-line-strong bg-surface px-3.5 py-3 text-[13px] leading-5 text-text shadow-menu"
          >
            <BellRing size={16} strokeWidth={1.9} className="mt-0.5 flex-none text-accent-text" aria-hidden="true" />
            <span className="min-w-0 break-words">{feedText(t.alerts, toast)}</span>
          </Link>
        ) : null}
      </div>
    </>
  );
}
