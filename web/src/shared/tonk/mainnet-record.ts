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
