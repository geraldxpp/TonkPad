import { explorerAddressUrl, mainnetNetwork } from "@/shared/tonk/networks";

/**
 * tonkfun.fun's launchpad on Robinhood Chain mainnet, as deployed by the
 * owner on 12 Nov 2026 (reports/mainnet-deployment.json in the contract
 * project: the frozen build 5c199225, Patch A). Each contract's source is
 * verified on Blockscout, and the Safe account has accepted ownership of
 * the launchpad and the migrator. A new deployment means updating this list.
 */
export const MAINNET_RECORD = {
  launchpad: "0xbCaF0eCF36D15622a13D04b5ac58d312818BB4f0",
  migrator: "0x7d233D86fa9D3A36042C2A537276e995c70adC0f",
  /** Created by the migrator; every graduated pool's key names it as its hook. */
  guard: "0xbEcED0F0600D62de0189DA0532E31FE4D868A000",
  /** Created by the launchpad; it deploys each launch's token. */
  tokenFactory: "0xB452f430606d612B03a8F110B9f3c6BEaf05c496",
  /** The owner of the launchpad and the migrator. */
  safe: "0x9404675D77BCb54021806491a748A4543bf0b5D0",
  block: 112218281,
} as const;

export type DocsContractId = "launchpad" | "migrator" | "guard" | "tokenFactory" | "safe";

export interface DocsContract {
  id: DocsContractId;
  /** As the record has it, with its checksum capitals. */
  address: string;
  /** The contract's verified source on the explorer; the Safe's address page. */
  url: string;
}

const ORDER: readonly DocsContractId[] = ["launchpad", "migrator", "guard", "tokenFactory", "safe"];

/** The contracts with their explorer links, from the app's own mainnet network definition. */
export function mainnetContracts(): DocsContract[] {
  const network = mainnetNetwork({ launchpad: MAINNET_RECORD.launchpad, migrator: MAINNET_RECORD.migrator, block: String(MAINNET_RECORD.block) });
  if (!network) return [];
  return ORDER.map((id) => {
    const address = MAINNET_RECORD[id];
    const page = explorerAddressUrl(network, address);
    return { id, address, url: id === "safe" ? page : `${page}?tab=contract` };
  });
}
