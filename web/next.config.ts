import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Agent guidance lives in the repo's CLAUDE.md; don't let `next dev` write AGENTS.md.
  agentRules: false,
  // Always inlined, so a build without it (production) drops the e2e stub wallet entirely.
  env: { NEXT_PUBLIC_WALLET_STUB: process.env.NEXT_PUBLIC_WALLET_STUB ?? "" },
  turbopack: {
    // The wallet adapter's Coinbase, Base Account and Safe connectors are off; see the stub.
    resolveAlias: {
      "@wagmi/connectors": "./src/shared/wallet/no-wagmi-connectors.ts",
    },
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
