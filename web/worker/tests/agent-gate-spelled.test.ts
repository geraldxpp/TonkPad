import { describe, expect, it } from "vitest";
import type { Locale } from "@/shared/i18n/config";
import { spelledFigures } from "../src/telegram/agent/gate-spelled";
import { gate } from "./agent-gate-fixtures";

/**
 * Numbers written in words or CJK numerals beside a unit (injection#7):
 * checked like digits, so "five percent" can't carry a fee the facts don't
 * hold. The facts (agent-gate-fixtures.ts) hold 1%, 25%, 0.25%, 99%, 10
 * million tokens and 0.042 ETH.
 */
const blocked = (reply: string, language: Locale = "en") => gate(reply, {}, { language }).blocked;

describe("the numbers check: figures in words", () => {
  it.each<[Locale, string, string]>([
    ["en", "On fees: the swap fee is five percent of every trade.", "On fees: the swap fee is one percent of every trade."],
    ["en", "On launching: the launch fee is two ETH, paid once.", "On the tax: every buy in the launch block pays ninety-nine percent."],
    ["en", "On referrals: a referral pays fifty percent of the protocol fee.", "On referrals: a referral pays twenty-five percent of the protocol fee."],
    ["en", "On Crew Rewards: holders need five million tokens.", "On Crew Rewards: holders need ten million tokens."],
    ["es", "Sobre comisiones: cada operación paga el cinco por ciento.", "Sobre comisiones: cada operación paga el uno por ciento."],
    ["pt", "Sobre taxas: cada negociação paga cinco por cento.", "Sobre taxas: cada negociação paga um por cento."],
    ["fr", "Sur les frais : chaque échange paie cinq pour cent.", "Sur les frais : chaque échange paie un pour cent."],
    ["de", "Zu Gebühren: jeder Handel zahlt fünf Prozent.", "Zu Gebühren: jeder Handel zahlt ein Prozent."],
    ["ru", "О комиссиях: каждая сделка платит пять процентов.", "О комиссиях: каждая сделка платит один процент."],
    ["tr", "Ücretler: her işlem yüzde beş öder.", "Ücretler: her işlem yüzde bir öder."],
    ["vi", "Về phí: mỗi giao dịch trả năm phần trăm.", "Về phí: mỗi giao dịch trả một phần trăm."],
    ["id", "Tentang biaya: setiap transaksi membayar lima persen.", "Tentang biaya: setiap transaksi membayar satu persen."],
    ["zh", "关于费用：每笔交易的协议费是百分之五。", "关于费用：每笔交易的协议费是百分之一。"],
    ["ja", "手数料について：取引ごとに五パーセントの手数料がかかります。", "手数料について：取引ごとに一パーセントの手数料がかかります。"],
    ["ko", "수수료: 거래마다 오 퍼센트를 냅니다.", "수수료: 거래마다 일 퍼센트를 냅니다."],
  ])("checks a spelled figure in %s", (lang, wrong, right) => {
    expect(blocked(wrong, lang)).toBe("numbers");
    expect(blocked(right, lang)).toBeNull();
  });

  it("reads 百分之 with digits as a percentage too", () => {
    expect(blocked("关于费用：协议费是百分之2。", "zh")).toBe("numbers");
    expect(blocked("关于费用：协议费是百分之1。", "zh")).toBeNull();
    expect(blocked("关于税：发射区块里的每笔买入支付百分之九十九的税。", "zh")).toBeNull();
  });

  it("blocks a unit beside number words it can't read for certain", () => {
    expect(blocked("On fees: every trade pays five two percent.")).toBe("numbers");
    expect(spelledFigures("every trade pays five two percent", "en").uncertain).toBe(true);
  });

  it("leaves words that aren't a figure beside a unit alone", () => {
    for (const [lang, reply] of [
      ["en", "On launching: one of the launchpads is tonkfun.fun, and a token takes two blocks to open."],
      ["en", "On tokens: a token's card shows its curve progress."],
      ["es", "Sobre lanzar: puedes lanzar un token en la página Launch."],
      ["tr", "Başlatma: Launch sayfasında bir token başlatabilirsin."],
      ["ko", "이 토큰은 카드에서 커브 진행률을 보여 줍니다."],
      ["zh", "关于代币：一个代币的卡片会显示曲线进度。"],
      ["de", "Zum Start: ein Token startet auf der Launch-Seite."],
    ] as Array<[Locale, string]>) {
      expect(blocked(reply, lang), reply).toBeNull();
    }
  });

  it("converts only what it checks: the shown text keeps the words", () => {
    expect(gate("On fees: every trade pays one percent.").text).toBe("On fees: every trade pays one percent.");
    expect(spelledFigures("every trade pays one percent", "en")).toEqual({ text: "every trade pays 1 percent", uncertain: false });
  });
});
