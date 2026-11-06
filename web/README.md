# Tonkpad.fun — web

The Tonkpad.fun token terminal (Solana + Robinhood Chain), built module by module
from the approved design in `../design-reference/`. Project rules live in
`../CLAUDE.md`; module briefs live in `../prompts/`.

Built so far: **Module 1 — app shell + Explore** (`/`), in dark and light
themes and twelve languages. The other rail screens (`/live`, `/bridge`,
`/portfolio`, `/launch`, `/docs`, `/token/[ticker]`) show a "Coming in a later
module" panel inside the shell.

## Run it

```bash
npm install
npx playwright install chromium   # once, for the e2e tests
npm run dev                       # http://localhost:3000
```

| Script | What it does |
|---|---|
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` / `npm start` | Production build / serve it |
| `npm run lint` | ESLint (Next.js core-web-vitals + TypeScript rules) |
| `npm run typecheck` | `next typegen` (route types) then `tsc --noEmit` |
| `npm test` | Vitest + Testing Library unit and component tests |
| `npm run test:e2e` | Playwright against a production build on port 3100; also writes the captures in `e2e/screenshots/` |

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
e2e/            Playwright specs and screenshots
```

Modules import from `shared/` and `modules/shell/` only. Each module loads its
data through one async function (`getExploreData()`, `getShellData()`) that
returns typed mock data today and will call the API later.

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
- **Light and dark.** Dark is the default. The sun/moon button in the top bar,
  the rail's Theme item and the More sheet switch themes; the choice is saved
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
  sticky row (logo, search toggle, alerts, wallet) with the ticker under it; Mission Pick becomes a featured card with a
  full-width Buy; Heating up is a swipeable row; the token list is a compact
  Token / Market cap / 24h / Quick buy list, and the chain filter joins its
  toolbar. Tablet and desktop keep the design exactly.

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
