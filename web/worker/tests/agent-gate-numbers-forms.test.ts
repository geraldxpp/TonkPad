import { describe, expect, it } from "vitest";
import type { Locale } from "@/shared/i18n/config";
import { figuresIn } from "../src/telegram/agent/gate-numbers";
import { gate } from "./agent-gate-fixtures";

/**
 * Fix round 2 (answers#10): figures the numbers check couldn't read. A
 * hyphen or a Chinese counter between a figure and its unit, "pct" and
 * percentage points, "Ethereum", 以太坊 and イーサ as ETH, 成 and 割 as
 * tenths, Korean native numbers, and number words of every language
 * whatever the answer's declared one. The facts (agent-gate-fixtures.ts)
 * hold 1%, 25%, 0.25%, 99%, 10 million tokens and 0.042 ETH.
 */

const blocked = (reply: string, language: Locale = "en") => gate(reply, {}, { language }).blocked;

describe("figures the numbers check reads now (answers#10)", () => {
  it.each<[Locale, string]>([
    ["en", "On fees: every curve trade pays a seven-percent protocol fee."],
    ["en", "On fees: every curve trade pays a 7-percent protocol fee."],
    ["en", "On fees: every curve trade pays 7 pct."],
    ["en", "On fees: every curve trade pays seven pct."],
    ["en", "On fees: the protocol fee is three and a half percent."],
    ["en", "The launch fee is three Ethereum."],
    ["en", "The launch fee is 0.3 Ethereum."],
    ["zh", "发射费是三个以太坊。"],
    ["zh", "发射费是3个ETH。"],
    ["zh", "每笔交易的协议费是七个百分点。"],
    ["zh", "手续费为三成。"],
    ["ja", "手数料は三割です。"],
    ["ja", "発行手数料は三イーサです。"],
    ["ko", "수수료는 일곱 퍼센트입니다."],
    ["de", "On fees: the swap fee is seven percent of every trade."],
    ["en", "Die Gebühr beträgt sieben Prozent."],
    ["es", "On fees: the swap fee is seven percent of every trade."],
  ])("blocks a figure the facts don't hold in %s: %s", (lang, reply) => {
    expect(blocked(reply, lang)).toBe("numbers");
  });

  it.each<[Locale, string]>([
    ["en", "On fees: every curve trade pays a 1-percent protocol fee."],
    ["en", "On fees: every curve trade pays one pct."],
    ["en", "On launching: the launch fee is 0.042 Ethereum."],
    ["zh", "每笔交易支付1个百分点的协议费。"],
    ["de", "On fees: the swap fee is one percent of every trade."],
    ["en", "Once ETH is bridged, every curve trade pays the 1% protocol fee."],
    ["en", "On fees: fees on ETH are paid as gas, and each curve trade pays 1%."],
    ["en", "On bridging: the bridge moves ETH from Ethereum to Robinhood Chain."],
    ["zh", "交易成功后，代币会出现在钱包里。"],
    ["ja", "割合は曲線の進み具合で変わります。"],
  ])("lets a figure the facts hold, or no figure, through in %s: %s", (lang, reply) => {
    expect(blocked(reply, lang)).toBeNull();
  });

  it("reads 成 and 割 as tenths, and a counter or a hyphen before a unit", () => {
    expect(figuresIn("3成")).toEqual([{ value: 30, unit: "%", tolerance: 5, scaled: false }]);
    expect(figuresIn("3割です")[0]).toMatchObject({ value: 30, unit: "%" });
    expect(figuresIn("3个ETH")[0]).toMatchObject({ value: 3, unit: "ETH" });
    expect(figuresIn("a 7-percent fee")[0]).toMatchObject({ value: 7, unit: "%" });
    expect(figuresIn("3成本")[0]).toMatchObject({ value: 3, unit: null });
  });
});
