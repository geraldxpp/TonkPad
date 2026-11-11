import { isTestnetSite } from "@/shared/tonk/networks";
import { assetOf, type BridgeAsset, type BridgeNetwork, isNetworkAddress, networkOf } from "../lib/networks";
import { BridgeError, isRecord } from "./config";

const NO_STORE = { "cache-control": "no-store" };

/** Valid wallets that belong to no one, standing in for quotes made before a wallet connects. */
const QUOTE_WALLET = { evm: "0x000000000000000000000000000000000000dEaD", svm: "FLRettWhwj1oyn19GMQVF3xdGUtgZft4mRXBHTuWSuCv" } as const;

/** Like for like can be held tight; a conversion on the way needs more room. */
const SLIPPAGE = { same: 50, convert: 100 };

/** A transfer, with every network and asset resolved against the bridge's own list. */
export interface BridgeRequest {
  from: BridgeNetwork;
  to: BridgeNetwork;
  asset: BridgeAsset;
  receive: BridgeAsset;
  /** Base units of the sent asset. */
  amount: string;
  sender: string;
  recipient: string;
  /** Both ends are real wallets, not stand-ins. */
  real: boolean;
  gasTopUp: boolean;
  slippageBps: number;
}

const address = (network: BridgeNetwork, input: unknown, field: string): string | null => {
  if (input === undefined || input === null || input === "") return null;
  if (typeof input !== "string" || !isNetworkAddress(network, input)) throw new BridgeError("invalid", `bad ${field}`, 400);
  return input;
};

/** A transfer from query params or a JSON body, checked field by field; nothing unrecognised reaches a provider. */
export function parseBridgeRequest(input: Record<string, unknown>): BridgeRequest {
  const from = typeof input.from === "string" ? networkOf(input.from) : null;
  const to = typeof input.to === "string" ? networkOf(input.to) : null;
  if (!from || !to || from.id === to.id) throw new BridgeError("invalid", "bad networks", 400);
  const asset = typeof input.asset === "string" ? assetOf(from, input.asset) : null;
  const receive = typeof input.receive === "string" ? assetOf(to, input.receive) : null;
  if (!asset || !receive) throw new BridgeError("invalid", "bad asset", 400);
  if (typeof input.amount !== "string" || !/^[1-9]\d{0,39}$/.test(input.amount)) throw new BridgeError("invalid", "bad amount", 400);
  const sender = address(from, input.sender, "sender");
  const recipient = address(to, input.recipient, "recipient");
  const family = asset.family === receive.family && asset.family !== "coin";
  return {
    from,
    to,
    asset,
    receive,
    amount: input.amount,
    sender: sender ?? QUOTE_WALLET[from.vm],
    recipient: recipient ?? QUOTE_WALLET[to.vm],
    real: sender !== null && recipient !== null,
    gasTopUp: input.gasTopUp === true || input.gasTopUp === "1",
    slippageBps: family ? SLIPPAGE.same : SLIPPAGE.convert,
  };
}

/** The bridges only cover mainnets, so on the testnet site every route is closed. */
export function refuseOnTestnet(): void {
  if (isTestnetSite()) throw new BridgeError("closed", "the bridge is not on the testnet site", 404);
}

export const queryRecord = (request: Request): Record<string, unknown> => Object.fromEntries(new URL(request.url).searchParams.entries());

export async function bodyRecord(request: Request): Promise<Record<string, unknown>> {
  const body: unknown = await request.json().catch(() => null);
  return isRecord(body) ? body : {};
}

/** A failure's code for the browser, never the upstream detail. */
export function errorResponse(error: unknown, extra: Record<string, unknown> = {}): Response {
  if (error instanceof BridgeError) return Response.json({ error: error.code, ...extra }, { status: error.status, headers: NO_STORE });
  return Response.json({ error: "unavailable", ...extra }, { status: 502, headers: NO_STORE });
}

export const jsonResponse = (body: unknown): Response => Response.json(body, { headers: NO_STORE });
