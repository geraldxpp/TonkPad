// @vitest-environment node
import { describe, expect, it } from "vitest";
import { cats, check, hit, punishes } from "./mod-rules-fixtures";

const SITE = "portal-hub.site";

/** rules#3: a member asking how to connect or claim, beside a dapp link, is asking for help. */
describe("help requests beside a dapp link are never phishing (rules#3)", () => {
  it.each([
    "can't connect wallet on https://raydium.io, anyone else?",
    "how do I connect a wallet on https://raydium.io?",
    "where do I claim the airdrop? https://x.com/solana/status/123 says it's live",
    "how do I import wallet into https://phantom.app ?",
    "tried to recover wallet with https://help.phantom.app but no luck",
    "no puedo conectar la billetera en https://raydium.io",
    "não consigo conectar a carteira no https://raydium.io",
    "не могу подключить кошелек к https://raydium.io",
    "我无法连接钱包 https://raydium.io",
    "ウォレットを接続できません https://raydium.io",
    "지갑 연결이 안 돼요 https://raydium.io",
    "không kết nối ví được https://raydium.io",
    "gak bisa hubungkan wallet di https://raydium.io",
    "je n'arrive pas à connecter mon portefeuille sur https://raydium.io",
    "ich kann meine Wallet nicht verbinden auf https://raydium.io",
    "cüzdanımı bağlayamıyorum https://raydium.io",
    "I can't connect my wallet at https://raydium.io",
    "how can I connect your wallet to https://raydium.io?",
  ])("must not punish: %s", (text) => {
    expect(cats(text, { standing: "new" }), text).toEqual(["newcomer_link"]);
    expect(cats(text), text).toEqual(["unknown_link"]);
    expect(punishes(text)).toBe(false);
  });

  it.each(["https://www.coingecko.com/learn/what-is-a-crypto-airdrop", "https://solana.com/staking/rewards", "news at some-blog.xyz/claim-airdrop"])(
    "bait only in the path of an ordinary site is just that link: %s",
    (text) => {
      expect(cats(text, { standing: "new" })).toEqual(["newcomer_link"]);
      expect(cats(text)).toEqual(["unknown_link"]);
    },
  );

  it.each([
    ["bait in its host", "gm frens: bonus-drop.site"],
    ["a drainer handle", "follow @FreeAirdropDrops"],
    ["a look-alike host with bait in its path", "tonkfun-app.xyz/claim"],
    ["an obfuscated host with bait in its path", "evil[.]xyz/claim-airdrop"],
  ])("bait still counts in %s", (_, text) => {
    expect(hit(text, "phishing", { standing: "new" })).toMatchObject({ severity: "scam", certain: true });
  });

  it.each([
    ["English", `connect your wallet at ${SITE} to continue`],
    ["English", `Claim your rewards at ${SITE}`],
    ["Spanish", `Conecta tu billetera en ${SITE}`],
    ["Portuguese", `Conecte sua carteira em ${SITE}`],
    ["French", `Connectez votre portefeuille sur ${SITE}`],
    ["German", `Verbinde deine Wallet auf ${SITE}`],
    ["Turkish", `cüzdanınızı bağlayın ${SITE}`],
    ["Russian", `Подключите кошелек на ${SITE}`],
    ["Vietnamese", `Hãy kết nối ví tại ${SITE}`],
    ["Indonesian", `Silakan hubungkan dompet di ${SITE}`],
    ["Chinese", `请连接钱包 ${SITE}`],
    ["Japanese", `ウォレットを接続してください ${SITE}`],
    ["Korean", `지갑을 연결하세요 ${SITE}`],
  ])("imperative or second-person bait stays certain (%s): %s", (_, text) => {
    expect(hit(text, "phishing", { standing: "new" })).toMatchObject({ severity: "scam", certain: true });
  });

  it.each([
    ["Vietnamese", `kết nối ví tại ${SITE}`],
    ["Indonesian", `hubungkan dompet di ${SITE}`],
    ["Chinese", `连接钱包 ${SITE}`],
    ["Japanese", `ウォレットを接続 ${SITE}`],
    ["Korean", `지갑 연결 ${SITE}`],
    ["English, no 'your'", `connect a wallet at ${SITE}`],
  ])("without an imperative or second-person marker it is just that link (%s): %s", (_, text) => {
    expect(check(text, { standing: "new" }).hits.map((h) => h.category)).toEqual(["newcomer_link"]);
  });
});
