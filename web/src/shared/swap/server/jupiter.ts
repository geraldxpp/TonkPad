import { digitString, getJson, isRecord, SwapError } from "./config";

const BASE = "https://api.jup.ag";

/** One instruction as Jupiter sends it: base58 keys, base64 data. */
export interface JupInstruction {
  programId: string;
  accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[];
  data: string;
}

/** The parts of GET /swap/v2/build the app uses: the quote, the instructions and what's needed to compile them. */
export interface JupBuild {
  inAmount: string;
  outAmount: string;
  /** The minimum out at the slippage asked for. */
  otherAmountThreshold: string;
  slippageBps: number;
  priceImpactPct: number | null;
  labels: string[];
  computeBudgetInstructions: JupInstruction[];
  setupInstructions: JupInstruction[];
  swapInstruction: JupInstruction;
  cleanupInstruction: JupInstruction | null;
  otherInstructions: JupInstruction[];
  tipInstruction: JupInstruction | null;
  lookupTables: Record<string, string[]>;
  blockhash: number[];
  lastValidBlockHeight: number;
}

const isInstruction = (input: unknown): input is JupInstruction =>
  isRecord(input) && typeof input.programId === "string" && typeof input.data === "string" && Array.isArray(input.accounts);

const instructions = (input: unknown): JupInstruction[] => (Array.isArray(input) ? input.filter(isInstruction) : []);

const headers = (key: string | null): Record<string, string> => (key ? { "x-api-key": key } : {});

/**
 * Jupiter's route for an exact input, as instructions (GET /swap/v2/build,
 * Metis routing, no Jupiter fee): the app adds its own fee transfer and
 * compiles the transaction. `taker` pays and signs.
 */
export async function jupiterBuild(
  request: { inputMint: string; outputMint: string; amount: string; slippageBps: number; taker: string; maxAccounts: number },
  key: string | null,
): Promise<JupBuild> {
  const params = new URLSearchParams({
    inputMint: request.inputMint,
    outputMint: request.outputMint,
    amount: request.amount,
    slippageBps: String(request.slippageBps),
    taker: request.taker,
    // Leaves room in the 1,232-byte transaction for the fee transfer the app adds.
    maxAccounts: String(request.maxAccounts),
  });
  const body = await getJson(`${BASE}/swap/v2/build?${params}`, headers(key), "jupiter build");
  if (!isRecord(body) || !digitString(body.outAmount) || !digitString(body.otherAmountThreshold) || !isInstruction(body.swapInstruction)) {
    throw new SwapError("no-route", "jupiter build: no route");
  }
  const meta = isRecord(body.blockhashWithMetadata) ? body.blockhashWithMetadata : {};
  const blockhash = Array.isArray(meta.blockhash) ? meta.blockhash.filter((byte): byte is number => typeof byte === "number") : [];
  if (blockhash.length !== 32 || typeof meta.lastValidBlockHeight !== "number") throw new SwapError("unavailable", "jupiter build: no blockhash");
  const impact = Number(body.priceImpactPct);
  const route = Array.isArray(body.routePlan) ? body.routePlan : [];
  const labels = route
    .map((step) => (isRecord(step) && isRecord(step.swapInfo) && typeof step.swapInfo.label === "string" ? step.swapInfo.label : null))
    .filter((label): label is string => label !== null);
  const tables: Record<string, string[]> = {};
  if (isRecord(body.addressesByLookupTableAddress)) {
    for (const [table, addresses] of Object.entries(body.addressesByLookupTableAddress)) {
      if (Array.isArray(addresses)) tables[table] = addresses.filter((address): address is string => typeof address === "string");
    }
  }
  return {
    inAmount: digitString(body.inAmount) ? body.inAmount : request.amount,
    outAmount: body.outAmount,
    otherAmountThreshold: body.otherAmountThreshold,
    slippageBps: typeof body.slippageBps === "number" ? body.slippageBps : request.slippageBps,
    priceImpactPct: Number.isFinite(impact) ? impact : null,
    labels: [...new Set(labels)],
    computeBudgetInstructions: instructions(body.computeBudgetInstructions),
    setupInstructions: instructions(body.setupInstructions),
    swapInstruction: body.swapInstruction,
    cleanupInstruction: isInstruction(body.cleanupInstruction) ? body.cleanupInstruction : null,
    otherInstructions: instructions(body.otherInstructions),
    tipInstruction: isInstruction(body.tipInstruction) ? body.tipInstruction : null,
    lookupTables: tables,
    blockhash,
    lastValidBlockHeight: meta.lastValidBlockHeight,
  };
}

/** USD prices for up to a few mints (Jupiter Price v3); missing ones are left out. */
export async function jupiterPrices(mints: readonly string[], key: string | null): Promise<Record<string, number>> {
  const body = await getJson(`${BASE}/price/v3?ids=${mints.map(encodeURIComponent).join(",")}`, headers(key), "jupiter price");
  const prices: Record<string, number> = {};
  if (!isRecord(body)) return prices;
  for (const mint of mints) {
    const entry = body[mint];
    if (isRecord(entry) && typeof entry.usdPrice === "number" && Number.isFinite(entry.usdPrice)) prices[mint] = entry.usdPrice;
  }
  return prices;
}

/** A Solana token's name, symbol, decimals and art (Jupiter Tokens v2), or null when Jupiter doesn't know it. */
export async function jupiterToken(mint: string, key: string | null) {
  const body = await getJson(`${BASE}/tokens/v2/search?query=${encodeURIComponent(mint)}`, headers(key), "jupiter tokens");
  const match = Array.isArray(body) ? body.find((entry) => isRecord(entry) && entry.id === mint) : null;
  if (!isRecord(match) || typeof match.decimals !== "number" || typeof match.symbol !== "string") return null;
  return {
    symbol: match.symbol,
    name: typeof match.name === "string" ? match.name : match.symbol,
    decimals: match.decimals,
    icon: typeof match.icon === "string" && match.icon.startsWith("https://") ? match.icon : null,
  };
}
