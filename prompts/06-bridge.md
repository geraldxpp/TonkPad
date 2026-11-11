# Module 6 — Bridge

**Status: built on 11 Nov 2026.** The owner handed over the design (`design-proposals/Tonkfun.fun-UI-Design.zip`, folder `bridge-redesign/`) and the idea, "Universal Bridge — Bring Any Crypto In": major assets from almost any chain landing on Robinhood Chain, by the canonical bridge, Across, LayerZero, Relay and other aggregators, so nobody has to be on the chain already to join a mission. They said to add whatever was missing and wire it for production. This file records what the hand-off left open and what was decided.

## What the screen is
`/bridge`: move a major asset between networks, into Robinhood Chain above all. The design's layout, in both themes and all twelve languages: From and To, the destination, "Arrive ready to go", fees, Review, Recent, "Across chains", "Pick your pace" and "From arrived to ready", and on phones the estimate and button kept in reach.

## What the hand-off assumed, and what's real
Every point here was checked against the live APIs or the chain.

| In the hand-off | In reality | What was built |
|---|---|---|
| USDC arrives on Robinhood Chain | The chain's dollar is USDG; there is no canonical USDC | Dollars arrive as USDG, and the screen says what arrives before anything is signed |
| One asset, the same on both sides | Most pairs convert on the way | A picker on each side; each route reports what really arrives |
| Five sample networks | The routes reach far more | 17: Base, Ethereum, Arbitrum, Robinhood Chain, Solana, Optimism, Polygon, BNB Chain, Avalanche, Unichain, Linea, Ink, World Chain, Monad, HyperEVM, ZKsync, Scroll |
| Canonical bridge for any route | Only Ethereum and Robinhood Chain. Deposits take about 10 minutes; leaving takes about 7 days and a claim transaction on Ethereum | ETH deposits only, by `depositEth()`, into the sender's own plain wallet. A contract or EIP-7702 wallet would be credited at an aliased address, so it isn't offered one. Leaving uses a fast route |
| LayerZero as a route | Its transfer API needs a partner key from LayerZero's team | Not wired: it can't be tested without one. LI.FI reaches several other bridges meanwhile |
| Two fixed routes, Fastest and Lower fee | Routes come and go | Every live route, compared on one footing, marked fastest, cheapest or secured by Ethereum |
| "Sample route", "Preview transfer" | Real money | A live screen behind a switch (below) |

## Routes
Relay is asked for everything, and is the only route on Solana and the only one that delivers gas. Across is asked for EVM to EVM. The canonical bridge is added when it applies. LI.FI is asked when it has a key; without one its allowance is tiny, so it's kept for when nothing else has a route. Each answers independently, so one failing leaves the rest.

Costs are put on the same footing: providers value things differently, so like-for-like transfers are costed from what goes in and comes out at one price. The suggested route is the best value among those that aren't much slower than the fastest, so a ten-minute route is never suggested over a six-second one.

## The rules that keep it safe
- Networks, assets and token addresses are a fixed list; nothing from a request or a provider chooses one. Anyone can name a token USDC.
- The contracts a route may call or approve are a fixed list per network, surveyed from the routes' own answers across every asset pair. A provider pointing anywhere else has its route dropped rather than signed. When a provider upgrades a contract, that route is unavailable until `server/contracts.ts` is updated: it fails closed.
- Every answer is checked against what was asked: asset, chain, amount, recipient, a minimum no higher than the estimate, and a value equal to the amount for the chain's coin and zero otherwise. Across's call must name the recipient. A route needing a signature flow is dropped. A Solana deposit may only touch Relay's depository, and only the sender signs.
- Approvals are for exactly what's being sent, and only when the allowance is short. Across's own unlimited approval is ignored; only who to approve is taken from it. Mainnet USDT is cleared to zero first, as it requires.
- The transfer is rebuilt after the review, and refused if it would deliver more than 0.5% less than what was reviewed: the person sees the new figures and decides again.
- The server holds no key and sends nothing but a signed Solana transaction. Only the visitor's wallet signs. The wallet is moved to the source network immediately before each send, and it's the wallet's own answer that decides.
- A transfer is saved the moment it has a transaction, so a reload picks it up and can never send it again. Delivered counts only from the route's own report of the fill.
- Recent is on this device only; clearing it keeps anything still on its way.

## Go-live
`BRIDGE_TRADING=on` lets the server build real transfers; quotes work either way, and until it's on the screen says "Bridging opens soon". Test with a small amount in the owner's own wallet before opening it up: everything short of a real transfer has been checked here, and a real one can't be from a test or script.

Provider keys are optional today but worth having, as keyless use is rate-limited: `RELAY_API_KEY` (dashboard.relay.link; their docs say it will be required), `ACROSS_API_KEY` and `ACROSS_INTEGRATOR_ID` (across.to), `LIFI_API_KEY` (portal.li.fi). Balances use the existing `ROBINHOOD_RPC_URL`'s Alchemy key where that network is enabled, else public RPCs.

No app fee is taken on bridges: the design shows none and the owner hasn't asked for one. Relay, Across and LI.FI each support one if that changes.

## Wallets
Connecting now offers the source networks too. Someone connected before this shipped may have a session that only approved Robinhood Chain; their wallet can't switch, and the screen tells them to reconnect.

## Elsewhere
A live token's trade panel and the Swap screen, when the wallet is short, link here set up to land the chain's coin and lead back. The return path is checked against the site's own pages.

## On the testnet site
The screen says "Not on testnet yet" and its routes are closed: the bridges only reach mainnets.

## Not in this module
Deposit addresses, for Bitcoin, Tron, XRP or an exchange withdrawal, with no wallet connected (Relay supports them; a different flow). ERC-20s through the canonical bridge (retryable tickets). LayerZero until there's a key. An app fee.
