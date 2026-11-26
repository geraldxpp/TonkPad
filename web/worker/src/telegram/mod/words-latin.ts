import type { WordSet } from "./words";

/**
 * The word lists of the languages written in Latin letters (see words.ts for
 * how an entry matches). Data only: an entry may be a regular-expression
 * source, where a space stands for any run of spaces. Role words are plain
 * text.
 */
export const LATIN: Readonly<Record<"en" | "es" | "pt" | "fr" | "de" | "tr" | "vi" | "id", WordSet>> = {
  en: {
    question: ["what", "what's", "whats", "how", "why", "when", "wen", "where", "who", "whom", "whose", "which", "is it", "is this", "is that", "is there", "are there", "are you", "are they", "can i", "can you", "can we", "can someone", "can anyone", "could someone", "do i", "do you", "do we", "does anyone", "does it", "does this", "did anyone", "should i", "will it", "will there", "anyone know", "anybody know", "any idea", "any news"],
    solicit: [
      "(dm|pm|inbox|message|msg|text|contact|email) (me|us)", "(send|drop|shoot) (me|us) (a |an )?(dm|pm|message|msg|text|email)", "hit me up", "hmu",
      "(dm|pm|message|msg|inbox|text|ping|write to|reach out to|reach|talk to|chat with|contact) @[a-z0-9_]{4,}", "contact [^.!?\\n]{0,30}@[a-z0-9_]{4,}",
      "(dm|pm|message|msg|inbox|text|ping|write to|reach out to|reach|talk to|chat with|contact) (the |our |an? |official )?(admins?|support|mods?|moderators?|team|help ?desk|customer (care|service|support)|tech team)( team)?:? @[a-z0-9_]{4,}",
      "(i|we)( will| can| could|'ll|'d)? (dm|pm|inbox|message) (you|u)", "let me (dm|pm|inbox|message) (you|u)", "check (your|ur) (dm|dms|inbox|pm|pms|messages)",
    ],
    dm: ["dms?", "dm'?(ed|d|ing)", "pms?", "pm'?(ed|d|ing)", "inbox(ed)?", "direct messages?", "private messages?", "privately", "messaged me", "messaging me", "texted me", "wrote (to )?me", "reached out (to )?me", "contacted me"],
    drainer: [
      "claim (your |the |free |my |an? )?(airdrops?|rewards?|tokens?|bonus|prizes?|allocation|drop|nft|eth|sol|usdt|usdc|refund|compensation)", "claim (now|here|today|fast|instantly)", "airdrops?",
      "(connect|link) (your |my |a )?wallets?", "wallet( |-)?connect", "(validate|verify|authenticate|sync|synchronize|resync|restore|unlock|recover|import) (your |my |the )?wallets?",
      "wallet (validation|verification|sync|synchronization|rectification|migration|restore|recovery)", "rectif(y|ication)", "migrat(e|ion) (your |my |the )?(wallets?|tokens?|funds|assets)", "token migration",
      "white( |-)?list(ed|ing)?", "pre-?sales?", "(enter|submit|input|type|paste) (your |the |a )?(seed|phrase|seed phrase|recovery phrase|secret phrase|private key|mnemonic|12 words|24 words)", "giveaway", "double (your )?(eth|sol|btc|crypto|money)",
    ],
    help: [
      "help", "helps", "assist(ance)?", "lost", "losing", "stuck", "pending", "fail(ed|ing|s)?", "error", "bug", "broken", "not (working|received|showing|arrived|loading)",
      "(didn'?t|did not|haven'?t|have not) (get|receive|arrive|work|go through|show)", "(can'?t|cannot|can not|unable to) (sell|buy|withdraw|claim|swap|bridge|connect|launch|find|see|access)",
      "missing", "disappeared", "refund", "money back", "hacked", "drained", "stolen", "scammed", "rugged", "compromised", "where (is|are) my", "lost (my|all)",
    ],
    report: [
      "scam(s|mer|mers|med|ming)?", "fake", "phishing", "phish", "drainers?", "impersonat(or|ors|ing|ion|e|es)", "fraud(ster|sters)?", "(dm|pm)'?(ed|d) me", "messaged me", "texted me", "wrote (to )?me", "contacted me",
      "reached out (to )?me", "is (this|that|it|he|she|they) (real|legit|safe|official|you|the team|a scam)", "(don'?t|do not|never) (click|join|open|visit|connect|use|trust|buy|send)",
      "careful", "beware", "be aware", "watch out", "(not|isn'?t|is not|aren'?t|are not|ain'?t) (us|ours|official|the team|real|legit|legitimate|safe)", "report(ed|ing)?",
    ],
    security: [
      "vulnerabilit(y|ies)", "exploit(s|able|ed|ing)?", "re-?entrancy", "poc", "proof of concept", "(bug )?bount(y|ies)", "steps to reproduce", "attack vectors?", "security (issue|flaw|bug|hole|problem|vulnerability|risk)",
      "(found|discovered) (a|an) (bug|flaw|vulnerability|exploit|issue) in (the|your) (contract|contracts|code|launchpad|site)", "critical (bug|vulnerability|issue)", "privilege escalation", "integer (overflow|underflow)", "flash( |-)?loan attack",
    ],
    key: ["private( |-)?keys?", "priv( |-)?key", "privkey", "secret( |-)?keys?", "pk", "recovery phrase", "seed phrase", "secret phrase", "mnemonic", "key( |-)?pair", "wallet key", "export(ed)? (my |the |your )?(private )?key"],
    role: ["admin", "admins", "administrator", "administrators", "support", "mod", "mods", "moderator", "moderators", "team", "official", "help", "helpdesk", "help desk", "desk", "dev", "devs", "developer", "developers", "staff", "customer", "care", "customer care", "customer service", "customer support", "service", "ceo", "founder", "cofounder", "owner", "manager", "assistant", "verified", "security"],
  },
  es: {
    question: ["qué", "cómo", "como puedo", "como hago", "como funciona", "cuándo", "cuando", "dónde", "donde", "quién", "quien", "cuál", "cual", "cuánto", "cuanto", "cuánta", "cuántos", "cuantos", "por qué", "por que", "alguien sabe", "se puede", "es posible"],
    solicit: [
      "escr[ií]be(me|nos)", "m[aá]nda(me|nos) (un )?(mensaje|dm|md|privado|mp)", "env[ií]a(me|nos) (un )?(mensaje|dm|md|mp)", "cont[aá]cta(me|nos)", "h[aá]bla(me|nos) (al|por) (privado|interno|dm|md)",
      "cont[aá]cta(r)? (a|con) @[a-z0-9_]{4,}", "(escr[ií]bele|escribe) a @[a-z0-9_]{4,}", "te escribo (al|por) privado",
    ],
    dm: ["mensajes? (privados?|directos?)", "privado", "md", "dm", "me escribi[oó]", "me (mand|envi)[oó] (un )?mensaje", "me contact[oó]", "por interno"],
    drainer: [
      "reclam(a|ar|e) (tu |tus |el |los |la |las )?(airdrops?|recompensas?|tokens?|premios?|bonos?|reembolso)", "airdrops?", "(conecta|conectar|vincula|vincular) (tu |la |su )?(billetera|wallet|cartera)",
      "(valida|validar|verifica|verificar|sincroniza|sincronizar|restaura|restaurar|desbloquea|desbloquear) (tu |la |su )?(billetera|wallet|cartera)", "rectific(a|ar|aci[oó]n)",
      "migr(a|ar|aci[oó]n) (de )?(tu |tus |la |los )?(billetera|wallet|cartera|tokens?|fondos)", "lista blanca", "whitelist", "pre-?venta",
      "(introduce|ingresa|escribe|pega) (tu |la )?(frase semilla|frase de recuperaci[oó]n|frase secreta|semilla|clave privada)", "sorteo",
    ],
    help: [
      "ayuda", "ay[uú]da(me|nos)", "perd[ií]", "perdid[oa]s?", "atascad[oa]", "pendiente", "fall[oó]", "fallid[oa]", "error", "no (funciona|lleg[oó]|me lleg[oó]|recib[ií]|aparece|carga)",
      "no puedo (vender|comprar|retirar|reclamar|conectar)", "reembolso", "hackead[oa]", "robad[oa]", "estafad[oa]", "drenad[oa]", "me robaron", "me estafaron",
    ],
    report: [
      "estafa(s|dor|dores|dora)?", "fraude", "falso", "falsa", "fake", "phishing", "suplant(a|aci[oó]n|ador)", "me escribi[oó]", "me (mand|envi)[oó] (un )?mensaje", "me contact[oó]",
      "es (real|leg[ií]timo|oficial|seguro|verdad)", "no (hagas|hagan|den|des) clic", "no (abras|abran)", "cuidado", "ojo",
    ],
    security: ["vulnerabilidad(es)?", "exploit", "explot(ar|aci[oó]n)", "reentrada", "re-?entrancy", "prueba de concepto", "poc", "recompensa por (errores|bugs|fallos)", "bug bounty", "pasos para reproducir", "(fallo|agujero|falla) de seguridad"],
    key: ["clave privada", "llave privada", "clave secreta", "frase (semilla|de recuperaci[oó]n|secreta)", "mnem[oó]nic[oa]"],
    role: ["soporte", "ayuda", "equipo", "oficial", "administrador", "administradores", "moderador", "moderadores", "desarrollador", "atención al cliente", "servicio al cliente", "asistente", "fundador", "verificado"],
  },
  pt: {
    question: ["o que", "o quê", "como faço", "como funciona", "como posso", "como eu", "quando", "onde", "quem", "qual", "quais", "quanto", "quanta", "quantos", "por que", "por quê", "alguém sabe", "tem como", "é possível", "dá pra", "da pra"],
    solicit: [
      "me (chama|chame) (no )?(pv|privado|dm|direct|inbox|zap)", "chama (no )?(pv|privado|dm|direct)", "me (manda|mande|envia|envie) (uma )?(mensagem|dm|msg|direct)", "fala comigo no (pv|privado|direct)",
      "me (contate|contata|contacta)", "entre em contato (comigo|conosco|com @[a-z0-9_]{4,})", "(chama|fala com|contate) @[a-z0-9_]{4,}",
    ],
    dm: ["pv", "privado", "mensage(m|ns) (privada|direta)s?", "direct", "dm", "me chamou", "me (mandou|enviou) (uma )?(mensagem|dm|msg)", "me contatou"],
    drainer: [
      "(resgat|reivindiqu|reivindic)(e|ar) (seu |seus |o |os |sua |suas )?(airdrops?|recompensas?|tokens?|b[oô]nus|pr[eê]mios?|reembolso)", "airdrops?", "(conecte|conectar|vincule|vincular) (sua |a )?(carteira|wallet)",
      "(valide|validar|verifique|verificar|sincronize|sincronizar|restaure|restaurar|desbloqueie|desbloquear) (sua |a )?(carteira|wallet)", "retific(ar|a[cç][aã]o)",
      "migr(e|ar|a[cç][aã]o) (de )?(sua |seus |a |os )?(carteira|wallet|tokens?|fundos)", "lista branca", "whitelist", "pr[eé]-?venda",
      "(digite|insira|informe|cole) (sua |a )?(frase semente|frase de recupera[cç][aã]o|frase secreta|seed|chave privada)", "sorteio",
    ],
    help: [
      "ajuda", "me ajud(a|e|em)", "perdi", "perdid[oa]s?", "travad[oa]", "pres[oa]", "pendente", "falhou", "erro", "n[aã]o (funciona|chegou|recebi|aparece|carrega)",
      "n[aã]o consigo (vender|comprar|sacar|resgatar|conectar)", "reembolso", "hackead[oa]", "roubad[oa]", "drenad[oa]", "me roubaram", "ca[ií] (num|no|em um) golpe",
    ],
    report: [
      "golpes?", "golpistas?", "fraude", "falso", "falsa", "fake", "phishing", "me chamou", "me (mandou|enviou) (uma )?(mensagem|dm|msg)", "me contatou",
      "[eé] (real|leg[ií]timo|oficial|seguro|verdade)", "n[aã]o (cliquem?|clica)", "cuidado",
    ],
    security: ["vulnerabilidades?", "exploit", "explora[cç][aã]o", "reentr[aâ]ncia", "re-?entrancy", "prova de conceito", "poc", "bug bounty", "recompensa por (bugs|falhas)", "passos para reproduzir", "falha de seguran[cç]a"],
    key: ["chave privada", "chave secreta", "frase (semente|de recupera[cç][aã]o|secreta)", "mnem[oô]nic[oa]"],
    role: ["suporte", "ajuda", "equipe", "oficial", "administrador", "moderador", "desenvolvedor", "atendimento", "assistente", "fundador", "verificado"],
  },
  fr: {
    question: ["quoi", "comment ça", "comment faire", "comment on", "comment je", "comment est-ce", "pourquoi", "quand", "où", "qui", "quel", "quelle", "quels", "quelles", "combien", "est-ce que", "est-ce", "qu'est-ce", "quelqu'un sait", "c'est quoi", "y a-t-il", "peut-on"],
    solicit: [
      "[ée]cri(s|vez)(-| )moi", "envoie(z)?(-| )moi (un )?(message|dm|mp)", "contacte(z)?(-| )moi", "contacte(z)? @[a-z0-9_]{4,}", "mp(-| )moi", "(viens|venez) en (mp|priv[ée])",
    ],
    dm: ["mp", "messages? priv[ée]s?", "en priv[ée]", "dm", "m'a [ée]crit", "m'a contact[ée]e?", "m'a envoy[ée] (un )?message"],
    drainer: [
      "r[ée]clame(z|r)? (ton |ta |tes |votre |vos |le |les )?(airdrops?|r[ée]compenses?|tokens?|bonus|remboursement)", "airdrops?", "(connecte|connectez|connecter|relie|reliez) (ton |votre )?(portefeuille|wallet)",
      "(valide|validez|valider|v[ée]rifie|v[ée]rifiez|synchronise|synchronisez|synchroniser|restaure|restaurez|d[ée]bloque|d[ée]bloquez) (ton |votre )?(portefeuille|wallet)", "rectifi(er|ez|cation)",
      "migr(er|ez|ation) (de )?(ton |votre |vos )?(portefeuille|wallet|tokens?|fonds)", "liste blanche", "whitelist", "pr[ée]-?vente",
      "(entre|entrez|saisis|saisissez|colle|collez) (ta |votre )?(phrase de r[ée]cup[ée]ration|phrase secr[èe]te|seed|cl[ée] priv[ée]e)",
    ],
    help: [
      "aide", "aide(z)?(-| )moi", "perdu", "j'ai perdu", "bloqu[ée]e?", "en attente", "[ée]chou[ée]e?", "erreur", "ne (marche|fonctionne) pas", "pas re[cç]u",
      "(je ne peux|j'arrive) pas (à )?(vendre|acheter|retirer|r[ée]clamer)", "rembours(ement|er)", "pirat[ée]e?", "vol[ée]e?", "arnaqu[ée]e?", "vid[ée]e?",
    ],
    report: [
      "arnaques?", "arnaqueurs?", "escroc(s|querie)?", "faux", "fausse", "fake", "phishing", "m'a [ée]crit", "m'a contact[ée]e?", "m'a envoy[ée] (un )?message",
      "c'est (vrai|r[ée]el|l[ée]gitime|officiel|s[ûu]r)", "ne (cliquez|clique) pas", "m[ée]fiez(-| )vous", "m[ée]fie(-| )toi",
    ],
    security: ["vuln[ée]rabilit[ée]s?", "exploit", "failles?", "r[ée]entrance", "re-?entrancy", "preuve de concept", "poc", "bug bounty", "prime aux bugs", "[ée]tapes pour reproduire", "faille de s[ée]curit[ée]"],
    key: ["cl[ée] priv[ée]e", "cl[ée] secr[èe]te", "phrase (de r[ée]cup[ée]ration|secr[èe]te|seed)", "mn[ée]monique"],
    role: ["support", "aide", "équipe", "officiel", "officielle", "administrateur", "modérateur", "développeur", "assistance", "service client", "fondateur", "vérifié"],
  },
  de: {
    question: ["was ist", "was kostet", "was bedeutet", "was passiert", "wie", "warum", "wieso", "weshalb", "wann", "wo", "wer", "welche", "welcher", "welches", "wieviel", "wie viel", "kann man", "gibt es", "weiß jemand", "weiss jemand", "ist das", "ist es", "hat jemand"],
    solicit: [
      "schreib(t)? mir", "schreiben sie mir", "kontaktier(e|en sie|t) (mich|uns)", "(kontaktiere|kontaktieren sie|schreib|schreibt|schreiben sie) @[a-z0-9_]{4,}", "melde dich (bei mir|per pn|privat)",
      "pn (an mich|mir)", "dm mir", "schick(t)? mir (eine |'?ne )?(pn|dm|nachricht)",
    ],
    dm: ["pns?", "dm", "privatnachrichten?", "direktnachrichten?", "hat mir geschrieben", "hat mich (angeschrieben|kontaktiert)", "privat geschrieben"],
    drainer: [
      "(fordere|fordern sie|beanspruche|hole|hol|sichere|sichern sie) (dir |sich )?(deinen |deine |dein |ihren |ihre |ihr |den |die |das )?(airdrops?|belohnungs?|belohnungen|tokens?|bonus|erstattung)", "airdrops?",
      "(verbinde|verbinden sie|verkn[üu]pfe) (deine |ihre )?(wallet|geldb[öo]rse)", "(validiere|validieren sie|verifiziere|verifizieren sie|synchronisiere|synchronisieren sie|entsperre) (deine |ihre )?(wallet|geldb[öo]rse)",
      "berichtig(e|en|ung)", "migrier(e|en|t) (deine |ihre )?(wallet|tokens?|guthaben)", "whitelist", "vorverkauf", "presale", "gib (deine |ihre )?(seed( |-)?phrase|wiederherstellungsphrase|privaten schl[üu]ssel) ein", "gewinnspiel",
    ],
    help: [
      "hilfe", "hilf mir", "helft mir", "verloren", "steckt fest", "h[äa]ngt", "ausstehend", "fehlgeschlagen", "fehler", "funktioniert nicht", "nicht (angekommen|erhalten)",
      "kann nicht (verkaufen|kaufen|abheben|claimen)", "r[üu]ckerstattung", "gehackt", "gestohlen", "betrogen", "geleert", "abgezockt",
    ],
    report: [
      "betrug", "betr[üu]ger", "scam", "fake", "gef[äa]lscht", "phishing", "per (pn|dm|privatnachricht) geschrieben", "hat mir geschrieben", "hat mich (angeschrieben|kontaktiert)",
      "ist (das|er|sie) (echt|seri[öo]s|offiziell|legit|sicher)", "nicht klicken", "vorsicht",
    ],
    security: ["sicherheitsl[üu]cken?", "schwachstellen?", "exploit", "re-?entrancy", "proof of concept", "poc", "bug bounty", "schritte zum reproduzieren", "sicherheitsproblem"],
    key: ["private(r|n)? schl[üu]ssel", "private key", "geheime(r|n)? schl[üu]ssel", "wiederherstellungsphrase", "seed( |-)?phrase", "mnemonic"],
    role: ["support", "hilfe", "team", "offiziell", "offizielle", "admin", "administrator", "moderator", "entwickler", "kundendienst", "kundenservice", "gründer", "verifiziert"],
  },
  tr: {
    question: ["ne zaman", "ne kadar", "ne oldu", "ne demek", "nedir", "neden", "niye", "niçin", "nasıl", "nerede", "nereden", "nereye", "kim", "hangi", "kaç", "bilen var"],
    solicit: [
      "bana (yaz|yazın|mesaj at|mesaj atın|ulaş|ulaşın|dm at|dm atın)", "(dm|özelden|özel mesajdan) (yaz|yazın|at|atın|ulaş|ulaşın|gel|gelin)", "@[a-z0-9_]{4,} (ile |ya |e |a )?(iletişime geçin|iletişime geç|yazın|ulaşın)",
      "iletişime geç(in)? @[a-z0-9_]{4,}",
    ],
    dm: ["dm", "özel mesaj", "özelden", "bana yazdı", "mesaj attı", "bana ulaştı"],
    drainer: [
      "airdrop", "(ödülünü|ödüllerini|ödül|tokenini|tokenlerini|airdropunu|bonusunu) (talep et|al|topla)", "talep edin", "cüzdan(ını|ınızı)? (bağla|bağlayın|doğrula|doğrulayın|senkronize et|eşitle|kurtar)",
      "cüzdan doğrulama", "beyaz liste", "whitelist", "ön satış", "presale", "(gizli|kurtarma|seed) (ifadeni|ifadenizi|cümleni|kelimelerini) (gir|girin|yaz)", "özel anahtarını gir", "çekiliş",
    ],
    help: ["yardım", "kaybettim", "kayboldu", "takıldı", "beklemede", "başarısız", "hata", "çalışmıyor", "gelmedi", "alamadım", "satamıyorum", "çekemiyorum", "iade", "hacklendi", "çalındı", "dolandırıldım", "boşaltıldı"],
    report: ["dolandırıcı(lık)?", "scam", "sahte", "fake", "oltalama", "phishing", "bana yazdı", "mesaj attı", "bana ulaştı", "gerçek mi", "resmi mi", "güvenilir mi", "tıklamayın", "dikkat"],
    security: ["güvenlik açığı", "zafiyet", "exploit", "re-?entrancy", "kavram kanıtı", "poc", "bug bounty", "hata ödülü", "üretme adımları"],
    key: ["özel anahtar", "gizli anahtar", "private key", "kurtarma (ifadesi|cümlesi)", "gizli ifade", "seed (ifadesi|cümlesi)"],
    role: ["destek", "yardım", "ekip", "resmi", "yönetici", "admin", "moderatör", "geliştirici", "müşteri hizmetleri", "kurucu", "doğrulanmış"],
  },
  vi: {
    question: ["tại sao", "vì sao", "làm sao", "làm thế nào", "khi nào", "bao giờ", "ở đâu", "cái gì", "có ai", "ai biết", "có phải", "sao"],
    solicit: ["nhắn tin (cho |với )?(tôi|mình|em|anh|chị|tui)", "(ib|inbox|nt) (cho )?(tôi|mình|em|anh|chị|tui)", "liên hệ (với |cho )?(tôi|mình|em|anh|chị|tui|@[a-z0-9_]{4,})", "nhắn riêng"],
    dm: ["tin nhắn riêng", "nhắn riêng", "inbox", "ib", "dm", "nhắn tin cho (tôi|mình|em)", "đã nhắn tin", "nhắn cho (tôi|mình|em)"],
    drainer: [
      "nhận (airdrop|thưởng|phần thưởng|token|quà|hoàn tiền)", "airdrop", "kết nối ví", "xác (minh|thực) ví", "đồng bộ (hóa )?ví", "khắc phục ví", "khôi phục ví", "(di chuyển|chuyển đổi) (ví|token)",
      "danh sách trắng", "whitelist", "mở bán (trước|sớm)", "presale", "nhập (cụm từ (khôi phục|bí mật)|seed|khóa riêng|khóa bí mật)", "tặng quà",
    ],
    help: ["giúp", "mất", "bị mất", "kẹt", "bị treo", "đang chờ", "thất bại", "lỗi", "không (hoạt động|nhận được|bán được|mua được|rút được|vào được)", "hoàn tiền", "bị hack", "bị đánh cắp", "bị lừa", "bị rút sạch"],
    report: ["lừa đảo", "scam", "giả mạo", "hàng giả", "fake", "nhắn tin cho (tôi|mình|em)", "có thật không", "có phải (thật|chính thức)", "uy tín không", "đừng (bấm|nhấp|click)", "cẩn thận"],
    security: ["lỗ hổng", "khai thác", "exploit", "re-?entrancy", "bằng chứng khái niệm", "poc", "bug bounty", "tiền thưởng lỗi", "các bước tái hiện", "lỗ hổng bảo mật"],
    key: ["khóa riêng( tư)?", "khóa bí mật", "private key", "cụm từ (khôi phục|bí mật)", "seed phrase"],
    role: ["hỗ trợ", "quản trị viên", "quản trị", "admin", "chính thức", "đội ngũ", "kiểm duyệt viên", "nhà phát triển", "chăm sóc khách hàng", "cskh", "người sáng lập", "đã xác minh"],
  },
  id: {
    question: ["apa", "apakah", "bagaimana", "gimana", "kenapa", "mengapa", "kapan", "di mana", "dimana", "siapa", "berapa", "yang mana", "ada yang tahu", "ada yang tau", "bisakah", "bolehkah"],
    solicit: ["(silakan|langsung) dm", "dm (aja|saja)", "dm ke (saya|aku|gue|gw|@[a-z0-9_]{4,})", "japri", "hubungi (saya|aku|gue|gw|kami|@[a-z0-9_]{4,})", "kirim pesan (ke|pada) (saya|aku|gue|gw|@[a-z0-9_]{4,})"],
    dm: ["pesan pribadi", "japri", "dm", "chat pribadi", "nge-?dm", "menghubungi saya", "mengirim pesan", "kirim pesan"],
    drainer: [
      "klaim (airdrop|hadiah|token|bonus|sekarang|reward)", "airdrop", "(hubungkan|sambungkan) (dompet|wallet)", "(validasi|verifikasi|sinkronisasi|sinkronkan|pulihkan) (dompet|wallet)", "perbaiki (dompet|wallet)",
      "migrasi (dompet|wallet|token)", "daftar putih", "whitelist", "pra-?penjualan", "presale", "masukkan (frasa|seed|kunci pribadi|frasa pemulihan)", "giveaway", "bagi-?bagi",
    ],
    help: ["tolong", "bantu", "bantuan", "hilang", "kehilangan", "nyangkut", "macet", "tertunda", "pending", "gagal", "error", "tidak (berfungsi|masuk|diterima|bisa)", "(gak|ga|nggak) (masuk|bisa)", "refund", "dibobol", "di-?hack", "dicuri", "ditipu", "dikuras"],
    report: ["penipuan", "penipu", "scam", "palsu", "fake", "phishing", "nge-?dm saya", "menghubungi saya", "apakah (ini )?(asli|resmi|aman)", "(asli|resmi) (gak|nggak|tidak|ga)", "jangan (klik|diklik)", "hati-hati", "awas"],
    security: ["kerentanan", "celah keamanan", "eksploit", "exploit", "re-?entrancy", "bukti konsep", "poc", "bug bounty", "hadiah bug", "langkah reproduksi"],
    key: ["kunci (pribadi|privat|rahasia)", "private key", "frasa (pemulihan|rahasia)", "seed phrase"],
    role: ["dukungan", "bantuan", "resmi", "admin", "administrator", "moderator", "pengembang", "layanan pelanggan", "cs", "pendiri", "terverifikasi"],
  },
};
