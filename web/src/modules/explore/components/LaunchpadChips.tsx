import { LAUNCHPADS } from "@/shared/config/launchpads";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
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

/** Launchpad filters, a strip under the list tabs. They wrap on desktop and become one swipeable row on phones. */
export function LaunchpadChips({ launchpads, more, active, onPick }: LaunchpadChipsProps) {
  const { t } = useI18n();
  return (
    <div
      role="group"
      aria-label={t.toolbar.launchpads}
      className="flex min-w-0 flex-wrap items-center gap-1.5 border-b border-line bg-bg/25 px-4 py-3 max-md:flex-nowrap max-md:overflow-x-auto max-md:px-3 max-md:[scrollbar-width:none] max-md:[&::-webkit-scrollbar]:hidden"
    >
      {launchpads.map(({ id, count }) => (
        <Chip
          key={id}
          label={id === "all" ? t.toolbar.allLaunchpads : LAUNCHPADS[id].name}
          count={formatInteger(count)}
          mark={id === "all" ? undefined : <PadMark pad={id} decorative />}
          active={active === id}
          onClick={onPick ? () => onPick(id) : undefined}
        />
      ))}
      {more > 0 ? (
        <span className="flex-none text-[12px] whitespace-nowrap text-text-3">{fmt(t.toolbar.more, { count: more })}</span>
      ) : null}
    </div>
  );
}
