import { LAUNCHPADS } from "@/shared/config/launchpads";
import { formatInteger } from "@/shared/lib/format";
import { Chip } from "@/shared/ui/Chip";
import { PadMark } from "@/shared/ui/PadMark";
import type { ExploreData } from "../data/get-explore-data";
import type { ExploreView } from "../lib/view";

interface LaunchpadChipsProps {
  launchpads: ExploreData["launchpads"];
  more: number;
  active: ExploreView["pad"];
  onPick?: (pad: ExploreView["pad"]) => void;
}

export function LaunchpadChips({ launchpads, more, active, onPick }: LaunchpadChipsProps) {
  return (
    <div role="group" aria-label="Launchpads" className="flex flex-wrap items-center gap-2">
      {launchpads.map(({ id, count }) => (
        <Chip
          key={id}
          label={id === "all" ? "All launchpads" : LAUNCHPADS[id].name}
          count={formatInteger(count)}
          mark={id === "all" ? undefined : <PadMark pad={id} decorative />}
          active={active === id}
          onClick={onPick ? () => onPick(id) : undefined}
        />
      ))}
      <span className="text-[12px] text-text-3">+{more} more</span>
    </div>
  );
}
