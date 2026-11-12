import type { TonkEvent } from "./events";
import { systemRole, type SystemAddresses } from "./holders";

type Transfer = Extract<TonkEvent, { kind: "transfer" }>;

/**
 * Who really bought or sold in a transaction: each wallet's net move of the
 * token in it, from the token's own Transfers, system addresses left out. A
 * curve trade names its sender and a pool swap its router; when that address
 * didn't move the trade's way (a router passing tokens on), the wallet that
 * moved the most that way is the trader.
 */
export class TxMoves {
  private readonly moves = new Map<string, Map<string, bigint>>();

  constructor(transfers: readonly Transfer[], system: SystemAddresses) {
    for (const t of transfers) {
      const key = `${t.tx}:${t.token}`;
      const moves = this.moves.get(key) ?? new Map<string, bigint>();
      if (systemRole(t.from, system) === null) moves.set(t.from, (moves.get(t.from) ?? BigInt(0)) - t.value);
      if (systemRole(t.to, system) === null) moves.set(t.to, (moves.get(t.to) ?? BigInt(0)) + t.value);
      this.moves.set(key, moves);
    }
  }

  walletOf(tx: string, token: string, buy: boolean, named: string): string {
    const moves = this.moves.get(`${tx}:${token}`);
    if (!moves) return named;
    const right = (value: bigint) => (buy ? value > BigInt(0) : value < BigInt(0));
    if (right(moves.get(named) ?? BigInt(0))) return named;
    let best: string | null = null;
    let size = BigInt(0);
    for (const [wallet, value] of moves) {
      const amount = value < BigInt(0) ? -value : value;
      if (right(value) && amount > size) [best, size] = [wallet, amount];
    }
    return best ?? named;
  }
}

/** The launch-block tax a buy paid, by transaction, token and buyer: part of what the buyer put in. */
export function taxesOf(events: readonly TonkEvent[]): (tx: string, token: string, buyer: string) => bigint {
  const taxes = new Map<string, bigint>();
  for (const e of events) if (e.kind === "bundleTax") taxes.set(`${e.tx}:${e.token}:${e.sniper}`, (taxes.get(`${e.tx}:${e.token}:${e.sniper}`) ?? BigInt(0)) + e.penalty);
  return (tx, token, buyer) => taxes.get(`${tx}:${token}:${buyer}`) ?? BigInt(0);
}
