/**
 * Stands in for `@wagmi/connectors` (aliased in next.config.ts). Reown's wagmi
 * adapter imports it only for the Coinbase SDK, Base Account and Safe-app
 * connectors. The app turns the first two off (those wallets still connect as
 * browser extensions or through WalletConnect) and doesn't run inside Safe.
 * The real package would pull Coinbase's server SDK, and the optional x402
 * packages it expects, into the build. The adapter checks each export and
 * skips a connector it doesn't get.
 */
export const baseAccount = undefined;
export const coinbaseWallet = undefined;
export const safe = undefined;
