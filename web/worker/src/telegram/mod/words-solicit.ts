import type { Locale } from "@/shared/i18n/config";

/**
 * What stands around a "DM me" (rules-solicit.ts), in the site's 12
 * languages. Entries match as words.ts describes (a space stands for any
 * spaces; Chinese, Japanese and Korean match anywhere). Data only.
 *
 * - negation: right before a solicitation (up to two small words between),
 *   it cancels it: "don't DM me", "never message us".
 * - support: support, help, an admin, the team or a mod (and helping verbs).
 *   One inside a solicitation or after it in its sentence makes it an offer
 *   of support, which is rule-certain fake support; one before it (an
 *   admin addressed) does not.
 * - request: the member asking for help ("someone", "my", "I need"): one
 *   before a solicitation in its sentence makes it a request, never the
 *   author's own offer ("my launch is stuck, can someone DM me").
 * - attribution: reporting someone else's words ("he said", "got a
 *   message"): a solicitation after one isn't the author's own, when the
 *   message also holds report words.
 * - team: the team addressed ("admins, DM me", "can an admin DM me",
 *   "please DM me admins"): a request, never an offer.
 * - object: right after a solicitation, the member's own trouble as what
 *   the help is for ("DM me for help with my stuck tx"): a request.
 * - trouble: a member's own trouble ("stuck", "drained", "lost"); a later
 *   clause with "my" and one of these makes the solicitation a request
 *   ("DM me, my wallet got drained"), never "DM me for support, my team will
 *   fix it".
 * - bait: drainer nouns (airdrop, claim, presale, whitelist, refund): one in
 *   the sentence of an author's own solicitation makes it rule-certain fake
 *   support ("DM me to claim your airdrop").
 */
export interface SolicitWords {
  negation: readonly string[];
  support: readonly string[];
  request: readonly string[];
  attribution: readonly string[];
  team: readonly string[];
  object: readonly string[];
  trouble: readonly string[];
  bait: readonly string[];
}

export const SOLICIT_WORDS: Readonly<Record<Locale, SolicitWords>> = {
  en: {
    negation: ["don'?t", "dont", "do not", "never", "no", "not", "nobody", "no one", "won'?t", "will not", "can'?t", "cannot", "shouldn'?t", "should not", "mustn'?t", "must not", "stop"],
    support: ["support", "help", "helpdesk", "help desk", "assist(ance)?", "admins?", "administrators?", "team", "mods?", "moderators?", "customer (care|service|support)", "tech team", "service desk", "fix", "solve", "resolve", "recover"],
    request: ["someone", "somebody", "anyone", "anybody", "my", "mine", "i need", "i'?m stuck", "im stuck", "i lost", "help me", "i can'?t", "i cannot", "(i have|i've got|i got) (a |an )?(issue|problem)"],
    attribution: [
      "said", "says", "saying", "wrote", "writes", "told (me|us|people|everyone|them|him|her)", "tells (me|us|people|everyone)", "telling (me|us|people|everyone|members|users)", "asked (me|us|people|everyone)",
      "asking (me|us|people|everyone)", "messaged me", "texted me", "(dm|pm)'?e?d me", "sent me", "(got|received) (a|an|this|the) (dm|pm|message|msg|text|email)", "pretend(s|ed|ing)?", "posing as",
    ],
    team: ["admins?", "mods?", "moderators?", "team", "support", "devs?", "staff", "owners?"],
    object: ["(for|about|with|regarding|on) my", "(for|about|with|regarding|on) (some )?(help|assistance|support) (with|on|for|about) my"],
    trouble: ["stuck", "lost", "gone", "drained", "hacked", "stolen", "scammed", "rugged", "failed", "missing", "not working", "broken", "compromised", "can'?t", "cannot", "problem", "issue", "error"],
    bait: ["airdrops?", "claim(ing)?", "pre-?sales?", "white ?list(ed)?", "refunds?", "giveaway", "allocation"],
  },
  es: {
    negation: ["no", "nunca", "jam[aá]s", "ni", "nadie"],
    support: ["soporte", "ayud\\p{L}*", "asistencia", "admin\\p{L}*", "equipo", "moderador\\p{L}*", "atenci[oó]n al cliente", "servicio al cliente", "solucion\\p{L}*", "recuper\\p{L}*"],
    request: ["alguien", "mi", "mis", "necesito", "ay[uú]da(me|nos)", "perd[ií]", "no puedo", "tengo un problema"],
    attribution: ["dijo", "dice", "dicen", "dec[ií]a", "escribi[oó]", "me (pidi[oó]|pide|mand[oó]|envi[oó]|contact[oó])", "diciendo", "se hace pasar"],
    team: ["admins?", "administrador(es)?", "moderador(es)?", "mods?", "equipo", "soporte"],
    object: ["(con|sobre|por) mis?"],
    trouble: ["atascad[oa]", "perd[ií]", "robad[oa]", "hackead[oa]", "estafad[oa]", "no funciona", "no puedo", "problema", "error"],
    bait: ["airdrop", "reclam\\p{L}*", "preventa", "lista blanca", "whitelist", "reembolso", "sorteo"],
  },
  pt: {
    negation: ["n[aã]o", "nunca", "jamais", "nem", "ningu[eé]m"],
    support: ["suporte", "ajud\\p{L}*", "assist[eê]ncia", "admin\\p{L}*", "equipe", "moderador\\p{L}*", "atendimento", "resolv\\p{L}*", "recuper\\p{L}*"],
    request: ["algu[eé]m", "meu", "minha", "meus", "minhas", "preciso", "me ajud(a|e|em)", "perdi", "n[aã]o consigo", "estou com problema"],
    attribution: ["disse", "diz", "dizem", "dizendo", "falou", "escreveu", "me (mandou|enviou|pediu|chamou)", "pediu", "se passando"],
    team: ["admins?", "administrador(es)?", "moderador(es)?", "mods?", "equipe", "suporte"],
    object: ["(com|sobre) (o |a )?(meu|minha|meus|minhas)"],
    trouble: ["travad[oa]", "perdi", "roubad[oa]", "hackead[oa]", "n[aã]o funciona", "n[aã]o consigo", "problema", "erro"],
    bait: ["airdrop", "resgat\\p{L}*", "pr[eé]-?venda", "lista branca", "whitelist", "reembolso", "sorteio"],
  },
  fr: {
    negation: ["ne", "jamais", "pas", "personne", "aucun"],
    support: ["support", "aide", "aider", "aiderai", "aidons", "assistance", "admin\\p{L}*", "[ée]quipe", "mod[ée]rateur\\p{L}*", "service client", "r[ée]soudre", "r[ée]cup[ée]r\\p{L}*"],
    request: ["quelqu'un", "mon", "ma", "mes", "j'ai besoin", "aide(z)?(-| )moi", "j'ai perdu", "je n'arrive pas", "j'ai un probl[èe]me"],
    attribution: ["a dit", "disait", "disent", "a [ée]crit", "m'a (demand[ée]|[ée]crit|envoy[ée]|dit|contact[ée])", "pr[ée]tend", "se fait passer"],
    team: ["admins?", "administrateurs?", "mod[ée]rateurs?", "modos?", "[ée]quipe", "support"],
    object: ["(avec|pour|sur) (mon|ma|mes)"],
    trouble: ["bloqu[ée]e?", "perdu", "vol[ée]e?", "pirat[ée]e?", "ne marche pas", "probl[èe]me", "erreur"],
    bait: ["airdrop", "r[ée]clam\\p{L}*", "pr[ée]-?vente", "liste blanche", "whitelist", "remboursement"],
  },
  de: {
    negation: ["nicht", "kein", "keine", "nie", "niemals", "niemand"],
    support: ["support", "hilfe", "helfe", "helfen", "unterst[üu]tzung", "admin\\p{L}*", "team", "moderator\\p{L}*", "kundendienst", "kundenservice", "l[öo]sen", "wiederherstell\\p{L}*"],
    request: ["jemand", "mein", "meine", "meinen", "meinem", "meiner", "ich brauche", "hilf mir", "helft mir", "ich habe verloren", "ich kann nicht", "ich habe ein problem"],
    attribution: ["sagte", "sagt", "sagen", "schrieb", "schreibt", "meinte", "meint", "hat (mir |mich )?(geschrieben|gesagt|angeschrieben|kontaktiert)", "behauptet", "angeblich", "gibt sich als"],
    team: ["admins?", "moderator(en)?", "mods?", "team", "support"],
    object: ["(mit|wegen|bei|zu) (meine[mnrs]?|mein)"],
    trouble: ["steckt fest", "h[äa]ngt", "verloren", "gestohlen", "gehackt", "geleert", "funktioniert nicht", "problem", "fehler"],
    bait: ["airdrop", "claim\\p{L}*", "presale", "vorverkauf", "whitelist", "erstattung", "r[üu]ckerstattung"],
  },
  tr: {
    negation: ["asla", "sakın", "hiç", "kimse"],
    support: ["destek", "yardım\\p{L}*", "admin", "yönetici", "ekip", "moderatör", "müşteri hizmetleri", "çöz\\p{L}*"],
    request: ["biri", "birisi", "benim", "ihtiyacım", "yardım edin", "kaybettim", "sorunum"],
    attribution: ["dedi", "diyor", "diyorlar", "yazdı", "yazıyor", "istedi", "söyledi", "gibi davranıyor"],
    team: ["admin(ler)?", "yönetici(ler)?", "moderatör(ler)?", "ekip", "destek"],
    object: ["benim"],
    trouble: ["takıldı", "kaybettim", "çalındı", "hacklendi", "çalışmıyor", "sorun", "hata"],
    bait: ["airdrop", "talep", "ön satış", "presale", "beyaz liste", "whitelist", "iade"],
  },
  vi: {
    negation: ["đừng", "không", "chẳng", "chưa", "không bao giờ", "cấm"],
    support: ["hỗ trợ", "giúp", "admin", "quản trị", "đội ngũ", "cskh", "chăm sóc khách hàng", "khắc phục", "xử lý"],
    request: ["ai đó", "có ai", "của tôi", "của mình", "của em", "tôi cần", "mình cần", "em cần", "giúp tôi", "giúp mình", "giúp em", "bị mất"],
    attribution: ["nói", "bảo", "đã nhắn", "viết", "yêu cầu", "tự xưng", "giả danh", "giả mạo"],
    team: ["admin", "ad", "quản trị viên", "mod", "đội ngũ", "hỗ trợ"],
    object: ["(về|cho|với) (ví |tiền |token |giao dịch )?(của )?(tôi|mình|em)"],
    trouble: ["bị kẹt", "kẹt", "bị mất", "mất", "bị hack", "bị lừa", "lỗi", "không được"],
    bait: ["airdrop", "nhận", "presale", "mở bán", "whitelist", "danh sách trắng", "hoàn tiền"],
  },
  id: {
    negation: ["jangan", "jgn", "tidak", "tak", "gak", "ga", "nggak", "enggak", "bukan"],
    support: ["bantuan", "bantu", "dukungan", "admin", "tim", "moderator", "layanan pelanggan", "cs", "perbaiki", "pulihkan"],
    request: ["seseorang", "ada yang", "saya butuh", "saya perlu", "aku butuh", "aku perlu", "tolong", "bantu saya", "bantu aku", "dompet saya", "dompetku"],
    attribution: ["bilang", "berkata", "katanya", "menulis", "nyuruh", "menyuruh", "minta", "mengaku"],
    team: ["admin", "min", "mimin", "moderator", "mod", "tim"],
    object: ["(soal|untuk|tentang|dengan) (dompet |wallet |akun |token |transaksi )?(saya|aku|gue|gw)", "(dompet|wallet|akun)ku"],
    trouble: ["nyangkut", "macet", "hilang", "dicuri", "di-?hack", "ditipu", "gagal", "error", "masalah"],
    bait: ["airdrop", "klaim", "presale", "whitelist", "daftar putih", "refund"],
  },
  ru: {
    negation: ["не", "никогда", "ни", "нельзя", "никому"],
    support: ["поддержк\\p{L}*", "техподдержк\\p{L}*", "помогу", "поможем", "поможет", "помощь", "помочь", "админ\\p{L}*", "администратор\\p{L}*", "команд\\p{L}*", "модератор\\p{L}*", "решу", "решим", "восстанов\\p{L}*"],
    request: ["кто-нибудь", "кто-то", "мой", "моя", "мои", "моё", "мое", "мне нужн\\p{L}*", "помогите", "помоги", "потерял\\p{L}*", "не могу"],
    attribution: ["сказал\\p{L}*", "говорит", "говорят", "написал\\p{L}*", "пишет", "пишут", "просит", "просил\\p{L}*", "утвержда\\p{L}*", "якобы", "представил\\p{L}*"],
    team: ["админ(ы|ка)?", "администратор(ы)?", "модер(ы|атор|аторы)?", "команда", "поддержка"],
    object: ["(с|по|насчёт|насчет) (мо(им|ей|ими|ему)|моим)"],
    trouble: ["завис\\p{L}*", "застрял\\p{L}*", "потерял\\p{L}*", "украли", "взломали", "не работает", "не могу", "проблем\\p{L}*", "ошибк\\p{L}*"],
    bait: ["аирдроп\\p{L}*", "эйрдроп\\p{L}*", "airdrop", "пресейл", "вайтлист", "белый список", "компенсаци\\p{L}*", "возврат"],
  },
  zh: {
    negation: ["不要", "别", "別", "勿", "不会", "不會", "绝不", "絕不", "从不", "從不", "切勿", "不用"],
    support: ["客服", "支持", "帮助", "幫助", "帮忙", "幫忙", "协助", "協助", "管理员", "管理員", "团队", "團隊", "官方", "技术支持", "技術支持", "解决", "解決"],
    request: ["有人", "谁", "誰", "我的", "我需要", "帮帮我", "幫幫我", "救命", "我丢", "我丟"],
    attribution: ["说", "說", "让我", "讓我", "叫我", "要我", "声称", "聲稱", "发来", "發來", "私信了我", "私聊了我", "联系了我", "聯繫了我", "冒充"],
    team: ["管理员", "管理員", "管理", "版主", "客服", "团队", "團隊", "官方"],
    object: ["我的"],
    trouble: ["被盗", "被盜", "被骗", "被騙", "卡住", "丢失", "丟失", "失败", "失敗", "问题", "問題"],
    bait: ["空投", "领取", "領取", "预售", "預售", "白名单", "白名單", "退款"],
  },
  ja: {
    negation: ["決して", "絶対に"],
    support: ["サポート", "手伝", "助け", "管理者", "運営", "チーム", "モデレーター", "解決", "対応"],
    request: ["誰か", "私の", "僕の", "俺の", "助けて", "困って"],
    attribution: ["と言", "って言", "と書", "から連絡", "が来"],
    team: ["管理者", "運営", "モデレーター", "サポート"],
    object: ["私の", "僕の", "俺の"],
    trouble: ["盗まれ", "詰まった", "失った", "できない", "できません", "エラー", "問題"],
    bait: ["エアドロ", "受け取", "プレセール", "ホワイトリスト", "返金"],
  },
  ko: {
    negation: ["절대"],
    support: ["고객센터", "지원", "도와", "도움", "관리자", "운영자", "팀", "상담", "해결"],
    request: ["누가", "누구", "도와주세요", "도와 주세요", "잃었", "제 지갑", "내 지갑", "제 돈", "내 돈"],
    attribution: ["라고", "하래", "말했", "보냈", "왔어", "왔는데", "사칭"],
    team: ["관리자", "운영자", "운영진", "매니저"],
    object: ["제 (지갑|돈|토큰|계정)", "내 (지갑|돈|토큰|계정)"],
    trouble: ["털렸", "잃었", "막혔", "멈췄", "안 ?돼", "오류", "문제"],
    bait: ["에어드랍", "에어드롭", "프리세일", "화이트리스트", "환불"],
  },
};
