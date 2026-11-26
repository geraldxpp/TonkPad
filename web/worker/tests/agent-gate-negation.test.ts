import { describe, expect, it } from "vitest";
import type { Locale } from "@/shared/i18n/config";
import { findClaims } from "../src/telegram/agent/claims";
import { gate } from "./agent-gate-fixtures";

/**
 * The banned-claim negation window (injection#5): a negation counts only
 * beside the claim's own predicate or as a framing of what can't be said,
 * never as part of an intensifier ("no doubt", "nobody denies", "not
 * financial advice"), and a question's "whether", 吗 or không counts only
 * when the reply goes on to deny.
 */
describe("banned claims: what a negation turns into a disclaimer", () => {
  it.each([
    ["en", "On this token: there's no doubt it's legit."],
    ["en", "No doubt it will be listed on a big exchange soon."],
    ["en", "Nobody denies the profits are guaranteed."],
    ["en", "No one can deny it is legit."],
    ["en", "I can't deny the gains are guaranteed."],
    ["en", "Not financial advice but it is going to explode."],
    ["en", "Wondering whether it's legit? It is."],
    ["en", "Without a doubt it's legit."],
    ["en", "No question it is risk-free."],
    ["en", "I've never seen anything so legit."],
    ["en", "You can't go wrong with this guaranteed profit."],
    ["es", "No hay duda de que es legítimo."],
    ["es", "Sin duda es legítimo."],
    ["de", "Ohne Zweifel wird er gelistet."],
    ["fr", "C'est sans aucun doute garanti."],
    ["pt", "Sem dúvida é legítimo."],
    ["zh", "保证赚钱吗？当然。"],
    ["zh", "毫无疑问保证赚钱。"],
    ["vi", "Có đảm bảo lợi nhuận không? Có."],
    ["ja", "利益は保証されていて間違いない。"],
  ])("blocks a vouch dressed as a negation in %s: %s", (lang, reply) => {
    expect(findClaims(reply, [], lang as Locale)).not.toEqual([]);
    expect(gate(reply, {}, { language: lang as Locale }).blocked).toBe("claim");
  });

  it.each([
    ["en", "Nothing here is guaranteed, and no token is risk-free."],
    ["en", "I can't tell whether a token is safe to buy."],
    ["en", "No token here is guaranteed to rise."],
    ["en", "A high score doesn't mean a token is legit."],
    ["en", "There is no token that is risk-free."],
    ["en", "I don't know whether it's legit."],
    ["en", "Is it guaranteed? No, nothing is guaranteed."],
    ["es", "Nada está garantizado y no es seguro comprar a ciegas."],
    ["de", "Ich weiß nicht, ob es legit ist."],
    ["id", "Tidak ada token yang bebas risiko."],
    ["vi", "Không có token nào phi rủi ro."],
    ["vi", "Có đảm bảo lợi nhuận không? Không."],
    ["zh", "能保证赚钱吗？不能。"],
    ["zh", "没有人能保证收益。"],
    ["ja", "利益は保証されていません。"],
  ])("still lets a disclaimer through in %s: %s", (lang, reply) => {
    expect(findClaims(reply, [], lang as Locale)).toEqual([]);
  });

  it("reads a question by the answer that follows: a yes-word or a bare restatement affirms it, a negation denies it", () => {
    expect(findClaims("Is it safe to buy? It is not.", [], "en")).toEqual([]);
    expect(findClaims("Is it legit? It isn't, and no score says so.", [], "en")).toEqual([]);
    expect(findClaims("Wondering whether it's legit? It is, definitely.", [], "en")).toEqual(["legit"]);
    expect(findClaims("Is it guaranteed? Yes, of course.", [], "en")).toEqual(["guaranteed"]);
    expect(findClaims("Is it guaranteed? No doubt.", [], "en")).toEqual(["guaranteed"]);
    expect(findClaims("¿Es legítimo? Sí, lo es.", [], "es")).toEqual(["legit"]);
    expect(findClaims("¿Es legítimo? No lo es.", [], "es")).toEqual([]);
    expect(findClaims("それは保証されていますか？はい。", [], "ja")).toEqual(["guaranteed"]);
    expect(findClaims("それは保証されていますか？いいえ、保証されていません。", [], "ja")).toEqual([]);
  });

  it("no longer counts English 'whether' as a negation in a question the reply goes on to affirm", () => {
    expect(findClaims("Is it legit? Yes.", [], "en")).toEqual(["legit"]);
    expect(findClaims("Whether it's legit? It is.", [], "en")).toEqual(["legit"]);
    expect(findClaims("Whether it's legit or not depends on its creator.", [], "en")).toEqual([]);
  });
});
