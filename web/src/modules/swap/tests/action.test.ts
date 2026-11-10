import { describe, expect, it } from "vitest";
import { en } from "@/shared/i18n/dictionaries/en";
import { BASE_TOKENS } from "@/shared/swap/tokens";
import type { SwapQuote } from "@/shared/types/swap";
import { actionState } from "../components/SwapAction";

const sol = BASE_TOKENS.sol[0];
const quote = (tradingOpen: boolean) => ({ outAmount: "1", minOut: "1", tradingOpen }) as SwapQuote;
const base = { chain: "sol" as const, owner: "FLRettWhwj1oyn19GMQVF3xdGUtgZft4mRXBHTuWSuCv", anyWallet: true, from: sol, raw: "50000000", balance: "1000000000", quote: quote(true), loading: false, error: null };

describe("the swap button", () => {
  it("goes through wallet, amount, funds, quote and the go-live switch before Review", () => {
    expect(actionState(en.swap, { ...base, owner: null, anyWallet: false })).toEqual({ kind: "connect", label: "Connect wallet" });
    expect(actionState(en.swap, { ...base, owner: null })).toEqual({ kind: "connect", label: "Connect a Solana wallet" });
    expect(actionState(en.swap, { ...base, raw: null }).label).toBe("Enter an amount");
    expect(actionState(en.swap, { ...base, balance: "1000" }).label).toBe("Not enough SOL");
    expect(actionState(en.swap, { ...base, quote: null, error: "no-route" }).label).toBe("No route for this pair right now");
    expect(actionState(en.swap, { ...base, quote: null, error: "busy" }).label).toBe("Busy right now. Retrying…");
    expect(actionState(en.swap, { ...base, quote: null, loading: true })).toEqual({ kind: "wait", label: "Finding the best price…" });
    expect(actionState(en.swap, { ...base, quote: quote(false) })).toEqual({ kind: "blocked", label: "Trading opens soon" });
    expect(actionState(en.swap, base)).toEqual({ kind: "review", label: "Review swap" });
  });

  it("lets an unknown balance through to the quote", () => {
    expect(actionState(en.swap, { ...base, balance: null }).kind).toBe("review");
  });
});
