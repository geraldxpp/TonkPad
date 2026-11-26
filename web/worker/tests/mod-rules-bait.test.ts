// @vitest-environment node
import { describe, expect, it } from "vitest";
import { cats, hit } from "./mod-rules-fixtures";

/** A link that isn't allowed and says nothing about itself. */
const SITE = "portal-hub.site";

describe("drainer phishing needs the bait in the link or an imperative bait phrase (abuse#3)", () => {
  it.each([
    ["English", "Solana's airdrop thread is here https://x.com/solana/status/123"],
    ["English", "presale ended, chart: https://dexscreener.com/solana/abc"],
    ["English", "giveaway on x.com/coinbase/status/1"],
    ["English", "whitelisted wallets can mint on opensea.io/collection/kittens"],
    ["English", "pre-sale info at somesite.io/info"],
    ["Spanish", "sorteo en x.com/coinbase/status/2"],
    ["Portuguese", "sorteio em x.com/coinbase/status/3"],
    ["Indonesian", "bagi-bagi di x.com/coinbase/status/4"],
    ["Russian", "розыгрыш тут x.com/coinbase/status/5"],
    ["Chinese", "空投公告 x.com/coinbase/status/6"],
    ["Japanese", "エアドロップのお知らせ x.com/coinbase/status/7"],
    ["Korean", "에어드랍 공지 x.com/coinbase/status/8"],
  ])("a bare noun beside an unknown link is only that link (%s): %s", (_, text) => {
    expect(cats(text)).toEqual(["unknown_link"]);
    expect(cats(text, { standing: "new" })).toEqual(["newcomer_link"]);
    expect(cats(text, { standing: "trusted" })).toEqual([]);
  });

  it.each([
    ["its host", "gm frens: bonus-drop.site"],
    ["the path of a look-alike host", "news at tonkfun-news.xyz/claim-airdrop"],
    ["the path of a hidden-dot host", "see mysite[.]xyz/airdrop/start"],
    ["a handle", "follow @FreeAirdropDrops"],
    ["a Telegram link", "t.me/claim_rewards_bot"],
  ])("bait in %s is certain phishing", (_, text) => {
    for (const standing of ["member", "new", "trusted"] as const) expect(hit(text, "phishing", { standing })).toMatchObject({ severity: "scam", certain: true });
  });

  it.each([
    ["English", `Claim your rewards at ${SITE}`],
    ["English", `connect your wallet at ${SITE} to continue`],
    ["English", `Enter your seed phrase on ${SITE} to verify`],
    ["English", `validate your wallet here: ${SITE}`],
    ["English", `sync your wallet: ${SITE}`],
    ["English", `rectify your wallet at ${SITE}`],
    ["English", `migrate your tokens at ${SITE}`],
    ["Spanish", `Conecta tu billetera en ${SITE}`],
    ["Portuguese", `Conecte sua carteira em ${SITE}`],
    ["French", `Connectez votre portefeuille sur ${SITE}`],
    ["German", `Verbinde deine Wallet auf ${SITE}`],
    ["Turkish", `cüzdanınızı bağlayın ${SITE}`],
    // rules#3: these five read the same in a statement, so they need an imperative or second-person marker.
    ["Vietnamese", `hãy kết nối ví tại ${SITE}`],
    ["Indonesian", `silakan hubungkan dompet di ${SITE}`],
    ["Russian", `Подключите кошелек на ${SITE}`],
    ["Chinese", `请连接钱包 ${SITE}`],
    ["Japanese", `ウォレットを接続してください ${SITE}`],
    ["Korean", `지갑 연결하세요 ${SITE}`],
  ])("an imperative bait phrase beside an unknown link is certain phishing (%s): %s", (_, text) => {
    expect(hit(text, "phishing", { standing: "new" })).toMatchObject({ severity: "scam", certain: true });
  });

  it("an address or a hash in a link's path is never read for bait", () => {
    // Folded, "c1aim" reads "claim": an ID that spells bait by chance is still just a link.
    expect(cats("chart pump.fun/coin/Bc1aimPq8vWxYzR4tUv6nM2kJh9gFd3sAe5")).toEqual(["unknown_link"]);
    expect(cats("tx solanabeach.io/transaction/4c1aimRzb0nu5Pq8vWxYzR4tUv6nM2kJh9gFd3sAe5Hj7kLmNpQrStUvWxYz2a3b4c5d6e7f8g9hAbCdEfGh")).toEqual(["unknown_link"]);
  });

  it("a bait phrase without a link, or beside an allowed one, is no phishing", () => {
    expect(cats("claim your airdrop now")).toEqual([]);
    expect(cats("connect your wallet on https://www.tonkfun.fun/launch")).toEqual([]);
  });

  it("a bare noun never turns a look-alike link into anything less", () => {
    expect(hit("airdrop at tonkfun-claim.xyz", "lookalike", { standing: "new" })).toMatchObject({ severity: "scam", certain: true });
  });
});
