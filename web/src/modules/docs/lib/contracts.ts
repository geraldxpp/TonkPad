import { MAINNET_RECORD } from "@/shared/tonk/mainnet-record";
import { explorerAddressUrl, mainnetNetwork } from "@/shared/tonk/networks";

/** The deployment record lives in shared/, so the bot's knowledge pack (shared/bot) reads the same one. */
export { MAINNET_RECORD };

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
