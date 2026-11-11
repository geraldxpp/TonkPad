import { shortAddress } from "@/shared/lib/address";
import { chainText } from "@/shared/tonk/metadata";

/** The longest name and ticker the screen shows: anyone can publish a token with any text. */
const NAME_MAX = 40;
const SYMBOL_MAX = 12;

export const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** A finite number from JSON that may spell it as a string; null otherwise. */
export function numeric(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

/** A token's name, or its short address when it has none worth showing. */
export const cleanName = (value: unknown, address: string) => chainText(value, NAME_MAX) || shortAddress(address);

/** A token's ticker, or the start of its address when it has none. */
export const cleanSymbol = (value: unknown, address: string) => chainText(value, SYMBOL_MAX) || address.replace(/^0x/, "").slice(0, 5).toUpperCase();

/** A balance in base units as a number, for display and sums. Exact amounts stay in `raw`. */
export function toAmount(raw: bigint, decimals: number): number {
  const scale = BigInt(10) ** BigInt(decimals);
  const whole = raw / scale;
  const part = raw % scale;
  return Number(whole) + (decimals === 0 ? 0 : Number(part) / Number(scale));
}

/** Runs `work` over `items`, at most `limit` at a time. */
export async function inChunks<T, R>(items: readonly T[], limit: number, work: (item: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = [];
  for (let i = 0; i < items.length; i += limit) {
    results.push(...(await Promise.allSettled(items.slice(i, i + limit).map(work))));
  }
  return results;
}
