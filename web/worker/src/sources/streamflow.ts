import { base58Encode } from "../solana";
import { heliusRpc } from "./holders";

/**
 * Streamflow, the lock program Solana creators use (strmRq…Kg5m, confirmed by
 * three sources). A lock's tokens sit in an escrow token account that owns
 * itself; its terms sit in a 1104-byte record that names the escrow at byte
 * 209. Offsets follow Streamflow's JS SDK (packages/stream/solana/layout.ts)
 * and were checked against real records (worker/tests/fixtures/streamflow.json).
 */
export const STREAMFLOW = "strmRqUCoQUgGUan5YhzUZa6KqdzwX5L6FpUxfmKg5m";
const RECORD_SIZE = 1104;
const ESCROW_AT = 209;
/** getProgramAccounts costs 10 Helius credits. */
export const LOOKUP_CREDITS = 10;

export interface StreamLock {
  escrow: string;
  /** Who locked the tokens (the creator, for a creator lock). */
  sender: string;
  recipient: string;
  mint: string;
  /** Unix seconds. */
  start: number;
  cliff: number;
  end: number;
  canceledAt: number;
  /** Raw token units. */
  deposited: number;
  cliffAmount: number;
  perPeriod: number;
  /** Seconds between releases after the cliff. */
  period: number;
  /** Nobody can cancel it or speed it up, and it is still open. */
  firm: boolean;
}

export function parseStreamLock(data: Uint8Array): StreamLock | null {
  if (data.length < 672) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const u64 = (at: number) => Number(view.getBigUint64(at, true));
  const key = (at: number) => base58Encode(data.subarray(at, at + 32));
  const on = (at: number) => data[at] !== 0;
  const canceledAt = u64(25);
  return {
    escrow: key(ESCROW_AT),
    sender: key(49),
    recipient: key(113),
    mint: key(177),
    start: u64(409),
    cliff: u64(441),
    end: u64(33),
    canceledAt,
    deposited: u64(417),
    cliffAmount: u64(449),
    perPeriod: u64(433),
    period: u64(425),
    // cancelable_by_sender, cancelable_by_recipient, can_update_rate, closed
    firm: !on(457) && !on(458) && !on(540) && !on(671) && canceledAt === 0,
  };
}

/** The lock whose escrow is `escrow`, or null when Streamflow doesn't hold it. */
export async function fetchStreamLock(apiKey: string, escrow: string, onCredits: (credits: number) => void): Promise<StreamLock | null> {
  onCredits(LOOKUP_CREDITS);
  const found = await heliusRpc<Array<{ account: { data: [string, string] } }>>(apiKey, "getProgramAccounts", [
    STREAMFLOW,
    { encoding: "base64", filters: [{ dataSize: RECORD_SIZE }, { memcmp: { offset: ESCROW_AT, bytes: escrow } }] },
  ]);
  const record = found[0];
  const lock = record ? parseStreamLock(Buffer.from(record.account.data[0], "base64")) : null;
  return lock && lock.escrow === escrow ? lock : null;
}
