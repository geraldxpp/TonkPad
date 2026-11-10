# Module 4 — Launch (Creator Studio)

**Status: draft for the owner's approval, 10 Nov 2026. Nothing is built from this until the owner approves it.**

Build the Launch screen of tonkfun.fun in `web/` (`/launch`, `modules/launch`): the Creator Studio from the redesign (`design-proposals/Tonkfun.fun-UI-Design.zip`, folder `launch-redesign/`), wired to the repaired Tonk contracts on Robinhood Chain Testnet. A creator fills in four sections, reviews the launch, signs one transaction in their own wallet, and gets a token with its bonding curve, an optional dev lock, and Crew and Creator rewards.

This prompt is the owner's guide (`launch_creator_studio_implementation_guide.md`) with its errors corrected against the deployed contracts. Section 2 lists each correction; **[C#]** marks where it applies.

## 1. What wins when sources disagree
1. **The deployed contracts** (`/Users/mac/Desktop/Tonk Smart-contract/testnet`: `src/`, `DEPLOYED-ADDRESSES.json`, `reports/testnet-deployment.json`), for every rule and number. Never the original `.sol.txt` files.
2. **This prompt.**
3. **The design** (`launch-redesign/`: `index.html`, `styles.css`, `screenshots/`), for look, layout, copy and the phone flow, in the app's own tokens (CLAUDE.md).
4. **The owner's guide and the testnet handoff** (`/Users/mac/Desktop/claude-testnet-handoff.md`), for intent.

## 2. Corrections to the guide

| # | The guide says | This prompt says | Why |
|---|---|---|---|
| C1 | Launch fee 0.005 ETH, 6 ETH virtual reserve and ~17.5 ETH graduation, as fixed numbers | Read `launchFee`, `defaultVirtualEth` and `defaultVirtualTokens` from the launchpad; compute the rest (section 7) | Live testnet has a 0.0001 ETH fee and a 0.0015 ETH reserve, and the owner can change both |
| C2 | Dev-buy presets of 0.1 / 0.25 / 0.5 ETH | Presets are the virtual reserve ÷ 60, ÷ 24 and ÷ 12 | The same share of supply on any network: exactly 0.1 / 0.25 / 0.5 ETH at 6 ETH, and 0.000025 / 0.0000625 / 0.000125 test ETH on testnet, where 0.1 ETH is 23 times the whole curve |
| C3 | Dev buy: take the total trade fee off, then apply the curve. Check: 0.25 ETH at 4% gives ~41.3M tokens (4.13% of supply, 5.16% of the curve) | Take off the 1% protocol fee and the Creator fee only. Check: 0.25 ETH with Creator 1% gives 42,095,276 tokens (4.21% of supply, 5.26% of the curve) | The contract charges no Crew fee while nobody holds the token, which includes the creator's buy inside the launch |
| C4 | "~$18.0K Fair-Start MC", "$18.0K to $19.5K" | The starting cap is 5.5918 ETH on mainnet defaults. Dollars come only from a live ETH price | $18.0K is true only when ETH is about $3,219 |
| C5 | Its own Mission Score formula | Mission score v2 as approved on 7 Nov 2026, plus +5 for Crew Rewards (decision D1) | One model for this preview and for Explore |
| C6 | Locked badge: 50%+ of the dev buy locked for 7+ days | The approved rule: locked tokens worth 1%+ of supply, with 7+ days left (decision D1) | So a lock of a few tokens can't earn the badge |
| C7 | "+15 Contract Authorities Renounced (Immutable Mint/Freeze)" | "+15 No mint or freeze authority" | Supply is fixed and transfers can't be frozen. But the launchpad's owner (tonkfun.fun) can pause curve trading and exclude addresses from Crew rewards, so "renounced" overstates it |
| C8 | Linear vesting from 1 month (30 days) to 12 months (365 days) | A month is 30 days: 1 to 12 months is 30 to 360 days | The contract counts seconds; the reward tiers need 30 and 90 days |
| C9 | Block-0 Shield "auto-taxes non-creator same-block snipers at 99%" | A 99% tax on every separate buy in the launch block and the next block, the creator's own included. Only the buy inside the launch is exempt | That is what the contract does. It is a tax, not a guarantee against snipers |
| C10 | Crew and Creator rewards "paid automatically" | Crew rewards accrue per holder; a payout is attempted when that holder's balance changes, and they can claim by hand. Creator fees are sent on each trade, with a claim if delivery fails | Contract behaviour; "automatically" alone promises too much |
| C11 | Emoji badges | lucide icons: Lock, Zap, Bot, ShieldCheck | CLAUDE.md: never emoji as icons |

## 3. Decisions for the owner
Each has a default this prompt assumes. Change any before approving.

**D1. Mission score and Locked badge.** Default **A**: keep the rules approved on 7 Nov 2026 and add +5 for Crew Rewards of 1% or more. Alternative **B**: the guide's rules.

- Under A, the lock earns +10 (and cancels the unlocked-buy penalty) when half or more of the creator's launch buy is still locked 30 days after launch. A linear vest releases every second, so it must hold more than half at that point: at exactly half it would lose the points seconds after launch. The penalty is −8 for an unlocked buy over 5% of supply and −20 over 15%.
- Under B, any lock of 50%+ for 7+ days earns +10, and any unlocked buy is penalised (−8, −15 over 5%, −20 over 15%).
- Locked badge under A: the tokens still locked 7 days after launch are 1%+ of supply. Under B: any lock of 50%+ for 7+ days.

Scores at launch, then after 10 minutes, with Crew 2% and a dev buy of 4.2% of supply unless noted:

| Setup | A (default) | B (guide) |
|---|---|---|
| 80% in a 180-day linear vest (the form's default) | 70, then 80 | 70, then 80 |
| 65% in a 180-day linear vest | 70, then 80 | 70, then 80 |
| 60% in a 180-day linear vest (exactly half after 30 days) | 60, then 70 | 70, then 80 |
| 50% in a 180-day linear vest | 60, then 70 | 70, then 80 |
| 50% in a 90-day time-lock | 70, then 80 | 70, then 80 |
| 50% in a 30-day time-lock | 60, then 70 | 70, then 80 |
| No lock | 60, then 70 | 52, then 62 |
| No lock, dev buy of 8.1% of supply | 52, then 62 | 45, then 55 |
| No dev buy | 60, then 70 | 60, then 70 |

Why A: applied to every launchpad, B lowers the scores of existing tokens whose creators bought without locking. Applied only to tonkfun.fun launches, B gives our own launchpad an easier +10 than Pump.fun or Pons tokens get, which a neutral score shouldn't do.

**D2. Token images.** Default: none in phase 1; the token shows its first letter on the brand gradient, as the design's default tile does. Hosting comes next: Vercel Blob (the existing account) or IPFS through a provider such as Pinata.

**Smaller defaults:**
- Production keeps Launch as "coming soon" until mainnet contracts exist. The Creator Studio runs on the testnet site.
- The testnet site shows test ETH only, with no dollar conversion (faucet ETH has no dollar value). The volume example in section 6.5 keeps its dollar scale and is labelled illustrative.
- The form starts with name, ticker, description and socials empty. Settings start as in the design: the middle dev-buy preset, 80% in a 6-month linear vest, Crew 2%, Creator 1%. Alternative: start with no dev buy, so nobody spends more than the launch fee without choosing to.
- The Token Agent starts off.
- A custom time-lock runs from 7 to 365 days. The dev buy goes up to 1⅔ times the virtual reserve (10 ETH on mainnet defaults), about two thirds of supply.
- On the testnet site, Explore, Token, Swap, Bridge and Portfolio show "Not on testnet yet" until their phases. No mock or mainnet token appears beside real testnet transactions.
- The testnet site is the `testnet` branch's Vercel preview, behind a Vercel login, until a public address is wanted.

## 4. Phases
1. **The Creator Studio and real launches on testnet** (this prompt). Build order: the screen on mock settings with its tests; the testnet wiring; the owner's public test launch (section 12).
2. **Token page on testnet:** curve buy and sell with exact quotes and a simulation before each, approval before a sell, the launch-block wait, holder reward claims, the creator's lock claim and extension, metadata updates, referral credit.
3. **Explore and Portfolio on testnet:** an indexer for the contracts' events from block 151119562, holders, history and the live score.
4. **Graduation,** then trading in the graduated pool once a reviewed swap contract exists, and pool fee collection.
5. **External routes and locks** (none are configured today).

Each later phase gets its own section in this file, approved before it is built.

## 5. Networks
`NEXT_PUBLIC_TONK_NETWORK` selects the mode. It only picks public addresses, so it may be public.

| Value | Where | Launch screen |
|---|---|---|
| unset | Production | "Coming soon", as today |
| `testnet` | The testnet site | The Creator Studio on chain 46630 |
| `mock` | Tests and local development only | The Creator Studio on mock settings, labelled Demo. A real wallet is never asked to sign; only the tests' stub wallet "signs" |

Testnet settings live in code (`shared/tonk/networks.ts`), all public: chain 46630, RPC `https://rpc.testnet.chain.robinhood.com/rpc` (server-side override `TONK_RPC_URL`), explorer `https://explorer.testnet.chain.robinhood.com`, faucet `https://faucet.testnet.chain.robinhood.com`, the ten addresses in `DEPLOYED-ADDRESSES.json`, and the launchpad's deployment block 151119562. Mainnet has no entry yet.

In testnet mode:
- A **TESTNET** badge shows in the top bar on every screen, phones included.
- `rh` means chain 46630 everywhere: the wallet's network (AppKit's `robinhoodTestnet`), balances, explorer links and the network check before signing. Solana isn't offered.
- The server checks once that its RPC reports chain 46630; if not, every Tonk route answers "unavailable".
- `/api/swap/*` refuses, whatever `SWAP_TRADING` says: Jupiter and 0x don't cover this chain.
- Browser storage keys carry the chain id, and amounts read "test ETH".

## 6. The screen
Desktop shows the four cards with a sticky right column; below `md` it becomes the design's four-step flow (6.8). Sizes, radii, gaps and copy come from the design; colours from CLAUDE.md's tokens.

### 6.1 Header and chrome
- Eyebrow "Creator Studio / Robinhood Chain", title "Launch a mission.", the two-line intro, and Save draft with "Only on this device".
- Top bar on this screen: a static **Robinhood Chain (ETH)** pill and **Refer & earn 25%**, beside the theme toggle and wallet button. The status bar shows the chain's live gas price and, on mainnet, the live ETH price; no Solana figures.
- **Refer & earn** opens the design's dialog. It says the share is 25% of the 1% protocol fee, so 0.25% of each referred curve trade; it doesn't apply to the launch fee or the creator's launch buy, and self-referrals don't count. A connected wallet gets its link (`/?ref=<address>`) with a copy button. A valid `ref` on arrival is remembered on the device; trades credit it from phase 2.

### 6.2 Progress bar
Four steps whose subtitles follow the form: **Token & basics** ("Tonkfun Native · $TICKER / ETH"), **Locked Mission** ("80% · 6-month linear vest", "50% · 90-day time-lock" or "No lock"), **Mission economics** ("2% Crew · 1% Creator"), **Token Agent** (the agent's name, or "Off"). Clicking a step scrolls to its card.

### 6.3 Card 1 — Token & basics
- **Protocol summary:** native ETH pair (1B supply, 80% curve, 20% DEX); the starting cap with the virtual reserve; the 99% launch-block tax **[C9]**; Uniswap v4 graduation with the net ETH target and the 0.5% creator bonus; and the launch fee. Every figure is read or computed **[C1] [C4]**.
- **Fields:** name (required, 1–32 characters), ticker (required, 1–10 of A–Z and 0–9, typed text is upper-cased), description (up to 280), and the image tile (D2).
- **Socials & links:** X handle or profile link, Telegram link, website. Each is optional and checked as in the design; only http and https links pass. Helper: "Stored with your mission and shown on Explore and the token page. You can update them later." They don't affect the Mission score.
- **Initial dev buy:** None plus three presets **[C2]**, each showing the share of supply it buys, and a custom amount up to the cap. Under it: tokens received, share of supply, and "Exempt from the launch-block tax. Trade fees are included in your buy."
- **No dev buy** sets the lock to No lock, disables the lock controls and caps Creator Rewards at 0.5%, with the note "An initial dev buy is required to lock tokens and unlock higher Creator Rewards."

### 6.4 Card 2 — Locked Mission
- **Three modes.** Time-lock: everything unlocks at the end; 30, 90 or 180 days, or a custom number of days. Linear vesting: unlocks every second over 1 to 12 months **[C8]**. No lock: the dev buy is liquid; share and duration are disabled.
- **Share of the dev buy:** 50% to 100% in steps of 5.
- **Preview:** locked and liquid token counts, and the release chart: a declining staircase for a vest (monthly snapshots of a continuous release), or a flat line with one bar at the end for a time-lock.
- **Commitment box:** the locked count, the Creator Rewards tier this lock unlocks (6.5), and its effect on the Mission score and Locked badge under D1, naming what is missing when it earns neither.

### 6.5 Card 3 — Mission economics
- **Fee bar:** Protocol 1.0% (fixed), Crew, Creator, and "Total trade fee: X.X% / 5.0% max".
- **Crew Rewards:** Off, 1.0%, 1.5%, 2.0%, 3.0%, 4.0%. No option under 1%. Helper: the curve, locked dev tokens and excluded system addresses don't earn **[C10]**.
- **Creator Rewards:** Off, 0.5%, 1.0%, 1.5%, 2.0%, 3.0%, 4.0%, gated by the lock:

| Tier | Needs | Creator Rewards up to |
|---|---|---|
| None | no lock, no dev buy, or a lock under 30 days | 0.5% |
| Standard | 50%+ of the dev buy locked for 30+ days | 2.0% |
| Ironclad | 80%+ locked for 90+ days | 4.0% |

- **Auto-adjust:** Crew plus Creator can't pass 4.0%. Raising one moves the other down to its highest option that fits; lowering the lock moves Creator down to its tier's cap. Each adjustment shows a short notice.
- **"A day in your economy":** volume chips of $25K, $100K and $500K a day. Four figures a day: to the Crew, to the creator and to tonkfun.fun (the 1% protocol fee, which goes to the launchpad's treasury; a referrer takes a quarter of it on referred trades), which add up to the trade fee, then what holding 1% of the eligible supply earns from the Crew's part. Labelled illustrative: example volume, paid in ETH.

### 6.6 Card 4 — Token Agent
- A toggle; when on, name (1–32), role (1–50), brief (1–400) and one of four voices: Tactical, Hype, Analytical, Meme.
- The sample reply changes with the voice, and its pills follow the form: the dev lock, Crew, Creator and "Pair: ETH".
- The card says plainly that these settings are stored with the mission and that the chat is a preview: no agent service answers yet.

### 6.7 Right column
- **Token preview,** as it will appear in Explore: letter tile, name, ticker, and badges with lucide icons **[C11]**: Locked (D1), Crew X% (Crew at 1%+), Agent (when on), and Block-0 Shield (always; its tooltip states **[C9]**). Then the starting cap and the bar "X% of curve from dev buy" with the graduation target.
- **Mission score preview:** the score and level now, and "N after 10 minutes, if nothing else changes". Rows: Base 50; No mint or freeze authority +15 **[C7]**; Creator's tokens locked +10 or 0; Crew Rewards +5 or 0; Unlocked creator buy 0, −8 or −20; New launch −10. Levels are v2's: Safe from 75, Caution from 50, else Risky. A footnote says trading and holders move the score after launch **[C5]**.
- **Launch summary:** network; launchpad and pair; dev buy with its share of supply and token count; Locked Mission; Crew Rewards; Creator Rewards "+ 0.5% graduation bonus"; protocol fee; Token Agent; launch fee; and **You pay now** (launch fee plus dev buy, "+ network gas"). It notes that the Creator fee on the creator's own buy returns to them in the same transaction.
- **The main button** (6.9).

### 6.8 Phones
Below `md`: one step at a time with Back and Next, a fixed bar with the total and the next action, and a Preview button that opens the token preview and score in a dialog. Each step is checked before moving on; step 4's Next is the review. No horizontal page scroll at 390 px.

### 6.9 Drafts and the main button
- **Save draft** stores the form on this device, by chain. Reset asks first. Nothing is saved without the button.
- The button reads, in order of what's missing: the first invalid field's message; **Connect wallet**; **Not enough test ETH** (with the faucet link on testnet); **Launches are paused** (if the contract is); else **Review launch**. The guide's "Launch $TICKER on Robinhood" is the confirm button inside the review.

## 7. The numbers
All amounts are integers in wei (`bigint`), with the contract's own rounding (each division rounds down). `fee`, `vEth` and `vTokens` are read from the launchpad.

- Call value = `fee` + dev buy.
- Protocol fee = dev buy × 1%. Creator fee = dev buy × Creator %. Net = dev buy − both **[C3]**.
- Tokens bought = `vTokens` − (`vEth` × `vTokens`) ÷ (`vEth` + net). Locked = bought × share; liquid = the rest.
- Starting cap = `vEth` × 1B ÷ `vTokens`. Cap after the buy = (`vEth` + net) × 1B ÷ (`vTokens` − bought). Curve filled = bought ÷ 800M.
- Graduation target (net ETH into the curve) = `vEth` × `vTokens` ÷ (`vTokens` − 800M), rounded up, − `vEth`.
- Still locked N days after launch: a time-lock holds everything until its end; a vest holds locked × (days − N) ÷ days. Both hold nothing once N reaches the end.
- D1's lock test is made on the settings, so rounding can't decide it: a time-lock passes with 50%+ and more than 30 days; a vest passes when share × (days − 30) is more than 50 × days.

Check values, to become unit tests (Crew 2%, Creator 1%, 80% in a 180-day linear vest):

| | Mainnet defaults | Live testnet |
|---|---|---|
| Fee and reserve | 0.005 and 6 ETH | 0.0001 and 0.0015 test ETH |
| Dev buy; call value | 0.25; 0.255 ETH | 0.0002; 0.0003 test ETH |
| Protocol fee; Creator fee; net | 0.0025; 0.0025; 0.245 | 0.000002; 0.000002; 0.000196 |
| Tokens bought | 42,095,276 (4.21% of supply) | 124,002,358 (12.40% of supply) |
| Locked; liquid | 33.68M; 8.42M | 99.20M; 24.80M |
| Curve filled | 5.26% | 15.50% |
| Cap before; after | 5.5918; 6.0578 ETH | 0.001398; 0.001787 test ETH |
| Graduation target | 17.5824 ETH net | 0.004396 test ETH net |

## 8. What goes on-chain
`launchMission(LaunchParams)` with the call value. `LaunchParams`: `name`, `symbol`, `metadataUri`, `agentPrompt`, `crewFeeBps`, `creatorFeeBps`, `lockType` (0 none, 1 time-lock, 2 linear), `lockShareBps`, `lockDurationSeconds` (days × 86,400). With no lock, share and duration are 0.

- `metadataUri` holds compact JSON, empty fields left out: `{"v":1,"description":"…","x":"handle","telegram":"https://t.me/…","website":"https://…"}`. `image` joins it with D2.
- `agentPrompt` holds `{"v":1,"name":"…","role":"…","voice":"tactical","brief":"…"}`, or an empty string when the agent is off.
- The creator can change both later, so the screen never calls them permanent. Fees and the lock are fixed at launch; a lock can only be extended.
- Anyone can call the contract directly, so text read back from the chain is untrusted: shown as plain text, links limited to http and https, never rendered as HTML.

ABIs come from the repaired build (`out/…/TonkpadRobinhood.json`), only the entries used, never the deployment bundle.

## 9. Launching
1. **Review, "One final look.":** the design's rows and the total call value, a checkbox, and **Launch $TICKER**.
2. **On confirm,** in order, with nothing sent if a step fails:
   - Read the fee, the reserves and the paused flag again. If any changed, update the figures, say so, and stay on the review.
   - Simulate the exact call from the creator's address and estimate its gas. A refusal shows the contract's reason in plain words; the balance must cover the call value plus the estimated gas with a margin.
   - Make sure the wallet itself is on chain 46630, switching or adding the network if needed (the guard from `shared/wallet/network.ts`).
3. **The wallet signs and sends.** States are distinct: confirm in your wallet; sent and confirming, with the explorer link; launched; failed. A hash alone is never success.
4. **Once there is a hash** it goes in the URL (`/launch?tx=…`). A reload resumes watching that transaction and never sends another. While one is confirming, the launch button is disabled.
5. **On the receipt:** read `MissionLaunched` for the token's address, then the mission and its lock from the contract. Show "Mission launched" with the token address (copy), tokens bought, locked and liquid, the fees, and links to the transaction and the token on the explorer. The chain's figures win over the preview's. The saved draft is cleared.
6. **Failures,** each with its own message and a way forward: refused in the wallet; wallet on another network; not enough ETH; refused by the contract; reverted on-chain (nothing launched, only gas spent); replaced or cancelled in the wallet; RPC unreachable.

No test or script ever sends a transaction. Only a person does, in their own wallet.

## 10. Code
- `modules/launch/`: the screen's components, hooks, form rules, data loader (`getLaunchData()` returns mock settings: the contract's mainnet defaults; `getLiveLaunchData()` reads the chain) and tests.
- `shared/tonk/`: networks and addresses, ABIs, the curve and lock maths, launch parameters and metadata, the launch-time score rows, and `server/` RPC reads. Phase 2's token page uses the same code.
- `app/api/tonk/`: settings (fee, reserves, paused, gas price), simulate, and transaction status. Each validates its input, is rate-limited (`shared/lib/rate-limit.ts`) and never caches an error.
- `shared/wallet/`: the network check before signing takes the configured chain instead of a fixed 4663.
- `modules/shell/`: the TESTNET badge, the page's top-bar slot and the "Not on testnet yet" panel.
- `worker/src/score.ts`: +5 for Crew Rewards (D1). A test feeds the same launch to the worker's score and to the preview's rows and expects the same number.
- CLAUDE.md, AGENTS.md and the README are updated with the module, the Block-0 Shield badge and the new icons.

## 11. Done means
CLAUDE.md's list, plus:
- **Unit tests:** the check values in section 7 to the wei; tiers, auto-adjust and the no-dev-buy rule; field validation; metadata written and read back, including hostile input; parameters encoded and decoded against the ABI; a fixture receipt decoded; score parity with the worker.
- **End-to-end** in mock mode, with the stub wallet and `/api/tonk/*` stubbed in the browser: fill the form and watch the preview follow; review and launch through to "Mission launched"; a refusal in the wallet; a contract refusal; a wrong network; a reload while confirming; the phone flow; 390 px in German and Russian, both themes; everything by keyboard.
- The e2e configs blank the Tonk settings, so no test reaches the RPC or spends faucet ETH.
- All 12 languages. Screenshots at 1440 px beside the design's.

## 12. The owner's public test
After the testnet site is up, the owner launches once from their own wallet in Chrome, using a wallet that can add custom networks, such as MetaMask or Rabby:

- Name **Tonk Test One**, ticker **TTONE**, Crew 2%, Creator 1%, linear vesting, 80% locked for 180 days, dev buy 0.0002 test ETH.
- Expected: a call value of 0.0003 test ETH plus gas, and the testnet column of section 7.
- Also tried: a wallet on the wrong network, a rejected signature, and a reload while confirming.

Claude then reads the receipt, the event, the mission and the lock from the chain and reports them beside the preview's figures, with the transaction link. That, with the branch, the preview address, screenshots and command results, is the delivery.

## 13. Not in this module
- Mainnet deployment, any change to the deployed contracts, and re-running their deployment.
- An agent service, image hosting (D2) and referral earnings (phase 3: worked out from each trade's transaction, since the contract logs no referral event).
- For a later mainnet review, not blockers here: trading after graduation needs a reviewed swap contract; a public quote function and a referral event would simplify the app; the owner's pause and Crew-exclusion powers should be stated in Docs.
