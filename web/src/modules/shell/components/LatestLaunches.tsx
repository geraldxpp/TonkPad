import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { fmt } from "@/shared/i18n/config";
import { getI18n } from "@/shared/i18n/server";
import { shortAddress } from "@/shared/lib/address";
import { formatAge } from "@/shared/lib/format";
import type { MissionSummaryJson } from "@/shared/tonk/mission";
import { type TonkNetwork, tonkNetwork } from "@/shared/tonk/networks";
import { readLatestMissions } from "@/shared/tonk/server/mission";
import { TokenArt } from "@/shared/ui/TokenArt";

/** The launches and the moment they were read, in unix seconds, for their ages. */
async function load(network: TonkNetwork): Promise<{ missions: MissionSummaryJson[] | null; now: number }> {
  const missions = await readLatestMissions(network).catch(() => null);
  return { missions, now: Date.now() / 1000 };
}

/**
 * The launchpad's newest launches, read from its own MissionLaunched events
 * at request time: name, ticker and age, each opening the token's page. When
 * the chain can't be read it says so; it never falls back to made-up tokens.
 */
export async function LatestLaunches() {
  const { t, href } = await getI18n();
  const f = t.mission.find;
  const network = tonkNetwork();
  if (!network) return null;
  // Read per request, never while the page is prerendered.
  await connection();
  const { missions, now } = await load(network);
  if (!missions) return <p className="m-0 text-[13px] text-text-3">{f.unavailable}</p>;
  if (missions.length === 0) return <p className="m-0 text-[13px] text-text-3">{f.empty}</p>;
  return (
    <ul className="m-0 flex list-none flex-col p-0">
      {missions.map((mission) => (
        <li key={mission.token} className="border-t border-line first:border-t-0">
          <Link href={href(`/token/${mission.token}`)} className="-mx-2 flex min-w-0 items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-raised">
            <span className="flex size-9 flex-none overflow-hidden rounded-[10px]">
              <TokenArt src={mission.image} label={mission.symbol} size={36} brand className="size-full object-cover" />
            </span>
            <span className="flex min-w-0 flex-auto flex-col gap-0.5">
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="min-w-0 truncate text-[14px] font-semibold">{mission.name}</span>
                <span className="flex-none font-mono text-[11px] font-semibold text-text-3">{mission.symbol}</span>
              </span>
              <span className="font-mono text-[11px] text-text-3">{shortAddress(mission.token)}</span>
            </span>
            <span className="flex-none text-[12px] text-text-3">{fmt(t.token.trades.ago, { time: formatAge(Math.max(0, now - mission.time) / 60, t.token.trades.units) })}</span>
            <ArrowUpRight size={15} strokeWidth={2} className="flex-none text-text-3" aria-hidden="true" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
