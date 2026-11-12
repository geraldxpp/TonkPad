import Link from "next/link";
import { BetaNotice } from "@/shared/ui/BetaNotice";
import type { DocsContract } from "../lib/contracts";
import { ContractList } from "./ContractList";
import { Figures } from "./Figures";
import { DocsCard, type DocsMessages, type Href, Para, SubHeading } from "./ui";

interface SafetyCardProps {
  d: DocsMessages;
  href: Href;
  contracts: readonly DocsContract[];
  inviteOnly: boolean;
}

/**
 * 9. Safety: no outside audit (the beta notice), the starting limits, what
 * the Safe account that owns the contracts can and can't do, the pause
 * that never stops selling, and the contracts on Blockscout.
 */
export function SafetyCard({ d, href, contracts, inviteOnly }: SafetyCardProps) {
  const s = d.safety;
  return (
    <DocsCard id="safety" title={s.title}>
      {/* The launchpad has had internal reviews only (LAUNCHPAD_AUDITED is false); an outside audit means rewording this. */}
      <BetaNotice text={s.beta} className="mt-3" />
      <Para>
        <Link href={href("/security")} className="rounded font-medium text-accent-text hover:underline">
          {s.security}
        </Link>
      </Para>
      <SubHeading>{s.limitsTitle}</SubHeading>
      <Para>{s.limits}</Para>
      <Figures keys={["reserveNow", "maxCurve"]} />
      {inviteOnly ? <Para>{s.invite}</Para> : null}
      <SubHeading>{s.ownerTitle}</SubHeading>
      <Para>{s.owner}</Para>
      <Para>{s.cannot}</Para>
      <SubHeading>{s.pauseTitle}</SubHeading>
      <Para>{s.pause}</Para>
      <Figures keys={["status"]} source />
      <SubHeading>{s.contractsTitle}</SubHeading>
      <Para>{s.contracts}</Para>
      <ContractList d={d} contracts={contracts} />
    </DocsCard>
  );
}
