/** Worker settings, read from the environment (Railway variables or web/.env.local). */
export interface WorkerConfig {
  port: number;
  heliusApiKey: string | null;
  jupiterApiKey: string | null;
  /** Blockscout PRO API key: holders of graduated Pons tokens. */
  blockscoutApiKey: string | null;
  robinhoodRpcUrl: string | null;
  /** Where Pons logs are read; Alchemy's free plan only allows 10-block log queries. */
  robinhoodLogsRpcUrl: string;
  /** When set, every /v1 request must send it in the x-worker-token header. */
  workerToken: string | null;
  /** Where the token state is saved between restarts. */
  snapshotPath: string;
  /** Helius credits a UTC day may spend on live trades for open token pages (HELIUS_TRADES_DAILY_CREDITS). */
  tradesDailyCredits: number;
}

const value = (raw: string | undefined) => (raw && raw.trim() ? raw.trim() : null);

/** A whole number of credits, or the fallback when it's missing or not a number. */
function credits(raw: string | undefined, fallback: number): number {
  const n = Number(value(raw));
  return value(raw) !== null && Number.isInteger(n) && n >= 0 ? n : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  return {
    port: Number(env.PORT ?? 8787),
    heliusApiKey: value(env.HELIUS_API_KEY),
    jupiterApiKey: value(env.JUPITER_API_KEY),
    blockscoutApiKey: value(env.BLOCKSCOUT_API_KEY),
    robinhoodRpcUrl: value(env.ROBINHOOD_RPC_URL),
    robinhoodLogsRpcUrl: value(env.ROBINHOOD_LOGS_RPC_URL) ?? "https://rpc.mainnet.chain.robinhood.com",
    workerToken: value(env.WORKER_TOKEN),
    snapshotPath: value(env.SNAPSHOT_PATH) ?? "worker/.state/snapshot.json",
    tradesDailyCredits: credits(env.HELIUS_TRADES_DAILY_CREDITS, 15_000),
  };
}

/** Logs a line with a time stamp. Never pass keys or URLs that contain them. */
export function log(scope: string, message: string): void {
  console.log(`${new Date().toISOString().slice(11, 19)} [${scope}] ${message}`);
}
