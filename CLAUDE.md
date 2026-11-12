# tonkfun.fun — web app

tonkfun.fun (formerly Tonkpad.fun; the domain is still tonk-pad.vercel.app) is a token terminal for Solana and Robinhood Chain. Its screens are Explore, Token Detail, Swap, Launch (Creator Studio), Bridge and Portfolio. We build it one module (screen) at a time from the approved design in `design-reference/`, restyled by the tonkfun.fun redesign (10 Nov 2026, the owner's call): `design-proposals/Tonkfun.fun-Explore-Design.zip` holds Explore and Token Detail as built, plus Swap, Bridge, Portfolio and Launch for later. Where the two differ, the redesign wins. Swap is built (module 3, 10 Nov 2026). Launch, the Creator Studio, is built (module 4, 10 Nov 2026) for the testnet site: there it launches real tokens on Robinhood Chain Testnet, and on production it stays "coming soon" until mainnet contracts exist. On the testnet site the token page reads those launches from the chain (phase 2, 10 Nov 2026): Buy and Sell on the curve, a holder's reward claim, and the creator's tools. Portfolio is built (module 5, 11 Nov 2026): the connected wallets' holdings and activity, read live from the chains. Bridge is built (module 6, 11 Nov 2026): major assets between 17 networks, into Robinhood Chain above all, by the best live route.

## Folders
- `design-reference/` — the approved design. Read-only: never edit anything in it.
  - `<screen>.html` opens in any browser and runs the design as built, motion included.
  - `<screen>.dc.html` is the design canvas source: markup with every exact style value, plus a `<script type="text/x-dc">` block holding the data and filter logic.
  - `screenshots/` has full-page captures at 1440 px wide.
- `prompts/` — one task prompt per module (`01-explore-page.md`, then more later).
- `web/` — the app. All code goes here.

## Stack (ask before changing any of this)
- Next.js with the App Router, latest stable. React + TypeScript in strict mode. npm.
- Tailwind CSS, latest stable. Design tokens are CSS variables in `web/src/styles/tokens.css`, mapped into the Tailwind theme.
- Icons from `lucide-react` (names below). Never emoji as icons.
- Fonts through `next/font/google`: Bricolage Grotesque 700/800 for display, Geist 400–700 for UI, Geist Mono 400–600 for every number, ticker, price and address.
- Tests: Vitest + Testing Library for units, Playwright for end-to-end and screenshots.

## Code layout
```
web/src/
  app/[lang]/          routes only, one tree per language; each page file just renders its module
  proxy.ts             language routing: English unprefixed (/swap), others prefixed (/es/swap)
  modules/
    shell/             chrome every screen shares: AppShell, SideRail, TopBar, TickerTape, ChainFilter, StatusBar, Logo
    explore/           module 1: components/, hooks/, lib/, data/, tests
    token/             module 2: token detail (its live Buy/Sell runs on shared/swap); on the testnet site,
                       a mission read from the launchpad (MissionView, components/curve/)
    swap/              module 3: the Swap screen (card, token picker, Recent, token and route cards)
    launch/            module 4: the Creator Studio (four cards, token preview, Mission score, summary, review, receipt)
    portfolio/         module 5: the Portfolio screen; server/ reads holdings, activity and market history behind /api/portfolio/*
    bridge/            module 6: the Bridge screen; server/ compares Relay, Across, LI.FI and the canonical bridge behind /api/bridge/*
    security/          the Security page (/security, from the footer): report, scope with the frozen build's hashes, rules, rewards, checks
    docs/              module 11: the Docs page (/docs), ten sections checked against the deployed contracts; its live figures read the launchpad in the browser, the mainnet addresses are lib/contracts.ts
  shared/
    ui/                Badge, ChainMark, PadMark, TokenAvatar, ScorePill, CurveBar, Sparkline, Segmented, Tabs, Button, IconButton, Chip, Sheet
    lib/               format.ts, seeded-random.ts, sparkline.ts, cn.ts
    config/            chains.ts, launchpads.ts
    i18n/              config.ts (languages, path helpers), dictionaries/ (en.ts is the source), server.ts (getI18n), I18nProvider.tsx (useI18n)
    types/             token.ts and friends
    swap/              the swap engine both Swap and token pages use: tokens, amounts, quotes (useQuote),
                       the run (useSwapRun: build → approve → sign → send → confirm), the review dialog, Recent;
                       server/ holds the Jupiter (Solana) and 0x (Robinhood Chain) clients behind /api/swap/*
    wallet/            wallet store and drivers (Reown AppKit; a stub for e2e), balances, signing
    tonk/              tonkfun.fun's own launchpad contracts: networks and addresses, the curve and lock maths, launch rules,
                       the Mission score (at launch and on a live mission), mission metadata and types,
                       token images (image.ts, the picker and its upload);
                       server/ reads the chain and builds launches, trades and actions behind /api/tonk/*,
                       and checks, re-encodes and stores token images behind /api/tonk/image
  styles/              tokens.css, animations.css, globals.css
web/public/tokens/     token art, copied from design-reference/assets/tokens
web/worker/            live-data worker (Node + tsx): feeds in, the screens' JSON views out
```

Rules:
- A module owns its components, hooks, data and tests. Modules import from `shared/` and `modules/shell/` only, never from another module.
- Components are presentational and typed; data comes in through props. Each module loads its data through one async function (Explore: `getExploreData()`) that returns typed mock data. When `WORKER_URL` is set, a module's live loader (Explore: `getLiveExploreData()`) returns the same shapes from the worker, and the browser refreshes them through `/api/live/*`. Mock data stays the default and is what the tests run on.
- View state (filters, tabs, timeframe, search) lives in URL search params so any view can be shared.
- Every user-facing string, aria-label and title comes from the dictionaries: `await getI18n()` in Server Components, `useI18n()` in Client Components. Add each new key to `en.ts` and all eleven other languages (a unit test enforces matching keys and `{placeholders}`). Internal links go through `href()` so they keep the language. Names of tokens, chains and launchpads, tickers and numbers are not translated; numbers keep en-US formatting.
- No `any`. Named exports. Keep files short (aim for under 200 lines).
- Build only what the module prompt asks for. If something is unclear, ask instead of guessing.
- Swaps (owner's decisions, 10 Nov 2026): Jupiter Swap V2 `/build` on Solana and 0x AllowanceHolder on Robinhood Chain, from server routes only (`JUPITER_API_KEY`, `ZEROX_API_KEY`, the RPC keys and the fee wallets never reach the browser). tonkfun.fun takes 1% (`FEE_BPS`): on Solana as a SOL (or USDC) transfer to `SOLANA_FEE_WALLET` added to the swap transaction, from the input before the route or from the minimum output after it; on Robinhood Chain through 0x's integrator fee to `EVM_FEE_WALLET`. Real swaps are behind a switch: the server builds and sends transactions only with `SWAP_TRADING=on`; quotes work either way. Every swap is signed in the user's own wallet after the "One last look." review. Tests never call the real APIs: e2e configs blank the swap keys and stub `/api/swap/*` in the browser. Never run a real swap from a test or script.
- Launch (owner's decisions, 10 Nov 2026; `prompts/04-launch-creator-studio.md`): the deployed contracts are the source of truth for every rule and number. The screen reads the launch fee and reserves from the launchpad and mirrors its maths in integers (`shared/tonk/curve.ts`); nothing is hard-coded from the design. `NEXT_PUBLIC_TONK_NETWORK` picks the mode: unset keeps Launch "coming soon" (production); `testnet` wires the app to Robinhood Chain Testnet (chain 46630), where `rh` means the testnet everywhere, a TESTNET badge shows, Solana and swaps are off, and screens not yet on testnet say so instead of showing mock tokens; `mock` is the demo the tests run on. The server builds and simulates a launch (`/api/tonk/launch`); only the creator's wallet sends it, after the "One final look." review, and a launch counts only with a confirmed receipt. Never send a transaction from a test or script. The testnet site is its own production build: after changing anything it shows or reads, run `npm run test:e2e:testnet` too (it builds in `testnet` mode against a local stand-in RPC; the other runs never build that mode). The launch-time Mission score is v2 plus +5 for Crew Rewards of 1% or more, held to the worker's by a test. A token's image is optional (see Token images).
- Token page on testnet (owner's decisions, 10 Nov 2026; section 14 of `prompts/04-launch-creator-studio.md`): on the testnet site `/token/<address>` shows a mission read from the launchpad, every figure in test ETH and none in dollars; production's and the demo's token page are unchanged. The contract has no quote function, so `shared/tonk/curve.ts` mirrors its buy and sell maths in integers. The server (`/api/tonk/trade`, `/api/tonk/action`) reads the mission at one block, simulates the exact call there and builds it only when the contract's answer equals the mirrored quote; it holds no key. A sell's approval is for exactly the amount sold. The Crew fee is charged only while someone eligible holds the token, a sell pays out at most the ETH really in the curve, and buys wait out the launch-block shield (the L2 block from ArbSys, never a timer). Only the visitor's wallet sends; a trade, claim, lock extension or edit counts only from its confirmed receipt's event, and the hash stays in the URL (`?tx=` for a trade, `?action=<kind>:<hash>` for the rest) so a reload never sends again. Extending a linear vest re-vests only what hasn't unlocked (what has unlocked stays claimable), and a lock can never be shortened: the screen says both before the wallet opens. What needs the indexer (holders, top traders, the top-10 share) says "Not on testnet yet" rather than showing a stand-in. Everything a token says about itself is untrusted (the contract sets no maximum on a name, a ticker or its stored texts): the server bounds it, and it is only ever shown as text. The Mission score there comes from chain facts and is held to the worker's over a lock's life by a test. Until Explore lists testnet tokens, a token is found by its address or in the latest launches on the testnet Explore page, or from the launch receipt.
- Portfolio (owner's go-ahead, 11 Nov 2026; `prompts/05-portfolio.md`): the screen reads and shows, and never signs or sends. A token counts only with a real market behind its price (Jupiter's liquidity and audit on Solana; DexScreener's deepest trustworthy pool on Robinhood Chain); the rest count for nothing and sit behind a warning. Stablecoins are known by address, never by ticker. The chart is the wallet's current holdings at past prices, not past balances, and says so. Text from the chain is cleaned on the server and the CSV guards against spreadsheet formulas. No new keys. On the testnet site it says "Not on testnet yet" and its routes are closed.
- Bridge (owner's go-ahead, 11 Nov 2026; `prompts/06-bridge.md`): networks, assets and the contracts a route may call or approve are fixed lists (`modules/bridge/lib/networks.ts`, `server/contracts.ts`); a provider pointing anywhere else has its route dropped, so a provider's upgrade means updating that list. Relay, Across, LI.FI and, for ETH from Ethereum, the canonical bridge are compared from server routes only. Real transfers are behind a switch: the server builds them only with `BRIDGE_TRADING=on`; quotes work either way. Every transfer is signed in the user's own wallet after the "Check your destination." review; approvals are for exactly the amount sent; a transfer is rebuilt after the review and refused if it would deliver over 0.5% less. A transfer is saved as soon as it has a transaction, so a reload never sends it again, and it counts as delivered only from the route's own report. Tests never call the real APIs: e2e configs set `BRIDGE_PROVIDERS=off` and stub `/api/bridge/*` in the browser. Never run a real transfer from a test or script. On the testnet site it says "Not on testnet yet" and its routes are closed.
- Mainnet launchpad (owner's decisions, 11 Nov 2026; `prompts/07-mainnet.md`): `NEXT_PUBLIC_TONK_NETWORK=mainnet` connects Robinhood Chain mainnet only once `NEXT_PUBLIC_TONK_LAUNCHPAD`, `NEXT_PUBLIC_TONK_MIGRATOR` and `NEXT_PUBLIC_TONK_LAUNCHPAD_BLOCK` hold the deployment's read-back; until then Launch stays "coming soon". The owner deploys from their own wallet (`script/DeployTonkpadMainnet.s.sol` in the contract project's `mainnet` copy, which carries the review's fixes H-1 and M-1 to M-4) and a 2-of-3 Safe accepts ownership; never deploy, sign or send for them. On mainnet a mission page counts in dollars at the live ETH price (unavailable without one); buys and launches are refused unless the launchpad's `graduationMigrator()` is the deployed one; a beta notice shows while `LAUNCHPAD_AUDITED` is false; a Creator Rewards tier above 0.5% needs 10M tokens locked. Graduated tokens trade on their Uniswap v4 pool through Uniswap's official Universal Router: quotes from V4Quoter, the exact swap run at the quote's block with the quote as its minimum before it is built, a sell's Permit2 approval exact and the router's allowance exact for 30 minutes, and a receipt counted only from the PoolManager's `Swap` on that token's pool. Pools are used only through the migrator's own `poolKey(token, fee)`, whose hook must be its initialization guard, never a look-alike pool for the same token. Anyone may share a graduated pool's fees (`distributePostGradRewards`) from the token page. While `NEXT_PUBLIC_TONK_LAUNCH_INVITES` lists creator wallets, Launch is invite-only for every other wallet, and the server won't build their launch. It is a soft gate: the contract stays permissionless, and the code says so. A testnet preview can name a fresh deployment through the same three values, plus `NEXT_PUBLIC_TONK_UNISWAP_POOL_MANAGER`, `_ROUTER`, `_PERMIT2` and `_QUOTER` for its router and quoter. Mainnet never reads those. After changing anything mainnet mode shows or reads, run `npm run test:e2e:mainnet` (a mainnet-mode build against the local stand-in RPC).
- Launchpad indexer (owner's approval, 12 Nov 2026; `prompts/10-launchpad-indexer.md`): the worker follows tonkfun.fun's mainnet launchpad from its deployment block (`worker/src/tonk/`), keeping the whole history and its cursor in the snapshot, with chunked `getLogs` on Robinhood Chain's RPC (never the Blockscout API). Explore lists the launches by the same rules as every token, never pinned. Prices come from `CurveTrade`'s reserves, then only from the PoolManager's `Swap` on the pool id of the migrator's guarded `poolKey(token, fee)`; never DexScreener. Holders are exact from each token's Transfers; the launchpad (curve, and the creator's locked tokens as a "Locked (creator)" row), PoolManager, migrator and 0xdead are labelled and not counted, nor is dust under one token. The Mission score and Locked badge are the token page's own functions on the same chain facts, held together by a test. The mainnet token page reads holders, top traders and the top-10 share from the worker and says "Data unavailable" without it; testnet stays as it is. Pushing anything under `web/worker/` redeploys the Railway worker.
- Token images (owner's approval, 12 Nov 2026; `prompts/12-token-images.md`): a creator adds an image in Launch's Basics or in the token page's Edit details (`shared/tonk/ImagePicker.tsx`). `POST /api/tonk/image` takes PNG, JPEG, WebP or GIF up to 2 MB, signed by the uploader's EVM wallet (an EIP-191 message naming the site, the wallet, the file's SHA-256 and a time within 5 minutes, checked with viem), from an invited wallet while `NEXT_PUBLIC_TONK_LAUNCH_INVITES` is set, at most 10 an hour per wallet (counted in the Blob store, so it holds across instances). `sharp` re-encodes it to a 512 × 512 WebP (centre-cropped, metadata stripped, an animation's first frame), stored in Vercel Blob as `token-art/<sha256>.webp`; nothing is stored unless it decodes. Its address goes in the metadata's optional `image` (still `v: 1`). Only images on `NEXT_PUBLIC_TONK_IMAGE_HOST` (one exact hostname, never a wildcard) are ever shown: the app, the worker and Next's `images.remotePatterns` drop every other address. The owner hides an image by its hash in `TONK_HIDDEN_IMAGES` (server and worker only, so the browser never receives a hidden image). The store is a public Blob store connected to the project, which Vercel reaches by the project's OIDC token (`BLOB_STORE_ID`; a `BLOB_READ_WRITE_TOKEN`, where set, wins); without either the route answers `closed` and the picker says images aren't set up. The e2e builds (the stub wallet's) keep uploads in memory, and the stub signs with a test-only key; never upload anywhere real from a test or script.
- The hero's featured coin (the reference's Mission Pick) is reserved for tonkfun.fun's own coin: until it launches it shows the rounded T with "Coming soon" (owner's request). `MissionPick` stays for when the coin goes live.
- Internal storage keys keep their old names (`tonkpad-theme`, `tonkpad-lang`, `tonkpad-watchlist`, `tonkpad-wallet`) so returning visitors keep their settings; new keys take the same prefix (`tonkpad-launch-draft:<chainId>`, `tonkpad-ref:<chainId>`, `tonkpad-portfolio-hidden`, `tonkpad-bridge-recent`).

## Design tokens
The palette is the tonkfun.fun redesign's: graphite surfaces with the brand cyan of the rounded T, and green for gains and locks. It replaces the earlier gunmetal-and-blue palette and the violet one in `design-reference/`; where they differ, these values win.

| Token | Value | Use |
|---|---|---|
| --bg | #080D10 | page |
| --bg-deep | #060A0D | rail, status bar |
| --surface | #0E161B | cards, table |
| --raised | #151F25 | inputs, menus, hovered row |
| --input | #1B2B33 | active segment |
| --line | #213039 | borders, dividers |
| --line-strong | #344954 | stronger borders |
| --text | #F0F5F7 | primary text |
| --text-2 | #A7B6BE | secondary text |
| --text-3 | #81959F | tertiary text (keeps 4.5:1 contrast on --bg) |
| --accent | #00D7E8 | brand cyan (tints use `--accent-rgb`) |
| --accent-text | #58E5EF | cyan text |
| --cta | #24DBEA | primary button (text `--on-cta` #03282E) |
| --neon | #3DDC84 | green (tints use `--neon-rgb`) |
| --cyan | #3FD8F0 | smart money |
| --pos | #3DDC84 | gains, Buy (text #03140B) |
| --neg | #FF5C74 | losses |
| --warn | #FFB547 | caution |
| --gold | #F4C553 | crew rewards, graduated |
| --hot | #FF7A45 | hot |
| --locked | #3DDC84 | locked missions |
| --agent | #B8ACFF | token agent |
| --track | #252A31 | empty progress track |

Gradients (bonding curve, sweep bar) run --accent → --accent-text (`--gradient-brand`). Focus ring everywhere: 2px solid --cta with a 2px offset (#24DBEA in dark). The tonkfun.fun mark itself is #00CDE6 in both themes.

Dark is the default theme. Light is opt-in (top-bar sun/moon, the rail's Theme item, the More sheet), saved in localStorage, applied before first paint by an inline script, and defined in `tokens.css` under `:root[data-theme="light"]`:

| Token | Light | | Token | Light |
|---|---|---|---|---|
| --bg | #F2F6F8 | | --accent | #087C8A |
| --bg-deep | #EAF1F4 | | --accent-text | #006C7A |
| --surface | #FFFFFF | | --cta | #087888 (text #FFFFFF) |
| --raised | #EDF3F6 | | --neon | #18A957 |
| --input | #DFEAF0 | | --pos, --locked | #08703A (Buy text #FFFFFF) |
| --line | #DBE5EB | | --neg | #C42339 |
| --line-strong | #C3D3DC | | --warn | #8A5A00 |
| --text | #0D1117 | | --gold | #805B00 |
| --text-2 | #3F4754 | | --hot | #D4561C |
| --text-3 | #5E6675 | | --agent | #5B47C9 |
| --track | #DCE1E8 | | --cyan | #057285 |

Light text colours keep 4.5:1 on their backgrounds and tints. Token-card art tiles stay dark in both themes (`data-theme="dark"` on the card scopes the dark tokens). A token without art shows its letter on teal (`--art-tile`, `--art-scene`, ink `--art-ink`), the same in both themes. Never hard-code a theme colour; use a token, and the `light:` variant only where a token can't express the difference.

## Badges
| Badge | Text | Background | Border | Icon |
|---|---|---|---|---|
| Locked | #3DDC84 | --locked at 14% | --locked at 38% | Lock |
| Crew 2% | #F4C553 | --accent at 16% | rgba(244,197,83,.38) | Zap, filled |
| Agent | #B8ACFF | --agent at 14% | --agent at 38% | Bot |
| Hot | #FF7A45 | rgba(255,122,69,.14) | none | Flame, filled, icon only |
| OG | #F4C553 | rgba(244,197,83,.14) | none | Crown, filled |
| New | #7DB8F5 | --accent at 14% | none | Zap, filled |
| Graduated | #F4C553 | rgba(244,197,83,.14) | none | GraduationCap |
| Verified RWA | #7DB8F5 | --accent at 14% | --accent at 38% | ShieldCheck |
| Block-0 Shield | --accent-text | --accent at 14% | --accent at 38% | ShieldCheck |

Block-0 Shield marks a tonkfun.fun launch: a 99% tax on every separate buy in the launch block and the next one (its tooltip says so).

Locked marks a Locked Mission and, with the Locked Missions tab, is reserved for tokens launched on tonkfun.fun (the owner's call, 7 Nov 2026); locks on other launchpads only count in the Mission score.

On token-card art, Locked, Crew and Agent use the slightly stronger fills from the reference (.16 / .20 / .16 backgrounds, .42 borders), and Verified RWA uses --accent at 16% with a .42 border. Verified RWA marks a tokenized stock or RWA from a verified issuer (live data only); its tooltip names the issuer.

Mission score pill: Safe = #3DDC84 on --pos at 12% with ShieldCheck. Caution = #FFB547 on rgba(255,181,71,.13) with ShieldCheck. Risky = #FF5C74 on rgba(255,92,116,.12) with TriangleAlert.

## Chain and launchpad marks
Chain and launchpad marks use each one's own logo (the owner's decision, 6 Nov 2026, replacing the earlier stand-in rule): a 96 px PNG in `web/public/chains/<id>.png` or `web/public/launchpads/<id>.png`, set as `logo` in `shared/config/chains.ts` or `launchpads.ts`. tonkfun.fun's is its rounded T (`web/public/launchpads/tonk.svg`). A chain or launchpad without a logo file shows its letter on its colour from the table below. Add any new public folder like these to the matcher in `proxy.ts`.

| Mark | Shape | Background | Letter |
|---|---|---|---|
| Solana | circle | linear-gradient(135deg, #9945FF, #19FB9B) | S, #0B0A1A |
| Robinhood Chain | circle | #CCFF00 | R, #0E1400 |
| tonkfun.fun (id `tonk`) | rounded square | #00CDE6 | T, #03282E |
| Pons | rounded square | #2DD4BF | Pn, #032A25 |
| Pump.fun | rounded square | #3BE2A0 | P, #05261A |
| Bonk.fun | rounded square | #FF9B2F | B, #2B1500 |
| Bags | rounded square | #33C2FF | G, #00243A |
| Moonshot | rounded square | #FFD24A | M, #2B2000 |
| Heaven | rounded square | #FF7EC8 | H, #2E0A1F |

## Icons (lucide-react)
Compass (Explore), ArrowDownUp (Swap; also the flip button), History (Recent swaps), Eye (review), Layers (route), ArrowRightLeft (Bridge), Wallet (Portfolio), Bell (Alerts), Rocket (Launch), BookOpen (Docs), Sun (Theme; Moon while light), Ellipsis (More), Globe (Language), Check, X (Close), Search, ChevronDown, ChevronLeft, ChevronRight, Target (Mission Pick), ShieldCheck, TriangleAlert, Lock, Zap, Bot, Flame, Crown, GraduationCap, SlidersHorizontal (trade settings), ArrowUpRight (open a token), Radio (launch radar), Gift (Refer & earn), Save (Save draft), Hourglass (Time-lock), TrendingDown (Linear vesting), LockOpen (No lock), Users (Crew Rewards), LineChart (starting cap), Copy, ImageUp (token image). The logo is tonkfun.fun's rounded T, drawn inline by the `Logo` component (its `size` is the width; the height follows the mark's shape). The favicon and Apple icon (`web/src/app/icon.svg`, `icon.png`, `apple-icon.png`) are the same T on the page colour. The rail groups the screens under Workspace (Explore, Swap, Bridge, Portfolio, Alerts, Launch) and Docs under Resources; on phones the tab bar shows Explore, Swap, Bridge, Portfolio, Launch, Docs and More, and token pages swap it for their Buy / Sell bar; with a wallet connected, Portfolio swaps it for Receive / Swap / Bridge.

## Motion
CSS keyframes live in `styles/animations.css`. Turn every animation and transition off under `prefers-reduced-motion: reduce`. No animation library unless a module prompt asks for one.

## Done means
- Side by side with its reference screenshot at 1440 px wide, the screen matches (fonts may anti-alias a little differently).
- No horizontal page scroll at 390 px wide, in both themes and in a long language (German, Russian).
- `npm run lint`, `npm run typecheck`, `npm test` and `npm run test:e2e` all pass.
- Every control works with the keyboard and shows the focus ring.
- You report what you built, how to run it, anything you could not match, and screenshots of the result.
