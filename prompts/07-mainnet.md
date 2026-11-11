# Module 7: the launchpad on mainnet

**Status: approved by the owner on 11 Nov 2026, with decision 2 as "Fix the contracts".** The same day the owner dropped the outside audit; an internal audit takes its place (`prompts/08-internal-audit.md`). The reports are in the shared notes folder: `mainnet-fork-rehearsal.md` and `contract-review-claude.md`.
- **Contracts:** eight fixes are in the project's `mainnet` copy: the review's five, Astra's D-01 and D-02, and the re-review's N-1. Two re-reviews found each fix closes its finding, with no new critical, high or medium finding (section 2b). The build is frozen in `reports/mainnet-freeze.json`. 110 tests pass with the fork, 90 without it, and the internal audit is running on it.
- **App:** section 3 is on `main`: `d8dbb5b`, then `1122c7e`, which trades only on the migrator's guarded pool. It is live in production with mainnet mode off. Since then (11 Nov): the "Share pool fees" card, and testnet mode reading a fresh deployment, with its router and quoter, from public values for Astra's preview.
- **Left:** the internal audit, then Astra's attack pass and testnet campaign (section 5), the owner's Safe, deployment and Production settings (section 6), then go or no-go (section 7). The owner wants tonkfun.fun's launchpad live on Robinhood Chain mainnet within two days, by 13 Nov 2026. ChatGPT ("Astra") will test the way the public would, using a browser and wallets with the owner's permission, while Claude builds. This brief maps the six pre-mainnet gates onto those two days, sets the mainnet decisions with defaults, and says who does what. Claude never deploys, signs or sends anything: the owner signs every transaction in their own wallet or Safe.

## 1. The gates, in two days

| Gate | How it's met by 13 Nov | Still open at launch |
|---|---|---|
| 1. Graduation end to end | **Done on a mainnet fork (11 Nov).** At 1 ETH and 6 ETH reserves the curve completes, and the official pool is seeded at v4's exact amounts and locked. Buys and sells through the official Universal Router deliver exactly V4Quoter's quote, and `distributePostGradRewards` pays exactly what the position earned. The pending-migration path and a reverting migrator behave as designed. Still to do: Astra graduates a token through the testnet app. | Trading a graduated pool on public testnet, which has no router |
| 2. The untested paths | **Done on the fork (11 Nov): 19 tests, all passing, no bug found.** They cover every launch type and rule, the launch-block tax (L2 blocks mocked), referral payouts on buys and sells, pause and unpause, a sale capped by the curve's ETH, refusing recipients credited and then withdrawn, and Crew rewards across 50 holders, exact to the wei. Still to do: Astra's campaign on public testnet, and the owner's pause and unpause there. | A real bot buying in the launch block on a public chain |
| 3. Independent audit | **No outside audit: the owner's decision, 11 Nov.** In its place, the internal audit (`prompts/08-internal-audit.md`):<br>- Slither and Aderyn<br>- invariant fuzzing with Foundry and Medusa<br>- Halmos on the maths<br>- a test for each known launchpad attack<br>- the mainnet integration rehearsal<br>- Astra's attack pass and a testnet campaign on a fresh deployment of the frozen build<br><br>Before it came Claude's review (no critical finding; H-1, M-1 to M-4 and six lows) and Astra's (D-01 and D-02). All are fixed in the `mainnet` copy and re-reviewed twice (section 2b). | No outside auditor: the beta notice and a guarded launch (the internal audit's section 7) stand in |
| 4. Mainnet setup | A Safe multisig owns every contract, the treasury is a separate address, the migrator points at Uniswap's official contracts, and the source is verified on Blockscout at deployment. The migrator can be set once and never replaced (decision 2). | The pause has no delay and also freezes curve sells (M-4's residual) |
| 5. App finished, then used | Section 3's app work, tested by unit tests and by end-to-end runs against mock data, against testnet, and against a local mainnet fork. Astra's campaign stands in for weeks of public testnet use. | Weeks of strangers using it |
| 6. Real checks on production | The owner makes one Base USDC → Robinhood Chain bridge transfer and opens Portfolio with their real wallet. | — |

## 2. Decisions (defaults in bold)

1. **Owners.**
   - **A Safe on Robinhood Chain (app.safe.global supports the chain), 2 of 3 signers on separate devices, owns the launchpad and the migrator.** Both use two-step ownership: the deployer proposes, and the Safe accepts.
   - **The treasury is a separate address**, not one of the signers.
   - Alternative: one wallet owns everything for the first days. It's faster, but one stolen key would control everything.
2. **The owner powers (review findings H-1 and M-1 to M-4).** One owner transaction, with no delay and no event, can replace the migrator. The next completion of any curve then sends that curve's ETH and its 200M-token reserve to the new migrator. Anyone can complete a curve by buying the rest, so a stolen owner key drains every live curve at once (H-1). An app-side check can't stop this, because the attacker calls the contract directly.
   - **Fix it in the contracts before mainnet, with a test for each change:**
     - the migrator can be set once and never replaced (H-1);
     - `renounceOwnership` is disabled, so a pause can never become permanent (M-4);
     - the PoolManager and the migrator are excluded from Crew rewards when each token is created (M-1);
     - a lock unlocks a higher creator-fee tier only if it locks at least 1% of supply (M-2);
     - Crew exclusion is one-way, and only for contracts (M-3).
   - Each change is small. The 49 original tests, the review's 18 and the fork's 19 all run again, and the review session re-reviews the diff. The testnet keeps today's code; the mainnet code is proven on the fork.
   - Alternative: launch the code unchanged. The owner then accepts H-1 and the mediums in writing, with mitigations:
     - a 2-of-3 Safe
     - a monitor that alerts on any change to `graduationMigrator()`, `owner()` or `pendingOwner()` (the contract emits no events for these)
     - reserves at 1 ETH
     - the beta notice
   - Either way, before building any trade the server reads `graduationMigrator()` and `paused()`. It refuses if the migrator isn't the one deployed, and the page says trading has stopped.
3. **Launch settings.**
   - **The launch fee is 0.005 ETH**, the design's figure. The contract allows up to 0.05.
   - **Virtual reserves are 1 ETH, the contract's mainnet minimum.** A curve then graduates after about 2.93 ETH of net buying, so no curve holds more than about 3 ETH while the code is unaudited.
   - After the review, the Safe raises the reserves towards the 6 ETH default (about 17.6 ETH per curve). A change applies only to launches after it.
4. **Uniswap: the official deployment** (Uniswap's catalog, 4 Nov 2026):
   - PoolManager `0x8366a39CC670B4001A1121B8F6A443A643e40951`
   - PositionManager `0x58daec3116aae6D93017bAAea7749052E8a04fA7`
   - Universal Router `0x204FAca1764B154221e35c0d20aBb3c525710498`
   - Permit2 `0x000000000022D473030F116dDEE9F6B43aC78BA3`
   - V4Quoter `0x8Dc178eFB8111BB0973Dd9d722ebeFF267c98F94`
   - StateView `0xF3334192D15450CdD385c8B70e03f9A6bD9E673b`

   The pool's initialization guard is mined for the official PoolManager when the contracts are deployed.
5. **What gets deployed.**
   - **The launchpad and the migrator only.** The external router (locks for other launchpads' tokens, and forwarding) waits for its own phase, which keeps unaudited code off mainnet.
   - The contract project gets a chain-4663 configuration and script that use the official Uniswap and deploy none of their own.
   - The script sets the migrator, fee and reserves, then proposes the Safe as owner. **It was written and rehearsed on the fork on 11 Nov:** 7 transactions from the deployer, then the Safe accepts ownership of both contracts.
   - The script refuses:
     - any chain but 4663
     - a missing Safe or treasury
     - a Safe that needs fewer than 2 signatures
     - a treasury that is the deployer, the Safe or one of its signers
     - settings outside the contract's limits
   - **The owner signs the 7 transactions in their own browser wallet**, with Foundry's `--browser` signing: `forge script script/DeployTonkpadMainnet.s.sol --rpc-url https://rpc.mainnet.chain.robinhood.com --sender <deployer> --browser --broadcast --slow`. The project's wallet tool stays testnet-only.
   - **Use a fresh deployer wallet** with a little ETH for gas: about 0.0005 ETH of L2 gas, plus the L1 data fee. Rerun the rehearsal right before signing, since any transaction the deployer sends changes the addresses.
6. **Verification.**
   - **Mainnet: the source is verified on Blockscout at deployment.**
   - **Testnet: verified now**, so the owner can pause and unpause from the explorer during testing and creators can read the contract.
   - Publishing the source is the owner's go-ahead.
7. **The token page on mainnet.**
   - **Figures are in ETH with dollar values beside them.** The testnet shows test ETH only.
   - Holders, top traders and the top-10 share need an indexer: **they say "Coming soon"** until one exists.
8. **Portfolio. A launch token still on its curve is priced from the curve, since anyone can sell into it. After graduation it's priced from its pool.** Without this, launch tokens would sit behind Portfolio's "no real market" warning.
9. **A beta notice** on Launch and on launch-token pages while the code is unaudited: **"Beta: these contracts haven't had an independent audit yet. Only put in what you can afford to lose."**
10. **Pause runbook.**
    - **Who:** the Safe, with two signatures.
    - **How:** the Safe app → contract interaction → `pause()`.
    - **When:** any unexplained difference between the app and the chain, a reported exploit, or a migrator change you didn't make.
    - **While paused,** launches and curve buys and sells stop, while pool trading, transfers and claims carry on. The app reads `paused()` and says exactly that. A pause freezes curve sells too (M-4), so reopen as soon as it's safe.
    - **Never renounce ownership** (M-4's fix makes it impossible). Renouncing while paused would freeze every curve's ETH for good.

## 2b. The second review (Astra, 11 Nov) against this plan

Astra reviewed the frozen 10 Nov contracts independently and ran 13 public testnet transactions. The hand-off is at `/Users/mac/Desktop/Tonk Smart-contract/reviews/2026-11-11-independent-review/START-HERE.md`. Its findings, set against Claude's review and the fixes already in the `mainnet` copy:

| Astra | Claude's review | Where it stands |
|---|---|---|
| T-01: the owner can swap the migrator at once and redirect graduation principal | H-1 | **Fixed.** The migrator can be set once and never replaced or unset. The pause stays with the Safe and has no delay. The trade-off: a broken migrator can't be swapped out, so the deployed one is graduated through on the fork before signing. |
| P-01: a 1-wei dev buy earns the 4% creator tier | M-2 | **Fixed.** A tier above 0.5% needs 10M tokens (1% of supply) locked. The Studio and the server apply the same rule. A tier set at launch lasts the token's life, even after the lock ends; that's a policy choice, and stated here. |
| D-01: a payee that permanently refuses plain ETH can never withdraw its credit (conditional Medium) | not found | **Fixed** (the owner's go-ahead, 11 Nov) and re-reviewed: `withdrawAccruedEthTo(recipient)` on the launchpad and the migrator. It debits only the caller's own credit, clears it before sending, keeps `nonReentrant`, reverts if delivery fails, and gives no admin power over anyone's credit. The external router isn't deployed in v1. |
| D-02: reserve settings the contract accepts can create a mission that never graduates (Medium) | owner powers and L-4 (pin the token reserve) | **Fixed** (the owner's go-ahead, 11 Nov) and re-reviewed: pin the virtual token reserve at 1.073B and bound the ETH reserve between 1 and 100 ETH. Tests at both bounds prove the graduation seed stays inside the migrator's price range. The deployment's own settings (1 ETH, 1.073B) already graduate on the fork. |
| P-02: telemetry counts vested-but-unclaimed tokens as locked | not found | **No change.** The app reads `devLocks` and works out the vesting itself; it never uses that telemetry field. |
| P-03: migrator fee dust goes to the creator (at most 1 wei a harvest) | not found | **Accepted** and documented. |
| P-04: TonkToken rounding | I-4 | **Accepted**; already documented. |
| The external router's forwarding semantics | R-1 | **Not deployed in v1.** |
| App: last holder can't sell all; false "cancelled"; approval continuation | not found | The main session is fixing these on `main` (the owner's "Yes, fix them"). This branch rebases onto that fix. |

Astra also corrects the plan in four places:
- Extending a linear vest keeps what has vested and re-vests only the rest.
- The Studio's 32-character name limit is the screen's, not the contract's.
- Only two public wallets were available, so the four-wallet scenarios weren't run publicly.
- Any source change needs fresh hashes, fresh tests and a fresh review. The go-or-no-go list in section 7 already requires that.

### The re-review of the fixes (11 Nov)

Claude's review session re-reviewed the five fixes (`contract-review-claude.md`, "Re-review of the mainnet fixes"). Only `TonkpadRobinhood.sol` and `TonkpadUniV4Migrator.sol` differ from the testnet release. Each fix closes its finding, and there is no new critical, high or medium finding. 95 tests pass with the fork, 76 without it. Three new lows, each shown by a test:

| Finding | What happens | Proposed |
|---|---|---|
| N-1: a launch before configuration keeps the defaults for good | The launchpad takes launches from the block it's deployed in, and the script configures it in later transactions. A launch that lands in between gets the 6 ETH default reserves (a curve of about 17.6 ETH), none of M-1's exclusions, and a place in the latest launches. Anyone watching for the deployment can send one. | **Fixed** (the owner's go-ahead, 11 Nov) and re-reviewed: one line at the top of `launchMission`, `require(graduationMigrator != address(0), "Tonkpad: Not configured")`, and the script sets the fee and reserves before the migrator. Launches now open only once everything is set, and the pending-migration path is unreachable. |
| N-2: a broken migrator can't be replaced, and only the pause stops new launches | H-1's trade-off. If the one migrator ever reverts, every curve stalls one buy short of graduating. Holders can still sell, so no ETH is lost, but the only switch that stops new launches, `pause()`, also stops sells. It's unlikely: the official v4 contracts are immutable, and the migrator has no settings besides its treasury. Recovery is a new launchpad. | **Accept for v1.** Optional later: an exits-only pause that stops launches and buys but leaves sells open. It would also answer M-4's residual. |
| N-3: contract-wallet holders can be excluded for good (needs the owner key) | The code check stops the owner excluding ordinary wallets. But a holder's Safe, a 4337 account or an EIP-7702 wallet has code, and exclusion is one-way. What the wallet earned is paid out, and it earns nothing more on that token. | **Accept.** Publish the policy (pools and vaults only) and watch `CrewExcluded`. Optional: refuse EIP-7702 delegations. |

Two residuals stay:
- A pause also freezes curve sells (M-4).
- The app must apply M-2's floor, and it does. The Studio and the server refuse a tier above 0.5% without 10M tokens locked. The Mission score counts a lock only if it locks at least 1% of supply, whatever the creator fee.

**The owner's answer, 11 Nov,** given in the main session: "also you can ahead on the fixes for" D-01 and D-02. The rehearsal session is making both in the `mainnet` copy, with Astra's reproductions kept as regression tests. Then every suite runs again and the review session re-reviews the diff.

**N-1, the owner's answer, 11 Nov:** "Fix all three" (D-01, D-02 and N-1). N-1 joins the same round: one line and a reordered script, with its test kept as a regression test. N-2 and N-3 are accepted as above.

### The second re-review (11 Nov)

The review session re-reviewed the D-01, D-02 and N-1 round (`contract-review-claude.md`, "Second re-review"). Each fix closes its finding, and there is no new critical, high or medium finding. 110 tests pass with the fork (20 of them fork tests, at block 111,668,435), and 90 without it. Two informational notes:
- **S-1:** `withdrawAccruedEthTo` can send a credit to the migrator, where it is stranded, or to a tonkfun.fun token, where it becomes Crew rewards (or is refused). Either is the claimant's own choice and harms no one else. Optionally, refuse those recipients, or warn in an app recovery screen (the app offers none in v1).
- **S-2:** the external router has the same gap D-01 closed. It isn't deployed in v1, and is fixed before it ever is.

These stay open, as accepted:
- M-4: a pause also stops sells.
- N-2 and N-3.
- L-1 to L-3, and the launch-fee half of L-4.
- L-5's silent setters.
- I-1 to I-5, and R-1.
- Curve rounding favours the trader by under one unit per trade: one token-wei on a buy, one wei on a sale. The internal audit found it, from GTE's M-23. It's harmless: gas costs about 10^12 times more, solvency holds, and sales are capped at the curve's real ETH. The owner chose to restate the audit's two rules as "within one unit" rather than change the frozen code ("ok then restate it", 11 Nov).

The build is frozen in `reports/mainnet-freeze.json`: the launchpad `648269c3…`, the migrator `0b2aacd0…` and the guard `954c1567…`.

## 3. App work (Claude, this repo)

- **Mainnet mode.** `NEXT_PUBLIC_TONK_NETWORK=mainnet` with the mainnet addresses. Launch opens on production, Solana, swaps and the bridge stay on, and there's no TESTNET badge. Production switches only when the owner sets the variable after deployment.
- **Graduated tokens trade on their pool** through the official Universal Router:
  - Quotes come from V4Quoter for `migrator.poolKey(token, fee)`.
  - A buy pays ETH and needs no approval.
  - A sell approves Permit2 and then allows the router, each for exactly the amount sold, the router's allowance for 30 minutes.
  - The server simulates and builds each trade, and the wallet signs after the "One last look." review: the same rules as curve trades.
  - **"Share pool fees"** calls `distributePostGradRewards`, which anyone may call. Built on 11 Nov: the Pool fees card on a graduated token's page, which the server checks on the guarded pool and simulates first, and whose receipt shows who got what.
- **Explore on production** gets the address box and the latest launches, as on testnet.
- **Portfolio** prices launch tokens per decision 8.
- **The guards** in decisions 2 and 10, and the beta notice in decision 9.
- **From the rehearsal and the review:**
  - The buy that completes a curve needs about 950k gas, so the app never caps it below that.
  - A graduation through the pending path emits its event with no pool address, so the app reads `missions(token).dexPoolOrPosition`.
  - The Mission score counts a lock only if it locks at least 1% of supply (M-2).
  - A receipt shows no lock when the lock type is none, whatever the event's `lockedBps` says (L-3).
  - After pool trades the page offers "Share pool fees", which keeps the post-graduation Crew pot small (L-2).
  - Pool trades use the deployed router's v4-periphery 1.0.3 format: command `0x10`, actions `0x06`, `0x0c` and `0x0f`. V4Quoter's quotes match it exactly.
- **Tests:** unit tests, the existing end-to-end runs (mock, live and testnet), and a new mainnet-fork run: the app against a local fork with our contracts deployed. Nothing is sent to any chain.

## 4. Contracts (Claude, a separate session, in the contract project)

- **Done (11 Nov):** the mainnet-fork rehearsal (19 tests), and the chain-4663 configuration and script, rehearsed on the fork. A plain `npm test` stays offline; `MAINNET_FORK=1` runs the fork suites.
- **Done (11 Nov):** the five fixes, each with a test, then every suite again and a re-review. Each fix closes its finding; the re-review adds three lows (section 2b).
- **Done (11 Nov):** D-01, D-02 and N-1 in one round, then every suite and a second re-review (section 2b). The build is frozen.
- **Now:** the internal audit's sections 1–5 on the frozen build (`prompts/08-internal-audit.md`).
  - The review session: static analysis, Halmos and the known-attack tests.
  - The rehearsal session: invariant fuzzing (Foundry and Medusa) and the mainnet integration checks.
  - Any violation is reported, not fixed, until the owner decides.
- **Any critical or high finding from Astra** gets the same treatment.

## 5. Astra

Astra's brief is `prompts/08-astra-brief.md` (11 Nov). It replaces the two briefs in `mainnet-2-day-plan.md`.
1. **Part 1, now: an independent attack pass in code** on the frozen build. Astra works in its own folder (`reviews/2026-11-11-mainnet-attack-pass/`) and never edits the `mainnet` copy.
2. **Part 2: a real-wallet campaign with attacks** on a fresh testnet deployment of the frozen build. It starts once the internal audit's sections 1–5 are green, since a fix after deployment would mean deploying and running the campaign again. It needs:
   - **The frozen build deployed fresh** to Robinhood Chain Testnet, signed by the owner's test wallet. The existing testnet deployment stays as it is.
   - **A testnet site pointing at it,** on a separate preview branch, so the current testnet site and its missions are untouched. Built on 11 Nov: testnet mode reads the new addresses, and the router and quoter, from public values limited to the preview branch (`web/README.md`, "A testnet preview of a fresh deployment").
   - **Uniswap's V4Quoter and Universal Router on testnet,** for buying and selling in a graduated pool through the app. The testnet's v4 stack (`reports/testnet-deployment.json`) has PoolManager, PositionManager and Permit2, but no router or quoter. Agreed on 11 Nov: the fresh deployment adds both, in the v4-periphery 1.0.3 format chain 4663 runs, against the testnet PoolManager and Permit2. Part 2 then covers the app's own pool trading with real wallets. The deployment is on-chain, so it waits for the owner's go-ahead and their signature.

Astra uses only fresh wallets holding only test ETH, and never sees a seed phrase or private key.

## 6. The owner

- Approve this brief.
- Create the Safe and choose the treasury address.
- No outside audit (the owner's decision, 11 Nov). Instead, decide the internal audit's open items (`prompts/08-internal-audit.md`): the fresh testnet deployment for Astra's Part 2, the Safe's three signers, the bug bounty amount and the domain. The audit tools are installed.
- Run the two real checks in gate 6.
- Give Astra the testnet site (a Vercel share link) and its test wallets.
- Sign the testnet pause and unpause, the mainnet deployment, and the Safe's acceptance of ownership.
- Set `NEXT_PUBLIC_TONK_NETWORK=mainnet` for Production once the deployment checks out.

## 7. Go or no-go, before the mainnet deployment is signed

- **The fork rehearsal:** every check passes.
- **Both reviews:** every critical or high finding is fixed or shown false, and the fixes pass every suite and the rehearsal. Done: all are fixed and re-reviewed twice.
- **The internal audit:** sections 1–6 green on the frozen build, and section 7 in place (`prompts/08-internal-audit.md`). Red is reported as red.
- **Astra's attack pass and campaign** (`prompts/08-astra-brief.md`): no open defect, and no unexplained difference between the app and the chain.
- **The app:** lint, typecheck, unit tests and every end-to-end run pass.
- **Setup:** the Safe exists, the treasury is chosen, and the testnet pause and unpause are done.
- **Guarded launch** (the internal audit's section 7): on the app side, `NEXT_PUBLIC_TONK_LAUNCH_INVITES` lists the invited creators for the first days, built 11 Nov. It's a soft gate: the contract stays permissionless, so monitoring watches every launch.
- **Deployment checks** (the review's list):
  - the chain ID is 4663;
  - the migrator is built on the official PoolManager and PositionManager, and the PositionManager's Permit2 is the official one;
  - the guard's address flags are right, and `poolKey(token, fee).hooks` is the guard;
  - the migrator, fee and reserves are set and read back before any launch is announced;
  - `graduationMigrator()` is the migrator just deployed (the script's read-back asserts it): it can never be changed, so a wrong one means a new launchpad before any launch;
  - the Safe has accepted ownership of both contracts, and the script's `verifyAccepted` read-back passes. Until then, the deployer key can still change the fee, the reserves, the treasury, the pause and exclusions;
  - the source verified on Blockscout matches the frozen hashes (`reports/mainnet-freeze.json`);
  - the treasury can receive ETH;
  - monitoring is running.
- **Sign-off:** the owner accepts, in writing, starting with the internal audit in place of an outside one, with decisions 3, 9 and 10 in place. Decision 2 is fixed.

## 8. Schedule

**11 Nov**
- Done:
  - the fork rehearsal, the mainnet script and Claude's review
  - the brief's approval ("Fix the contracts")
  - the five fixes and their re-review, and Astra's review
  - the D-01, D-02 and N-1 round, its re-review and the freeze
- Done in the app, on `main` and live with mainnet mode off: mainnet mode, pool trading on the guarded pool only, Explore, Portfolio and the guards.
- The owner dropped the outside audit for the internal audit, and approved its tools.
- Astra starts Part 1, the attack pass in code.
- The owner sets up the Safe and a fresh deployer wallet, and runs the gate 6 checks.

**12 Nov**
- The internal audit's sections 1–5 finish. Anything red goes to the owner.
- Every app test runs again on the final build. ("Share pool fees" and the testnet preview settings were built on 11 Nov.)
- Once sections 1–5 are green: the frozen build deployed fresh to testnet (owner-signed), the preview site, and Astra's Part 2 campaign.
- Go or no-go in the evening.

**13 Nov**
- The owner signs the deployment, and the Safe accepts ownership.
- The deployment is checked read-only.
- Production switches to mainnet mode, and Launch opens.

If a review finds something that needs a contract change, the date moves with it. The go or no-go list doesn't.
