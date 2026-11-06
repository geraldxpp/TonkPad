# Tonkpad.fun — web

The Tonkpad.fun token terminal (Solana + Robinhood Chain), built module by module
from the approved design in `../design-reference/`. Project rules live in
`../CLAUDE.md`; module briefs live in `../prompts/`.

Built so far: **Module 1 — app shell + Explore** (`/`), in dark and light
themes and twelve languages. Explore runs on mock data, or on **live
Pump.fun and Bonk.fun launches** from the live-data worker (`worker/`,
see below). The other rail screens (`/live`, `/bridge`,
`/portfolio`, `/launch`, `/docs`, `/token/[ticker]`) show a "Coming in a later
module" panel inside the shell.

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
  shared/       ui/ primitives, lib/ (format, seeded-random, sparkline, url-params), config/, types/,
                i18n/ (languages, dictionaries, getI18n / useI18n)
  styles/       tokens.css (design tokens), animations.css (all motion), globals.css (Tailwind theme)
  shared/live/  the worker's JSON contract helpers: server-side fetch, usePolling, query strings
  app/api/live/ /api/live/list|overview|shell, a CDN-cached proxy to the worker
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
| Robinhood Chain RPC | gas in the status bar | `ROBINHOOD_RPC_URL` |

- **Refresh.** New tokens refresh every 8 s, busy ones every 15–30 s and quiet
  ones every 2–20 minutes, which keeps DexScreener well under its limit. Views
  are recomputed at most once a second; `/api/live/*` responses are cached by
  the CDN for 2 s, so every visitor polling the same view shares one call.
  The browser polls the overview and the list every 4 s (the shell every
  10 s) while the tab is visible.
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
  whatever its size, so the worker stays under about 432K credits a month,
  well inside the free plan's 1M.
- **Mission score v1** (`worker/src/score.ts`) is a placeholder built from
  what the worker knows: authorities, graduation, the creator's launch buy,
  trading mix, crashes, volume and age.
- **Not tracked yet:** holders (shown as —), smart money and locked missions
  (empty tabs), Robinhood Chain and Pons, and the other Solana launchpads.
  Bonk.fun tokens show up in New pairs but have no market data until they
  graduate (DexScreener doesn't index their curve).
- **Restarts.** The worker saves a snapshot every minute and on shutdown
  (`worker/.state/`, ignored by git) and picks up where it left off.

## Deploy on Vercel

- Import the repository and set **Root Directory** to `web`. The framework
  preset (Next.js), build command and output are detected; no `vercel.json` is
  needed.
- Use Node 22 or 24 (`engines.node` is `>=22`).
- `/` (and `/es`, `/ja`, …) is served as a partial prerender (static shell
  from the CDN plus a streamed request-time part); the other screens are fully
  static in every language. `proxy.ts` runs for page requests to pick the
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
    `WORKER_TOKEN` (a long random string, e.g. `openssl rand -hex 32`) and
    `SNAPSHOT_PATH=/data/snapshot.json`. Railway sets `PORT` itself.
  - **Volume** mounted at `/data`, so restarts keep the last day of tokens.
  - **Networking** → Generate Domain. `https://<domain>/health` should answer
    `{"ok":true,…}`; `/v1/*` answers 401 without the token.

  Then in Vercel set `WORKER_URL` (that domain, with `https://`) and the same
  `WORKER_TOKEN` for Production, and redeploy. Without `WORKER_URL` the site
  shows the mock data. In live mode `/` streams in at request time behind a
  loading skeleton.
