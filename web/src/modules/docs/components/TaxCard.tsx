import { Badge } from "@/shared/ui/Badge";
import { DocsCard, type DocsMessages, Para } from "./ui";

/** 7. The launch-block tax: 99% on buys in the launch block and the next one, burned; the launch's own dev buy is exempt. */
export function TaxCard({ d }: { d: DocsMessages }) {
  const x = d.tax;
  return (
    <DocsCard id="tax" title={x.title}>
      <div className="mt-3">
        <Badge kind="shield" />
      </div>
      <Para>{x.body}</Para>
      <Para>{x.burn}</Para>
      <Para>{x.why}</Para>
      <Para>{x.wait}</Para>
    </DocsCard>
  );
}
