# Tonkpad.fun — web

The Tonkpad.fun token terminal (Solana + Robinhood Chain), built module by module
from the approved design in `../design-reference/`. Project rules live in
`../CLAUDE.md`; module briefs live in `../prompts/`.

Built so far: **Module 1 — app shell + Explore** (`/`). The other rail screens
(`/live`, `/bridge`, `/portfolio`, `/launch`, `/docs`, `/token/[ticker]`) show a
"Coming in a later module" panel inside the shell.

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
| `npm run test:e2e` | Playwright against a production build on port 3100; also writes `e2e/screenshots/explore-1440.png` |

## Layout

```
src/
  app/          routes only; each page renders its module
  modules/
    shell/      AppShell, SideRail, TopBar (search, ticker tape, chain filter), StatusBar, Logo, LaterPanel
    explore/    Explore: components/, hooks/, lib/ (filter, view, radar), data/, tests/
  shared/       ui/ primitives, lib/ (format, seeded-random, sparkline, url-params), config/, types/
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
- **Phone layout (under 768 px).** The rail becomes a fixed seven-tab bar along
  the bottom; the top bar is one sticky row (logo, search toggle, alerts,
  wallet) with the ticker under it; Mission Pick becomes a featured card with a
  full-width Buy; Heating up is a swipeable row; the token list is a compact
  Token / Market cap / 24h / Quick buy list, and the chain filter joins its
  toolbar. Tablet and desktop keep the design exactly.

## Deploy on Vercel

- Import the repository and set **Root Directory** to `web`. The framework
  preset (Next.js), build command and output are detected; no `vercel.json` is
  needed.
- Use Node 22 or 24 (`engines.node` is `>=22`).
- `/` is served as a partial prerender (static shell from the CDN plus a
  streamed request-time part); the other screens are fully static. Fonts are
  self-hosted by `next/font` at build time and token art is served from
  `public/tokens/`.
