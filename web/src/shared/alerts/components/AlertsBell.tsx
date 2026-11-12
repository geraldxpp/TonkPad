"use client";

import { Bell } from "lucide-react";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { IconButton } from "@/shared/ui/IconButton";
import { useUnreadAlerts } from "../hooks";
import { setAlertsPanel, useAlertsPanel } from "../panel";

/** The top bar's bell: opens the Alerts panel; its dot shows only while alerts are unread. */
export function AlertsBell({ className }: { className?: string }) {
  const { t } = useI18n();
  const unread = useUnreadAlerts();
  const open = useAlertsPanel();
  return (
    <IconButton
      label={unread > 0 ? fmt(t.nav.alertsNew, { count: unread }) : t.header.alerts}
      size={40}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={() => setAlertsPanel(true)}
      className={className}
    >
      <Bell size={18} strokeWidth={1.8} className="max-md:size-4" aria-hidden="true" />
      {unread > 0 ? (
        <span aria-hidden="true" className="absolute top-[9px] right-[9px] size-1.5 rounded-full bg-accent shadow-[0_0_0_2px_var(--bg)] max-md:top-[6px] max-md:right-[6px]" />
      ) : null}
    </IconButton>
  );
}
