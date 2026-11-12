import { Figures } from "./Figures";
import { DocsCard, type DocsMessages, Para, SubHeading } from "./ui";

/**
 * 3. The bonding curve: the price, the virtual reserves, the 800M / 200M
 * split, and graduation into the Uniswap v4 pool, with the launchpad's
 * live starting reserves, starting market cap and graduation point.
 */
export function CurveCard({ d }: { d: DocsMessages }) {
  const c = d.curve;
  return (
    <DocsCard id="curve" title={c.title}>
      <Para>{c.price}</Para>
      <Para>{c.reserves}</Para>
      <Para>{c.supply}</Para>
      <Figures keys={["reserves", "startCap", "graduation"]} source />
      <p className="m-0 mt-2 text-[11px] leading-4 text-text-3">{d.figures.newLaunches}</p>
      <SubHeading>{c.graduationTitle}</SubHeading>
      <Para>{c.graduation}</Para>
      <Para>{c.seed}</Para>
      <Para>{c.locked}</Para>
      <Para>{c.guard}</Para>
    </DocsCard>
  );
}
