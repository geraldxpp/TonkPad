/**
 * Drainer bait in the site's 12 languages: telling the reader to claim,
 * connect, validate, sync, rectify or migrate a wallet, or to enter a
 * recovery phrase. Beside a link that isn't allowed, one makes the message
 * rule-certain phishing (rules-hits.ts), but only in imperative or
 * second-person form, and never in a question, a first-person sentence, a
 * negation or someone else's words (rules-text.ts reads the sentence):
 * "how do I connect a wallet on raydium.io?" and "can't connect wallet on
 * raydium.io" are a member asking for help. Bare nouns (airdrop, presale,
 * whitelist, giveaway, sorteo, розыгрыш, 空投…) are not here: they stay in
 * words-latin.ts and words-other.ts `drainer`, which only describe a message
 * (scam warnings, token names), and next to a link they are just a link.
 * Entries match as words.ts describes.
 *
 * BAIT holds forms that are imperative or second-person by themselves:
 * English needs "your" (or "ur"), Spanish, Portuguese and French their
 * imperatives with a "you" possessive (never the infinitive: "no puedo
 * conectar la billetera"), German, Turkish and Russian their imperatives.
 * MARKED_BAIT holds Vietnamese, Indonesian, Chinese, Japanese and Korean
 * forms, which read the same in a statement ("我无法连接钱包"): they count
 * only beside an imperative or second-person marker in the same sentence
 * (BAIT_MARKERS: hãy, silakan, 请, 你的, してください, 하세요…).
 */
export const BAIT: Readonly<Record<"en" | "es" | "pt" | "fr" | "de" | "tr" | "ru", readonly string[]>> = {
  en: [
    "claim (your|ur) (free )?(airdrops?|rewards?|tokens?|bonus|prizes?|allocation|drop|nft|eth|sol|usdt|usdc|refund|compensation)", "claim (it |them )?(now|here|today|fast|instantly)",
    "(connect|link) (your|ur) wallets?", "(validate|verify|authenticate|sync|synchronize|resync|restore|unlock|recover|import|rectify|migrate) (your|ur) wallets?",
    "wallet (validation|synchronization|rectification)", "migrate (your|ur) (tokens?|funds|assets)",
    "(enter|submit|input|type|paste) (your|ur) (seed|phrase|seed phrase|recovery phrase|secret phrase|private key|mnemonic|12 words|24 words)", "double (your|ur) (eth|sol|btc|crypto|money)",
  ],
  es: [
    "reclam(a|e|á) (tu|tus|su|sus) (airdrops?|recompensas?|tokens?|premios?|bonos?|reembolso)", "(conecta|conecte|conectá|vincula|vincule) (tu|su) (billetera|wallet|cartera)",
    "(valida|valide|verifica|verifique|sincroniza|sincronice|restaura|restaure|desbloquea|desbloquee|rectifica|rectifique|migra|migre) (tu|su) (billetera|wallet|cartera)",
    "migr(a|e) (tus|sus) (tokens?|fondos)", "(introduce|introduzca|ingresa|ingrese|escribe|escriba|pega|pegue) (tu|su) (frase semilla|frase de recuperaci[oó]n|frase secreta|semilla|clave privada)",
  ],
  pt: [
    "(resgate|reivindique) (o |os |a |as )?(seu|seus|sua|suas|teu|tua) (airdrops?|recompensas?|tokens?|b[oô]nus|pr[eê]mios?|reembolso)", "(conecte|conecta|vincule|vincula) (a )?(sua|tua) (carteira|wallet)",
    "(valide|verifique|sincronize|restaure|desbloqueie|retifique|migre) (a )?(sua|tua) (carteira|wallet)",
    "migre (os )?(seus|teus) (tokens?|fundos)", "(digite|insira|informe|cole) (a )?(sua|tua) (frase semente|frase de recupera[cç][aã]o|frase secreta|seed|chave privada)",
  ],
  fr: [
    "r[ée]clame(z)? (ton|ta|tes|votre|vos) (airdrops?|r[ée]compenses?|tokens?|bonus|remboursement)", "(connecte|connectez|relie|reliez) (ton|votre) (portefeuille|wallet)",
    "(valide|validez|v[ée]rifie|v[ée]rifiez|synchronise|synchronisez|restaure|restaurez|d[ée]bloque|d[ée]bloquez|rectifie|rectifiez|migre|migrez) (ton|votre) (portefeuille|wallet)",
    "migre(z)? (tes|vos) (tokens?|fonds)", "(entre|entrez|saisis|saisissez|colle|collez) (ta|votre) (phrase de r[ée]cup[ée]ration|phrase secr[èe]te|seed|cl[ée] priv[ée]e)",
  ],
  de: [
    "(fordere|fordern sie|beanspruche|hole|hol|sichere|sichern sie) (dir |sich )?(deinen |deine |dein |ihren |ihre |ihr |den |die |das )?(airdrops?|belohnungs?|belohnungen|tokens?|bonus|erstattung)",
    "(verbinde|verbinden sie|verkn[üu]pfe) (deine |ihre )?(wallet|geldb[öo]rse)",
    "(validiere|validieren sie|verifiziere|verifizieren sie|synchronisiere|synchronisieren sie|entsperre|berichtige|berichtigen sie|migriere|migrieren sie) (deine |ihre )?(wallet|geldb[öo]rse)",
    "(gib|geben sie) (deine |ihre )?(seed( |-)?phrase|wiederherstellungsphrase|privaten schl[üu]ssel) ein",
  ],
  tr: [
    "(ödülünü|ödüllerini|ödül|tokenini|tokenlerini|airdropunu|bonusunu) (talep et|al|topla)", "(hemen )?talep edin", "cüzdan(ını|ınızı)? (bağla|bağlayın|doğrula|doğrulayın|senkronize et|eşitle|kurtar)",
    "cüzdan doğrulama", "(gizli|kurtarma|seed) (ifadeni|ifadenizi|cümleni|kelimelerini) (gir|girin|yaz)", "özel anahtarını gir",
  ],
  ru: [
    "(получи|получите|забери|заберите|заклейми|клейми|клеймите) (свой |свои |ваш |ваши |свою |вашу )?(аирдроп|эйрдроп|airdrop|награду|награды|токены|бонус|бонусы|компенсацию)",
    "подключ(и|ите) (свой |ваш )?кош(е|ё)л(е|ё)к", "(валидац|верификац|синхронизац)(ия|ию|ии) кошелька", "миграци(я|ю|и) кошелька",
    "(валидируй|валидируйте|верифицируй|верифицируйте|синхронизируй|синхронизируйте|восстанови|восстановите|разблокируй|разблокируйте) (свой |ваш )?кош(е|ё)л(е|ё)к",
    "введ(и|ите) (свою |вашу )?(сид( |-)?фразу|фразу|приватный ключ|мнемонику|секретную фразу)",
  ],
};

/** Bait that reads the same in a statement: certain only beside a BAIT_MARKERS word in its sentence. */
export const MARKED_BAIT: Readonly<Record<"vi" | "id" | "zh" | "ja" | "ko", readonly string[]>> = {
  vi: ["nhận (airdrop|thưởng|phần thưởng|token|quà|hoàn tiền)", "kết nối ví", "xác (minh|thực) ví", "đồng bộ (hóa )?ví", "khắc phục ví", "khôi phục ví", "(di chuyển|chuyển đổi) ví", "nhập (cụm từ (khôi phục|bí mật)|seed|khóa riêng|khóa bí mật)"],
  id: ["klaim (airdrop|hadiah|token|bonus|sekarang|reward)", "(hubungkan|sambungkan) (dompet|wallet)", "(validasi|verifikasi|sinkronisasi|sinkronkan|pulihkan|perbaiki|migrasi) (dompet|wallet)", "masukkan (frasa|seed|kunci pribadi|frasa pemulihan)"],
  zh: ["(领取|領取)(空投|奖励|獎勵|代币|代幣|补偿|補償)", "(连接|連接)(钱包|錢包)", "(验证|驗證)(钱包|錢包)", "同步(钱包|錢包)", "(修复|修復|恢复|恢復)(钱包|錢包)", "(迁移|遷移)(钱包|錢包)", "(输入|輸入)(助记词|助記詞|私钥|私鑰|恢复短语)"],
  ja: ["(報酬|トークン|エアドロップ|補償)を?(受け取|請求|獲得)", "ウォレットを?接続", "ウォレットを?(認証|検証)", "ウォレットを?同期", "ウォレットを?(修正|復旧|復元)", "ウォレットの?移行", "(シードフレーズ|秘密鍵|復元フレーズ|リカバリーフレーズ)を?入力"],
  ko: ["(보상|토큰|에어드랍|에어드롭)(을|를)? (받|청구|수령)", "지갑(을|를)? 연결", "지갑(을|를)? (인증|검증)", "지갑(을|를)? 동기화", "지갑(을|를)? 복구", "지갑 마이그레이션", "(시드 문구|개인키|개인 키|복구 문구)(를|을)? 입력"],
};

/** An imperative or second-person marker: what makes MARKED_BAIT an instruction ("Hãy kết nối ví", "请连接钱包", "지갑을 연결하세요"). */
export const BAIT_MARKERS: Readonly<Record<"vi" | "id" | "zh" | "ja" | "ko", readonly string[]>> = {
  vi: ["hãy", "vui lòng", "bạn", "các bạn", "của bạn"],
  id: ["silakan", "segera", "ayo", "yuk", "mohon", "harap", "anda", "kamu", "dompetmu", "walletmu"],
  zh: ["请", "請", "你的", "您的", "你", "您", "立即", "马上", "馬上", "赶快", "趕快", "快来", "快來"],
  ja: ["してください", "して下さい", "しましょう", "しよう", "しろ", "せよ", "お願いします", "あなたの", "今すぐ"],
  ko: ["하세요", "해주세요", "해 주세요", "하십시오", "하시오", "해라", "하라", "당신의", "지금 바로"],
};

/**
 * An imperative drainer verb opening a sentence, whatever follows ("Validate
 * it now at …", "Claim now"): with BAIT, what voids a report (a report never
 * waives a message that tells the reader to act on its link).
 */
export const OPENING_BAIT: readonly string[] = [
  "(please |pls |now |just |go |quickly |hurry,? )?(claim|connect|validate|verify|sync|synchronize|resync|rectify|migrate|restore|recover|import|unlock|secure|authenticate) (it|them|now|here|today|this|the|a|an|your|ur|free)",
];
