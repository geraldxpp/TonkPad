# Module 7: the launchpad on mainnet

**Status: approved by the owner on 11 Nov 2026, with decision 2 as "Fix the contracts".** The reports are in the shared notes folder: `mainnet-fork-rehearsal.md` and `contract-review-claude.md`.
- **Contracts:** the five fixes are in the project's `mainnet` copy, with the rehearsal and deploy dry run repeated. The re-review (11 Nov) found that each fix closes its finding, with no new critical, high or medium finding, and three new lows (N-1 to N-3, section 2b). 95 tests pass with the fork, 76 without it. D-01, D-02 and N-1 are being fixed in the same copy (the owner's go-ahead, 11 Nov).
- **App:** sections 3 and 5 are built on branch `claude/tonkfun-mainnet`, apart from the "Share pool fees" button, which comes next. The branch sits on `main` at `78eb30c`, which includes the fixes for Astra's app findings.
- **Left:** the owner's Safe, deployment and Production settings (section 6), then go or no-go (section 7). The owner wants tonkfun.fun's launchpad live on Robinhood Chain mainnet within two days, by 13 Nov 2026. ChatGPT ("Astra") will test the way the public would, using a browser and wallets with the owner's permission, while Claude builds. This brief maps the six pre-mainnet gates onto those two days, sets the mainnet decisions with defaults, and says who does what. Claude never deploys, signs or sends anything: the owner signs every transaction in their own wallet or Safe.

## 1. The gates, in two days

| Gate | How it's met by 13 Nov | Still open at launch |
|---|---|---|
| 1. Graduation end to end | **Done on a mainnet fork (11 Nov).** At 1 ETH and 6 ETH reserves the curve completes, and the official pool is seeded at v4's exact amounts and locked. Buys and sells through the official Universal Router deliver exactly V4Quoter's quote, and `distributePostGradRewards` pays exactly what the position earned. The pending-migration path and a reverting migrator behave as designed. Still to do: Astra graduates a token through the testnet app. | Trading a graduated pool on public testnet, which has no router |
| 2. The untested paths | **Done on the fork (11 Nov): 19 tests, all passing, no bug found.** They cover every launch type and rule, the launch-block tax (L2 blocks mocked), referral payouts on buys and sells, pause and unpause, a sale capped by the curve's ETH, refusing recipients credited and then withdrawn, and Crew rewards across 50 holders, exact to the wei. Still to do: Astra's campaign on public testnet, and the owner's pause and unpause there. | A real bot buying in the launch block on a public chain |
| 3. Independent audit | Not met. **Claude's review (11 Nov) found no critical finding. It found one high that needs the owner key (H-1: replacing the migrator drains every live curve), four medium (M-1 to M-4) and six low.** Each is shown by a test. The repairs H1–H6 hold; M3 holds only in part. Astra's independent review agrees on H-1 and M-2 and adds two mediums, D-01 and D-02 (section 2b). Claude's five are fixed in the `mainnet` copy and re-reviewed. Every critical or high finding is fixed or accepted in writing before deployment (decision 2), alongside the guarded start and a quick outside review when it lands. | The audit itself |
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
| D-01: a payee that permanently refuses plain ETH can never withdraw its credit (conditional Medium) | not found | **Being fixed** (the owner's go-ahead, 11 Nov): `withdrawAccruedEthTo(recipient)` on the launchpad and the migrator. It debits only the caller's own credit, clears it before sending, keeps `nonReentrant`, reverts if delivery fails, and gives no admin power over anyone's credit. The external router isn't deployed in v1. |
| D-02: reserve settings the contract accepts can create a mission that never graduates (Medium) | owner powers and L-4 (pin the token reserve) | **Being fixed** (the owner's go-ahead, 11 Nov): pin the virtual token reserve at 1.073B and bound the ETH reserve between 1 and 100 ETH. Tests at both bounds prove the graduation seed stays inside the migrator's price range. The deployment's own settings (1 ETH, 1.073B) already graduate on the fork. |
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
| N-1: a launch before configuration keeps the defaults for good | The launchpad takes launches from the block it's deployed in, and the script configures it in later transactions. A launch that lands in between gets the 6 ETH default reserves (a curve of about 17.6 ETH), none of M-1's exclusions, and a place in the latest launches. Anyone watching for the deployment can send one. | **Being fixed** (the owner's go-ahead, 11 Nov): one line at the top of `launchMission`, `require(graduationMigrator != address(0), "Tonkpad: Not configured")`, and the script sets the fee and reserves before the migrator. Launches then open only once everything is set, and the pending-migration path becomes unreachable. Without the fix, a deployment check catches it (section 7). |
| N-2: a broken migrator can't be replaced, and only the pause stops new launches | H-1's trade-off. If the one migrator ever reverts, every curve stalls one buy short of graduating. Holders can still sell, so no ETH is lost, but the only switch that stops new launches, `pause()`, also stops sells. It's unlikely: the official v4 contracts are immutable, and the migrator has no settings besides its treasury. Recovery is a new launchpad. | **Accept for v1.** Optional later: an exits-only pause that stops launches and buys but leaves sells open. It would also answer M-4's residual. |
| N-3: contract-wallet holders can be excluded for good (needs the owner key) | The code check stops the owner excluding ordinary wallets. But a holder's Safe, a 4337 account or an EIP-7702 wallet has code, and exclusion is one-way. What the wallet earned is paid out, and it earns nothing more on that token. | **Accept.** Publish the policy (pools and vaults only) and watch `CrewExcluded`. Optional: refuse EIP-7702 delegations. |

Two residuals stay:
- A pause also freezes curve sells (M-4).
- The app must apply M-2's floor, and it does. The Studio and the server refuse a tier above 0.5% without 10M tokens locked. The Mission score counts a lock only if it locks at least 1% of supply, whatever the creator fee.

**The owner's answer, 11 Nov,** given in the main session: "also you can ahead on the fixes for" D-01 and D-02. The rehearsal session is making both in the `mainnet` copy, with Astra's reproductions kept as regression tests. Then every suite runs again and the review session re-reviews the diff.

**N-1, the owner's answer, 11 Nov:** "Fix all three" (D-01, D-02 and N-1). N-1 joins the same round: one line and a reordered script, with its test kept as a regression test. N-2 and N-3 are accepted as above.

## 3. App work (Claude, this repo)

- **Mainnet mode.** `NEXT_PUBLIC_TONK_NETWORK=mainnet` with the mainnet addresses. Launch opens on production, Solana, swaps and the bridge stay on, and there's no TESTNET badge. Production switches only when the owner sets the variable after deployment.
- **Graduated tokens trade on their pool** through the official Universal Router:
  - Quotes come from V4Quoter for `migrator.poolKey(token, fee)`.
  - A buy pays ETH and needs no approval.
  - A sell approves Permit2 and then allows the router, each for exactly the amount sold, the router's allowance for 30 minutes.
  - The server simulates and builds each trade, and the wallet signs after the "One last look." review: the same rules as curve trades.
  - **"Share pool fees"** calls `distributePostGradRewards`, which anyone may call.
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
- **Under way (the owner's go-ahead, 11 Nov):** D-01, D-02 and N-1 in one round, then every suite and a re-review again.
- **Any critical or high finding from Astra** gets the same treatment.

## 5. Astra

Two ready-to-paste briefs, in the shared notes folder's `mainnet-2-day-plan.md`:
1. **An adversarial review** of the four contracts.
2. **A public-simulation campaign** on the testnet site with four test wallets: every launch type, trades, referral, claims, the creator's tools, graduation, reloads and cancelled signatures, odd token text, phones, languages, and the testnet pause with the owner.

Astra uses only fresh wallets holding only test ETH, and never sees a seed phrase or private key.

## 6. The owner

- Approve this brief.
- Create the Safe and choose the treasury address.
- Ask an outside auditor for a quick review.
- Run the two real checks in gate 6.
- Give Astra the testnet site (a Vercel share link) and its test wallets.
- Sign the testnet pause and unpause, the mainnet deployment, and the Safe's acceptance of ownership.
- Set `NEXT_PUBLIC_TONK_NETWORK=mainnet` for Production once the deployment checks out.

## 7. Go or no-go, before the mainnet deployment is signed

- **The fork rehearsal:** every check passes.
- **Both reviews:** every critical or high finding is fixed or shown false, and the fixes pass the 49 tests and the rehearsal.
- **Astra's campaign:** no unexplained difference between the app and the chain.
- **The app:** lint, typecheck, unit tests and every end-to-end run pass.
- **Setup:** the Safe exists, the treasury is chosen, and the testnet pause and unpause are done.
- **Deployment checks** (the review's list):
  - the chain ID is 4663;
  - the migrator is built on the official PoolManager and PositionManager, and the PositionManager's Permit2 is the official one;
  - the guard's address flags are right, and `poolKey(token, fee).hooks` is the guard;
  - the migrator, fee and reserves are set and read back before any launch is announced;
  - `graduationMigrator()` is the migrator just deployed: it can never be changed, so a wrong one means a new launchpad before any launch;
  - no `MissionLaunched` event came before the last configuration transaction (N-1), unless N-1 is fixed;
  - the Safe has accepted ownership of both contracts;
  - the treasury can receive ETH;
  - monitoring is running.
- **Sign-off:** the owner accepts, in writing, starting without an independent audit, with decisions 3, 9 and 10 in place and decision 2 either fixed or accepted.

## 8. Schedule

**11 Nov**
- Done: the fork rehearsal, the mainnet script, Claude's review, the brief's approval ("Fix the contracts"), the five fixes and their re-review, and Astra's review.
- Done in the app: mainnet mode, pool trading, Explore, Portfolio and the guards.
- The owner approved D-01, D-02 and N-1 (section 2b).
- Astra runs the public-simulation campaign.
- The owner sets up the Safe and a fresh deployer wallet, requests the outside review, and runs the gate 6 checks.

**12 Nov**
- The D-01, D-02 and N-1 round, re-reviewed and rehearsed again.
- The app gets the "Share pool fees" button and every test run again.
- Astra re-tests the fixes.
- Go or no-go in the evening.

**13 Nov**
- The owner signs the deployment, and the Safe accepts ownership.
- The deployment is checked read-only.
- Production switches to mainnet mode, and Launch opens.

If a review finds something that needs a contract change, the date moves with it. The go or no-go list doesn't.
