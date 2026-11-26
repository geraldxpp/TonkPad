import { type ClaimRule, may, never, words as w } from "./claims-rule";

/**
 * The claim families beyond claims-latin.ts's first list, in the languages
 * written in Latin script (prompts/15-community-agent.md, Guardrails: it
 * never speaks for the team, never gives financial advice): an official,
 * endorsed or verified token (tonkfun.fun's own channel, group and pages are
 * no token); the team's refunds, compensation and plans; trade instructions
 * and price direction; and "this token is safe". Each can be denied ("no
 * token is endorsed by tonkfun.fun"), so each is negatable; a price move
 * explained by its condition ("the price will rise as more people buy") is
 * an explanation, not a prediction.
 */

/** A price move inside a condition in its sentence ("if more people buy, the price will rise"), checked just after its "will". */
const after = (conditions: string) => `(?<!(?:^|[^\\p{L}])(?:${conditions})[^\\p{L}][^.!?;]*)`;
/** A price move followed by its condition ("will rise as more people buy"). */
const unless = (conditions: string) => `(?!,? (?:${conditions})(?![\\p{L}]))`;
/** The same anywhere later in its clause ("will climb toward the cap as the curve fills"). */
const unlessLater = (conditions: string) => `(?![^.!?;:]{0,60}(?:^|[^\\p{L}])(?:${conditions})(?![\\p{L}]))`;
/**
 * An amount that grows by design earlier in its clause ("the amount you can
 * claim will increase", "your rewards will rise"): a price moves, these
 * don't. Read after the verb, so it costs nothing where no move is said.
 */
export const NOT_AMOUNT = "(?<!(?:^|[^\\p{L}])(?:amounts?|shares?|rewards?|claimable|balances?|count|number|supply|fees?|gas|holders?|reserves?|score|progress|payouts?|unlock\\p{L}*|vest\\p{L}*)[^\\p{L}.!?;:,][^.!?;:,]{0,40})";
/** Not inside a condition: "if you sell now, you pay the fee" states a cost, it advises nothing. */
const NOT_IF = "(?<!(?:^|[^\\p{L}])(?:if|when|once|whenever|unless|before|after|whether)(?: \\p{L}+){0,2} )";

const EN: ClaimRule[] = [
  may("official token", w("official (?:tonkfun |pumpfun |bonkfun )?(?:token|coin|memecoin|meme coin|project)s?|(?:endorsed|backed|approved|vetted|verified|certified|sponsored|recommended) by (?:the )?(?:team|tonkfun|us|admins?|devs?|developers)|(?:the team|team|tonkfun|we|admins?|devs?) (?:has |have )?(?:verified|endorsed|approved|vetted|certified|backs?|endorses?|recommends?) (?:this|the|that|its|it|these|your) (?:token|coin|project|creator|launch)")),
  may("team promise", w("(?:the team|team|we|tonkfun|admins?|the admins|devs?|the devs|developers|the developers)(?: will|'ll| are going to| is going to| are gonna| is gonna| plans? to| promised to| promises to| is planning to| are planning to) (?:\\p{L}+ )?(?:refund|compensate|reimburse|repay|pay (?:you|everyone|holders) back|make (?:you|everyone|it) whole|cover (?:your|the) loss(?:es)?|launch|list|add|release|airdrop)|(?:we|the team|team|tonkfun)(?: are| is|'re) (?:launching|listing|adding|releasing|refunding|compensating|airdropping)|you(?:'ll| will| are going to| are gonna) (?:be |get )(?:refunded|compensated|reimbursed|repaid|paid back|made whole)|you(?:'ll| will) (?:get|receive) (?:a |your |full )?(?:refund|compensation|money back|reimbursement)")),
  may("trade advice", w(`(?:should|ought to|had better|better) (?:probably |definitely |really |just |seriously )?(?:buy|sell|ape|dump)|${NOT_IF}(?:buy|sell|ape|dump)(?: (?:it|this|that|the token|some|more|everything|all|in|out))? (?:now|today|asap|immediately|right now|right away|while (?:you|it) can)|(?:good|great|perfect|best|right|ideal) (?:time|moment|chance|entry|opportunity|day) to (?:buy|sell|ape|get in|enter|exit)|sell (?:everything|it all|all of it|all your)|buy (?:the )?dip`)),
  never("trade advice", w("(?:don't|do not|dont|never) (?:buy|sell|ape|dump)(?: (?:it|this|that|the token|anything|everything))? (?:now|today|yet|right now)")),
  may("price move", w(`(?:\\p{L}+'ll|will|is going to|are going to|gonna|going to|is about to|about to|bound to|sure to|set to)${NOT_AMOUNT}${after("if|when|as|once|whenever|while|the more")} (?:\\p{L}+ )?(?:double|triple|quadruple|recover|rebound|bounce back|go up|rise|climb|soar|increase|rally|skyrocket)${unlessLater("as|when|if|while|once|whenever|along|with each|because|until")}`)),
  may("token is safe", w("(?:token|coin|project|launch|contract|it|this|that)(?:'s| is| are|'re) (?:completely |totally |perfectly |absolutely |100 ?% |very |really |fully |entirely |super |pretty |quite |definitely )?safe(?! to (?:say|assume|ignore|share|use|close|skip|leave|delete|keep))|(?:\\p{L}+'s|is|are) (?:a |an )?(?:completely |totally |perfectly |very |really |100 ?% )?safe (?:token|coin|project|pick|choice|buy)")),
];

const ES: ClaimRule[] = [
  may("official token", w("(?:token|moneda|coin|memecoin|proyecto)s? oficial(?:es)?|(?:respaldad|avalad|aprobad|verificad|certificad|recomendad)[oa]s? por (?:el equipo|tonkfun|nosotros|los admins?)")),
  may("team promise", w("(?:el equipo|equipo|nosotros|tonkfun|los admins?|los desarrolladores) (?:te |les |os |le |nos )?(?:va|van|vamos) a (?:te |les |os |le )?(?:reembolsar|compensar|devolver|indemnizar|lanzar|listar|a[nñ]adir|agregar)|(?:el equipo|nosotros|tonkfun) (?:te |les |os |le )?(?:reembolsar[aá]n?|reembolsaremos|compensar[aá]n?|compensaremos|devolver[aá]n?|devolveremos|lanzar[aá]n?|lanzaremos|listar[aá]n?)|(?:ser[aá]s|ser[aá]n|vas a ser|van a ser) (?:reembolsad|compensad|indemnizad)[oa]s?")),
  may("trade advice", w("(?:deber[ií]as|deber[ií]an|debes|deben|tienes que|tienen que|te conviene|conviene) (?:ya |realmente )?(?:comprar|vender)|(?:compra|compren|comprad|vende|vendan|vended)(?: (?:ya|todo|m[aá]s))? (?:ahora|ya|hoy|cuanto antes)|(?:buen|mejor|gran) momento (?:para|de) (?:comprar|vender|entrar)|vende(?:r)? todo")),
  may("price move", w(`(?:(?:va|van) a${after("si|cuando|mientras|conforme|a medida que|cuanto m[aá]s|cada vez que")} (?:duplicar|triplicar|subir|recuperar|dispararse|multiplicarse)|se (?:va|van) a (?:duplicar|triplicar|recuperar|disparar|multiplicar)|subir[aá]n?|se duplicar[aá]n?|se triplicar[aá]n?|se recuperar[aá]n?)${unless("a medida|cuando|si|mientras|con cada|conforme")}`)),
  may("token is safe", w("(?:token|moneda|proyecto|esto|este|eso|ese|esta|esa)(?: token)? (?:es|est[aá]) (?:totalmente |completamente |muy |realmente |100 ?% )?segur[oa]|(?:es|est[aá]) (?:totalmente|completamente|100 ?%) segur[oa]|(?:token|proyecto|moneda) segur[oa]")),
];

const PT: ClaimRule[] = [
  may("official token", w("(?:token|moeda|coin|memecoin|projeto)s? oficia(?:l|is)|(?:endossad|aprovad|verificad|certificad|apoiad|recomendad)[oa]s? (?:pel[oa]|por) (?:equipe|time|tonkfun|n[oó]s|admins?)")),
  may("team promise", w("(?:a equipe|o time|equipe|n[oó]s|tonkfun|os admins?|os desenvolvedores) (?:te |lhe |vos |nos )?(?:vai|v[aã]o|vamos|ir[aá]|ir[aã]o) (?:te |lhe |vos )?(?:reembolsar|compensar|devolver|ressarcir|indenizar|lan[cç]ar|listar|adicionar)|(?:a equipe|n[oó]s|tonkfun) (?:te |lhe )?(?:reembolsar[aá]|reembolsaremos|compensar[aá]|compensaremos|devolver[aá]|lan[cç]ar[aá]|lan[cç]aremos)|(?:ser[aá]s?|ser[aã]o|vai ser|v[aã]o ser) (?:reembolsad|compensad|ressarcid|indenizad)[oa]s?")),
  may("trade advice", w("(?:voc[eê] )?(?:deve|devia|deveria|devem|deveriam|tem que) (?:j[aá] |realmente )?(?:comprar|vender)|(?:compre|venda|comprem|vendam)(?: (?:j[aá]|tudo|mais))? (?:agora|j[aá]|hoje|logo)|(?:bom|melhor|[oó]timo) momento (?:para|de) (?:comprar|vender|entrar)|vend(?:a|er) tudo")),
  may("price move", w(`(?:(?:vai|v[aã]o)${after("se|quando|enquanto|conforme|[àa] medida que|quanto mais|sempre que")} (?:dobrar|triplicar|subir|recuperar|valorizar|disparar)|dobrar[aá]|triplicar[aá]|subir[aá]|recuperar[aá]|valorizar[aá])${unless("conforme|quando|se|enquanto|[àa] medida|com cada|a cada")}`)),
  may("token is safe", w("(?:token|moeda|projeto|isto|isso|este|esse|esta|essa)(?: token)? (?:[eé]|est[aá]) (?:totalmente |completamente |muito |realmente |100 ?% )?segur[oa]|(?:token|projeto|moeda) segur[oa]")),
];

const FR: ClaimRule[] = [
  may("official token", w("(?:jeton|token|coin|memecoin|projet)s? officiel(?:le)?s?|(?:approuv[eé]|soutenu|valid[eé]|v[eé]rifi[eé]|certifi[eé]|recommand[eé])e?s? par (?:l'[eé]quipe|tonkfun|nous|les admins?)")),
  may("team promise", w("(?:l'[eé]quipe|nous|tonkfun|les admins?|les d[eé]veloppeurs) (?:va|vont|allons) (?:vous |te |les |nous )?(?:rembourser|indemniser|d[eé]dommager|compenser|lancer|lister|ajouter)|(?:l'[eé]quipe|nous|tonkfun) (?:vous |te |les )?(?:remboursera|rembourserons|rembourseront|indemnisera|indemniserons|d[eé]dommagera|compensera|lancera|lancerons|listera)|(?:vous serez|tu seras|vous allez [eê]tre|tu vas [eê]tre) (?:rembours[eé]|indemnis[eé]|d[eé]dommag[eé]|compens[eé])e?s?")),
  may("trade advice", w("(?:tu devrais|vous devriez|il faut|tu dois|vous devez) (?:vite |vraiment )?(?:acheter|vendre)|(?:ach[eè]te|achetez|vends|vendez)(?: (?:tout|vite))? (?:maintenant|tout de suite|aujourd'hui)|(?:bon|meilleur) moment (?:pour|d') ?(?:acheter|vendre|entrer)|vend(?:s|ez|re) tout")),
  may("price move", w(`(?:(?:va|vont)${after("si|quand|lorsque|[àa] mesure que|chaque fois que")} (?:doubler|tripler|monter|remonter|grimper|augmenter|exploser|se redresser)|doublera|triplera|montera|remontera|grimpera|augmentera)${unless("quand|si|lorsque|[àa] mesure|avec chaque|au fur")}`)),
  may("token is safe", w("(?:jeton|token|projet|coin)s? (?:est|sont) (?:totalement |compl[eè]tement |tr[eè]s |vraiment |100 ?% )?(?:s[uû]rs?|sans danger|sans risque)|(?:jeton|token|projet) s[uû]r")),
];

const DE: ClaimRule[] = [
  may("official token", w("offizielle[nrsm]? (?:token|coin|memecoin|projekt)s?|(?:vom team|von tonkfun|von uns) (?:verifiziert|empfohlen|unterst[uü]tzt|gepr[uü]ft|best[aä]tigt|gebilligt)|(?:verifiziert|empfohlen|unterst[uü]tzt|gepr[uü]ft) (?:vom|durch das) team")),
  may("team promise", w("(?:das team|team|wir|tonkfun|die admins?|die entwickler) (?:wird|werden) (?:\\p{L}+ ){0,4}(?:zur[uü]ckerstatten|erstatten|entsch[aä]digen|zur[uü]ckzahlen|ersetzen|ausgleichen|starten|launchen|listen|hinzuf[uü]gen|ver[oö]ffentlichen)|(?:du wirst|sie werden|ihr werdet) (?:\\p{L}+ ){0,2}(?:entsch[aä]digt|erstattet|r[uü]ckerstattet|ausgeglichen)")),
  may("trade advice", w("(?:du solltest|ihr solltet|sie sollten|solltest du|sollten sie|du musst|sie m[uü]ssen) (?:jetzt |sofort |unbedingt |schnell )?(?:kaufen|verkaufen|einsteigen)|(?:kauf|kaufe|kauft|verkauf|verkaufe|verkauft)(?: (?:ihn|es|sie|alles))? (?:jetzt|sofort|heute)|jetzt (?:kaufen|verkaufen|einsteigen)|(?:guter|bester|perfekter|richtiger) (?:zeitpunkt|moment) (?:zum|um zu) (?:kaufen|verkaufen|einsteigen)|alles verkaufen")),
  may("price move", w(`(?:wird|werden)${after("wenn|falls|sobald|je mehr|w[aä]hrend")} (?:sich )?(?:(?!nicht|kein)\\p{L}+ ){0,2}(?:verdoppeln|verdreifachen|steigen|erholen|explodieren|hochgehen|zulegen)${unless("wenn|sobald|w[aä]hrend|je|mit jedem|weil|da")}`)),
  may("token is safe", w("(?:token|coin|projekt|er|es) (?:ist|sind) (?:absolut |v[oö]llig |komplett |total |sehr |wirklich |100 ?% )?sicher(?!,? (?:dass|ob|wie|wann))")),
];

const TR: ClaimRule[] = [
  may("official token", w("resmi (?:token|coin|jeton|proje)\\p{L}*|(?:ekip|takım) tarafından (?:onaylan|doğrulan|desteklen|önerilen)\\p{L}*")),
  may("team promise", w("(?:ekip|ekibimiz|takım|biz|tonkfun|yöneticiler|geliştiriciler) (?:\\p{L}+ ){0,2}(?:iade edecek|iade edeceğiz|geri ödeyecek|geri ödeyeceğiz|telafi edecek|telafi edeceğiz|tazmin edecek|listeleyecek|ekleyecek|başlatacak|çıkaracak)\\p{L}*|(?:paranız|paran|kaybınız|kaybın)\\p{L}* (?:iade edilecek|geri ödenecek|telafi edilecek|karşılanacak)")),
  may("trade advice", w("(?:hemen|şimdi|bugün) (?:satın al|al|sat)\\p{L}*|(?:satın alın|satın al|alın)(?: \\p{L}+)? (?:hemen|şimdi)|(?:almalısın|almalısınız|satmalısın|satmalısınız|almanız gerek|satmanız gerek)\\p{L}*|(?:almak|satmak) için (?:iyi|en iyi|doğru|harika|mükemmel) (?:bir )?(?:zaman|an)")),
  may("price move", w("(?:yükselecek|ikiye katlanacak|katlanacak|toparlanacak|artacak)(?<!(?:(?:^|[^\\p{L}])eğer|[dt][ıiuü]kç[ae])[^\\p{L}][^.!?;]*)")),
  may("token is safe", w("(?:token|coin|proje)\\p{L}* (?:tamamen |kesinlikle |çok |100 ?% |%100 )?güvenli(?:dir)?")),
];

const VI: ClaimRule[] = [
  may("official token", w("(?:token|đồng coin|đồng|coin|dự án) chính thức|được (?:đội ngũ|tonkfun|nhóm) (?:xác minh|bảo chứng|chứng nhận|hậu thuẫn|bảo lãnh|đề xuất)")),
  may("team promise", w("(?:đội ngũ|nhóm phát triển|nhóm|chúng tôi|tonkfun|team|admin) (?:\\p{L}+ ){0,2}sẽ (?:\\p{L}+ )?(?:hoàn tiền|hoàn trả|hoàn lại|bồi thường|đền bù|ra mắt|niêm yết)|(?:bạn|các bạn) sẽ được (?:hoàn tiền|hoàn trả|bồi thường|đền bù)")),
  may("trade advice", w("(?:bạn |các bạn )?nên (?:mua|bán|vào lệnh|chốt lời)|(?:mua|bán)(?: \\p{L}+)? (?:ngay|ngay bây giờ|liền|hôm nay)|(?:thời điểm|lúc) (?:tốt|tuyệt vời|lý tưởng|thích hợp) (?:để|mà) (?:mua|bán)|bán hết")),
  may("price move", w(`(?:sẽ|chắc chắn sẽ)${after("nếu|khi|càng|mỗi khi")} (?:\\p{L}+ )?(?:tăng gấp đôi|gấp đôi|gấp ba|tăng giá|tăng mạnh|phục hồi|hồi phục|tăng lên)${unless("khi|nếu|theo|mỗi khi")}`)),
  may("token is safe", w("(?:token|đồng coin|dự án|nó)(?: này| đó| nào)? (?:là |rất |hoàn toàn |tuyệt đối )?an toàn")),
];

const ID: ClaimRule[] = [
  may("official token", w("(?:token|koin|coin|proyek) resmi|(?:diverifikasi|didukung|disetujui|direkomendasikan) (?:oleh )?(?:tim|tonkfun|kami)")),
  may("team promise", w("(?:tim|kami|tonkfun|admin|developer|pengembang) (?:\\p{L}+ )?(?:akan|bakal) (?:\\p{L}+ )?(?:mengembalikan|mengganti|memberi kompensasi|memberikan kompensasi|refund|meluncurkan|melisting|menambahkan|mencairkan)|(?:kamu|anda) (?:akan|bakal) (?:mendapat|mendapatkan|menerima) (?:refund|kompensasi|ganti rugi|pengembalian dana)|dana (?:kamu|anda|mu) (?:akan|bakal) dikembalikan")),
  may("trade advice", w("(?:kamu |anda )?(?:harus|sebaiknya|wajib) (?:segera )?(?:beli|membeli|jual|menjual)|(?:beli|jual)(?: \\p{L}+)? (?:sekarang|segera|hari ini)|(?:waktu|saat) (?:yang )?(?:tepat|bagus|terbaik) (?:untuk|buat) (?:beli|membeli|jual|menjual)|jual semua")),
  may("price move", w(`(?:akan|bakal)${after("jika|kalau|ketika|saat|seiring|semakin|bila|apabila")} (?:\\p{L}+ )?(?:naik|berlipat ganda|dua kali lipat|tiga kali lipat|pulih|melonjak|meroket)${unless("saat|ketika|jika|kalau|seiring|setiap")}`)),
  may("token is safe", w("(?:token|koin|proyek)(?: ini| itu)? (?:sangat |benar-benar |100 ?% |pasti )?aman")),
];

export const FAMILIES_LATIN: readonly ClaimRule[] = [...EN, ...ES, ...PT, ...FR, ...DE, ...TR, ...VI, ...ID];
