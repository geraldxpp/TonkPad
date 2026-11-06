# Module 1 — App shell + Explore page

Build the Explore page of Tonkpad.fun in `web/`, plus the app shell every later screen will reuse. It must look and move like `design-reference/explore.html`.

## 1. Look before you code
1. Read `CLAUDE.md`.
2. Open `design-reference/explore.html` in a browser at 1440×900 (Playwright is fine). Scroll it, click the list tabs and launchpad chips, open the All Chains menu and type in the search box. That page is the live design, motion included.
3. Compare it with `design-reference/screenshots/explore-1440.png`.
4. Read `design-reference/explore.dc.html`. Port exact values from it: colours, sizes, radii, gradients, shadows, copy and data. Don't eyeball.
5. Reply with your plan (component list and file tree), then start.

## 2. Set up
- `npx create-next-app@latest web --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm`
- Add `lucide-react`. Dev dependencies: `vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @playwright/test`.
- npm scripts: `dev`, `build`, `lint`, `typecheck` (`tsc --noEmit`), `test` (`vitest run`), `test:e2e` (`playwright test`).
- Copy `design-reference/assets/tokens/*.svg` to `web/public/tokens/`.
- Set up the fonts, `tokens.css` and `animations.css` as described in `CLAUDE.md`.

## 3. Build the shell (`modules/shell`)
- **AppShell**: rail + main column + status bar on #07080D, with the two soft background glows from the reference (violet top-left, cyan top-right).
- **SideRail** (76 px wide, #05060A, right border): Logo; Explore (active), Live, Bridge, Portfolio, Alerts (red "3" badge), Launch, Docs; Theme and More pinned to the bottom. Items are 60×58 with radius 14, a 20 px icon and an 11 px/600 label. Active item: violet tint background, violet icon, white label.
- **TopBar**: search field ("Search token, ticker or CA" with a `/` key hint; pressing `/` focuses it), TickerTape, ChainFilter, bell with a violet dot, and a "Connect wallet" button (UI only).
- **ChainFilter**: pill with stacked S and R marks, label and chevron. Menu: All Chains 8,412 · Solana 5,941 · Robinhood Chain 2,471. It closes on pick, Escape and outside click, and uses listbox/option roles.
- **StatusBar**: Live (pulsing dot), Next sweep bar + countdown, SOL $182.40, ETH $3,412, Robinhood Chain gas 0.02 gwei, Docs / Status / Terms, © 2026 Tonkpad.fun.
- Routes for the other rail items (`/live`, `/bridge`, `/portfolio`, `/launch`, `/docs`, `/token/[ticker]`) render a simple "Coming in a later module" panel inside the shell. Token cards, table names and the Mission Pick "Buy" link to `/token/<TICKER>`.

## 4. Build Explore (`modules/explore`)
1. **Hero**: live pill ("Live on Solana & Robinhood Chain · 8,412 tokens tracked today"); H1 "Every launch, / on your radar." with "radar." in the violet-to-cyan gradient; the subtitle; the 4 stats; and the **Mission Pick** card (Ghosty: score 94, Locked, Crew 2%, Agent, price, market cap, 24h change, green Buy).
2. **Live scope**: card with the 1m / 5m / 1h segmented control (5m active), the radar (spec in section 6) and its legend: New · Heating up · Graduating · Next sweep.
3. **Heating up now**: title, subtitle, View all and prev/next buttons (UI only), and 5 token cards (GHOST, SCAT, ORB, MOON, SHRM) using their background colours from `C2`.
4. **Toolbar**: tabs Trending · New pairs · Graduating · Graduated · Gainers · Smart money · Locked Missions (with lock icon); timeframe 5m / 1h / 6h / 24h; Filters with a count of 2 (UI only); list/grid toggle (list active, grid is UI only).
5. **Launchpad chips**: All launchpads 8,412 · Tonkpad 1,846 · Pons 624 · Pump.fun 3,904 · Bonk.fun 1,022 · Bags 512 · Moonshot 304 · "+3 more".
6. **Token table**: 11 columns (#, Token, Bonding curve, Mission score, Last 24h, 24h, Volume, Holders, Smart money, Market cap, Quick buy) and 10 rows. Include the empty state with Reset filters, and the footer "Showing N of 8,412 tokens · refreshes every 4s" with Load more (UI only). The wide table scrolls inside its own box. Quick buy shows 0.5 (SOL) or 0.01 (ETH) and has an aria-label.

Data: port `DATA`, `PAD`, `LVL`, `C2`, `BL` and the counts from the reference script into `modules/explore/data/explore.mock.ts` as typed objects. Port the seeded sparkline builder `spark(seed, drift, vol)` into `shared/lib/sparkline.ts` with the same seeds, so it draws the same paths.

## 5. Behaviour (match the reference logic)
- Filters combine: chain AND launchpad AND search AND tab.
- Search: the name or ticker contains the text, case-insensitive.
- Tabs: Trending = no extra filter. New pairs = `isNew`, or age in minutes. Graduating = on the curve and at 50% or more. Graduated = curve complete. Gainers = sorted by 24h change, highest first. Smart money = one or more smart wallets. Locked Missions = locked flag.
- Rank numbers restart at 1 after filtering.
- Timeframe only switches the active pill for now (the data is static).
- Reset filters returns to Trending, all launchpads, all chains and an empty search.
- URL: `?chain=sol&pad=pons&tab=locked&tf=1h&q=mo`, leaving defaults out. Reloading restores the view.
- Test these counts: default 10 · Locked Missions 4 · search "mo" 2 · Solana 5 · Solana + Pons 0 (empty state) · Gainers row 1 is Ghosty.

## 6. Motion
From the design. Match these exactly:

| Element | Motion |
|---|---|
| Radar sweep | 300 px disc with `conic-gradient(from 40deg, rgba(140,123,255,0) 0deg, rgba(140,123,255,0) 276deg, rgba(140,123,255,.42) 360deg)` and a 1.6 px #C9C0FF leading line at 40°. It rotates 360° every 6 s, linear, forever. |
| Live dots (hero pill, status bar) | `box-shadow` ring growing 0 → 5 px → 0 in rgba(54,214,140,.55), 2 s ease-in-out, forever. |
| Token cards | On hover: translateY(-4px), a 1.5 px violet ring and a violet glow, 200 ms ease. |
| Table rows | Hover background #141723. |

Add these in code. The design implies them, but the reference doesn't animate them:

| Element | Motion |
|---|---|
| Ticker tape | Seamless right-to-left marquee (render the list twice and translate −50%), about 40 s per loop. Pause on hover and focus, and keep the faded edges. |
| Radar blips | Each blip pings when the sweep's leading edge passes it: a ring grows out from the blip and fades (about 600 ms) and the blip brightens. This repeats every sweep. |
| Next sweep | The countdown in Live scope and in the status bar counts down with the 6 s sweep (0:06 → 0:01, then resets). The status bar's small bar fills 0 → 100% each sweep. |

Radar maths. Each blip in `BL` is `[ticker, angleDeg, distance 0–1, sizePx, label, glowColor, labelSide]`. The centre is (150, 150) and the radius is 150. Position: `x = 150 + d·150·cos(a)`, `y = 150 + d·150·sin(a)`, with the angle `a` measured clockwise from 3 o'clock. The leading edge starts 40° clockwise from 12 o'clock, so it reaches a blip after `t = ((((a + 50) % 360) + 360) % 360) / 360 × 6 s`. Use that as the ping's `animation-delay` with a 6 s period. Drive the pings from the same start time as the sweep so they stay in sync.

Known issue to fix: the "$ORB +221%" label is clipped on the left edge of the scope in the reference. Keep every radar label fully inside the card.

Under `prefers-reduced-motion: reduce`: no sweep (show the wedge still at its start angle), no pulses, no marquee and no pings. The countdown shows a static 0:04.

## 7. Responsive
Build for 1440 first. At 1280, 1024 and 768 nothing overlaps or gets clipped. Under 768 px the rail becomes a horizontal bar above the content, the hero stacks above Live scope, the cards go two across, and the table scrolls inside its box. No horizontal page scroll at 390 px.

## 8. Tests
- Unit (Vitest): the filter function with every count above, the formatters, the sparkline builder (same seed gives the same path string) and the radar maths (positions and ping delays).
- E2E (Playwright): every interaction above, the URL round-trip, the chain menu by keyboard (Enter and Escape), reduced motion switching the animations off, and a full-page screenshot at 1440 wide saved to `web/e2e/screenshots/explore-1440.png`.

## Out of scope
Wallet connection, real data or APIs, the content of the other screens, the light theme (the Theme button is UI only), grid view, the Filters panel and Load more.

## When you're done
Report the file tree, how to run it, your screenshot next to `design-reference/screenshots/explore-1440.png`, and anything that doesn't match yet.
