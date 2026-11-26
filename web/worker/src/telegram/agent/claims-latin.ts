import { type ClaimRule, may, never, words as w } from "./claims-rule";

/**
 * Banned claims in the languages written in Latin script, whole words over
 * normalized text (claims-rule.ts). Each language has the brief's families:
 * guaranteed, risk-free, can't lose, safe to buy, not a scam, legit, to the
 * moon, price target, zero fees, official partner, will be listed, airdrop
 * is live, presale. Topic words alone ("On presales:", "price targets") are
 * not claims: the promotional or promising forms are.
 */

const EN: ClaimRule[] = [
  may("guaranteed", w("guaranteed|guarantee(?:s|ing)? (?:you|that|a|an|holders|buyers|investors|everyone|users|members|(?:\\p{L}+ ){0,2}(?:profits?|returns?|gains?|income|earnings|money|rewards?|yields?|payouts?|wins?|listings?|refunds?))|(?:i|we|they|it|tonkfun|team) guarantees?")),
  may("risk-free", w("risk ?-?free|riskless|zero risk|without (?:any )?risk")),
  never("risk-free", w("no-risk")),
  never("can't lose", w("(?:can ?not|can't|won't|will not|never) lose|impossible to lose|no way to lose|sure profit|easy money")),
  may("safe to buy", w("safe (?:to (?:buy|invest|hold|ape)|investment|bet)|(?:totally|completely|100 ?%) safe")),
  never("not a scam", w("(?:not|isn't|never) (?:a )?(?:scam|rug ?pull|rug|honeypot)|(?:can't|cannot|won't|will not) (?:rug|be rugged)|rug ?-?proof|scam ?-?free")),
  may("legit", w("legit")),
  may("to the moon", w("to the moon|mooning|(?:will|going to|gonna) (?:pump|moon|explode|skyrocket)")),
  may("price target", w("price (?:target|prediction|forecast) (?:of|is|for)|target price (?:of|is)|(?:will|going to) (?:reach|hit) \\$?\\d+(?:[.,]\\d+)?[kmb]?")),
  never("zero fees", w("(?:zero|no|0) (?:trading |swap |hidden |gas )?fees?|fee ?-?free|free of (?:any )?(?:fees?|charges?)|without (?:any )?fees?|commission ?-?free")),
  may("official partner", w("official (?:partner(?:s|ship)?|collab(?:oration)?)|partner(?:ed|ing|ship) with")),
  may("will be listed", w("(?:will|to) (?:be|get) listed|will (?:it|this|the token|the coin|they) (?:be|get) listed|(?:is|are) getting listed|listing on|upcoming listing")),
  may("airdrop live", w("airdrops? (?:is|are) (?:live|confirmed|coming|happening|open)|(?:confirmed|upcoming|live|official) airdrops?|claim (?:your |the )?airdrop")),
  may("presale", w("pre ?-?sales? (?:is |are )?(?:live|open|starts?|price|link|round)|(?:join|buy in) (?:the )?pre ?-?sale|private sale|whitelist sale")),
];

const ES: ClaimRule[] = [
  may("guaranteed", w("garantizad[oa]s?|(?:te |les )?garantizo|garantizamos|garantiza(?:n)?|garantizar[aá]n?")),
  may("risk-free", w("sin riesgos?|libre de riesgos?|(?:cero|0) riesgos?|riesgo cero")),
  never("can't lose", w("no (?:puedes|puede|pod[eé]s|pod[eé]is|vas a|van a|vais a) perder|imposible perder|ganancia segura|dinero f[aá]cil")),
  may("safe to buy", w("segur[oa] (?:para )?(?:comprar|invertir)|compra segura|inversi[oó]n segura|apuesta segura|100 ?% segur[oa]")),
  never("not a scam", w("no es (?:una |un )?(?:estafa|fraude|scam|timo|rug ?pull|rug)")),
  may("legit", w("legit|(?:es|sea|son|sean|ser[aá]) leg[ií]tim[oa]s?")),
  may("to the moon", w("a la luna|(?:va|van) a (?:explotar|despegar)")),
  may("price target", w("precio objetivo (?:de|es)|objetivo de precio (?:de|es)")),
  never("zero fees", w("sin (?:comisi[oó]n|comisiones|tarifas?|cargos?)|(?:cero|0) comisi[oó]n(?:es)?|comisi[oó]n(?:es)? cero|libre de comisiones")),
  may("official partner", w("socios? oficial(?:es)?|alianza oficial|asociaci[oó]n oficial|colaboraci[oó]n oficial|en alianza con")),
  may("will be listed", w("ser[aá]n? listad[oa]s?|se listar[aá]n?|cotizar[aá]n? en")),
  may("airdrop live", w("airdrop (?:ya )?(?:est[aá]|es) (?:activo|confirmado|disponible|en vivo)|airdrop (?:confirmado|oficial)|reclama (?:tu|el) airdrop")),
  may("presale", w("pre ?-?venta (?:ya )?(?:est[aá] )?(?:activa|abierta|comienza|empieza)|[uú]nete a la pre ?-?venta|venta privada")),
];

const PT: ClaimRule[] = [
  may("guaranteed", w("garantid[oa]s?|garanto|garantimos|garante(?:m)?|garantir[aá]|garantir[aã]o")),
  may("risk-free", w("sem riscos?|livre de riscos?|risco zero|zero risco")),
  never("can't lose", w("n[aã]o (?:tem como|d[aá] para|pode|vai|vais) perder|imposs[ií]vel perder|lucro certo|dinheiro f[aá]cil")),
  may("safe to buy", w("segur[oa] (?:para )?(?:comprar|investir)|compra segura|investimento seguro|aposta segura|100 ?% segur[oa]")),
  never("not a scam", w("n[aã]o [eé] (?:um |uma )?(?:golpe|fraude|scam|pir[aâ]mide|rug ?pull|rug)")),
  may("legit", w("legit|(?:[eé]|seja|s[aã]o|ser[aá]) leg[ií]tim[oa]s?")),
  may("to the moon", w("(?:para|at[eé]|rumo [àa]) (?:a )?lua|vai (?:explodir|decolar|disparar)")),
  may("price target", w("pre[cç]o[- ]alvo (?:de|[eé])|alvo de pre[cç]o (?:de|[eé])")),
  never("zero fees", w("sem (?:taxas?|tarifas?|comiss[aã]o|comiss[oõ]es)|taxa zero|zero taxas?|isento de taxas")),
  may("official partner", w("parceir[oa]s? oficia(?:l|is)|parceria oficial|em parceria com")),
  may("will be listed", w("ser[aá] listad[oa]|(?:vai|v[aã]o) ser listad[oa]s?|listagem n[ao]")),
  may("airdrop live", w("airdrop (?:j[aá] )?(?:est[aá] )?(?:ativo|confirmado|dispon[ií]vel|liberado)|airdrop oficial|resgate (?:seu|o) airdrop")),
  may("presale", w("pr[eé] ?-?venda (?:j[aá] )?(?:est[aá] )?(?:aberta|ativa|come[cç]a)|participe da pr[eé] ?-?venda|venda privada")),
];

const FR: ClaimRule[] = [
  may("guaranteed", w("garantie?s?|je (?:te |vous )?garantis|nous (?:te |vous )?garantissons|garantit|garantissent|garantira|garantiront")),
  may("risk-free", w("sans risques?|z[eé]ro risque")),
  never("can't lose", w("(?:ne )?(?:peux|peut|pouvez|pourrez|pourras) pas perdre|impossible de perdre|gain assur[eé]|argent facile")),
  may("safe to buy", w("s[uû]r d'(?:acheter|investir)|investissement s[uû]r|pari s[uû]r|sans danger d'(?:acheter|investir)")),
  never("not a scam", w("n'est pas (?:une |un )?(?:arnaque|escroquerie|scam|rug ?pull|rug)|pas une arnaque")),
  may("legit", w("legit|(?:est|soit|sont|sera) l[eé]gitimes?")),
  may("to the moon", w("(?:vers|sur|jusqu'[àa]) la lune|va (?:exploser|d[eé]coller|s'envoler)")),
  may("price target", w("objectif de (?:prix|cours) (?:de|est)|prix cible (?:de|est)")),
  never("zero fees", w("sans (?:frais|commissions?)|(?:z[eé]ro|aucuns?|pas de) frais|frais z[eé]ro")),
  may("official partner", w("partenaires? officiels?|partenariat officiel|en partenariat avec")),
  may("will be listed", w("sera list[eé]e?|seront list[eé]e?s|va [eê]tre list[eé]e?|listing sur")),
  may("airdrop live", w("airdrop (?:est )?(?:en cours|confirm[eé]|actif|ouvert)|airdrop officiel|r[eé]clamez? (?:ton |votre |l')airdrop")),
  may("presale", w("pr[eé] ?-?vente (?:est )?(?:ouverte|active|commence)|participez? [àa] la pr[eé] ?-?vente|vente priv[eé]e")),
];

const DE: ClaimRule[] = [
  may("guaranteed", w("garantiert(?:e|er|en)?|garantien?|gewinngarantie|garantieren|garantiere|garantierst")),
  may("risk-free", w("risikofrei(?:e|er|es|en)?|ohne risiko|null risiko")),
  never("can't lose", w("(?:kannst|k[oö]nnen|kann) (?:nicht|nichts) verlieren|unm[oö]glich zu verlieren|sicherer gewinn|leichtes geld")),
  may("safe to buy", w("(?:ist|sind) sicher (?:zu )?kaufen|sichere (?:investition|anlage|wette)")),
  never("not a scam", w("kein(?:e|en)? (?:betrug|scam|abzocke|rug ?pull|rug)")),
  may("legit", w("legit|ist seri[oö]s|ist legitim")),
  may("to the moon", w("(?:zum|auf den|bis zum) mond|wird (?:explodieren|durch die decke gehen)")),
  may("price target", w("(?:kursziel|preisziel) (?:von|ist|liegt)")),
  never("zero fees", w("keine gebühren|ohne gebühren|null gebühren|gebührenfrei(?:e|er|es|en)?")),
  may("official partner", w("offizielle[rn]? partner(?:in|schaft)?|in partnerschaft mit")),
  may("will be listed", w("(?:wird|werden) (?:\\p{L}+ ){0,3}gelistet|gelistet (?:wird|werden)|listing auf")),
  may("airdrop live", w("airdrop (?:ist )?(?:live|best[aä]tigt|aktiv|offen)|(?:best[aä]tigte[rn]?|offizielle[rn]?) airdrop")),
  may("presale", w("(?:vorverkauf|presale) (?:ist offen|l[aä]uft|startet|beginnt)")),
];

const TR: ClaimRule[] = [
  may("guaranteed", w("garanti(?:li|lidir|dir)?|garantisi(?:ni|yle)?|garanti (?:ediyoruz|ederim|eder|ediyor|edecek|veriyor)")),
  may("risk-free", w("risksiz|sıfır risk")),
  never("risk-free", w("(?:hiç )?risk yok")),
  never("can't lose", w("kaybetme(?:zsin|zsiniz|yeceksin|yeceksiniz)|kaybetmek imkansız|kesin kazanç|kolay para")),
  may("safe to buy", w("güvenle (?:satın )?al(?:abilirsin|abilirsiniz|ın)|almak güvenli(?:dir)?|güvenli (?:bir )?yatırım")),
  never("not a scam", w("(?:dolandırıcılık|scam|rug|sahte) değil(?:dir)?")),
  may("legit", w("legit|meşru")),
  may("to the moon", w("aya (?:çık|gid|uç)\\p{L}*|uçacak|patlayacak")),
  may("price target", w("fiyat hedefi|hedef fiyat")),
  never("zero fees", w("sıfır (?:ücret|komisyon)|komisyonsuz|(?:ücret|komisyon) yok|ücretsiz işlem")),
  may("official partner", w("resmi (?:ortak|partner)\\p{L}*")),
  may("will be listed", w("listelenecek\\p{L}*")),
  may("airdrop live", w("airdrop (?:aktif|başladı|onaylandı|canlı)|(?:onaylı|resmi) airdrop")),
  may("presale", w("(?:ön ?satış|presale) (?:başladı|açık|aktif)")),
];

const VI: ClaimRule[] = [
  may("guaranteed", w("(?:đảm bảo|bảo đảm|cam kết) (?:lợi nhuận|có lãi|có lời|thắng|tăng giá)|lợi nhuận (?:được )?(?:đảm bảo|bảo đảm)")),
  may("risk-free", w("phi rủi ro|không (?:có )?rủi ro")),
  never("can't lose", w("không thể (?:bị )?(?:lỗ|thua)|chắc chắn (?:có )?(?:lãi|lời|thắng)|tiền dễ")),
  may("safe to buy", w("an toàn để (?:mua|đầu tư)|khoản đầu tư an toàn")),
  never("not a scam", w("không (?:phải )?(?:là )?(?:lừa đảo|scam|rug)")),
  may("legit", w("legit")),
  may("to the moon", w("(?:lên|tới|đến) mặt trăng|to the moon")),
  may("price target", w("(?:mục tiêu giá|giá mục tiêu) (?:là|của)")),
  never("zero fees", w("miễn phí giao dịch|không (?:mất |có |tính )?phí|phí (?:bằng )?0(?![.,]\\d)")),
  may("official partner", w("đối tác chính thức|hợp tác chính thức")),
  may("will be listed", w("sẽ (?:được )?(?:niêm yết|list)|sắp lên sàn")),
  may("airdrop live", w("airdrop (?:đã |đang )?(?:mở|diễn ra|được xác nhận)|airdrop chính thức")),
  may("presale", w("(?:mở bán sớm|presale) (?:đã |đang )?(?:mở|bắt đầu|diễn ra)")),
];

const ID: ClaimRule[] = [
  may("guaranteed", w("dijamin|menjamin|jaminan (?:untung|profit|keuntungan)|garansi (?:untung|profit)")),
  may("risk-free", w("bebas risiko|tanpa risiko|nol risiko")),
  never("can't lose", w("(?:tidak|tak) (?:mungkin|bisa|akan) rugi|pasti untung|cuan pasti|uang mudah")),
  may("safe to buy", w("aman (?:untuk )?(?:dibeli|membeli|beli|investasi)|investasi aman")),
  never("not a scam", w("bukan (?:penipuan|scam|tipuan|rug ?pull|rug)")),
  may("legit", w("legit")),
  may("to the moon", w("ke bulan|to the moon|akan meledak|terbang tinggi")),
  may("price target", w("target harga(?:nya)? (?:adalah|di|ke)")),
  never("zero fees", w("tanpa (?:biaya|komisi)|bebas biaya|biaya nol|nol biaya")),
  may("official partner", w("mitra resmi|kemitraan resmi|bermitra dengan")),
  may("will be listed", w("akan (?:di)?listing|akan terdaftar di|listing di")),
  may("airdrop live", w("airdrop (?:sudah )?(?:aktif|dikonfirmasi|dibuka)|airdrop resmi")),
  may("presale", w("(?:presale|pra-?penjualan) (?:sudah )?(?:dibuka|aktif|dimulai)")),
];

export const CLAIMS_LATIN: readonly ClaimRule[] = [...EN, ...ES, ...PT, ...FR, ...DE, ...TR, ...VI, ...ID];
