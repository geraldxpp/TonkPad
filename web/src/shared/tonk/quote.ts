import { buyQuote, minimumOut, type MissionCurve, sellQuote } from "./curve";
import type { MissionJson, TradeQuoteJson, TradeSide } from "./mission";

/** A mission's curve in the launchpad's own units, for the curve maths. */
export function missionCurve(mission: MissionJson): MissionCurve {
  return { virtualEth: BigInt(mission.virtualEth), virtualTokens: BigInt(mission.virtualTokens), tokensLeft: BigInt(mission.tokensLeft), realEth: BigInt(mission.realEth) };
}

/** The Crew fee the contract charges right now: none while nobody eligible holds the token. */
export function chargedCrewBps(mission: MissionJson): number {
  return BigInt(mission.eligibleSupply) > BigInt(0) ? mission.crewBps : 0;
}

/**
 * A trade on the mission's current curve. `minOut` is the least the trader
 * accepts: from the slippage when quoting, or the one already approved when
 * the server checks a trade again.
 */
export function quoteTrade(mission: MissionJson, side: TradeSide, amount: bigint, slippageBps: number, approvedMinOut?: bigint): TradeQuoteJson {
  const curve = missionCurve(mission);
  const crew = chargedCrewBps(mission);
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
      completesCurve: quote.tokensOut === curve.tokensLeft && curve.tokensLeft > BigInt(0),
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
