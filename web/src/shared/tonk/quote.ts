import { buyQuote, minimumOut, type MissionCurve, sellQuote } from "./curve";
import type { MissionJson, TradeQuoteJson, TradeSide } from "./mission";

const ZERO = BigInt(0);

/** A mission's curve in the launchpad's own units, for the curve maths. */
export function missionCurve(mission: MissionJson): MissionCurve {
  return { virtualEth: BigInt(mission.virtualEth), virtualTokens: BigInt(mission.virtualTokens), tokensLeft: BigInt(mission.tokensLeft), realEth: BigInt(mission.realEth) };
}

/** A trade, as far as the Crew fee is concerned. */
export interface CrewTrade {
  side: TradeSide;
  amount: bigint;
  /** The seller counts toward the eligible supply: every wallet does, but the launchpad and a few system addresses. */
  sellerEligible: boolean;
}

/**
 * The Crew fee the contract charges: none while nobody eligible holds the
 * token. A buy checks before it trades. A sell checks after its tokens have
 * moved to the launchpad, which is excluded, so an eligible seller's own
 * tokens no longer count: the last eligible holder selling out pays no Crew
 * fee. Without a trade, the fee as it stands.
 */
export function chargedCrewBps(mission: MissionJson, trade?: CrewTrade): number {
  const before = BigInt(mission.eligibleSupply);
  const after = trade?.side === "sell" && trade.sellerEligible ? before - trade.amount : before;
  return after > ZERO ? mission.crewBps : 0;
}

export interface QuoteOptions {
  /** The minimum the trader already approved, when the server checks the trade again. */
  approvedMinOut?: bigint;
  /** Whether the seller counts toward the eligible supply (most wallets do). */
  sellerEligible?: boolean;
}

/**
 * A trade on the mission's current curve. `minOut` is the least the trader
 * accepts: from the slippage when quoting, or the one already approved when
 * the server checks a trade again.
 */
export function quoteTrade(mission: MissionJson, side: TradeSide, amount: bigint, slippageBps: number, { approvedMinOut, sellerEligible = true }: QuoteOptions = {}): TradeQuoteJson {
  const curve = missionCurve(mission);
  const crew = chargedCrewBps(mission, { side, amount, sellerEligible });
  if (side === "buy") {
    const quote = buyQuote(curve, amount, crew, mission.creatorBps);
    return {
      side,
      amountIn: String(amount),
      out: String(quote.tokensOut),
      minOut: String(approvedMinOut ?? minimumOut(quote.tokensOut, slippageBps)),
      protocolFee: String(quote.protocolFee),
      crewFee: String(quote.crewFee),
      creatorFee: String(quote.creatorFee),
      refund: String(quote.refundEth),
      completesCurve: quote.tokensOut === curve.tokensLeft && curve.tokensLeft > ZERO,
      capped: false,
    };
  }
  const quote = sellQuote(curve, amount, crew, mission.creatorBps);
  return {
    side,
    amountIn: String(amount),
    out: String(quote.netEthOut),
    minOut: String(approvedMinOut ?? minimumOut(quote.netEthOut, slippageBps)),
    protocolFee: String(quote.protocolFee),
    crewFee: String(quote.crewFee),
    creatorFee: String(quote.creatorFee),
    refund: "0",
    completesCurve: false,
    capped: quote.capped,
  };
}
