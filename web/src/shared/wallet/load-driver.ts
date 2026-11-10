import type { WalletDriver } from "./types";

/**
 * Loads the wallet code on demand. Both branches are dynamic imports, so
 * none of it is in the pages' first load; the e2e builds swap in the stub
 * (NEXT_PUBLIC_WALLET_STUB=1 is inlined at build time, so a production
 * build never reaches it).
 */
export async function loadDriver(): Promise<WalletDriver> {
  if (process.env.NEXT_PUBLIC_WALLET_STUB === "1") {
    const { createStubDriver } = await import("./stub-driver");
    return createStubDriver();
  }
  const projectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID?.trim();
  if (!projectId) throw new Error("NEXT_PUBLIC_REOWN_PROJECT_ID is not set");
  const { createAppKitDriver } = await import("./appkit-driver");
  return createAppKitDriver(projectId);
}
