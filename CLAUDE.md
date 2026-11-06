# Tonkpad.fun — web app

Tonkpad.fun is a token terminal for Solana and Robinhood Chain. It has five screens: Explore, Token Detail, Launch (Creator Studio), Bridge and Portfolio. We build it one module (screen) at a time from the approved design in `design-reference/`.

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
  app/                 routes only; each page file just renders its module
  modules/
    shell/             chrome every screen shares: AppShell, SideRail, TopBar, TickerTape, ChainFilter, StatusBar, Logo
    explore/           module 1: components/, hooks/, lib/, data/, tests
    token/ launch/ bridge/ portfolio/    later modules, same shape
  shared/
    ui/                Badge, ChainMark, PadMark, TokenAvatar, ScorePill, CurveBar, Sparkline, Segmented, Tabs, Button, IconButton, Chip
    lib/               format.ts, seeded-random.ts, sparkline.ts, cn.ts
    config/            chains.ts, launchpads.ts
    types/             token.ts and friends
  styles/              tokens.css, animations.css, globals.css
web/public/tokens/     token art, copied from design-reference/assets/tokens
```

Rules:
- A module owns its components, hooks, data and tests. Modules import from `shared/` and `modules/shell/` only, never from another module.
- Components are presentational and typed; data comes in through props. Each module loads its data through one async function (Explore: `getExploreData()`) that returns typed mock data now and will call the real API later.
- View state (filters, tabs, timeframe, search) lives in URL search params so any view can be shared.
- No `any`. Named exports. Keep files short (aim for under 200 lines).
- Build only what the module prompt asks for. If something is unclear, ask instead of guessing.

## Design tokens
The palette follows the Tonkpad logo: gunmetal steel surfaces, the electric blue of the chain glow and the green of the lock. It replaces the violet palette in `design-reference/` (changed at the owner's request); where the two differ, these values win.

| Token | Value | Use |
|---|---|---|
| --bg | #07080A | page |
| --bg-deep | #050607 | rail, status bar |
| --surface | #0E1013 | cards, table |
| --raised | #15181C | inputs, menus, hovered row |
| --input | #1C2026 | active segment |
| --line | #1D2127 | borders, dividers |
| --line-strong | #2C3139 | stronger borders |
| --text | #F2F4F6 | primary text |
| --text-2 | #A3A9B2 | secondary text |
| --text-3 | #7D838C | tertiary text (keeps 4.5:1 contrast on --bg) |
| --accent | #3D8EF0 | brand electric blue (tints use `--accent-rgb`) |
| --accent-text | #7DB8F5 | blue text |
| --cta | #4A9CF5 | primary button (text #04101E) |
| --neon | #3DDC84 | brand green from the lock (tints use `--neon-rgb`) |
| --cyan | #3FD8F0 | smart money |
| --pos | #3DDC84 | gains, Buy (text #03140B) |
| --neg | #FF5C74 | losses |
| --warn | #FFB547 | caution |
| --gold | #F4C553 | crew rewards, graduated |
| --hot | #FF7A45 | hot |
| --locked | #3DDC84 | locked missions |
| --agent | #B8ACFF | token agent |
| --track | #252A31 | empty progress track |

Gradients (bonding curve, sweep bar) run --accent → --neon. Focus ring everywhere: 2px solid #4A9CF5 (--cta) with a 2px offset. Dark theme only for now.

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

On token-card art, Locked, Crew and Agent use the slightly stronger fills from the reference (.16 / .20 / .16 backgrounds, .42 borders).

Mission score pill: Safe = #3DDC84 on --pos at 12% with ShieldCheck. Caution = #FFB547 on rgba(255,181,71,.13) with ShieldCheck. Risky = #FF5C74 on rgba(255,92,116,.12) with TriangleAlert.

## Chain and launchpad marks
These are original stand-ins (a letter on a colour). Never use the real logos.

| Mark | Shape | Background | Letter |
|---|---|---|---|
| Solana | circle | linear-gradient(135deg, #9945FF, #19FB9B) | S, #0B0A1A |
| Robinhood Chain | circle | #CCFF00 | R, #0E1400 |
| Tonkpad | rounded square | #3D8EF0 | T, #04101E |
| Pons | rounded square | #2DD4BF | Pn, #032A25 |
| Pump.fun | rounded square | #3BE2A0 | P, #05261A |
| Bonk.fun | rounded square | #FF9B2F | B, #2B1500 |
| Bags | rounded square | #33C2FF | G, #00243A |
| Moonshot | rounded square | #FFD24A | M, #2B2000 |
| Heaven | rounded square | #FF7EC8 | H, #2E0A1F |

## Icons (lucide-react)
Compass (Explore), Radar (Live), ArrowRightLeft (Bridge), Wallet (Portfolio), Bell (Alerts), Rocket (Launch), BookOpen (Docs), Sun (Theme), Ellipsis (More), Search, ChevronDown, ChevronLeft, ChevronRight, Target (Mission Pick), ShieldCheck, TriangleAlert, Lock, Zap, Bot, Flame, Crown, GraduationCap, SlidersHorizontal (Filters), List, LayoutGrid. The logo is the owner's emblem (`web/src/modules/shell/assets/tonkpad-logo.png`, the T in a chain ring with the green lock), rendered by the `Logo` component; it replaces the inline SVG in the reference.

## Motion
CSS keyframes live in `styles/animations.css`. Turn every animation and transition off under `prefers-reduced-motion: reduce`. No animation library unless a module prompt asks for one.

## Done means
- Side by side with its reference screenshot at 1440 px wide, the screen matches (fonts may anti-alias a little differently).
- No horizontal page scroll at 390 px wide.
- `npm run lint`, `npm run typecheck`, `npm test` and `npm run test:e2e` all pass.
- Every control works with the keyboard and shows the focus ring.
- You report what you built, how to run it, anything you could not match, and screenshots of the result.
