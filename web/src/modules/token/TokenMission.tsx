"use client";

import { useI18n } from "@/shared/i18n/I18nProvider";
import type { TonkNetwork } from "@/shared/tonk/networks";
import { type MissionLoad, useMissionPage } from "./hooks/useMissionPage";
import { MissionView } from "./MissionView";

interface TokenMissionProps {
  address: string;
  network: TonkNetwork;
  /** The server's first read of the chain. */
  initial: MissionLoad;
}

/** A separate keyed session, so one token's figures or a trade in flight never carry over to another address. */
export function TokenMission(props: TokenMissionProps) {
  return <TokenMissionSession key={props.address} {...props} />;
}

/**
 * The testnet site's token page: a mission of tonkfun.fun's launchpad, read
 * from the chain and kept fresh. An address the launchpad doesn't know is
 * "not found"; an unreachable chain keeps the last figures and says so.
 */
function TokenMissionSession({ address, network, initial }: TokenMissionProps) {
  const { t } = useI18n();
  const { page, status, refresh, onMission } = useMissionPage(address, initial);
  if (!page) {
    return (
      <section role="status" className="flex min-h-[40vh] flex-col items-center justify-center gap-3 rounded-3xl border border-line bg-surface p-6 text-center">
        <h1 className="font-display text-2xl font-bold">{t.meta.token}</h1>
        <p className="m-0 max-w-[420px] text-sm text-text-2">{status === "not-found" ? t.mission.notFound : t.mission.failed}</p>
      </section>
    );
  }
  return (
    <>
      {status === "unavailable" ? (
        <p role="status" className="mb-4 rounded-xl border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-warn">
          {t.mission.stale}
        </p>
      ) : null}
      <MissionView page={page} network={network} onMission={onMission} onRefresh={refresh} />
    </>
  );
}
