"use client";

import { Bot, GraduationCap, ShieldCheck } from "lucide-react";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { Tag } from "../TokenHeader";

/**
 * The header's marks that only a mission read from the chain can claim: an
 * agent brief is stored, the launch-block shield every tonkfun.fun launch
 * has, and Graduated once the curve is complete.
 */
export function MissionTags({ agent, graduated }: { agent: boolean; graduated: boolean }) {
  const { t } = useI18n();
  return (
    <>
      {agent ? (
        <Tag tone="bg-agent/10 text-agent">
          <Bot size={11} strokeWidth={2.2} aria-hidden="true" />
          {t.badges.agent}
        </Tag>
      ) : null}
      <Tag tone="bg-accent/10 text-accent-text" title={t.launch.preview.shieldTitle}>
        <ShieldCheck size={11} strokeWidth={2.4} aria-hidden="true" />
        {t.launch.preview.shield}
      </Tag>
      {graduated ? (
        <Tag tone="bg-gold/10 text-gold">
          <GraduationCap size={11} strokeWidth={2.2} aria-hidden="true" />
          {t.badges.graduated}
        </Tag>
      ) : null}
    </>
  );
}
