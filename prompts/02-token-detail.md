# Module 2 — Token Detail

Build the token screen of Tonkpad.fun in `web/` (`/token/[address]`, `modules/token`). It must look and behave like the owner's export `token.html` / `token.dc.html` (Ghosty, 1440 × 1880), in the app's own palette (CLAUDE.md wins over the export's violet).

Decided with the owner on 7 Nov 2026: build from the export; real trades; Captain Boo answers from the token's own data (scripted, no AI service); the chart uses TradingView's Lightweight Charts (Apache-2.0).

## Phases
1. **The screen on mock data** (this prompt's sections 1–7). Everything the export shows and does, with the trade panel and the bridge dialog simulated exactly as the export simulates them.
2. **Live data.** The worker serves `/v1/token/:address` in the same shapes: header facts, stats, candles, trades, holders, top traders, locks (Streamflow), and Captain Boo's facts. Crew rewards and Locked Missions stay Tonkpad-only.
3. **Real trades.** Wallet connection (Reown, both chains), quotes and swaps (Jupiter on Solana; the Pons curve and Uniswap on Robinhood Chain), balances, slippage, priority and MEV settings, confirmations, and a security review before it goes live. Real bridging comes after that.

## 1. Look before you code
Read `CLAUDE.md`, the export's markup (exact sizes, radii, gaps, type) and its `text/x-dc` block (data and logic). Compare with the owner's screenshot. Map every colour to a token.

## 2. Layout
Breadcrumb (Explore / tab / name). Two columns that wrap: main (flex 999 1 600px, gap 20) and aside (flex 1 1 360px, max 420px, gap 20).

## 3. Main column
- **Header card:** 112 px art, name (Bricolage 800 40/44), chain and launchpad pills, ticker · creator · launch date, badges (Locked Mission ✓ for Tonkpad launches only, Crew Rewards 2%, Agent live, Mission score), CA copy button and Website / Community / Share / Watchlist; market cap block on the right (mono 600 40/44, 24h change, price per token).
- **Chart card:** Price / MCap toggle, timeframes 1m 5m 15m 1h 4h 1D, Indicators (2), full screen; OHLC + change + volume readout; candles and volume, a dashed graduation line with its label, a dashed current-price line with its tag, W and S markers, and the smart-wallet callout on the last candle.
- **Stats strip:** Market cap, 24h volume, Liquidity, Holders, Top 10, Dev locked.
- **Activity card:** tabs Live trades / Holders · 1,204 / Top traders; 1h buys vs sells bar; the three tables (scroll sideways inside the card); Show more.
- **About card:** description and the eight facts.

## 4. Aside
- **Trade panel:** Buy / Sell; Market / Limit / Auto-sell; the bridge banner when the buy balance is short; you pay (amount input, balance, unit, USD), presets (Buy 0.01 0.05 0.1 0.5 Max; Sell 0.5 1 2 3 Max); you receive with the 15% slippage minimum; Slippage / Priority / MEV shield; the trade button or the reason you can't trade; the fee line.
- **Bridge dialog:** From Base / Arbitrum / Ethereum / Solana, you send / you get, provider and ETA, Bridge & Ready Wallet; closing on Escape, the close button and the backdrop; a success toast in the trade panel.
- **Mission telemetry:** dev lock status with progress and the verify link; crew rewards with the 14-day payout bars.
- **Captain Boo:** the chat log with fact chips, the three quick questions, a free-text question routed by keyword (lock / crew / brief / other).

## 5. Behaviour (match the export's logic)
Timeframe switches the candles, labels and readout. Activity tabs switch tables. Side, presets and amount drive receive, minimum, balance colour, banner and button. Every token from Explore opens a page: Ghosty uses the export's data; other mock tokens get the same structure from their own figures.

## 6. Responsive, themes, language
1440 first; columns wrap; no horizontal page scroll at 390 px in both themes and in German and Russian. Every string in all 12 languages.

## 7. Tests
Unit: candle generator (same seed, same candles), trade maths, Captain Boo routing, chart data mapping. E2E: every interaction above, the dialog by keyboard, and `web/e2e/screenshots/token-1440.png`.

## Out of scope for phase 1
Live data, wallets, real trades and bridging (phases 2 and 3), Limit and Auto-sell order forms, the Indicators menu contents.
