# Module 4 — Launch (Creator Studio)

**Status: sections 1 to 13 (phase 1) were approved by the owner on 10 Nov 2026 and are built; the owner's test launch passed the same day. Section 14 (phase 2) was approved by the owner on 10 Nov 2026 with its defaults ("Approve, start") and built the same day; section 14.11 lists what the build settled beyond the brief. The owner's test of it (section 14.9) comes next.**

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
2. **Token page on testnet:** curve buy and sell with exact quotes and a simulation before each, approval before a sell, the launch-block wait, holder reward claims, the creator's lock claim and extension, metadata updates, referral credit. Section 14.
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
- The e2e configs blank the Tonk settings, so no test reaches the RPC or spends faucet ETH. The testnet site has its own run (`npm run test:e2e:testnet`): a production build in `testnet` mode against a local stand-in RPC that answers only the settings and a balance.
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

## 14. Phase 2 — the token page on testnet

**Status: approved by the owner on 10 Nov 2026 with the defaults of D3 to D6, and built that day. Section 14.11 lists what the build settled beyond this text.**

On the testnet site, `/token/<address>` opens a token launched on tonkfun.fun's launchpad: its price, curve and trades read from the chain, Buy and Sell on the curve, a holder's reward claim, and the creator's tools (claim unlocked tokens, extend the lock, edit details). Production and the demo don't change: there the token page stays as it is.

Why now: the contracts are not verified on the testnet explorer (its API returns no source or ABI for the launchpad or the token), so until this screen exists a creator has no practical way to claim unlocked tokens. Verifying them on the explorer is a job for the contract project, outside this phase.

Sources, in the order of section 1: the deployed contracts (`TonkpadRobinhood.sol`, which also holds `TonkToken`); this section; the token page as built (module 2) for look and layout; the testnet handoff for its interface rules and test order. Everything below was read from the contract's source and checked on 10 Nov 2026 against the owner's live token (Tonk Test One, `0xEaC30db90c3ac240D0122a07e46be8C161051A8A`) with read-only simulations.

### 14.1 Corrections
What the token page as built, or earlier text, assumes; and what the contract does. **[C#]** marks where each applies.

| # | Assumed | This section says | Why |
|---|---|---|---|
| C12 | A trade is quoted from a dollar price, and sells are typed in millions of tokens | Quotes come from the token's own curve in integers. Buys are typed in test ETH and sells in tokens, exact to the wei | The handoff forbids the fixtures' price division and million-token units for real transactions |
| C13 | Dollars on every figure | Test ETH only on the testnet site (decision D3) | Faucet ETH has no price |
| C14 | The contract can be asked for a quote | It can't: the buy quote is internal and there is no sell quote. The app mirrors both in integers and simulates the real call before the wallet is asked | Three buys and three sells simulated on the live token on 10 Nov equalled the mirrored maths to the wei (section 14.5) |
| C15 | The Crew fee is always charged | It is charged only while someone eligible holds the token (`eligibleSupply` above 0) | Contract rule; it is why the creator's launch buy paid none |
| C16 | A sell is paid from the curve's price alone | The ETH paid out is capped at the ETH really in the curve (`realEthReserves`) | Contract rule |
| C17 | Holders claim their rewards | Rewards are sent when a holder's tokens move; what is still unpaid shows from `viewUnpaidRewards` and can be claimed. Never show `rewardDebt` | Handoff rule; `rewardDebt` is an internal checkpoint |
| C18 | Extending a lock only moves its end date | For a linear vest it also restarts the vest: what has vested stays claimable, and the rest vests again from now to the new end. The new end is the later of now and the old end, plus the extension (7 days or more). A lock can never be shortened | `extendDevLock` |
| C19 | A detail can be edited on its own | `updateMissionMetadata` replaces both stored strings (details and agent brief) every time, so the form always sends both, starting from what is on-chain | Contract behaviour |
| C20 | Graduation is a separate step | A buy larger than what is left is cut to fit, the rest is refunded, and the token graduates inside that same transaction. After it, `buy` and `sell` are refused | Simulated on the live token: 0.009 test ETH bought all 675,997,641.51 tokens left, refunded 0.004625412087912087 and used about 1.13M gas |
| C21 | The launch-block wait can be timed | Buys in the launch block and the next L2 block lose 99% (the lost ETH stays in the curve). Read the L2 block from ArbSys (`0x64`), as the contract does, never a timer. On this chain `eth_blockNumber` returns the same number (checked) | Handoff rule |

### 14.2 Decisions for the owner
Each has a default this section assumes. Change any before approving.

**D3. Money on the testnet token page.** Default: test ETH on every figure, no dollars, as in the Creator Studio. Alternative: also show dollars at an example ETH price, labelled as illustrative.

**D4. Finding a token before Explore is on testnet (phase 3).** Default: the launch receipt gets **Open token page**, and the testnet Explore placeholder gets an "Open a token by its address" box and a short list of the latest launches, read from the launchpad's `MissionLaunched` events (name, ticker, age; the newest 20). Alternative: the address box only.

**D5. What the page shows before the indexer (phase 3).** Default: everything the chain answers directly: price, market cap, curve progress, ETH in the curve, the token's trades and a chart built from them, 24-hour volume and trade count, the lock, Crew Rewards paid, and the Mission score from chain facts. The holder count, the Holders and Top traders tabs say "Not on testnet yet". Alternative: read holders from the testnet explorer's API now (it is a Blockscout and serves them), which adds a dependency on someone else's service.

**D6. A buy that would complete the curve.** Default: allowed, because the contract allows it. The review says the buy is cut to fit, how much is refunded, and that the token graduates and curve trading ends. Alternative: on the testnet site, refuse such a buy until phase 4 has checked graduation there. Checking the graduated pool and trading in it stay in phase 4 either way.

Smaller defaults:
- Slippage is the Swap screen's setting (0.5%, 1% or 3%). It sets the minimum the contract must deliver; the minimum is never zero.
- Buy presets are the launchpad's virtual reserve ÷ 60, ÷ 24 and ÷ 12 (as the Creator Studio's), and Max. Max keeps back twice the estimated network fee. Sell presets are 25%, 50%, 75% and Max of the wallet's tokens.
- An approval before a sell is for exactly the amount being sold, never unlimited.
- The referrer is the address remembered from a `?ref=` link (`tonkpad-ref:<chainId>`), when it is a valid address and not the trader's own. The review names it. With none, no referrer is sent.
- The page re-reads the chain every 5 seconds while it is visible, and at once after a confirmed action.
- Holders whose wallet can't receive ETH (`claimCrewRewardsTo`) are not served in this phase.

### 14.3 The screen
`/token/<address>` on the testnet site, for an address the launchpad knows as a mission. Any other address shows the token page's "not found" state. The layout is module 2's: header, market card, activity and insights, with the trade column beside them and the Buy / Sell bar on phones. The TESTNET badge and "test ETH" show throughout **[C13]**.

- **Header:** the letter tile (images come with D2), name, ticker, copy address, explorer link, and the badges the chain supports: Locked (the tokens that will still be locked 7 days from now are 1% of supply or more, phase 1's rule), Crew X% (1% or more), Agent (an agent brief is stored), Block-0 Shield, Graduated.
- **Market card:** price per token and market cap in test ETH, worked out from the curve's reserves; the change over 24 hours, or since launch for a younger token; the chart from the token's `CurveTrade` events (market cap after each trade, volume in test ETH); the curve's progress to graduation; and four figures: market cap, 24-hour volume with its trade count, ETH in the curve, holders ("—", D5).
- **Activity:** Trades from the events (side, test ETH, tokens, market cap after, trader, a link to the transaction). Holders and Top traders: "Not on testnet yet" (D5). About: the description and links stored on-chain, shown as untrusted text with the same guards as section 8.
- **Insights:** the Mission score from the rows the chain can answer now (no mint or freeze authority, the creator's buy and lock, Crew Rewards, the 10-minute rule), held to the worker's score by a test as in phase 1; the market rows join with the indexer. The lock: share, schedule, vested, claimed, still locked, end date. The creator's address.
- **Crew Rewards card:** the rate, the total paid to holders (`totalCrewRewardsPaid`), and for a connected wallet "Your unpaid rewards" with **Claim** when there are any **[C17]**.
- **Trade panel** (the column on desktop, the bar and sheet on phones): Buy or Sell; the amount with its presets; what you receive and the minimum after slippage; and the fees as the contract will charge them: 1% protocol, the token's Creator fee, and its Crew fee or 0% while nobody eligible holds the token **[C15]**. The button says, in order of what is missing: Connect wallet; Trading opens in a moment (the launch-block wait **[C21]**); Trading is paused; Graduated, with "pool trading comes later"; Not enough test ETH, with the faucet link; Not enough tokens; else Review.
- **Creator panel,** only for the connected wallet that created the token:
  - **Claim:** what has unlocked and not been claimed, with **Claim N $TICKER**. A time-lock shows nothing to claim until its end.
  - **Extend lock:** 7, 30, 90 or 180 more days, or a number of 7 or more. Before signing it shows the new end date and, for a vest, that the unvested tokens start vesting again from now **[C18]**, and that a lock can't be shortened afterwards.
  - **Edit details:** description, X, Telegram, website and the agent's brief, with the Creator Studio's checks and limits. Name and ticker can't change **[C19]**.
- **Unpaid ETH:** if the launchpad is holding ETH it could not deliver to the connected wallet (`claimableEth`), a line shows the amount with **Withdraw**.
- **Explore placeholder and receipt** (D4): the address box, the latest launches, and **Open token page** on "Mission launched".

### 14.4 How a trade runs
1. **Quote** as you type, from the page's latest read of the curve, with the maths of section 14.5.
2. **Review, "One last look."** (the Swap screen's dialog): you pay, you receive (estimate), the minimum, each fee, the referrer if there is one, and for a buy that completes the curve the amount refunded and that the token graduates (D6).
3. **On confirm,** in order, with nothing sent if a step fails:
   - The server reads the mission again, checks the L2 block is past the launch block + 1 **[C21]**, that trading isn't paused and the token hasn't graduated.
   - **Sell only:** if the wallet's allowance to the launchpad is short, the wallet first signs an approval for exactly this amount, and the app waits for its receipt.
   - The server simulates the exact call from the trader's address and estimates its gas. The result must equal the server's own mirrored quote on the state it just read; a mismatch stops the trade. If that fresh quote is below the minimum the review showed, the figures update and the review stays open; otherwise the trade goes ahead with the minimum the person approved. The balance must cover the amount plus the estimated gas with a margin.
   - The wallet must be on chain 46630 (the guard from `shared/wallet/network.ts`).
4. **The wallet signs and sends.** Approval, signature, confirming, done and failed are separate states, each with its explorer link once there is a hash. A hash alone is never success.
5. **On the receipt:** the `CurveTrade` event gives the real amounts, which the page shows in place of the estimate; balances and the page refresh. The hash is kept in the URL, as on Launch, so a reload while a trade confirms keeps watching it and never sends another.
6. **Failures,** each with its own message and a way forward: refused in the wallet; wrong network; not enough test ETH or tokens; the minimum can't be met (the price moved: quote again); paused; graduated; the launch-block wait; reverted on-chain (only gas spent); replaced or cancelled; RPC unreachable.

Claim, Extend lock, Edit details, the reward claim and Withdraw run the same way without the quote: the server builds and simulates, the wallet sends, and the result counts only from the confirmed receipt and its event (`DevTokensClaimed`, `LockExtended`, `MetadataUpdated`, `CrewRewardPaid`, `FallbackEthWithdrawn`).

No test or script ever sends a transaction. Only a person does, in their own wallet.

### 14.5 The numbers
Integers in wei, each division rounding down, as in section 7. `vEth`, `vTokens`, `left` (tokens still on the curve) and `realEth` are the mission's own state.

- **Buy.** Fees come off the amount first: protocol 1%, Creator fee, and Crew fee only while `eligibleSupply` is above 0 **[C15]**. Net = amount − fees. Tokens out = `vTokens` − (`vEth` × `vTokens`) ÷ (`vEth` + net), at most `left`. When the amount reaches what the curve needs, it is cut to that, the rest is refunded and all of `left` is bought **[C20]**.
- **Sell.** Gross = `vEth` − (`vEth` × `vTokens`) ÷ (`vTokens` + tokens in), at most `realEth` **[C16]**. The same three fees come off the gross; the seller receives the net.
- **Minimums.** Minimum out = quote × (10,000 − slippage in bps) ÷ 10,000, and at least 1 wei.
- **Price and cap.** Price = `vEth` ÷ `vTokens`; market cap = price × 1B; curve filled = (800M − `left`) ÷ 800M. These come from the reserves, not from `getMissionTelemetry`, whose price is rounded down to a whole wei per token.
- **Vest.** Claimable = locked × (now − start) ÷ (end − start) − claimed, and everything once the end is reached. After an extension the contract's checkpoint applies: vested so far is kept, and the remainder vests from the new start to the new end **[C18]**.
- **Extension.** New end = the later of now and the old end, + the days added (7 or more).

Check values, to become unit tests. The token's state on 10 Nov 2026 at block 151,327,091: `vEth` 1,696,000,000,000,000 wei; `vTokens` 948,997,641,509,433,962,264,150,943; `realEth` 196,000,000,000,000; `left` 675,997,641,509,433,962,264,150,943; Crew 2% (charged), Creator 1%. Each row was simulated against the deployed contract and matched to the wei:

| Trade | Result |
|---|---|
| Buy 0.00005 test ETH | 26,119,201.142461485199930760 tokens; fees 0.0000005 protocol, 0.000001 Crew, 0.0000005 Creator |
| Buy 0.001 test ETH | 343,011,195.726301432143669016 tokens |
| Buy 0.009 test ETH | all 675,997,641.509433962264150943 tokens left; 0.004625412087912087 refunded; the token graduates |
| Sell 1,000,000 tokens | 0.000001713856886439 test ETH net (0.000001785267590039 gross) |
| Sell 10,000,000 tokens | 0.000016977726842347 net (0.000017685132127443 gross) |
| Sell 24,800,471 tokens | 0.000041465612168118 net |
| Sell without an approval | refused by the token (`ERC20InsufficientAllowance`) |

Gas, estimated on the live token: a buy about 271,000; a buy that graduates about 1,130,000; claim unlocked tokens about 129,000; extend the lock about 89,000; edit details about 54,000; claim rewards about 43,000.

### 14.6 What goes on-chain

| Action | Call | Who |
|---|---|---|
| Buy | `buy(token, minTokensOut, referrer)` with the amount as value | anyone |
| Sell | `approve(launchpad, amount)` on the token when the allowance is short, then `sell(token, tokensIn, minEthOut, referrer)` | a holder |
| Claim rewards | `sweepMyCrewRewards()` on the token | a holder with unpaid rewards |
| Claim unlocked tokens | `claimDevTokens(token)` | the creator |
| Extend the lock | `extendDevLock(token, seconds)` | the creator |
| Edit details | `updateMissionMetadata(token, metadataUri, agentPrompt)` | the creator |
| Withdraw unpaid ETH | `withdrawAccruedEth()` | the wallet it is owed to |

Reads: `missions`, `devLocks`, `claimableDevTokens`, `claimableEth` and `paused` on the launchpad; `eligibleSupply`, `viewUnpaidRewards`, `totalCrewRewardsPaid`, `balanceOf` and `allowance` on the token; `CurveTrade` and `MissionLaunched` events; ArbSys for the L2 block. The RPC answered a token's whole trade history in one query on 10 Nov (about 200,000 blocks); the read still asks in bounded ranges and keeps to the newest 500 trades, so a longer history can't break the page. `buy` and `sell` are refused while the launchpad is paused; the claims are not.

### 14.7 Code
- `shared/tonk/`: the sell and mid-life buy maths, minimums, the vest and extension maths, a mission's types, and `server/` reads (mission, lock, trades in bounded ranges, the wallet's standing on a token) and builders (trade, approval and each action), all simulated before they are returned.
- `app/api/tonk/`: `token/[address]` (the page's data), `account` (a wallet's balance, allowance, unpaid rewards, claimable tokens and unpaid ETH for one token), `trade` and `action` (build and simulate), `missions` (the latest launches, D4), and `tx` extended to read the new events. Each validates its input, is rate-limited and never caches an error. The RPC key stays on the server.
- `modules/token/`: a testnet loader that returns the page's existing shapes from the chain, with a display unit so the same cards show test ETH; the curve trade panel, the creator panel and the reward claim. Production's token page and its tests don't change.
- `modules/shell/` and `modules/launch/`: the Explore placeholder's address box and latest launches, and the receipt's link (D4).
- All new strings in the 12 languages. CLAUDE.md, AGENTS.md and the README are updated.

### 14.8 Done means
CLAUDE.md's list, plus:
- **Unit tests:** section 14.5's check values to the wei; the Crew fee waived with no eligible holders; the real-ETH cap on a sell; the cap, refund and graduation of a buy; minimums; vest and extension maths; every refusal the builders can return.
- **End-to-end** in the testnet run (`npm run test:e2e:testnet`), with the stand-in RPC holding one mission and its trades, the stub wallet, and the build routes answered in the browser: the page shows the chain's figures; a buy through to its receipt; a sell with its approval step; a reward claim; the creator's claim, extension and edit; the paused, graduated, launch-block and short-of-funds states; a wallet that isn't the creator sees no creator panel; 390 px in German and Russian, both themes; everything by keyboard.
- The mock and production runs stay green, unchanged.
- A read-only check against the live testnet, run by hand and never in the test suite: a buy and a sell simulated on the owner's token equal the mirrored maths.

### 14.9 The owner's public test
With the creator's wallet and a second wallet as the buyer, both holding test ETH (the handoff's order):

1. **Buy** 0.00005 test ETH of TTONE from the buyer's wallet. At the state above that is 26,119,201.14 tokens with fees of 4%; the page's own figure at the time is the expectation.
2. **Sell** part of it, for example 10,000,000 tokens: an approval, then the sale.
3. **Rewards:** the buyer's buy pays its Crew fee to the holders before it, so the creator's wallet shows unpaid rewards: about 0.000001 test ETH from that buy, a little more after the sell. Claim them; a second claim has nothing to pay. Rewards are also sent whenever a holder's own tokens move, so a wallet that has just traded may already have been paid.
4. **Lock:** the creator claims what has unlocked (only that amount moves), then extends the lock by 7 days and sees the new end date. The buyer's wallet is offered neither.
5. **Edit details:** add a description and a link; they show once confirmed.
6. **Failures:** reject a signature; reload while a trade confirms; trade with a quote that has gone stale; a wallet on the wrong network.

Claude reads each receipt and the state back from the chain and reports them beside the page's figures, with the transaction links.

### 14.10 Not in this phase
- Explore, Portfolio, holders, top traders and history from an indexer (phase 3).
- Checking graduation on the public testnet, trading in the graduated pool and collecting its fees (phase 4).
- External routes and locks (phase 5); reward claims sent to another address; token images (D2); an agent service; mainnet.
- For the contract project, not blockers here: verify the three contracts on the testnet explorer; a mission count on the launchpad (`allMissions` has no length) would let the app list launches without reading events.

### 14.11 As built
What the build settled that the sections above left open, for the owner to change if they wish:

- **The creator's tools sit in the main column,** under the header, not in the trade column: the trade panel stays in view beside them, and the four lock figures get the width. Undelivered ETH, when there is any, shows in a line above them.
- **On phones a sent trade shows above the Buy / Sell bar** until it is dismissed, because the sheet it was sent from closes.
- **One trade at a time:** while a trade waits for its receipt the next can't be reviewed. Once it settles, a new one can start without dismissing the last.
- **Text read from the chain is bounded.** The contract checks only that a name and ticker aren't empty, and sets no maximum on the two texts it stores, so anyone calling it directly could store megabytes. The server shows at most 64 characters of a name and 16 of a ticker (printable characters only; the token's address stands in when nothing is left), and doesn't pass on a stored text over 4,096 characters: longer than anything the app writes, so not its JSON.
- **The header's mark for an agent reads "Agent",** never "Agent live": a brief is stored, and no agent answers yet.
- **The Mission score moves as a vest unlocks,** by v2's own rows. The owner's first test token scores 80 now; from about 37.5 days after launch less than half its launch buy is still locked 30 days out, so the unlocked-buy penalty returns (72); from day 75 the lock holds less than half the creator's tokens 30 days out, so its points go too (62). A test holds this to the worker's score.
- **After a confirmed trade the curve's figures can lag by up to about 5 seconds.** The receipt's own amounts and the wallet's balances show at once; the price, cap and trades follow at the page's next read of the chain.
- **Slippage, presets and the referrer** are as the smaller defaults say. The buy presets need the launchpad's settings, so they appear a moment after the page.

