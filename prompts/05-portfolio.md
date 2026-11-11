# Module 5 — Portfolio

**Status: built on 11 Nov 2026.** The owner handed over the design (`Tonkfun.fun-UI-Design.zip`, folder `portfolio-redesign/`) and said to build it, add what was missing, wire it for production and deploy it. This file records what the design left open and what was decided, so a later change can see why.

## What the screen is
`/portfolio`: what the connected wallets hold on Robinhood Chain and Solana, read live from the chains. The design's layout, in both themes and all twelve languages: the heading, a network filter, the balance card with its chart, "Across your wallets", Assets and Activity, and on phones a Receive / Swap / Bridge bar.

## Where the design and production differ
The design runs on sample data. What each illustrative part became:

| In the design | In production | Why |
|---|---|---|
| "Demo wallets", sample addresses | The connected wallets. A Connect state offering both networks when there are none, and Connect beside a network that isn't connected | A real screen needs a wallet |
| Sample holdings and prices | Solana: the wallet's token accounts, named and priced by Jupiter. Robinhood Chain: the provider's token index, priced from DexScreener | Real balances, real prices |
| Sine-wave chart | The wallet's **current holdings at past prices**: real candles for SOL and ETH, the market's own 5-minute, 1-hour, 6-hour and 24-hour moves for other tokens | Nothing knows what a wallet held last month without an indexer. The chart says what it is, and how much of the value it could trace |
| Range "All", "since first holding" | **1Y**, "Past year" | The first holding isn't known |
| Sample activity | Read from the chains: Helius on Solana, the provider's transfers on Robinhood Chain | Real history |
| "Bridges" activity filter | Left out | No Bridge module yet; a bridge reads as a send or a receive |
| "Preview empty wallet" | The empty state, when the wallet really is empty | Not a demo any more |
| "Design preview" tag, disclosures, "sample" notes | "Updated 07:09" with Refresh; a real warning about sending from the wrong network | Those notes described the prototype |

## Added beyond the design
- **Prices have to be earned.** Anyone can mint a token, seed a tiny pool and print a huge "value" on every wallet they airdrop it to. A price needs at least $1,000 of liquidity, not flagged suspicious by Jupiter, and on Robinhood Chain a known quote coin or $10,000 of depth. Tokens without one count for nothing in the totals and sit behind "Show N tokens with no market price", with a warning: their names are often phishing.
- **Stablecoins by address, never by ticker.** Anyone can name a token USDC.
- **Spam stays out of Activity.** Airdrops of tokens with no market and specks of SOL are dropped.
- **Partial answers.** One network, one token program or the price source failing leaves the rest standing and says the total may be low. Only a wallet's own coin balance is essential.
- **The CSV can't be weaponised.** A token named `=HYPERLINK(…)` is written as text.
- **Text from the chain is cleaned on the server:** printable characters only, bounded length, art only through image CDNs.
- A long wallet opens with 30 rows and Show all. Load more on Activity. Explorer links on positions, wallets and transactions.

## How it reads
- `GET /api/portfolio/[chain]/[owner]`, `GET /api/portfolio/[chain]/[owner]/activity?cursor=` and `GET /api/portfolio/market?range=`, all behind the rate limiter, validating their input and never caching an error. Keys stay on the server; no new ones are needed: `HELIUS_API_KEY`, `JUPITER_API_KEY`, `ROBINHOOD_RPC_URL`. Candles come from Coinbase's public market data.
- Holdings refresh every 60 seconds while the tab is visible, and with Refresh. Activity is read only once its tab is opened.
- The screen sends nothing and signs nothing. Swap and Receive hand off to their own flows.
- On the testnet site the screen says "Not on testnet yet" and the routes are closed: its tokens have no market to price them.

## Phones
With a wallet connected, the Receive / Swap / Bridge bar takes the tab bar's place, as a token page's Buy / Sell bar does, and the design shows. Without one the tab bar stays, so nobody is stranded. The logo and the Explore link lead back.

## Not in this module
Profit and loss and true balance history (they need an indexer or a price-history provider); a QR code on Receive (a new dependency); a Bridge screen.
