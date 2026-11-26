/**
 * The launchpad's figures for a new launch and their dollar values. The maths
 * lives in shared/tonk/figures, so the Telegram bot's launchpad_figures tool
 * (worker/src/telegram/agent) reads the very figures this page shows.
 */
export { type DocsFigures, docsFigures, usdValue } from "@/shared/tonk/figures";
