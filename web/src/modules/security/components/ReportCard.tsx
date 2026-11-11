import { ArrowUpRight } from "lucide-react";
import type { SecurityContact } from "../lib/contact";
import { DotList, SecurityCard, type SecurityMessages, SubHeading } from "./SecurityCard";

interface ReportCardProps {
  s: SecurityMessages;
  contact: SecurityContact | null;
}

/** 1. How to report: privately and first, to the security contact ("Coming soon" until one is set), what to include, and when we reply. */
export function ReportCard({ s, contact }: ReportCardProps) {
  const r = s.report;
  return (
    <SecurityCard id="security-report" title={r.title}>
      <p className="m-0 mt-2 text-[13px] leading-5 text-text-2">{r.privately}</p>
      <div className="mt-4 rounded-xl border border-accent/30 bg-accent/6 px-4 py-3.5">
        <span className="block text-[11px] font-medium tracking-[0.2px] text-text-3">{r.contact}</span>
        {contact ? (
          <a
            href={contact.href}
            {...(contact.kind === "link" ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            className="mt-1 inline-flex max-w-full items-center gap-1.5 rounded text-[15px] font-semibold text-accent-text hover:underline"
          >
            <span className="min-w-0 [overflow-wrap:anywhere]">{contact.text}</span>
            {contact.kind === "link" ? <ArrowUpRight size={14} strokeWidth={2} aria-hidden="true" className="flex-none" /> : null}
          </a>
        ) : (
          <span className="mt-1 block text-[15px] font-semibold">{r.comingSoon}</span>
        )}
      </div>
      <SubHeading>{r.includeTitle}</SubHeading>
      <DotList items={[r.location, r.impact, r.steps, r.you]} />
      <SubHeading>{r.expectTitle}</SubHeading>
      <p className="m-0 mt-1.5 text-[13px] leading-5 text-text-2">{r.expect}</p>
    </SecurityCard>
  );
}
