// @vitest-environment node
import { describe, expect, it } from "vitest";
import { MASK, maskForModel } from "../src/telegram/mod/secrets";
import type { TgMessageEntity } from "../src/telegram/types";

const entity = (text: string, part: string, type: "email" | "phone_number"): TgMessageEntity => ({ type, offset: text.indexOf(part), length: part.length });

describe("maskForModel hides contact details (privacy#6)", () => {
  it.each([
    ["my email is sam@example.com, why did my buy fail?", `my email is ${MASK}, why did my buy fail?`],
    ["write to Sam.Doe+tonk@mail.example.co.uk please", `write to ${MASK} please`],
    ["почта: иван@почта.рф", `почта: ${MASK}`],
    ["For bugs, contact security@tonkfun.fun with the details", `For bugs, contact ${MASK} with the details`],
  ])("an e-mail address: %s", (text, masked) => {
    expect(maskForModel(text)).toBe(masked);
  });

  it.each([
    ["call me at +1 555 123 4567 today", `call me at ${MASK} today`],
    ["whatsapp +447946095800", `whatsapp ${MASK}`],
    ["mi número +34 612-345-678", `mi número ${MASK}`],
    ["звони +7 (912) 345-67-89", `звони ${MASK}`],
    ["加我 +86 138 0013 8000", `加我 ${MASK}`],
    ["text (555) 123-4567 or 555.123.4567", `text ${MASK} or ${MASK}`],
    ["nomor saya 0812-3456-7890", `nomor saya ${MASK}`],
    ["số của tôi 0912 345 678", `số của tôi ${MASK}`],
  ])("a phone number: %s", (text, masked) => {
    expect(maskForModel(text)).toBe(masked);
  });

  it("masks what Telegram marked, whatever its form", () => {
    const text = "reach me on 0171 1234567 or at sam(at)example.com";
    const entities = [entity(text, "0171 1234567", "phone_number"), entity(text, "sam(at)example.com", "email")];
    expect(maskForModel(text, entities)).toBe(`reach me on ${MASK} or at ${MASK}`);
  });

  it("ignores entities that don't fit the text", () => {
    const text = "gm frens";
    const broken = [{ type: "phone_number", offset: 50, length: 10 }, { type: "email", offset: -3, length: 4 }, { type: "email", offset: 0, length: 0 }] as TgMessageEntity[];
    expect(maskForModel(text, broken)).toBe(text);
  });

  it.each([
    "ask @TonkfunBot about the fee",
    "is 0xfd42e33d5d3a8b04ed95f43e9453f7b17b23cd95 legit?",
    "mint 7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr",
    "I bought 1,000,000 tokens at 0.000123 ETH",
    "up +5.5% today, +100.000000 SOL in a week, +1000000 holders",
    "launch on 2026-11-25 at 12:30, block 12345678",
    "supply 1 000 000 000 and v1.2.3",
    "hi@everyone gm",
  ])("leaves the rest alone: %s", (text) => {
    expect(maskForModel(text)).toBe(text);
  });
});
