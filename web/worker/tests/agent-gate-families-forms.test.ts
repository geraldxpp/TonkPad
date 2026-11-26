import { describe, expect, it } from "vitest";
import type { Locale } from "@/shared/i18n/config";
import { findClaims } from "../src/telegram/agent/claims";
import { gate } from "./agent-gate-fixtures";

/**
 * Fix round 2: the claim families' common forms (answers#6) and no false
 * blocks on facts (answers#9). A fake "official" coin, refunds promised in
 * the passive, "now's the time to buy" and "it's about to pump" are claims;
 * a conditional ("if you sell now, you pay the 1% fee") and an amount that
 * grows by design ("the amount you can claim will increase each day of a
 * linear vest") are facts.
 */

const blocked = (lang: Locale, reply: string) => {
  expect(findClaims(reply, [], lang)).not.toEqual([]);
  expect(gate(reply, {}, { language: lang }).blocked).toBe("claim");
};
const passes = (lang: Locale, reply: string) => {
  expect(findClaims(reply, [], lang)).toEqual([]);
};

describe("the claim families' common forms (answers#6)", () => {
  it.each([
    ["en", "Yes, it's the real tonkfun.fun coin."],
    ["en", "Yes, TFUN is tonkfun.fun's own coin."],
    ["en", "This token was launched by the tonkfun.fun team."],
    ["en", "tonkfun.fun stands behind this token."],
    ["en", "It's the coin the team itself launched."],
    ["es", "Es el token real de tonkfun.fun."],
    ["zh", "这就是tonkfun.fun自己的币。"],
  ])("blocks the brand's own coin in %s: %s", (lang, reply) => blocked(lang as Locale, reply));

  it.each([
    ["en", "Everyone will be refunded."],
    ["en", "Holders will be compensated for the tax."],
    ["en", "Refunds will be sent to every holder by Friday."],
    ["en", "The team has promised refunds to everyone who lost money."],
    ["en", "A refund is on its way to your wallet."],
    ["fr", "Tout le monde sera remboursé."],
    ["de", "Alle werden entschädigt."],
    ["ru", "Всем вернут деньги."],
    ["zh", "大家都会得到赔偿。"],
    ["ko", "모두 환불받을 수 있습니다."],
    ["tr", "Herkese para iadesi yapılacak."],
    ["id", "Semua akan mendapat refund."],
    ["vi", "Mọi người sẽ được hoàn tiền."],
    ["es", "Todos serán reembolsados."],
    ["pt", "Todos serão reembolsados."],
    ["ja", "全員に返金されます。"],
  ])("blocks a promise in the passive in %s: %s", (lang, reply) => blocked(lang as Locale, reply));

  it.each([
    ["en", "Now's the time to buy."],
    ["en", "Load up before it's too late."],
    ["en", "It's a strong buy."],
    ["en", "You should get in early."],
    ["en", "Go ahead and buy, the curve is almost full."],
    ["en", "The price is going up."],
    ["en", "It's about to pump."],
    ["en", "It should double by Friday."],
    ["en", "The price can only go up from here."],
    ["en", "Expect the price to double by Friday."],
    ["en", "This one is safe."],
    ["ru", "Цена скоро пойдет вверх."],
    ["zh", "价格马上就要涨了。"],
  ])("blocks trade advice, a price move or 'safe' in %s: %s", (lang, reply) => blocked(lang as Locale, reply));

  it.each([
    ["en", "tonkfun.fun's own coin is coming soon: any token that says it is the coin isn't."],
    ["en", "The real tonkfun.fun coin hasn't launched yet."],
    ["en", "Is this the real tonkfun.fun coin? No: tonkfun.fun's own coin is coming soon."],
    ["en", "Tokens on tonkfun.fun are launched by their creators, not by the team."],
    ["en", "Everyone will be able to see the token's card with /check."],
    ["en", "Holders will get a share of every curve trade while they hold enough tokens."],
    ["en", "On refunds: the team can't reverse on-chain transactions."],
    ["en", "Buyers who get in early, in the launch block, pay the 99% tax."],
    ["en", "If you get in early, in the launch block, you pay the 99% tax."],
    ["en", "The price may go up or down: nobody can say which."],
    ["en", "The page may take a moment to load up."],
  ])("lets a fact through in %s: %s", (lang, reply) => passes(lang as Locale, reply));
});

describe("no false blocks on facts (answers#9)", () => {
  it.each([
    ["en", "If you sell now, you pay the 1% protocol fee on the sale."],
    ["en", "If you buy now, you pay the curve's price plus the 1% protocol fee."],
    ["zh", "现在卖出的话，需要支付1%的协议费。"],
    ["zh", "如果现在卖出，需要支付1%的协议费。"],
    ["es", "Si vendes ahora, pagas la comisión del 1% del protocolo."],
    ["de", "Wenn du jetzt verkaufst, zahlst du die Protokollgebühr von 1%."],
    ["ru", "Если продать сейчас, вы заплатите комиссию протокола 1%."],
    ["en", "On locks: the amount you can claim will increase each day of a linear vest."],
    ["en", "On Crew Rewards: your rewards will increase over time while you hold."],
    ["en", "On vesting: your claimable share will rise every day until the lock ends."],
    ["en", "On graduation: the market cap will climb toward the graduation cap as the curve fills."],
    ["en", "On holders: the holder count will increase as more people buy."],
    ["en", "On the score: the Mission score will rise over the lock's life."],
    ["en", "On vesting: your unlocked balance only goes up during a linear vest."],
    ["ru", "Количество токенов, которые можно забрать, вырастет со временем."],
  ])("lets a fact through in %s: %s", (lang, reply) => passes(lang as Locale, reply));

  it.each([
    ["en", "Sell now."],
    ["en", "TFUN will double this week."],
    ["en", "TFUN is going up."],
    ["en", "On Crew Rewards: the price will double by Friday."],
    ["en", "Buy now and hold, it will double this week."],
    ["en", "The price will recover soon."],
    ["zh", "现在就买，价格会翻倍。"],
    ["ru", "Цена вырастет со временем."],
  ])("still blocks advice and a price move in %s: %s", (lang, reply) => blocked(lang as Locale, reply));
});
