// @vitest-environment node
import { describe, expect, it } from "vitest";
import { MASK, maskForModel } from "../src/telegram/mod/secrets";
import type { TgMessageEntity } from "../src/telegram/types";

/** rules#8 and admin-privacy-docs#1: the local formats members write, and Telegram's own marks. */
describe("maskForModel hides local phone formats (rules#8)", () => {
  it.each([
    ["help, my buy failed, WA me 081234567890", `help, my buy failed, WA me ${MASK}`],
    ["contact me on wa.me/6281234567890", `contact me on wa.me/${MASK}`],
    ["https://wa.me/15551234567 for help", `https://wa.me/${MASK} for help`],
    ["api.whatsapp.com/send?phone=6281234567890&text=hi", `api.whatsapp.com/send?phone=${MASK}&text=hi`],
    ["meu zap (11) 91234-5678", `meu zap ${MASK}`],
    ["mi número es 612 345 678", `mi número es ${MASK}`],
    ["Telefon 0151 23456789", `Telefon ${MASK}`],
    ["call me 07911 123456", `call me ${MASK}`],
    ["ring 07911123456 after 5", `ring ${MASK} after 5`],
    ["my buy failed, can the team call me on 13812345678 or 98765 43210?", `my buy failed, can the team call me on ${MASK} or ${MASK}?`],
    ["phone: 138 1234 5678", `phone: ${MASK}`],
    ["tel 5551234567", `tel ${MASK}`],
    ["whatsapp 0049 30 1234567", `whatsapp ${MASK}`],
    ["позвоните мне 8 912 345 67 89", `позвоните мне ${MASK}`],
    ["телефон 8 912 345-67-89", `телефон ${MASK}`],
    ["电话 13812345678", `电话 ${MASK}`],
    ["電話 090-1234-5678", `電話 ${MASK}`],
    ["전화 010 1234 5678", `전화 ${MASK}`],
    ["điện thoại 0912345678", `điện thoại ${MASK}`],
    ["zalo 0912 345 678", `zalo ${MASK}`],
    ["appelle-moi au 06 12 34 56 78", `appelle-moi au ${MASK}`],
  ])("%s", (text, masked) => {
    expect(maskForModel(text)).toBe(masked);
  });

  it("masks Telegram's own marks first, by their offsets in the original text", () => {
    const text = "ﬁx: 𝟎𝟏𝟓𝟏 𝟐𝟑𝟒𝟓𝟔𝟕𝟖𝟗 or x@y.zz";
    const phone = "𝟎𝟏𝟓𝟏 𝟐𝟑𝟒𝟓𝟔𝟕𝟖𝟗";
    const entities: TgMessageEntity[] = [{ type: "phone_number", offset: text.indexOf(phone), length: phone.length }, { type: "email", offset: text.indexOf("x@y.zz"), length: 6 }];
    expect(maskForModel(text, entities)).toBe(`fix: ${MASK} or ${MASK}`);
  });

  it("a number hidden behind invisible characters is still masked", () => {
    expect(maskForModel("WA 0812​34567890")).toBe(`WA ${MASK}`);
  });

  it.each([
    "supply 1000000000 tokens, 1% fee",
    "block 123456789 at 12:30",
    "I bought 1,000,000 at 0.000123 ETH",
    "launch on 2026-11-25, ref 20261125",
    "0.5 SOL and 10.25 ETH",
    "mint 7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr",
    "is 0xfd42e33d5d3a8b04ed95f43e9453f7b17b23cd95 legit?",
    "the number 1000000000 is the max supply",
  ])("leaves amounts, blocks, dates and addresses alone: %s", (text) => {
    expect(maskForModel(text)).toBe(text);
  });
});

describe("the local phone patterns stay narrow and fast (rules#8)", () => {
  it.each([
    "buy signal at 0.00001234, target 0.00002",
    "call it 1.5 ETH and move on",
    "tel aviv meetup next week",
    "the 2nd number on the chart: 1000000000 supply",
    "contract 0x1234567890123456789012345678901234567890 on solscan",
    "phone wallets work, version 1.2.3",
  ])("leaves a price, a version or a word alone: %s", (text) => {
    expect(maskForModel(text)).toBe(text);
  });

  it("masks a 4,096-character wall of phone words and digit runs in under 50 ms", () => {
    const walls = ["call me on 0812 ", "tel 5 5 5 1 2 3 ", "wa.me/628123456 or ", "(11) 9123"].map((unit) => unit.repeat(Math.ceil(4_096 / unit.length)).slice(0, 4_096));
    for (const wall of walls) {
      maskForModel(wall);
      const start = performance.now();
      maskForModel(wall);
      expect(performance.now() - start).toBeLessThan(50);
    }
  });
});
