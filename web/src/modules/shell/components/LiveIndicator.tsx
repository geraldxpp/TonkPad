"use client";

import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import { useShellLive } from "../live/ShellLive";

/** The status bar's Live dot. While live updates fail it stops pulsing and says it is reconnecting. */
export function LiveIndicator() {
  const { t } = useI18n();
  const { failed } = useShellLive();
  return (
    <span role="status" className={cn("inline-flex items-center gap-1.5 font-semibold", failed ? "text-warn" : "text-pos")}>
      <span aria-hidden="true" className={cn("size-2 rounded-full", failed ? "bg-warn" : "tk-pulse bg-pos")} />
      {failed ? t.status.reconnecting : t.status.live}
    </span>
  );
}
