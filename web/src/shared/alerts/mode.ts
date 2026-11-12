import { tonkMode } from "@/shared/tonk/networks";

/** Alerts run everywhere but the testnet site, whose screens say they aren't on testnet yet. */
export const alertsOn = () => tonkMode() !== "testnet";

/** The launchpad switches need tonkfun.fun's launches: mainnet, and the demo the tests run on. */
export const launchpadAlerts = () => tonkMode() === "mainnet" || tonkMode() === "mock";
