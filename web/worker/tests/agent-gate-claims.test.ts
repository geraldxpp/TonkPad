import { describe, expect, it } from "vitest";
import type { Locale } from "@/shared/i18n/config";
import { findClaims } from "../src/telegram/agent/claims";
import { gate } from "./agent-gate-fixtures";
import { testWords } from "./community-fixtures";

describe("banned claims", () => {
  it.each([
    ["en", "This token is safe to buy right now."],
    ["en", "It could 10x by Friday."],
    ["en", "Profits are guaranteed and you can't lose."],
    ["en", "It's not a scam, and the presale is live."],
    ["en", "Zero fees on every trade, and it will be listed on a big exchange."],
    ["es", "Es seguro comprar este token."],
    ["es", "Ganancia garantizada, no es una estafa."],
    ["es", "Puede hacer x10 esta semana."],
    ["ru", "Этот токен безопасно покупать."],
    ["ru", "Это не скам, прибыль гарантирована."],
    ["ru", "Он полетит на луну, будет 10х."],
    ["ja", "このトークンは買っても安全です。"],
    ["zh", "可以放心买入，稳赚不赔。"],
  ])("blocks a promise in %s: %s", (lang, reply) => {
    expect(findClaims(reply, [], lang as Locale).length).toBeGreaterThan(0);
    expect(gate(reply, {}, { language: lang as Locale }).blocked).not.toBeNull();
  });

  it("names the claims it finds, never the text", () => {
    expect(findClaims("This is safe to buy and will 10x.")).toEqual(expect.arrayContaining(["safe to buy", "multiplier"]));
    expect(gate("Este token es seguro para comprar.", {}, { language: "es" }).blocked).toBe("claim");
  });

  it.each([
    ["en", "Nothing here is guaranteed, and no token is risk-free."],
    ["en", "I can't tell whether a token is safe to buy."],
    ["en", "On presales: there is no presale, and I can't give price targets."],
    ["es", "Nada está garantizado y no es seguro comprar a ciegas."],
    ["pt", "Nada é garantido."],
    ["fr", "Rien n'est garanti."],
    ["de", "Gewinne sind nicht garantiert."],
    ["ru", "Ничего не гарантировано."],
    ["tr", "Kazanç garanti değildir."],
    ["zh", "不保证收益。"],
    ["ja", "利益は保証されていません。"],
    ["ko", "수익은 보장되지 않습니다."],
  ])("lets a disclaimer through in %s: %s", (lang, reply) => {
    expect(findClaims(reply, [], lang as Locale)).toEqual([]);
  });

  it.each([
    ["en", "On buying: I can't tell anyone when or whether to buy, or predict prices. A token's card (/check and its address) shows its Mission score: facts from the chain, not advice."],
    ["en", "On safety: the team never DMs first. If someone does, it's a scam: don't click their links. Every token can lose value."],
    ["en", "On the curve: as people buy, the price rises along the bonding curve; as they sell, it falls."],
    ["es", "Sobre comprar: no puedo decirte cuándo ni si comprar. Nada está garantizado."],
    ["ru", "О покупке: я не могу сказать, когда и стоит ли покупать. Ничего не гарантировано."],
    ["zh", "关于费用：曲线上的每笔买卖都支付固定的1%协议费。不保证任何收益。"],
    ["de", "Um sicher zu kaufen, prüfe zuerst die Karte des Tokens."],
    ["ru", "Чтобы безопасно покупать, проверяйте карточку токена."],
    ["ja", "安全に購入するには、トークンのカードを確認してください。"],
  ])("lets an ordinary answer through in %s", (lang, reply) => {
    expect(findClaims(reply, [], lang as Locale)).toEqual([]);
    expect(gate(reply, {}, { language: lang as Locale }).blocked).toBeNull();
  });

  it("counts only the answer's own language's negations when it is known", () => {
    // Portuguese "no" means "in the": it doesn't turn a promise into a disclaimer.
    expect(findClaims("O lucro no curto prazo é garantido.", [], "pt")).toEqual(["guaranteed"]);
    expect(gate("O lucro no curto prazo é garantido.", {}, { language: "pt" }).blocked).toBe("claim");
  });

  it("doesn't let a negation reach across a clause", () => {
    expect(findClaims("Don't worry, it's guaranteed.", [], "en")).toEqual(["guaranteed"]);
  });

  it("exempts the launchpad names, and the bot's own label and footer when given", () => {
    expect(findClaims("Moonshot, Pump.fun and Bonk.fun are launchpads, and so is tonkfun.fun.")).toEqual([]);
    const { label, footer } = testWords.answer;
    expect(findClaims(`${label}\nThe presale is live.\n${footer}`, [label, footer])).toEqual(["presale"]);
    expect(findClaims(`${label} ${footer}`, [label, footer])).toEqual([]);
  });
});

describe("score levels", () => {
  it.each(["Its Mission score is 78 · Safe.", "Mission score: Safe.", "The level is Caution.", "Оценка миссии 78 · Надёжно.", "任务评分78 · 安全。"])(
    "blocks a level beside the score: %s",
    (reply) => {
      expect(gate(reply).blocked).toBe("level");
    },
  );

  it.each(["Stay safe. The score rates chain facts.", "Risky tokens tend to get a low score.", "The score is not a safety check."])(
    "lets the same words through elsewhere: %s",
    (reply) => {
      expect(gate(reply).blocked).toBeNull();
    },
  );
});
