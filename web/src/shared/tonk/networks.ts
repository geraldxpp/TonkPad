/**
 * Where tonkfun.fun's own launchpad contracts live. NEXT_PUBLIC_TONK_NETWORK
 * picks the mode (it only selects public addresses, so it may be public):
 * unset keeps Launch "coming soon"; "testnet" wires the app to Robinhood
 * Chain Testnet; "mainnet" wires it to Robinhood Chain once the deployment's
 * addresses are set (see `mainnetNetwork`); "mock" runs the Creator Studio
 * on mock settings for tests and local development.
 */
export type TonkMode = "off" | "testnet" | "mainnet" | "mock";

export interface TonkNetwork {
  chainId: number;
  name: string;
  /** What amounts are counted in: "ETH", or "test ETH" where it has no value. */
  unit: string;
  /** The public RPC; the server may use TONK_RPC_URL instead. */
  rpcUrl: string;
  explorerUrl: string;
  /** Where to get coins for gas, on a testnet. */
  faucetUrl: string | null;
  launchpad: `0x${string}`;
  migrator: `0x${string}`;
  /** Locks for other launchpads' tokens: on testnet only, until its own phase. */
  externalRouter: `0x${string}` | null;
  /** Where graduated pools trade: Uniswap's official contracts on mainnet; on testnet only where a router and quoter are deployed beside its Uniswap copy. */
  uniswap: UniswapContracts | null;
  /** The launchpad's deployment block: where an indexer starts. */
  launchpadBlock: number;
}

/** Uniswap's official v4 contracts a graduated pool trades through. */
export interface UniswapContracts {
  poolManager: `0x${string}`;
  universalRouter: `0x${string}`;
  permit2: `0x${string}`;
  quoter: `0x${string}`;
}

/** Uniswap's official deployment on Robinhood Chain (developers.uniswap.org/deployments.json, 4 Nov 2026), lowercase. */
export const ROBINHOOD_UNISWAP: UniswapContracts = {
  poolManager: "0x8366a39cc670b4001a1121b8f6a443a643e40951",
  universalRouter: "0x204faca1764b154221e35c0d20abb3c525710498",
  permit2: "0x000000000022d473030f116ddee9f6b43ac78ba3",
  quoter: "0x8dc178efb8111bb0973dd9d722ebeff267c98f94",
};

/**
 * The repaired contracts on Robinhood Chain Testnet, deployed and verified
 * on 10 Nov 2026 (DEPLOYED-ADDRESSES.json and reports/testnet-deployment.json
 * in the contract project). The Uniswap v4 contracts beside them are an
 * isolated test deployment with no router, so pools don't trade here; a
 * testnet preview can name a fresh deployment instead (`testnetNetwork`).
 */
export const TONK_TESTNET: TonkNetwork = {
  chainId: 46630,
  name: "Robinhood Chain Testnet",
  unit: "test ETH",
  rpcUrl: "https://rpc.testnet.chain.robinhood.com/rpc",
  explorerUrl: "https://explorer.testnet.chain.robinhood.com",
  faucetUrl: "https://faucet.testnet.chain.robinhood.com",
  launchpad: "0xB9bb81242ce7B40775CEADF3b591411f0320Ec82",
  migrator: "0x6c0Fb62E5652EB6C2a257EeBBa75Ad2DcE708909",
  externalRouter: "0x73d4aeDd253044bA96D6BabB47016651c57BA2e7",
  uniswap: null,
  launchpadBlock: 151119562,
};

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** Where the mainnet deployment is: public values, set once the owner has deployed. */
export interface MainnetDeployment {
  launchpad: string | undefined;
  migrator: string | undefined;
  block: string | undefined;
}

/** NEXT_PUBLIC_ values are inlined at build time, so the browser reads the same deployment as the server. */
const BUILD_DEPLOYMENT: MainnetDeployment = {
  launchpad: process.env.NEXT_PUBLIC_TONK_LAUNCHPAD,
  migrator: process.env.NEXT_PUBLIC_TONK_MIGRATOR,
  block: process.env.NEXT_PUBLIC_TONK_LAUNCHPAD_BLOCK,
};

/** Uniswap contracts named for a testnet preview: public values, unset everywhere else. */
export interface UniswapDeployment {
  poolManager: string | undefined;
  universalRouter: string | undefined;
  permit2: string | undefined;
  quoter: string | undefined;
}

const BUILD_UNISWAP: UniswapDeployment = {
  poolManager: process.env.NEXT_PUBLIC_TONK_UNISWAP_POOL_MANAGER,
  universalRouter: process.env.NEXT_PUBLIC_TONK_UNISWAP_ROUTER,
  permit2: process.env.NEXT_PUBLIC_TONK_UNISWAP_PERMIT2,
  quoter: process.env.NEXT_PUBLIC_TONK_UNISWAP_QUOTER,
};

const lower = (value: string) => value.toLowerCase() as `0x${string}`;

/** A launchpad, its migrator and its first block, when all three are well formed and the two addresses differ. */
function deploymentOf(deployment: MainnetDeployment): Pick<TonkNetwork, "launchpad" | "migrator" | "launchpadBlock"> | null {
  const launchpad = deployment.launchpad?.trim() ?? "";
  const migrator = deployment.migrator?.trim() ?? "";
  const block = Number(deployment.block?.trim() || Number.NaN);
  if (!ADDRESS.test(launchpad) || !ADDRESS.test(migrator) || launchpad.toLowerCase() === migrator.toLowerCase()) return null;
  if (!Number.isSafeInteger(block) || block <= 0) return null;
  return { launchpad: lower(launchpad), migrator: lower(migrator), launchpadBlock: block };
}

/** All four Uniswap contracts, well formed and distinct, or none. */
function uniswapOf(deployment: UniswapDeployment): UniswapContracts | null {
  const values = [deployment.poolManager, deployment.universalRouter, deployment.permit2, deployment.quoter].map((value) => value?.trim() ?? "");
  if (!values.every((value) => ADDRESS.test(value)) || new Set(values.map((value) => value.toLowerCase())).size !== values.length) return null;
  const [poolManager, universalRouter, permit2, quoter] = values.map(lower);
  return { poolManager, universalRouter, permit2, quoter };
}

/**
 * Robinhood Chain mainnet, once the owner has deployed (prompts/07-mainnet.md):
 * the launchpad, the migrator and the launchpad's first block come from the
 * deployment's read-back. Anything missing or malformed connects nothing, so
 * Launch stays "coming soon"; the server also checks the pair against the
 * chain before it builds anything. Addresses are kept lowercase.
 */
export function mainnetNetwork(deployment: MainnetDeployment = BUILD_DEPLOYMENT): TonkNetwork | null {
  const fresh = deploymentOf(deployment);
  if (!fresh) return null;
  return {
    chainId: 4663,
    name: "Robinhood Chain",
    unit: "ETH",
    rpcUrl: "https://rpc.mainnet.chain.robinhood.com",
    explorerUrl: "https://robinhoodchain.blockscout.com",
    faucetUrl: null,
    ...fresh,
    externalRouter: null,
    // Mainnet trades only through Uniswap's official contracts, never addresses from the build.
    uniswap: ROBINHOOD_UNISWAP,
  };
}

/**
 * Robinhood Chain Testnet. By default the deployment above. A testnet
 * preview (Astra's campaign, prompts/08-astra-brief.md) names a fresh
 * deployment through the same three public values mainnet uses; it then
 * has no external router, and its pools trade wherever the four
 * NEXT_PUBLIC_TONK_UNISWAP_ values name a router and quoter beside the
 * testnet's Uniswap copy. Anything missing or malformed keeps the default.
 */
export function testnetNetwork(deployment: MainnetDeployment = BUILD_DEPLOYMENT, uniswap: UniswapDeployment = BUILD_UNISWAP): TonkNetwork {
  const fresh = deploymentOf(deployment);
  const pools = uniswapOf(uniswap);
  if (!fresh) return pools ? { ...TONK_TESTNET, uniswap: pools } : TONK_TESTNET;
  return { ...TONK_TESTNET, ...fresh, externalRouter: null, uniswap: pools };
}

/** The mode a value of NEXT_PUBLIC_TONK_NETWORK asks for; anything unknown is off. */
export function parseTonkMode(value: string | undefined): TonkMode {
  const mode = value?.trim().toLowerCase();
  return mode === "testnet" || mode === "mainnet" || mode === "mock" ? mode : "off";
}

/** This build's mode. The variable is inlined at build time, so the browser sees the same answer as the server. */
export function tonkMode(): TonkMode {
  return parseTonkMode(process.env.NEXT_PUBLIC_TONK_NETWORK);
}

/** The network this build's contracts are on, or null when none is connected (off, mock, and mainnet before its addresses are set). */
export function tonkNetwork(mode: TonkMode = tonkMode()): TonkNetwork | null {
  if (mode === "testnet") return testnetNetwork();
  return mode === "mainnet" ? mainnetNetwork() : null;
}

/**
 * Whether the deployed launchpad has had an independent audit. Until it has,
 * mainnet's Launch and launch-token pages carry a beta warning
 * (prompts/07-mainnet.md, decision 9).
 */
export const LAUNCHPAD_AUDITED = false;

/** True on the testnet site, where `rh` means the testnet everywhere and Solana isn't offered. */
export function isTestnetSite(): boolean {
  return tonkMode() === "testnet";
}

export const explorerTxUrl = (network: TonkNetwork, hash: string) => `${network.explorerUrl}/tx/${hash}`;
export const explorerAddressUrl = (network: TonkNetwork, address: string) => `${network.explorerUrl}/address/${address}`;
