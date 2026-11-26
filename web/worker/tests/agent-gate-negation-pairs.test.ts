import { describe, expect, it } from "vitest";
import type { Locale } from "@/shared/i18n/config";
import { findClaims } from "../src/telegram/agent/claims";
import { gate } from "./agent-gate-fixtures";

/**
 * Fix round 2 (answers#5): vouching through a negation. Frames that say
 * yes ("there's no denying", "without question", "can't stress enough",
 * "couldn't be more", "nothing to worry about", "not a single doubt",
 * "nobody can say otherwise", "il ne fait aucun doute", "keine Frage",
 * "不用担心", "那还用说"…), two English negations that cancel ("no way …
 * isn't"), and a quantifier too far from "legit" or "guaranteed" no longer
 * pass as disclaimers; the disclaimers the bot really writes still do.
 */

const blocks = (lang: Locale, reply: string) => {
  expect(findClaims(reply, [], lang)).not.toEqual([]);
  expect(gate(reply, {}, { language: lang }).blocked).toBe("claim");
};

describe("vouching through a negation (answers#5)", () => {
  it.each([
    ["en", "There's no denying it's legit."],
    ["en", "There is no denying that profits are guaranteed."],
    ["en", "There's no way this isn't legit."],
    ["en", "There's no way it's not legit."],
    ["en", "It couldn't be more legit."],
    ["en", "Nothing could be more legit."],
    ["en", "I can't stress enough that profits are guaranteed."],
    ["en", "Nobody can tell you it isn't legit."],
    ["en", "Don't worry it's legit."],
    ["en", "No matter what profits are guaranteed."],
    ["en", "There's no reason to doubt it's legit."],
    ["en", "No reason to worry profits are guaranteed."],
    ["en", "Is it legit? Nothing to worry about."],
    ["en", "Is it legit? Without question."],
    ["en", "Is it legit? Nobody can say otherwise."],
    ["en", "Is the profit guaranteed? Not a single doubt."],
    ["en", "Is it legit? Don't worry, it is."],
    ["en", "Is it legit? Nobody can say it isn't."],
    ["en", "Will it be listed? No doubt about it."],
    ["fr", "Il ne fait aucun doute que c'est garanti."],
    ["fr", "Il ne fait aucun doute qu'il sera listé."],
    ["es", "Es imposible que no sea legítimo."],
    ["es", "No te preocupes es legítimo."],
    ["pt", "Não tenha medo é garantido."],
    ["de", "Keine Frage der Gewinn ist garantiert."],
    ["de", "Kein Wunder, dass er gelistet wird."],
    ["ru", "Не сомневайтесь это гарантировано."],
    ["zh", "不用担心保证赚钱。"],
    ["zh", "保证赚钱吗？那还用说。"],
    ["zh", "保证赚钱吗？我觉得会的。"],
    ["vi", "Có đảm bảo lợi nhuận không? Đảm bảo luôn."],
    ["id", "Jangan khawatir, dijamin untung."],
    ["tr", "Endişelenme garantili."],
    ["ja", "心配いりません保証されています。"],
    ["ko", "걱정 마세요 수익은 보장됩니다."],
  ])("blocks in %s: %s", (lang, reply) => blocks(lang as Locale, reply));

  it.each([
    ["en", "A high score doesn't mean a token is legit."],
    ["en", "On the score: a high Mission score doesn't mean a token is legit or safe."],
    ["en", "No token here is guaranteed to rise."],
    ["en", "No profit on any token is guaranteed."],
    ["en", "Nothing here is guaranteed, and no token is risk-free."],
    ["en", "No score and no badge make a token legit."],
    ["en", "No score makes a token legit: it rates chain facts."],
    ["en", "There's no way to tell if a token is legit from its name."],
    ["en", "There's no way to know whether a token is legit."],
    ["en", "I don't know whether it's legit."],
    ["en", "I can't tell whether a token is safe to buy."],
    ["en", "Don't assume a token is legit because of its name."],
    ["en", "Don't worry: nothing is guaranteed, so only spend what you can lose."],
    ["en", "Is it legit? It isn't, and no score says so."],
    ["en", "Is it guaranteed? No, nothing is guaranteed."],
    ["en", "Is it legit? It's not, and nothing is guaranteed."],
    ["en", "Is it guaranteed? Don't worry: nothing is guaranteed, so only spend what you can lose."],
    ["fr", "Rien n'est garanti."],
    ["fr", "Ce n'est pas garanti."],
    ["es", "No es legítimo solo por su nombre."],
    ["es", "Nada está garantizado y no es seguro comprar a ciegas."],
    ["ru", "Ни один токен не безопасен."],
    ["ru", "Ничего не гарантировано."],
    ["de", "Ich weiß nicht, ob er gelistet wird."],
    ["zh", "没有人能保证收益。"],
    ["vi", "Có đảm bảo lợi nhuận không? Không."],
  ])("still lets a disclaimer through in %s: %s", (lang, reply) => {
    expect(findClaims(reply, [], lang as Locale)).toEqual([]);
  });
});
