// @vitest-environment node
import { describe, expect, it } from "vitest";
import { deliveryOf, loadAlertConfig } from "../src/alerts/config";

const MAINNET = {
  NEXT_PUBLIC_TONK_NETWORK: "mainnet",
  NEXT_PUBLIC_TONK_LAUNCHPAD: "0x1111111111111111111111111111111111111111",
  NEXT_PUBLIC_TONK_MIGRATOR: "0x2222222222222222222222222222222222222222",
  NEXT_PUBLIC_TONK_LAUNCHPAD_BLOCK: "111700000",
};

describe("the watcher's settings", () => {
  it("stays off unless NEXT_PUBLIC_TONK_NETWORK is mainnet or testnet", () => {
    for (const network of [undefined, "", "off", "mock", "sepolia"]) {
      const { config, notes } = loadAlertConfig({ NEXT_PUBLIC_TONK_NETWORK: network });
      expect(config).toBeNull();
      expect(notes).toEqual(["alerts off: NEXT_PUBLIC_TONK_NETWORK is not mainnet or testnet"]);
    }
  });

  it("needs the mainnet deployment's three values, read as the app reads them", () => {
    expect(loadAlertConfig({ NEXT_PUBLIC_TONK_NETWORK: "mainnet" }).notes).toEqual(["alerts off: mainnet needs NEXT_PUBLIC_TONK_LAUNCHPAD, _MIGRATOR and _LAUNCHPAD_BLOCK"]);
    expect(loadAlertConfig({ ...MAINNET, NEXT_PUBLIC_TONK_MIGRATOR: MAINNET.NEXT_PUBLIC_TONK_LAUNCHPAD }).config).toBeNull();
    const { config } = loadAlertConfig({ ...MAINNET, SNAPSHOT_PATH: "/data/snapshot.json" });
    expect(config).toMatchObject({
      chainId: 4663,
      explorerUrl: "https://robinhoodchain.blockscout.com",
      rpcUrl: "https://rpc.mainnet.chain.robinhood.com",
      launchpad: MAINNET.NEXT_PUBLIC_TONK_LAUNCHPAD,
      migrator: MAINNET.NEXT_PUBLIC_TONK_MIGRATOR,
      startBlock: 111_700_000,
      guard: null,
      pollMs: 10_000,
      largeOutflowWei: BigInt("1000000000000000000"),
      repeatMs: 30 * 60_000,
      maxLagSeconds: 90,
      checkFromBps: 5_000,
      summaryMs: 24 * 3_600_000,
      dryRun: false,
      statePath: "/data/alerts-4663.json",
      secrets: [],
    });
  });

  it("watches the testnet release by default on testnet, but never a half-set deployment", () => {
    expect(loadAlertConfig({ NEXT_PUBLIC_TONK_NETWORK: "testnet" }).config).toMatchObject({ chainId: 46630, launchpad: "0xb9bb81242ce7b40775ceadf3b591411f0320ec82", startBlock: 151_119_562, statePath: "worker/.state/alerts-46630.json" });
    expect(loadAlertConfig({ NEXT_PUBLIC_TONK_NETWORK: "testnet", NEXT_PUBLIC_TONK_LAUNCHPAD: MAINNET.NEXT_PUBLIC_TONK_LAUNCHPAD }).config).toBeNull();
    expect(loadAlertConfig({ ...MAINNET, NEXT_PUBLIC_TONK_NETWORK: "testnet" }).config).toMatchObject({ chainId: 46630, launchpad: MAINNET.NEXT_PUBLIC_TONK_LAUNCHPAD, startBlock: 111_700_000 });
  });

  it("reads the alert settings, and falls back with a note on a bad one", () => {
    const { config, notes } = loadAlertConfig({
      ...MAINNET,
      TONK_POOL_GUARD: "0x5855E0C9420895BB217ECE668264F0D0CBA16000",
      ALERT_LARGE_OUTFLOW_ETH: "2.5",
      ALERT_REPEAT_MINUTES: "15",
      ALERT_POLL_SECONDS: "abc",
      ALERT_GRADUATION_CHECK_FROM_PCT: "80",
      ALERT_SUMMARY_HOURS: "0",
      ALERT_DRY_RUN: "1",
    });
    expect(config).toMatchObject({ guard: "0x5855e0c9420895bb217ece668264f0d0cba16000", largeOutflowWei: BigInt("2500000000000000000"), repeatMs: 15 * 60_000, pollMs: 10_000, checkFromBps: 8_000, summaryMs: 0, dryRun: true });
    expect(notes).toEqual(["ALERT_POLL_SECONDS must be a number from 2 to 300; using 10"]);
    expect(loadAlertConfig({ ...MAINNET, ALERT_LARGE_OUTFLOW_ETH: "-1" }).notes).toEqual(["ALERT_LARGE_OUTFLOW_ETH must be an amount of ETH such as 0.5; using 1"]);
    expect(deliveryOf(config!)).toBe("dry run (logged only)");
  });

  it("sends only where both halves of a channel are set, and keeps every secret out of its notes", () => {
    const secrets = { ALERT_TELEGRAM_BOT_TOKEN: "123456:TOKEN-SECRET", ALERT_WEBHOOK_URL: "https://discord.com/api/webhooks/1/HOOK-SECRET", ALERT_HEARTBEAT_URL: "https://hc-ping.com/PING-SECRET", TONK_RPC_URL: "https://rpc.example/v2/RPC-SECRET" };
    const half = loadAlertConfig({ ...MAINNET, ALERT_TELEGRAM_BOT_TOKEN: secrets.ALERT_TELEGRAM_BOT_TOKEN, ALERT_WEBHOOK_URL: "not a url" });
    expect(half.config?.telegram).toBeNull();
    expect(half.notes).toEqual(["Telegram needs both ALERT_TELEGRAM_BOT_TOKEN and ALERT_TELEGRAM_CHAT_ID; it's off", "ALERT_WEBHOOK_URL isn't an http(s) URL; it's off"]);
    expect(deliveryOf(half.config!)).toBe("log only (no channel set)");
    const { config, notes } = loadAlertConfig({ ...MAINNET, ...secrets, ALERT_TELEGRAM_CHAT_ID: "-1001" });
    expect(config).toMatchObject({ telegram: { token: secrets.ALERT_TELEGRAM_BOT_TOKEN, chatId: "-1001" }, webhookUrl: secrets.ALERT_WEBHOOK_URL, heartbeatUrl: secrets.ALERT_HEARTBEAT_URL, rpcUrl: secrets.TONK_RPC_URL });
    expect(config?.secrets.sort()).toEqual(Object.values(secrets).sort());
    expect(deliveryOf(config!)).toBe("telegram + webhook");
    expect(JSON.stringify(notes)).not.toMatch(/SECRET/);
  });
});
