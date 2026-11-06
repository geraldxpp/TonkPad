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
| Token | Value | Use |
|---|---|---|
| --bg | #07080D | page |
| --bg-deep | #05060A | rail, status bar |
| --surface | #0D0F17 | cards, table |
| --raised | #141723 | inputs, menus, hovered row |
| --input | #1A1E2C | active segment |
| --line | #1B1F2D | borders, dividers |
| --line-strong | #2A2F42 | stronger borders |
| --text | #F3F4FA | primary text |
| --text-2 | #A2A7BE | secondary text |
| --text-3 | #7E849B | tertiary text (keeps 4.5:1 contrast on --bg) |
| --accent | #8C7BFF | brand violet |
| --accent-text | #B8ACFF | violet text |
| --cta | #A497FF | primary button (text #0B0A1A) |
| --cyan | #3FD8F0 | smart money, gradients |
| --pos | #36D68C | gains, Buy (text #03150C) |
| --neg | #FF5C74 | losses |
| --warn | #FFB547 | caution |
| --gold | #F4C553 | crew rewards, graduated |
| --hot | #FF7A45 | hot |
| --locked | #2EE0A1 | locked missions |
| --agent | #8CC4FF | token agent |
| --track | #262A3B | empty progress track |

Focus ring everywhere: 2px solid #A497FF with a 2px offset. Dark theme only for now.

## Badges
| Badge | Text | Background | Border | Icon |
|---|---|---|---|---|
| Locked | #2EE0A1 | rgba(20,208,143,.14) | rgba(20,208,143,.38) | Lock |
| Crew 2% | #F4C553 | rgba(140,123,255,.16) | rgba(244,197,83,.38) | Zap, filled |
| Agent | #8CC4FF | rgba(90,169,255,.14) | rgba(90,169,255,.38) | Bot |
| Hot | #FF7A45 | rgba(255,122,69,.14) | none | Flame, filled, icon only |
| OG | #F4C553 | rgba(244,197,83,.14) | none | Crown, filled |
| New | #B8ACFF | rgba(140,123,255,.14) | none | Zap, filled |
| Graduated | #F4C553 | rgba(244,197,83,.14) | none | GraduationCap |

On token-card art, Locked, Crew and Agent use the slightly stronger fills from the reference (.16 / .20 / .16 backgrounds, .42 borders).

Mission score pill: Safe = #36D68C on rgba(54,214,140,.12) with ShieldCheck. Caution = #FFB547 on rgba(255,181,71,.13) with ShieldCheck. Risky = #FF5C74 on rgba(255,92,116,.12) with TriangleAlert.

## Chain and launchpad marks
These are original stand-ins (a letter on a colour). Never use the real logos.

| Mark | Shape | Background | Letter |
|---|---|---|---|
| Solana | circle | linear-gradient(135deg, #9945FF, #19FB9B) | S, #0B0A1A |
| Robinhood Chain | circle | #CCFF00 | R, #0E1400 |
| Tonkpad | rounded square | #8C7BFF | T, #0B0A1A |
| Pons | rounded square | #2DD4BF | Pn, #032A25 |
| Pump.fun | rounded square | #3BE2A0 | P, #05261A |
| Bonk.fun | rounded square | #FF9B2F | B, #2B1500 |
| Bags | rounded square | #33C2FF | G, #00243A |
| Moonshot | rounded square | #FFD24A | M, #2B2000 |
| Heaven | rounded square | #FF7EC8 | H, #2E0A1F |

## Icons (lucide-react)
Compass (Explore), Radar (Live), ArrowRightLeft (Bridge), Wallet (Portfolio), Bell (Alerts), Rocket (Launch), BookOpen (Docs), Sun (Theme), Ellipsis (More), Search, ChevronDown, ChevronLeft, ChevronRight, Target (Mission Pick), ShieldCheck, TriangleAlert, Lock, Zap, Bot, Flame, Crown, GraduationCap, SlidersHorizontal (Filters), List, LayoutGrid. The logo is the inline SVG in the reference; turn it into a `Logo` component.

## Motion
CSS keyframes live in `styles/animations.css`. Turn every animation and transition off under `prefers-reduced-motion: reduce`. No animation library unless a module prompt asks for one.

## Done means
- Side by side with its reference screenshot at 1440 px wide, the screen matches (fonts may anti-alias a little differently).
- No horizontal page scroll at 390 px wide.
- `npm run lint`, `npm run typecheck`, `npm test` and `npm run test:e2e` all pass.
- Every control works with the keyboard and shows the focus ring.
- You report what you built, how to run it, anything you could not match, and screenshots of the result.
