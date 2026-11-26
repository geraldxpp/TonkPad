import type { Locale } from "@/shared/i18n/config";
import type { AbuseSet } from "./words";

/**
 * FOR THE OWNER'S REVIEW: the short lists behind two rules.
 *
 * - abuse: slurs and threats. A match is deleted and the admins are alerted;
 *   they decide what follows. Kept short on purpose: casual crypto slang
 *   ("this will kill it", "rekt") is not abuse.
 * - crisisStrong: first-person self-harm statements ("I", "my", or a verb
 *   form that can only be the speaker's), never a "dying of laughter" idiom
 *   (de risa, de rire, vor Lachen, от смеха, gülmekten, laughing: weak at
 *   most), nor a phone or a battery dying (Indonesian and Vietnamese put the
 *   possessive after the noun: "hp gue mau mati"). The member is never punished for
 *   the message (its deletes still stand); they get the human-written crisis
 *   reply and the admins an urgent alert.
 * - crisisWeak: weaker signs of distress (lost everything, can't go on), and
 *   the bare forms of the strong phrases, which are also everyday hyperbole
 *   ("mệt muốn chết", dead tired) or threats ("lo mau mati ya"). Nothing
 *   happens from these alone: they send the message to Haiku's check, which
 *   can raise the crisis flag.
 *
 * Entries are regular-expression sources, matched as words.ts describes (a
 * space stands for any run of spaces; Chinese, Japanese and Korean match
 * anywhere). Adding a phrase here changes moderation at once: keep each one
 * unambiguous.
 */
export const ABUSE_WORDS: Readonly<Record<Locale, AbuseSet>> = {
  en: {
    abuse: [
      "n[i1!|]gg(er|a|ah|uh|3r)s?", "f[a@4]gg?(ot|0t)s?", "k[i1]kes?", "sp[i1]cs?", "wetbacks?", "trann(y|ies)", "(i'?ll|i will|gonna|going to) (kill|murder|stab|hurt) (you|u|ya)",
      "kill (yourself|urself|ur self|your self)", "kys", "(hope|wish) (you|u) (die|get cancer|get raped)", "(i'?ll|i will|gonna|going to) doxx? (you|u)", "i know where you live", "rape (you|u)",
    ],
    crisisStrong: [
      "i (really )?(want|wanna|need) to die(?! (laughing|of laughter|from laughing))", "i wanna die(?! (laughing|of laughter|from laughing))", "i want to be dead",
      "kill(ing)? myself(?! (laughing|with laughter|of laughter))", "end(ing)? my (own )?life", "take my (own )?life", "(i'?m|i am|im) (feeling )?suicidal",
      "(i'?m|i am|im) (going to |gonna |about to )?commit(ting)? suicide", "i('ll| will| want to| wanna| might)? commit suicide", "i (really )?(don'?t|do not) want to (live|be alive|exist) anymore",
      "(i have|i've got|i got|i've) no reason to (live|keep living)", "(i have|i've got|i got|i've) nothing (left )?to live for", "(i'?m|i am|im|i'?d be|i would be) better off dead",
    ],
    crisisWeak: [
      "lost everything", "lost it all", "lost all my (money|savings|funds)", "(i'?m|i am|im) ruined", "can'?t go on", "can'?t take (it|this) anymore", "no way out", "hopeless", "my life is over", "give up on (life|everything)", "want to disappear", "life savings",
      "commit(ting)? suicide", "(don'?t|do not) want to (live|be alive|exist) anymore", "no reason to (live|keep living)", "nothing (left )?to live for", "better off dead", "goodbye cruel world",
    ],
  },
  es: {
    abuse: ["te voy a matar", "te (mato|matar[ée])", "m[aá]tate", "su[ií]cidate", "s[ée] d[oó]nde vives", "maric[oó]n(es)?", "sudacas?", "negratas?"],
    crisisStrong: ["(me )?quiero morir(?! de (la )?risa)", "quiero matarme", "me voy a (matar|suicidar)", "(voy a|quiero) suicidarme", "acabar con mi vida", "quitarme la vida", "no quiero (vivir|seguir viviendo)", "no tengo (raz[oó]n|motivo) para vivir"],
    crisisWeak: ["lo perd[ií] todo", "perd[ií] todos mis ahorros", "estoy arruinad[oa]", "no puedo m[aá]s", "no (hay|veo) salida", "sin esperanza", "mi vida (se acab[oó]|est[aá] arruinada)"],
  },
  pt: {
    abuse: ["vou te matar", "te mato", "se mata", "vai se matar", "sei onde (voc[eê]|vc) mora", "viad(o|inho)s?"],
    crisisStrong: ["quero morrer(?! de rir)", "vou me matar", "quero me matar", "(vou|quero) (me )?suicidar", "acabar com (a )?minha vida", "tirar (a )?minha (pr[oó]pria )?vida", "n[aã]o quero mais viver", "n[aã]o tenho (motivo|raz[aã]o) pra viver"],
    crisisWeak: ["perdi tudo", "perdi todas as minhas economias", "estou arruinad[oa]", "n[aã]o aguento mais", "sem sa[ií]da", "sem esperan[cç]a", "minha vida acabou"],
  },
  fr: {
    abuse: ["je vais te (tuer|buter|crever)", "(va|vas) te (tuer|suicider)", "suicide(-| )toi", "je sais o[uù] tu (habites|vis)", "p[ée]d[ée]s?", "bougnoules?"],
    crisisStrong: ["je veux mourir(?! de rire)", "je (veux|vais) me (suicider|tuer)", "en finir avec ma vie", "(je veux|je vais) en finir avec la vie", "mettre fin à mes jours", "je ne veux plus vivre", "je n'ai (plus )?aucune raison de vivre"],
    crisisWeak: ["j'ai tout perdu", "je suis ruin[ée]e?", "je n'en peux plus", "aucune issue", "sans espoir", "ma vie est fichue", "en finir avec la vie", "aucune raison de vivre"],
  },
  de: {
    abuse: ["ich (bring|bringe) dich um", "ich t[öo]te dich", "bring dich um", "ich wei(ß|ss) wo du wohnst", "schwuchteln?", "kanaken?"],
    crisisStrong: [
      "ich will (sterben(?! vor lachen)|nicht mehr leben)", "ich (bring|bringe) mich um", "ich (will|werde|möchte) mich umbringen", "mein leben beenden", "ich (will|werde|möchte) (selbstmord|suizid) begehen", "ich habe keinen grund (mehr )?zu leben",
    ],
    crisisWeak: ["alles verloren", "ich bin ruiniert", "ich kann nicht mehr", "kein ausweg", "hoffnungslos", "mein leben ist vorbei", "mich umbringen", "(selbstmord|suizid) begehen", "keinen grund (mehr )?zu leben"],
  },
  ru: {
    abuse: ["я тебя (убью|найду|зарежу)", "убей себя", "сдохни", "повесься", "знаю,? где ты живешь", "пид(о|а)р(ас|ы|ов|асы)?", "хач(и|ей)?", "чурк(а|и)"],
    crisisStrong: ["(?<!от смеха )хочу умереть(?! от смеха)", "покончу с собой", "(хочу|собираюсь) покончить с (собой|жизнью)", "убью себя", "не хочу (больше )?жить", "наложу на себя руки"],
    crisisWeak: ["потерял(а)? вс(е|ё)", "я разорен(а)?", "больше не могу", "нет выхода", "безнадежно", "моя жизнь кончена", "суицид", "покончить с (собой|жизнью)"],
  },
  tr: {
    abuse: ["seni öldüreceğim", "seni (öldürürüm|bulacağım)", "kendini öldür", "geber", "nerede oturduğunu biliyorum", "ibne(ler)?"],
    crisisStrong: ["(?<!gülmekten )ölmek istiyorum(?! gülmekten)", "kendimi öldüreceğim", "intihar edeceğim", "intihar etmek istiyorum", "yaşamak istemiyorum", "canıma kıyacağım", "hayatıma son vereceğim"],
    crisisWeak: ["her şeyimi kaybettim", "her şeyi kaybettim", "mahvoldum", "dayanamıyorum", "çıkış yolu yok", "umutsuzum"],
  },
  zh: {
    abuse: ["我要杀了你", "我會殺了你", "杀了你", "殺了你", "你去死", "去死吧", "我知道你住(在)?哪", "支那", "黑鬼"],
    crisisStrong: ["我(真的|好|很)?想死(?![你您他她它])", "我要自杀", "我要自殺", "我(真的|好|很)?想自(杀|殺)", "我(真的)?不想活了", "我(真的|快)?活不下去", "结束我的生命", "結束我的生命", "我(想|要)结束(自己的)?生命", "我(想|要)結束(自己的)?生命"],
    crisisWeak: ["我失去了一切", "全亏了", "全虧了", "亏光了", "虧光了", "撑不下去", "撐不下去", "绝望", "絕望", "想死", "想自(杀|殺)", "不想活了", "活不下去", "(结束|結束)生命"],
  },
  ja: {
    abuse: ["殺してやる", "ぶっ殺す", "死ね", "お前の住所", "ガイジ"],
    crisisStrong: ["(?<!笑いすぎて|笑い過ぎて|笑って)死にたい(?!のか|んか|の[?？]|か[?？])", "自殺したい", "消えたい", "生きていたくない", "命を絶ちたい"],
    crisisWeak: ["全部失った", "すべて失った", "もう無理", "絶望", "生きる意味がない", "自殺する", "死にたい"],
  },
  ko: {
    abuse: ["죽여 버릴", "죽인다", "죽어라", "자살해라", "너 어디 사는지 알아"],
    crisisStrong: ["(?<!웃겨서\\s*|웃겨\\s*)죽고 싶(?!냐|니|으냐|으면|으세요)", "자살하고 싶(?!냐|니|으냐|으면|으세요)", "자살할 거(?!니|냐)", "살고 싶지 않", "목숨을 끊고 싶"],
    crisisWeak: ["다 잃었", "전부 잃었", "더는 못 버티", "더 이상 못 버티", "희망이 없", "절망", "죽고 싶", "자살하고 싶", "자살할 거", "목숨을 끊"],
  },
  vi: {
    abuse: ["tao (sẽ )?giết mày", "giết mày", "đi chết đi", "mày chết đi", "tao biết nhà mày"],
    crisisStrong: [
      "(?<!(điện thoại|đt|máy|pin|laptop|máy tính|xe|mạng|wifi|sạc) )(tôi|tao|mình|tớ|em) (thật sự |thực sự |rất |chỉ )?muốn (chết|tự tử)(?!\\s+(à|hả|hở|không|chứ|sao|ư)(?![\\p{L}]))", "(tôi|tao|mình|tớ|em) (sẽ|định) tự tử", "(tôi|tao|mình|tớ|em) (thật sự |thực sự )?không muốn sống nữa",
      "(tôi|tao|mình|tớ|em) (muốn|sẽ|định) kết thúc cuộc đời", "kết thúc cuộc đời (của )?(tôi|tao|mình|tớ|em)",
    ],
    crisisWeak: ["mất hết", "mất tất cả", "tuyệt vọng", "không chịu nổi", "không còn lối thoát", "muốn chết", "muốn tự tử", "(sẽ|định) tự tử", "không muốn sống nữa", "kết thúc cuộc đời"],
  },
  id: {
    abuse: ["aku (akan )?bunuh (kamu|kau|lu|lo)", "gue bunuh (lu|lo)", "bunuh dirimu", "mati sana", "aku tahu rumahmu"],
    // The pronoun opens a clause (Indonesian possessives follow the noun: "hp gue mau mati" is "my phone is dying").
    crisisStrong: [
      "(?<=(?:^|[.,;:!?\\n…])\\s*)(aku|saya|gue|gw) (ingin|mau|pengen|pengin) mati", "(?<=(?:^|[.,;:!?\\n…])\\s*)(aku|saya|gue|gw) (ingin|mau|pengen|pengin|akan) bunuh diri",
      "(?<=(?:^|[.,;:!?\\n…])\\s*)(aku|saya|gue|gw) (tidak|gak|ga|nggak|enggak) (ingin|mau) hidup lagi", "(?<=(?:^|[.,;:!?\\n…])\\s*)(aku|saya|gue|gw) (ingin|mau|akan) mengakhiri hidup",
      "mengakhiri hidupku",
    ],
    crisisWeak: [
      "kehilangan segalanya", "uangku habis", "hancur", "tidak kuat lagi", "(gak|ga|nggak) kuat lagi", "putus asa", "(ingin|mau|pengen|pengin) mati", "(ingin|mau|pengen|pengin|akan) bunuh diri",
      "(tidak|gak|ga|nggak|enggak) (ingin|mau) hidup lagi", "mengakhiri hidup",
    ],
  },
};
