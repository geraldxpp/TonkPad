# Tonkpad.fun — web

The Tonkpad.fun token terminal (Solana + Robinhood Chain), built module by module
from the approved design in `../design-reference/`. Project rules live in
`../CLAUDE.md`; module briefs live in `../prompts/`.

Built so far: **Module 1 — app shell + Explore** (`/`) and **Module 2 —
Token Detail** (`/token/[address]`), in dark and light themes and
twelve languages. Explore runs on mock data, or on **live
Pump.fun, Bonk.fun and Pons (Robinhood Chain) launches** from the live-data
worker (`worker/`, see below). Token Detail uses that same live feed when
`WORKER_URL` is set: click any Explore token to open its contract address.
Without a worker, open `/token/GHOST` for the approved Ghosty design, or click
any mock Explore token. The other rail screens (`/live`, `/bridge`, `/portfolio`, `/launch`,
`/docs`) show a "Coming in a later module" panel inside the shell.

## Run it

```bash
npm install
npx playwright install chromium   # once, for the e2e tests
npm run dev                       # http://localhost:3000
```

That runs Explore on mock data. For live data, put the API keys in
`web/.env.local` (see *Live data*), then run the worker next to the app:

```bash
printf 'WORKER_URL=http://127.0.0.1:8787\n' > .env.development.local
npm run worker:dev               # terminal 1: the worker on :8787
npm run dev                      # terminal 2: the app, now live
```

Delete `.env.development.local` to go back to mock data. Production builds
(and so the e2e tests) never read it.

| Script | What it does |
|---|---|
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` / `npm start` | Production build / serve it |
| `npm run lint` | ESLint (Next.js core-web-vitals + TypeScript rules) |
| `npm run typecheck` | `next typegen` (route types) then `tsc --noEmit` |
| `npm test` | Vitest + Testing Library unit and component tests |
| `npm run test:e2e` | Playwright against a production build on port 3100; also writes the captures in `e2e/screenshots/` |
| `npm run test:e2e:live` | Live integration tests with a local fixture worker and a production app on port 3101; no provider credentials needed |
| `npm run worker:dev` | The live-data worker with `.env.local`, restarting on changes |
| `npm run worker` | The worker as it runs in production (env vars from the host) |

## Layout

```
src/
  app/[lang]/   routes only (one tree per language); each page renders its module
  proxy.ts      language routing (see below)
  modules/
    shell/      AppShell, SideRail, TopBar (search, ticker tape, chain filter, language, theme), StatusBar, Logo, LaterPanel, SettingsDialog
    explore/    Explore: components/, hooks/, lib/ (filter, view, radar), data/, tests/
    token/      Token Detail: components/ (chart, activity, trade, mission), hooks/, lib/, data/, tests/
  shared/       ui/ primitives, lib/ (format, seeded-random, sparkline, url-params), config/, types/,
                i18n/ (languages, dictionaries, getI18n / useI18n)
  styles/       tokens.css (design tokens), animations.css (all motion), globals.css (Tailwind theme)
  shared/live/  the worker's JSON contract helpers: server-side fetch, usePolling, query strings
  app/api/live/ /api/live/list|overview|shell and /api/live/token/[address], server-side proxies to the worker
worker/         the live-data worker (Node + tsx): src/ (sources/, views/, store, score) and tests/
e2e/            Playwright specs and screenshots
```

Modules import from `shared/` and `modules/shell/` only. Each module loads its
data through one async function (`getExploreData()`, `getShellData()`) that
returns typed mock data; with the worker on, Explore loads through
`getLiveExploreData()` instead, which returns the same shapes.

## How a few things work

- **View state in the URL.** `?chain=sol&pad=pons&tab=locked&tf=1h&q=mo`, defaults
  left out. Controls write with `history.replaceState`, which Next.js syncs into
  `useSearchParams` without a server round trip.
- **Rendering.** Cache Components and Partial Prefetching are on (the Next 16
  defaults). Everything that doesn't depend on the URL is prerendered; the
  token list, search box and chain pill render at request time inside
  `<Suspense>`, so a shared link arrives already filtered.
- **One sweep clock.** The radar sweep, the blip pings, the status-bar fill and
  both "Next sweep" countdowns share one start time
  (`modules/shell/lib/sweep-clock.ts`). Each ping is delayed by the time the
  sweep's leading edge takes to reach its blip.
- **Reduced motion.** `prefers-reduced-motion: reduce` turns every animation and
  transition off; the countdown shows a static `0:04`.
- **Palette.** Matched to the logo: gunmetal steel surfaces, electric blue
  (`--accent`) from the chain glow and green (`--neon`) from the lock. Tints
  use the `--accent-rgb` / `--neon-rgb` channels, so a retheme is a
  `tokens.css` change.
- **Light and dark.** Dark is the default. The sun/moon button in the top bar
  (phones too), the rail's Theme item and the More sheet switch themes; the choice is saved
  in `localStorage` (`tonkpad-theme`). The light palette is the
  `:root[data-theme="light"]` block in `tokens.css` (text keeps 4.5:1). A tiny
  inline script in `<head>` applies a saved light theme before the first
  paint, so there is no dark flash and pages stay static. Token-card art tiles
  carry `data-theme="dark"` and keep the dark palette in both themes; use the
  `light:` variant for anything else that must differ (e.g. the sun/moon icon).
- **Languages.** English, Español, Português (BR), Français, Deutsch, Русский,
  Türkçe, 中文 (简体), 日本語, 한국어, Tiếng Việt and Bahasa Indonesia. English is
  the default and lives at the unprefixed URLs (`/`, `/live`); the others are
  prefixed (`/es`, `/ja/live`). Every page is under `app/[lang]` and
  prerendered for each language. `proxy.ts` rewrites unprefixed URLs to English
  and sends visitors who picked another language (the `tonkpad-lang` cookie,
  set by the language menus) to their prefix. Strings live in
  `shared/i18n/dictionaries/` (English is the typed source; a unit test checks
  every language has the same keys and `{placeholders}`). Server Components
  read them with `await getI18n()`, Client Components with `useI18n()`; both
  give `t` (the messages), `href()` (adds the language prefix to a link) and
  `lang`. Numbers, prices and tickers keep the design's en-US formatting.
  Unknown paths render a translated 404 inside the shell.
- **Launchpad marks** are each launchpad's own logo, as 96 px PNGs in
  `public/launchpads/` (`logo` in `shared/config/launchpads.ts`): Tonkpad's is
  the emblem; Bags, Moonshot (moonshot.com) and Bonk.fun come from their own
  sites; Pump.fun, Pons and Heaven from DefiLlama's copies (pump.fun blocks
  scripted requests, Pons's site has no icon file, heaven.xyz is down). A
  launchpad without a file shows its letter on its colour.
- **Chain marks** are the chains' own logos too, in `public/chains/`:
  Solana's from Solana Labs' token list on GitHub (solana.com rate-limits
  scripted requests), Robinhood Chain's from DefiLlama's copy.
- **Tonkpad's coin slot.** The hero's featured coin (Mission Pick in the
  design) is reserved for Tonkpad's own coin: until it launches it shows the
  emblem with "Coming soon" (`NativeCoin`). The worker still computes a
  pick; `MissionPick` can show the coin's price and Buy once it's live.
- **Heating up carousel.** A real scroll row that glides on its own
  (`hooks/useAutoScroll.ts`): the cards render three times and the position
  wraps by one copy for a seamless loop. Hover, keyboard focus, touch and the
  wheel pause it; Previous/Next step one card; reduced motion keeps it still.
- **Token table tiers.** All 11 columns from 1440 px; Holders and Smart
  money drop below that, Bonding curve and Volume below 1280 px, Mission
  score and Last 24h below 1024 px. It never scrolls sideways, and Market cap
  and Quick buy are always on screen. The page fills wide screens.
- **Phone layout (under 768 px).** The rail becomes a fixed seven-tab bar along
  the bottom (More opens the theme and language sheet); the top bar is one
  sticky row (logo, search, language, theme, alerts, wallet) with the ticker
  under it. Like Boxa, the bar uses compact 32 px buttons (globe-only
  language, 28 px logo; the wordmark waits until 640 px) so "Connect wallet"
  fits in full from 340 px; under 340 px it is a wallet icon. The wallet
  button can't wrap: with a very large system font its label ends in "…"
  instead. Languages whose phrase is much longer show their short "Connect"; Mission Pick becomes a featured card with a
  full-width Buy; Heating up is a swipeable row; the token list is a compact
  Token / Market cap / 24h / Quick buy list, and the chain filter joins its
  toolbar. Tablet and desktop keep the design exactly.

## Token Detail

`getTokenData()` returns typed mock details for Ghosty and every token in the
mock Explore list. The screen includes the header and watchlist, an interactive
Lightweight Charts chart, activity tables, About, a simulated trade panel and
bridge dialog, lock telemetry, crew payouts and scripted Captain Boo replies.
Chart timeframe/value and activity tabs are kept in the URL. The watchlist is
saved in the browser. Crew rewards and Locked Missions remain Tonkpad-only.

In mock mode, balances, quotes, trades and bridging are simulated. No wallet
connects and no funds move. Captain Boo answers from the selected token's
fixture data; it does not call an AI service.

With `WORKER_URL` set, `getLiveTokenData(address)` loads `/v1/token/:address`
and the browser refreshes through `/api/live/token/[address]` every four
seconds while visible. The worker token stays on the server. The page shows
the selected token's identity, market figures, measured holder balances when
available, live trades and top traders, and candles built from the worker's
observed market-cap history.
Solana addresses are case-sensitive; Robinhood Chain addresses accept either
case. Direct links and reloads use the same address as Explore.

**Live trades and top traders.** Pons tokens on their curve keep their last
100 curve trades and every wallet's totals since launch (`pons.book`, saved in
the snapshot). Solana tokens get theirs from Helius `getTransactionsForAddress`
while someone has the page open (`worker/src/trades/solana.ts`): the last 300
transactions on opening, then newer ones every 30 s, read as buys and sells
from the fee payer's balance changes. That costs 10 credits per 100
transactions, and a daily cap (`HELIUS_TRADES_DAILY_CREDITS`, 15,000 by default)
stops it until the next UTC day; `/health` shows the day's spend under
`trades`. Top traders rank wallets by what they sold minus what they bought, in
USD; win rate is the share of a wallet's sells above its average buy on this
token. Graduated Robinhood Chain tokens have no trade feed yet.

**Holders.** A Solana token someone opens is measured within a minute, whatever
its size, and keeps the decimals the holder check reports, so its rows can show.

The worker does not keep complete developer vesting schedules. These fields
remain unavailable, and the chart identifies its history as observed samples
rather than exchange trade candles. No volume is invented for those candles. An outage preserves
the last good view with a warning; an unknown address shows an unavailable
token state, with no fallback to a mock token. Live pages show the connected
wallet's real balances (see *Wallets*) with trading still closed, and no
simulated balances, swaps, bridging or Captain Boo. Full history/lock
integrations, quotes and swaps remain later work; see
`../prompts/02-token-detail.md`.

The browser suite captures `e2e/screenshots/token-1440.png` and
`token-1440-light.png`, plus German dark and Russian light phone views.
The interactive chart uses the same candle recipes as the reference, with
TradingView's axis spacing and attribution. The app keeps its approved logo,
chain logos, theme controls, and blue/green palette.

## Wallets

Phase 3 starts with connecting and reading only: nothing is ever signed or
sent. "Connect wallet" in the top bar (and the Wallet section of the More
sheet) offers a Solana or a Robinhood Chain wallet. Once connected, the button
shows the chain's mark and the short address. Its menu copies the full
address, connects or switches to the other chain (a wallet can be connected on
both at once) and disconnects everything. On a live token page the trade panel
shows the wallet's SOL or ETH and its holding of that token. Its trade button
stays disabled, with a note that trading opens soon. Mock token pages keep the
simulated panel.

- **Library.** Reown AppKit (`@reown/appkit` 1.8.24) with its Solana and
  Wagmi adapters, in `src/shared/wallet/appkit-driver.ts`. Robinhood Chain is
  viem's `robinhood` chain (id 4663, public RPC). The app turns off email and
  social sign-in, Reown Authentication (sign-in by signature), swaps, on-ramp,
  send, activity and analytics. The Reown dashboard can override most of these
  once a feature there carries its own settings, so keep them off there too.
  (On 10 Nov 2026 none did, so the app's switches applied.) Even with
  analytics off, AppKit always reports three events to Reown: initialize,
  connect success and social-login success.
- **Coinbase, Base and Safe connectors** are off: `@wagmi/connectors` is
  aliased to an empty module in `next.config.ts`. The real one would pull
  Coinbase's server SDK into the build. Coinbase Wallet still connects as a
  browser extension or through WalletConnect. `package.json` pins
  `@wagmi/connectors` to 8.2.2 (an npm override), the version wagmi 3.7.9
  itself uses.
- **Loaded on demand.** `src/shared/wallet/wallet.ts` is a small store. The
  wallet library is a dynamic import, made on the first Connect, or once the
  page is idle for someone who connected before (`tonkpad-wallet` in
  localStorage). Explore and the token page load none of it: about 3–4 KB
  gzipped of wallet UI joins their first load, and AppKit (about 1.5 MB
  uncompressed) arrives only on Connect.
- **Balances** come from `GET /api/wallet/[chain]/[owner]?token=<address>`.
  It answers only for addresses in the chain's own format and reads through
  the server: `SOLANA_RPC_URL`, else Helius with `HELIUS_API_KEY`, else
  Solana's public RPC; `ROBINHOOD_RPC_URL`, else Robinhood Chain's public
  RPC. Solana's public RPC refuses browser requests, so reading in the browser
  isn't an option. The CDN may share a response for 5 s; the page refreshes
  every 15 s while visible.
- **Keys.** Only `NEXT_PUBLIC_REOWN_PROJECT_ID` reaches the browser. In the
  Reown dashboard (dashboard.reown.com), add every domain the site runs on to
  the project's allowed domains. Without the project id the wallet menu says
  connecting is unavailable.
- **Tests.** The e2e builds set `NEXT_PUBLIC_WALLET_STUB=1`; production builds
  inline it as empty, so the stub is left out. The stub wallet
  (`src/shared/wallet/stub-driver.ts`) connects at once with fixed addresses,
  so no real wallet or Reown network is needed. The live suite reads balances
  from a local fixture RPC (`e2e/live/fixture-rpc.ts`, port 8789).

## Live data

The worker (`worker/src/main.ts`) is one small Node process that keeps every
token launched in the last 24 hours in memory and serves the screen's views
as JSON. The app never calls the data providers itself.

| Feed | Gives | Key |
|---|---|---|
| PumpPortal WebSocket | every new Pump.fun and Bonk.fun token, and each graduation | none |
| DexScreener `tokens/v1` | price, market cap, volume, change and trades per 5m / 1h / 6h / 24h | none |
| Helius DAS `getAssetBatch` | art, name and ticker, mint and freeze authority | `HELIUS_API_KEY` |
| Jupiter price v3 | SOL and ETH in the status bar | `JUPITER_API_KEY` |
| Robinhood Chain RPC (Alchemy) | gas in the status bar | `ROBINHOOD_RPC_URL` |
| Robinhood Chain public RPC | every Pons launch, curve trade and graduation, and each token's name, ticker and logo | none (`ROBINHOOD_LOGS_RPC_URL` overrides it) |
| Helius `getTransactionsForAddress` | live trades of Solana tokens with an open page, capped per day | `HELIUS_API_KEY` (`HELIUS_TRADES_DAILY_CREDITS`) |

- **Refresh.** New tokens refresh every 8 s, busy ones every 15–30 s and quiet
  ones every 2–20 minutes, which keeps DexScreener well under its limit. Views
  are recomputed at most once a second; `/api/live/*` responses are cached by
  the CDN for 2 s, so every visitor polling the same view shares one call.
  The browser polls the overview and the list every 4 s (the shell every
  10 s) while the tab is visible. Token Detail also polls every 4 s; its
  successful responses share the short CDN cache, while errors use `no-store`.
  Opening a token prioritizes its existing metadata and holder checks without
  adding another provider polling loop.
- **Trust.** Only a launchpad's own pools count (its bonding curve, then the
  AMM it graduates to, quoted in SOL or a stablecoin), so a side pool can't
  fake a price, and a "launch" whose pools are older than the launch is
  dropped. Trending, Gainers and Heating up skip tokens under $4K.
- **Art.** Pump.fun tokens show Pump.fun's own copy from the moment they
  launch. Other tokens' art comes from their metadata; IPFS links are
  re-pointed from rate-limited public gateways to Pump.fun's gateway (or
  Filebase's). Both are served as 256 px copies from Helius's image CDN. A
  token without art shows its first letter.
- **Helius budget.** Lookups (art, names, mint and freeze authority) go out
  as one batch a minute, up to 100 tokens each. A call costs 10 credits
  whatever its size, so lookups stay near 432K credits a month. Holder
  checks add 2 credits a token (3 the first time, without a known supply),
  for Solana tokens on screen worth $5K+, each every 30 minutes and at most
  3 a minute; smart money looks up each Solana graduate once (2 credits,
  about 100 a day). Together that stays well inside the free plan's 1M.
  `/health` reports `heliusCalls` and an estimate of `heliusCredits`.
- **Pons.** DexScreener doesn't list Pons's bonding curves, so the worker
  reads them from the chain: every 3 s it asks Robinhood Chain's public RPC
  for new launches, trades and graduations (Alchemy's free plan only
  allows 10-block log queries; blocks are 0.1 s apart). Each token is
  priced from its own curve: constant product over 1B virtual tokens and
  0.4 × the graduation amount, which reproduces every real trade exactly.
  Launches paired with ETH use Jupiter's ETH price, USDG counts as $1, and
  tokenized stocks (SPY, NVDA…) use their DexScreener price. A graduated
  token moves to Uniswap v4, where DexScreener takes over. Pons tokens are
  fixed-supply contracts with no mint or pause functions. A fresh start, or
  a gap of more than a day, rebuilds the last day from the chain.
- **Mission score v2** (`worker/src/score.ts`, approved 7 Nov 2026) adds up
  authorities, a burned or locked pool, the creator's launch buy and locks,
  the top-10 wallets' share, trading mix, crashes, volume, age and pool
  depth. For tokens valued at $20K+: the 10 largest wallets holding over
  50% cost 20 points (30–50%: 10; under 20% earns 5), and a pool holding
  under 5% of the market cap costs 20 (never Safe); under 2% the score is
  capped at 30, Risky.
- **Locks** (`worker/src/locks.ts`, `worker/src/sources/streamflow.ts`):
  Solana creators lock tokens with Streamflow, whose escrow token accounts
  own themselves. When a holder check finds one among the 20 largest
  accounts, the worker reads its Streamflow record (10 credits, at most 3
  new ones a minute, re-read every 6 hours) and works out how much stays
  locked when. Locked Missions, the Locked badge and its tab, are reserved
  for tokens launched on Tonkpad (the owner's call): a Tonkpad launch with a
  lock nobody can cancel or speed up, 7+ days left and 1%+ of supply (the
  biggest share first); until Tonkpad launches they stay empty. On other
  launchpads locks count in the score only: with 30+ days left, the
  creator's own lock earns 10 points when it holds half their tokens, and it
  waives the launch-buy penalty when it holds half that buy. The graduation +10 now means a
  burned or locked pool: Pump.fun burns its PumpSwap LP (checked on-chain:
  the LP supply is 0) and Pons locks its Uniswap v4 position; Bonk.fun's
  migration pool isn't verified yet, so its graduates don't get it.
- **Top-10 holders** (`worker/src/sources/holders.ts`) come from Helius's 20
  largest token accounts and their owners (the score counts them from $20K). Owners off the ed25519 curve are
  program addresses (bonding curves, pools, lock escrows, pump.fun's Mayhem
  agent) and are left out, as are burn addresses; so is a team's multisig
  vault, which is rare for launches. A supply spread over hundreds of equal
  wallets still reads as well spread: the pool-depth cap is what catches it.
- **Verified issuers** (`worker/src/issuers.ts`): xStocks and Ondo Global
  Markets hold mint and freeze authority by design. A token whose two
  authorities both match an issuer's, and which Jupiter verifies under that
  issuer's tag, scores those as +15, skips the creator-buy, holder and pool
  checks, and shows the Verified RWA badge. The addresses were read on-chain
  from mints the issuers list (xstocks.com/products, Ondo's address page).
- **Holder counts** (the Holders column): Solana tokens get Jupiter's count,
  up to 100 tokens a request, every 2 minutes for tokens on screen and every
  20 for other listed ones (no Helius cost). Pons tokens are counted from
  their curve trades: buys credit the recipient (routers name the user
  there), sells debit the seller. That is exact on the curve but blind to
  Uniswap after graduation, so graduated Pons tokens on screen are checked
  on Blockscout (`worker/src/sources/blockscout.ts`, `BLOCKSCOUT_API_KEY`)
  hourly instead: the holder count, and the 50 largest holders for the
  top-10 share and smart money, leaving contracts such as the pool and the
  locker out. That is 50 credits a check, at most 2 a minute, and the worker
  stops at 80K of the free plan's 100K credits a day. Until a check, the
  column shows —. The same curve balances give Pons tokens their top-10 share.
- **Smart money** (`worker/src/smart/`): wallets that keep getting in early
  on tokens that graduate. Each graduation credits wallets, never its
  creator's: a Pons graduate its first 20 buyers (from its curve trades), a
  Solana graduate its 20 largest wallets at graduation (one Helius lookup; a
  stand-in for early buying, since Solana trade data costs money). A wallet
  credited by graduates from 3 or more different creators within 30 days is
  smart money. Each token counts the smart wallets among its holders (every
  wallet on a Pons curve, the largest wallets elsewhere), which fills the
  Smart money column and tab. A graduate credits its wallets six hours on,
  and only if it held up (still worth half its graduation value and at
  least $10K): bundles that push a token to graduation and dump it would
  otherwise pass as smart money. One that held up but was missed at
  graduation credits the wallets holding it most by then. Credits are kept
  in the snapshot; after a restart, graduates that credited nobody are
  judged again. A manual add/drop list comes later.
- **Not tracked yet:** Jupiter Lock and pool locks on top of a launchpad's
  own (none seen on screen yet), locks on Robinhood Chain, and the other
  Solana launchpads (Bags, Moonit, Heaven).
  Bonk.fun tokens show up in New pairs but have no market data until they
  graduate (DexScreener doesn't index their curve).
- **Restarts.** The worker saves a snapshot every minute and on shutdown
  (`worker/.state/`, ignored by git), including how far it has read the
  Pons logs, and picks up where it left off.

## Deploy on Vercel

- Import the repository and set **Root Directory** to `web`. The framework
  preset (Next.js), build command and output are detected; no `vercel.json` is
  needed.
- Use Node 22 or 24 (`engines.node` is `>=22`).
- `/` (and `/es`, `/ja`, …) is served as a partial prerender (static shell
  from the CDN plus a streamed request-time part). Token Detail also streams
  its request-time data; the placeholder screens are fully static in every
  language. `proxy.ts` runs for page requests to pick the
  language; it needs no configuration. If you add a folder to `public/`, add
  it to the proxy's `matcher` so its files aren't treated as pages. Fonts are
  self-hosted by `next/font` at build time and token art is served from
  `public/tokens/`.
- **Live data in production.** The worker runs on Railway; Railway's
  config files are deprecated, so these are dashboard settings. New project →
  Deploy from GitHub repo → this repository, then on the service:
  - **Root Directory** `/web`; **Custom Build Command** `node --version` (the
    worker runs from TypeScript, so the Next.js build is skipped);
    **Custom Start Command** `npm run worker`; **Healthcheck Path** `/health`.
  - **Variables** `HELIUS_API_KEY`, `JUPITER_API_KEY`, `ROBINHOOD_RPC_URL`,
    `WORKER_TOKEN` (a long random string, e.g. `openssl rand -hex 32`),
    `SNAPSHOT_PATH=/data/snapshot.json` and `PORT=8080`.
  - **Volume** mounted at `/data`, so restarts keep the last day of tokens.
  - **Networking** → Generate Domain on port 8080. `https://<domain>/health` should answer
    `{"ok":true,…}`; `/v1/*` answers 401 without the token.

  Then in Vercel set `WORKER_URL` (that domain, with `https://`) and the same
  `WORKER_TOKEN` for Production, and redeploy. For wallets, also set
  `NEXT_PUBLIC_REOWN_PROJECT_ID`, plus `HELIUS_API_KEY` and `ROBINHOOD_RPC_URL`
  so balances don't depend on the rate-limited public RPCs (server-only, never
  `NEXT_PUBLIC_`). Without `WORKER_URL` the site
  shows the mock data. In live mode `/` streams in at request time behind a
  loading skeleton.
