import { Figures } from "./Figures";
import { DocsCard, type DocsMessages, DotList, Para, SubHeading } from "./ui";

/**
 * 4. Fees: the launch fee (live), the 1% protocol fee with Crew and Creator
 * Rewards on every curve trade and their caps and tiers, referrals, the
 * graduation fee, and the pool's fee with Share pool fees.
 */
export function FeesCard({ d }: { d: DocsMessages }) {
  const f = d.fees;
  return (
    <DocsCard id="fees" title={f.title}>
      <Para>{f.launchFee}</Para>
      <Figures keys={["fee"]} source />
      <SubHeading>{f.tradeTitle}</SubHeading>
      <Para>{f.trade}</Para>
      <Para>{f.cap}</Para>
      <SubHeading>{f.tiersTitle}</SubHeading>
      <DotList items={[f.tierNone, f.tierStandard, f.tierIronclad]} />
      <Para>{f.tierFloor}</Para>
      <Para>{f.crewFloor}</Para>
      <SubHeading>{f.referralTitle}</SubHeading>
      <Para>{f.referral}</Para>
      <SubHeading>{f.graduationTitle}</SubHeading>
      <Para>{f.graduation}</Para>
      <SubHeading>{f.poolTitle}</SubHeading>
      <Para>{f.pool}</Para>
      <Para>{f.share}</Para>
    </DocsCard>
  );
}
