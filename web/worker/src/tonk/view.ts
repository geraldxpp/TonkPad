import { TOTAL_SUPPLY } from "@/shared/tonk/curve";
import type { HolderLabel, TokenHolder, TopTrader, WalletTag } from "@/shared/types/token-detail";
import { balanceOf, countedHolders, DEAD, DUST, type SystemAddresses } from "./holders";
import type { TonkToken } from "./launch";
import { heldForCreator } from "./score";
import { tonkTraders } from "./traders";

/** Counted holders a launch's page lists, besides its labelled system rows. */
export const SHOWN_HOLDERS = 50;

const share = (wei: bigint) => Number((wei * BigInt(1_000_000)) / TOTAL_SUPPLY) / 1_000_000;
const whole = (wei: bigint) => Number(wei / BigInt(10) ** BigInt(12)) / 1_000_000;
const TAGS: Partial<Record<HolderLabel, WalletTag>> = { curve: "curve", locked: "devLock" };

/** A wallet's tag: smart money first, then the launch-block shield's snipers. */
function tagOf(token: TonkToken, wallet: string, isSmart: (wallet: string) => boolean): WalletTag | null {
  if (isSmart(wallet)) return "smart";
  return token.tonk.snipers?.includes(wallet) ? "sniper" : null;
}

/**
 * A launch's holders, largest first: its 50 largest counted holders, and the
 * system addresses labelled by role, uncounted. The launchpad's balance is
 * two rows: the creator's tokens it still holds ("Locked (creator)", not the
 * creator's wallet) and the rest, the curve's.
 */
export function tonkHolders(token: TonkToken, system: SystemAddresses, isSmart: (wallet: string) => boolean): TokenHolder[] {
  const s = token.tonk;
  const pad = balanceOf(s, system.launchpad);
  const forCreator = heldForCreator(s) < pad ? heldForCreator(s) : pad;
  const roles: Array<[HolderLabel, string, bigint]> = [
    ["curve", system.launchpad, pad - forCreator],
    ["locked", system.launchpad, forCreator],
    ["pool", system.poolManager, balanceOf(s, system.poolManager)],
    ["migrator", system.migrator, balanceOf(s, system.migrator)],
    ["burned", DEAD, balanceOf(s, DEAD)],
  ];
  const rows: Array<{ row: TokenHolder; wei: bigint }> = roles
    .filter(([, , amount]) => amount >= DUST)
    .map(([label, address, amount]) => ({ row: { address, label, tag: TAGS[label] ?? null, share: share(amount), tokens: whole(amount), crewEarned: null }, wei: amount }));
  for (const [address, amount] of countedHolders(s, system).slice(0, SHOWN_HOLDERS)) {
    rows.push({ row: { address, tag: tagOf(token, address, isSmart), share: share(amount), tokens: whole(amount), crewEarned: null }, wei: amount });
  }
  return rows.sort((a, b) => (b.wei > a.wei ? 1 : b.wei < a.wei ? -1 : 0)).map(({ row }) => row);
}

/** The launch's top traders in dollars at the ETH price now (none without one), with what each still holds. */
export function tonkTraderRows(token: TonkToken, ethUsd: number | null, isSmart: (wallet: string) => boolean): TopTrader[] {
  if (ethUsd === null) return [];
  return tonkTraders(token.tonk).map((trader) => ({
    address: trader.wallet,
    tag: tagOf(token, trader.wallet, isSmart),
    pnlUsd: trader.realised * ethUsd,
    boughtUsd: trader.bought * ethUsd,
    soldUsd: trader.sold * ethUsd,
    winRate: trader.winRate,
    held: whole(balanceOf(token.tonk, trader.wallet)),
  }));
}
