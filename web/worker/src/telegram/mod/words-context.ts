import type { Locale } from "@/shared/i18n/config";

/**
 * What a sentence says about who is speaking, in the site's 12 languages
 * (rules-text.ts reads each sentence; entries match as words.ts describes).
 * Data only.
 *
 * - firstPerson: the member speaking of themselves, or their own trouble
 *   ("I", "my", "can't", "how do I"): bait in such a sentence is never
 *   rule-certain ("I can't connect my wallet at raydium.io").
 * - attribution: someone else's words ("it says", "asks you to"): bait
 *   reported is not the author's own ("tonkfun-claim.xyz says claim your
 *   airdrop, it's fake").
 * - claim: the word "claim" (a verb or a noun) in each language: outside a
 *   report sentence, it voids a report ("Yes! Claim now").
 */
export interface ContextWords {
  firstPerson: readonly string[];
  attribution: readonly string[];
  claim: readonly string[];
}

export const CONTEXT_WORDS: Readonly<Record<Locale, ContextWords>> = {
  en: {
    firstPerson: ["i", "i'm", "im", "i've", "ive", "i'd", "i'll", "my", "me", "mine", "myself", "can'?t", "cannot", "unable to", "how do i", "how can i", "where do i", "tried to", "trying to"],
    attribution: ["says?", "said", "saying", "asks?", "asked", "asking", "tells? (you|me|us|people|everyone)", "told (you|me|us|people|everyone)", "telling (you|me|us|people|everyone)", "wants? (you|me|us) to", "wanted (you|me|us) to", "pretends?", "claims? to", "claiming to", "posing as", "wrote", "writes"],
    claim: ["claim(s|ing|ed)?"],
  },
  es: {
    firstPerson: ["yo", "mi", "mis", "me", "no puedo", "puedo", "no logro", "no consigo", "c[oó]mo (puedo|hago)"],
    attribution: ["dice", "dicen", "dijo", "pide", "piden", "pidi[oó]", "quiere que", "te pide", "se hace pasar"],
    claim: ["reclam\\p{L}*"],
  },
  pt: {
    firstPerson: ["eu", "meu", "minha", "meus", "minhas", "n[aã]o consigo", "consigo", "como (eu|fa[cç]o|posso)"],
    attribution: ["diz", "dizem", "disse", "pede", "pedem", "pediu", "quer que", "se passa"],
    claim: ["resgat\\p{L}*", "reivindic\\p{L}*"],
  },
  fr: {
    firstPerson: ["je", "j'\\p{L}*", "mon", "ma", "mes", "moi", "comment (je|faire)"],
    attribution: ["dit", "disent", "a dit", "demande", "demandent", "veut que", "pr[ée]tend", "se fait passer"],
    claim: ["r[ée]clam\\p{L}*"],
  },
  de: {
    firstPerson: ["ich", "mein", "meine", "meinen", "meinem", "meiner", "mich", "mir", "wie kann ich"],
    attribution: ["sagt", "sagen", "sagte", "schreibt", "schrieb", "fordert", "verlangt", "will dass", "behauptet", "gibt sich als"],
    claim: ["claim\\p{L}*", "beanspruch\\p{L}*", "fordere", "hol dir"],
  },
  tr: {
    firstPerson: ["ben", "benim", "bana", "beni", "\\p{L}+(am|em)ıyorum", "\\p{L}+(am|em)iyorum", "\\p{L}+(ama|eme)dım", "\\p{L}+(ama|eme)dim", "nasıl"],
    attribution: ["diyor", "dedi", "istiyor", "yazıyor", "yazdı", "gibi davranıyor"],
    claim: ["talep\\p{L}*"],
  },
  vi: {
    firstPerson: ["tôi", "mình", "tui", "tớ", "giúp tôi", "giúp mình", "làm sao"],
    attribution: ["nói", "bảo", "yêu cầu", "tự xưng", "giả danh"],
    claim: ["nhận"],
  },
  id: {
    firstPerson: ["aku", "saya", "gue", "gw", "\\p{L}+ku", "(gak|ga|nggak|enggak|tidak|tak) bisa", "gimana", "bagaimana"],
    attribution: ["bilang", "katanya", "minta", "nyuruh", "menyuruh", "mengaku"],
    claim: ["klaim"],
  },
  ru: {
    firstPerson: ["я", "мой", "моя", "мои", "моё", "мое", "мне", "меня", "не могу", "не получается", "как мне"],
    attribution: ["пишет", "пишут", "говорит", "говорят", "просит", "предлагает", "сказал\\p{L}*", "якобы"],
    claim: ["получ(и|ите)", "забер(и|ите)", "клейм\\p{L}*", "заклейм\\p{L}*"],
  },
  zh: {
    firstPerson: ["我(?![们們])", "无法", "無法", "不能", "怎么", "怎麼"],
    attribution: ["说", "說", "叫你", "让你", "讓你", "要你", "声称", "聲稱", "冒充"],
    claim: ["领取", "領取"],
  },
  ja: {
    firstPerson: ["私", "僕", "俺", "わたし", "できません", "できない", "どうすれば"],
    attribution: ["と言", "って言", "と書", "と主張"],
    claim: ["受け取", "請求"],
  },
  ko: {
    firstPerson: ["제가", "저는", "저의", "내가", "나는", "나의", "제 지갑", "내 지갑", "안 ?돼", "안 ?되", "못 ?해", "못 ?하", "어떻게"],
    attribution: ["라고", "하래", "하라고", "사칭"],
    claim: ["수령", "청구"],
  },
};
