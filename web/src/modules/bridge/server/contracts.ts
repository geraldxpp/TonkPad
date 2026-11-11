import { BridgeError } from "./config";
import type { SolanaInstructions } from "./plan";

/**
 * The contracts each route may ask a wallet to call or approve, per network,
 * surveyed from the routes' own answers across every asset pair (11 Nov 2026)
 * and fixed here. A provider that points anywhere else, through a bug or a
 * breach, gets its route dropped rather than signed: if one upgrades a
 * contract, that route is unavailable until this list is updated.
 */
const set = (...addresses: string[]) => new Set(addresses.map((address) => address.toLowerCase()));

const RELAY_DEPOSITORIES = ["0x4cd00e387622c35bddb9b4c962c136462338bc31", "0x59916da825d2d2ec1bf878d71c88826f6633ecca"];
const RELAY_ROUTERS = ["0x0729e2a4716d9f7dd17858d5d504426d228697f7", "0xb92fe925dc43a0ecde6c8b1a2709c170ec4fff4f"];
const RELAY_PROXIES = ["0x5567954cd026cebfe486062cb75848e0f1c12e58", "0xccc88a9d1b4ed6b0eaba998850414b24f1c315be"];
const RELAY_CALLS = set(...RELAY_DEPOSITORIES, ...RELAY_ROUTERS);
const RELAY_SPENDERS = set(...RELAY_DEPOSITORIES, ...RELAY_PROXIES);
export const RELAY_PROGRAM = "99vQwtBwYtrqqD9YSXbdum3KBdxPAVxYTaQ3cfnJSrN2";
const COMPUTE_BUDGET = "ComputeBudget111111111111111111111111111111";

const ACROSS_PERIPHERY = "0x97ccdbea4632140639ad5ea9b944aa034eb15fd4";
const ACROSS_BY_CHAIN: Record<number, Set<string>> = {
  1: set(ACROSS_PERIPHERY, "0x5c7bcd6e7de5423a257d81b442095a1a6ced35c5"),
  10: set(ACROSS_PERIPHERY, "0x6f26bf09b1c792e3228e5467807a900a503c0281"),
  56: set(ACROSS_PERIPHERY),
  130: set(ACROSS_PERIPHERY, "0x09aea4b2242abc8bb4bb78d537a67a245a7bec64"),
  137: set(ACROSS_PERIPHERY, "0x9295ee1d8c5b022be115a2ad3c30c72e34e7f096"),
  143: set(ACROSS_PERIPHERY, "0xd2ecb3afe598b746f8123cae365a598da831a449"),
  324: set("0x7c99ced6d8011af8a52488884f7ba2c61b0fa57d"),
  480: set(ACROSS_PERIPHERY, "0x09aea4b2242abc8bb4bb78d537a67a245a7bec64"),
  999: set(ACROSS_PERIPHERY, "0x35e63ea3eb0fb7a3bc543c71fb66412e1f6b0e04"),
  4663: set(ACROSS_PERIPHERY, "0xd29c85f15df544ba632c9e25829fd29d767d7978"),
  8453: set(ACROSS_PERIPHERY, "0x09aea4b2242abc8bb4bb78d537a67a245a7bec64"),
  42161: set(ACROSS_PERIPHERY, "0xe35e9842fceaca96570b734083f4a58e8f7c5f2a"),
  43114: set(ACROSS_PERIPHERY, "0xfe9d541c92e4e90437c7152a00244886de37a658"),
  57073: set(ACROSS_PERIPHERY, "0xef684c38f94f48775959ecf2012d7e864ffb9dd4"),
  59144: set(ACROSS_PERIPHERY, "0x7e63a5f1a8f0b4d0934b2f2327daed3f6bb2ee75"),
};

const LIFI_DIAMOND = "0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae";
const LIFI_BY_CHAIN: Record<number, Set<string>> = {
  1: set(LIFI_DIAMOND),
  10: set(LIFI_DIAMOND),
  56: set(LIFI_DIAMOND),
  130: set("0x864b314d4c5a0399368609581d3e8933a63b9232"),
  137: set(LIFI_DIAMOND),
  143: set("0x026f252016a7c47cdef1f05a3fc9e20c92a49c37"),
  324: set("0x341e94069f53234fe6dabef707ad424830525715"),
  480: set(LIFI_DIAMOND),
  999: set("0x0a0758d937d1059c356d4714e57f5df0239bce1a"),
  4663: set("0xb477751b76cf82d00a686a1232f5fcd772414af3"),
  8453: set(LIFI_DIAMOND),
  42161: set(LIFI_DIAMOND),
  43114: set(LIFI_DIAMOND),
  57073: set("0x864b314d4c5a0399368609581d3e8933a63b9232"),
  59144: set("0xde1e598b81620773454588b85d6b5d4eec32573e"),
  534352: set(LIFI_DIAMOND),
};

const unknown = (label: string) => new BridgeError("no-route", `${label}: unknown contract`);

export function assertRelayEvm(_chainId: number, to: string): void {
  if (!RELAY_CALLS.has(to.toLowerCase())) throw unknown("relay");
}

export function assertAcrossEvm(chainId: number, to: string): void {
  if (!ACROSS_BY_CHAIN[chainId]?.has(to.toLowerCase())) throw unknown("across");
}

export function assertLifiEvm(chainId: number, to: string): void {
  if (!LIFI_BY_CHAIN[chainId]?.has(to.toLowerCase())) throw unknown("lifi");
}

/** Who a route may ask a token to approve. */
export function assertSpender(provider: "relay" | "across" | "lifi", chainId: number, spender: string): void {
  const known = provider === "relay" ? RELAY_SPENDERS : provider === "across" ? ACROSS_BY_CHAIN[chainId] : LIFI_BY_CHAIN[chainId];
  if (!known?.has(spender.toLowerCase())) throw unknown(provider);
}

/** A Solana deposit may only touch Relay's depository, and only the sender may sign. */
export function assertRelaySolana(plan: SolanaInstructions, sender: string): void {
  if (plan.instructions.length === 0) throw unknown("relay");
  for (const instruction of plan.instructions) {
    if (instruction.programId !== RELAY_PROGRAM && instruction.programId !== COMPUTE_BUDGET) throw unknown("relay");
    if (instruction.keys.some((key) => key.isSigner && key.pubkey !== sender)) throw new BridgeError("no-route", "relay: another signer");
  }
}
