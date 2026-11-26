import type { Locale } from "@/shared/i18n/config";

/**
 * Whether a link or handle is real, in the site's 12 languages
 * (rules-report.ts; entries match as words.ts describes). Data only.
 *
 * - legit: what a member asks about a link ("real", "official", "can I
 *   trust", "yours", "scam", 是官网, 공식…). In a question that holds the
 *   link or handle, or refers to it (DEMONSTRATIVES: "is this the official
 *   site? <link>"), it makes the message a report, wherever it stands.
 * - endorse: what a scammer says of their link ("legit", "official",
 *   "safe", "the only official"). In a statement beside the link, it voids
 *   any report.
 * - negatedReport: a report word denied ("no scam", "not fake", "estafa
 *   no", "не фейк", 不是骗局): an endorsement, never a report.
 */
export interface LegitWords {
  legit: readonly string[];
  endorse: readonly string[];
  negatedReport: readonly string[];
}

export const LEGIT_WORDS: Readonly<Record<Locale, LegitWords>> = {
  en: {
    legit: [
      "real", "legit", "legitimate", "official", "genuine", "safe", "trust", "trusted", "trustworthy", "scam", "fake", "phishing", "verified", "yours", "from (you|the team|tonkfun)",
      "(is|are|was) (this|that|it|these|those|they|he|she) (really )?(you|u|the team|tonkfun)", "your (site|link|page|bot|account|channel|group|admin|support)",
    ],
    endorse: ["legit", "legitimate", "official", "safe", "real", "genuine", "verified", "trusted", "trustworthy", "safu", "the only", "100%"],
    negatedReport: ["(not|no|isn'?t|is not|ain'?t|never) (a )?(scam|fake|rug|phishing|drainer)", "zero (scam|risk|rug)"],
  },
  es: {
    legit: ["real", "leg[ií]tim[oa]", "oficial", "segur[oa]", "verdad", "confiable", "estafa", "fals[oa]", "fake", "vuestr[oa]", "suy[oa]"],
    endorse: ["leg[ií]tim[oa]", "oficial", "segur[oa]", "verificad[oa]", "confiable", "el [úu]nico", "la [úu]nica"],
    negatedReport: ["no (es )?(una )?(estafa|fraude|fake)", "(estafa|fraude|fake) no", "sin estafa"],
  },
  pt: {
    legit: ["real", "leg[ií]tim[oa]", "oficial", "segur[oa]", "verdade", "confi[aá]vel", "golpe", "fals[oa]", "fake", "de voc[eê]s"],
    endorse: ["leg[ií]tim[oa]", "oficial", "segur[oa]", "verificad[oa]", "confi[aá]vel", "o [úu]nico", "a [úu]nica"],
    negatedReport: ["n[aã]o [eé] (um )?(golpe|fraude|fake)", "(golpe|fraude|fake) n[aã]o", "sem golpe"],
  },
  fr: {
    legit: ["vrai", "r[ée]el(le)?", "l[ée]gitime", "officiel(le)?", "s[ûu]r", "fiable", "arnaque", "faux", "fausse", "fake", "[àa] vous"],
    endorse: ["l[ée]gitime", "officiel(le)?", "s[ûu]r", "v[ée]rifi[ée]e?", "fiable", "le seul", "la seule"],
    negatedReport: ["(ce n'est |c'est )?pas (une )?(arnaque|fake|escroquerie)", "aucune arnaque"],
  },
  de: {
    legit: ["echt", "seri[öo]s", "offiziell(e|er|es)?", "legit", "sicher", "vertrauensw[üu]rdig", "betrug", "scam", "fake", "gef[äa]lscht", "von euch", "eure"],
    endorse: ["offiziell(e|er|es)?", "seri[öo]s", "sicher", "verifiziert", "legit", "die einzige", "der einzige"],
    negatedReport: ["kein (betrug|scam|fake)", "(ist )?nicht (fake|gef[äa]lscht)"],
  },
  tr: {
    legit: ["gerçek", "resmi", "güvenilir", "güvenli", "sahte", "dolandırıcı\\p{L}*", "scam", "sizin mi"],
    endorse: ["resmi", "güvenilir", "güvenli", "doğrulanmış", "tek resmi"],
    negatedReport: ["(dolandırıcılık|scam|sahte) değil"],
  },
  vi: {
    legit: ["thật", "chính thức", "uy tín", "an toàn", "lừa đảo", "giả", "scam", "của (bạn|các bạn|team|đội ngũ)"],
    endorse: ["chính thức", "uy tín", "an toàn", "duy nhất"],
    negatedReport: ["không (phải )?(là )?(lừa đảo|scam|giả)"],
  },
  id: {
    legit: ["asli", "resmi", "aman", "terpercaya", "penipuan", "palsu", "scam", "punya (kalian|tim)"],
    endorse: ["resmi", "aman", "terpercaya", "legit", "satu-satunya"],
    negatedReport: ["(bukan|tidak|gak|ga|nggak) (penipuan|scam|palsu)"],
  },
  ru: {
    legit: ["настоящ\\p{L}*", "официальн\\p{L}*", "реальн\\p{L}*", "безопасн\\p{L}*", "правда", "скам", "развод", "фейк", "мошенни\\p{L}*", "ваш\\p{L}*"],
    endorse: ["официальн\\p{L}*", "безопасн\\p{L}*", "проверенн\\p{L}*", "единственн\\p{L}*"],
    negatedReport: ["не (скам|фейк|развод|мошенничество)"],
  },
  zh: {
    legit: ["官网", "官網", "官方", "真的", "正规", "正規", "安全", "可信", "靠谱", "靠譜", "骗", "騙", "假的", "你们的", "你們的"],
    endorse: ["官网", "官網", "官方", "正规", "正規", "安全", "可靠", "唯一"],
    negatedReport: ["不是(骗局|騙局|骗子|騙子|假的|诈骗|詐騙)", "没有(骗局|騙局)"],
  },
  ja: {
    legit: ["公式", "本物", "安全", "詐欺", "偽物", "偽"],
    endorse: ["公式", "安全", "唯一"],
    negatedReport: ["詐欺(じゃない|ではない|ではありません)"],
  },
  ko: {
    legit: ["공식", "진짜", "안전", "사기", "가짜"],
    endorse: ["공식", "안전", "유일한"],
    negatedReport: ["사기(가|는)? 아니"],
  },
};

/** Words that point at something just named ("is this real?", "это развод?"): a question beside the link that holds one is about the link. */
export const DEMONSTRATIVES: readonly string[] = [
  "this", "that", "it", "these", "those", "esto", "este", "esta", "eso", "ese", "esa", "isso", "isto", "esse", "essa", "ce", "ça", "cela", "c'est", "das", "dies", "diese[rs]?", "es",
  "bu", "şu", "này", "đây", "đó", "ini", "itu", "это", "этот", "эта", "эти", "这", "這", "那", "它", "これ", "それ", "この", "その", "이거", "이것", "그거", "그것",
];

/** A sentence opening with a call to act on the link ("Join t.me/+…", "Visit …"): outside a report sentence, it voids a report. */
export const OPENING_PROMO: readonly string[] = ["(please |pls |now |just )?(join|visit|register|sign up|signup|click|tap|go to|head to|check out|buy|ape|apply|use|try)"];
