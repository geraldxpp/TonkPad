import { NOT_AMOUNT } from "./claims-latin-families";
import { type ClaimRule, may, words as w } from "./claims-rule";

/**
 * More forms of claims-latin-families.ts's families (answers#6), in the
 * languages written in Latin script: the brand's own coin, but only as what
 * something is ("it's the real tonkfun.fun coin", "TFUN is tonkfun.fun's
 * own coin"; "tonkfun.fun's own coin is coming soon" states a fact), a token
 * the team launched or stands behind; promises in the passive with any
 * subject ("everyone will be refunded", "refunds will be sent", "has
 * promised refunds"); "now's the time to buy", "load up", "strong buy",
 * "get in early"; and "is going up", "about to pump", "should double",
 * "can only go up". A condition still makes a trade or a refund a fact ("if
 * you get in early, you pay the 99% tax").
 */

/** Not inside a condition earlier in its sentence; placed after a rule's first words, so it is read only where they stand. */
const NOT_IF = "(?<!(?:^|[^\\p{L}])(?:if|when|once|whenever|unless|in case)[^\\p{L}][^.!?;]{0,120})";
/** A condition later in its clause makes a price move an explanation ("will climb as the curve fills"). */
const UNLESS_LATER = "(?![^.!?;:]{0,60}(?:^|[^\\p{L}])(?:as|when|if|while|once|whenever|along|with each|because|until)(?![\\p{L}]))";
const RISE = "(?:double|triple|quadruple|go up|rise|climb|soar|pump|moon|recover|rebound|10x)";

const EN: ClaimRule[] = [
  may("official token", w("(?:\\p{L}+'s|is|are|was|were) (?:the |a )?(?:real|genuine|actual|true|official|authentic|very own|own) tonkfun (?:coin|token|memecoin)s?|(?:\\p{L}+'s|is|are|was|were) tonkfun ?'s (?:very )?(?:own|real|official|genuine) (?:coin|token|memecoin)s?|(?:token|coin|memecoin|it|this|that|this one)(?: (?:is|was|has been|were))? (?:launched|created|issued|made|run|deployed|minted) by (?:the )?(?:tonkfun |tonkfun ?'s )?(?:team|devs|developers)|(?:coin|token) (?:that )?the (?:tonkfun )?team (?:itself |themselves )?(?:launched|created|issued|made|minted|deployed)|(?:stands?|standing) behind (?:this|the|that|your|its|these) (?:token|coin|project|launch)s?")),
  may("team promise", w(`(?:everyone|everybody|all holders|holders|all|users|buyers|investors|members|victims|you all|people|all of you|every holder)(?: will|'ll| are going to| is going to| are gonna| is gonna) (?:\\p{L}+ )?(?:be |get )(?:fully |partly )?(?:refunded|compensated|reimbursed|repaid|paid back|made whole)|(?:refunds?|compensation|reimbursements?|payouts?) (?:will|are going to|is going to) (?:be )?(?:sent|paid|issued|made|processed|distributed|airdropped)|(?:has|have|had) promised (?:a |full )?(?:refunds?|compensation|reimbursements?)|(?:a |the |your )?(?:refunds?|compensation|reimbursements?) (?:is|are) on (?:its|their|the) way|(?:your|the|their) (?:eth|money|funds|tokens|sol|usdc|loss(?:es)?) (?:will|are going to|is going to) be${NOT_IF} (?:returned|refunded|sent back|given back|restored|covered|reimbursed)`)),
  may("trade advice", w(`(?:now|today|this)(?:'s| is) the (?:time|moment|day|chance) to (?:buy|sell|ape|get in|load up|enter)|(?:^|(?<=[.!?;:] ))load up|(?:should|must|better|go|time to|gotta) load up|load up (?:on|before|now|while|today|more)|(?:strong|easy) buy|(?<!(?:who|that|which|try to|tries to|trying to|attempt to|those) )get in${NOT_IF} (?:early|now|before it|while (?:it|you) can)|go ahead and (?:buy|sell|ape)|take (?:your |some )?profits? (?:now|today|asap)|(?:it's|it is|this is) a (?:no-brainer|must-buy|must buy)`)),
  may("price move", w(`(?:\\p{L}+'s|is|are|\\p{L}+'re)${NOT_AMOUNT} (?:going up|about to (?:go up|rise|pump|moon))${UNLESS_LATER}|about to (?:pump|moon|explode|skyrocket|take off|rip)|(?:should|could|might|may)${NOT_AMOUNT} (?:easily |probably |definitely |soon )?${RISE}(?! or )${UNLESS_LATER}|(?:can|will|could) only${NOT_AMOUNT} (?:go up|rise|climb|increase)|only${NOT_AMOUNT} goes up|expect (?:\\p{L}+ ){1,3}to${NOT_AMOUNT} ${RISE}${UNLESS_LATER}`)),
  may("token is safe", w("(?:this|that) one(?:'s| is) (?:completely |totally |perfectly |100 ?% |very |really |definitely )?safe(?! to (?:say|assume|ignore|share|use|close|skip|leave|delete|keep))|(?:you're|you are|you'll be|you will be) safe (?:buying|holding|investing in|aping|to buy|to hold|to invest)")),
  may("guaranteed", w("(?:ensures?|assures?|ensuring) (?:you |holders |buyers |that )?(?:\\p{L}+ ){0,2}(?:profits?|returns?|gains?|income|earnings)|(?:profits?|returns?|gains?|income|earnings) (?:are|is) (?:assured|ensured|certain|a sure thing)")),
];

const ES: ClaimRule[] = [
  may("official token", w("(?:es|son|era) (?:el |la |los |las )?(?:token|moneda|coin|memecoin)s? (?:real(?:es)?|aut[eé]ntic[oa]s?|verdader[oa]s?|propi[oa]s?) de tonkfun|(?:es|son|era) (?:el |la )?(?:verdader[oa]|aut[eé]ntic[oa]|propi[oa]|real) (?:token|moneda|coin) de tonkfun|(?:lanzad|cread|emitid)[oa]s? por el equipo(?: de tonkfun)?")),
  may("team promise", w("(?:todos|todo el mundo|los holders|los usuarios|los compradores|los inversores|cada holder) (?:ser[aá]n?|van a ser|va a ser) (?:reembolsad|compensad|indemnizad|resarcid)[oa]s?|(?:los )?reembolsos? (?:se )?(?:enviar[aá]n?|pagar[aá]n?|har[aá]n?)|se (?:enviar[aá]n?|pagar[aá]n?|devolver[aá]n?) (?:los )?(?:reembolsos?|fondos|el dinero)|(?:ha|han) prometido (?:un |el |los )?(?:reembolsos?|compensaci[oó]n|indemnizaci[oó]n)")),
  may("trade advice", w("(?:ahora|hoy) es (?:el )?(?:momento|d[ií]a) (?:de|para) (?:comprar|vender|entrar)")),
];

const PT: ClaimRule[] = [
  may("official token", w("(?:[eé]|s[aã]o|era) (?:o |a )?(?:token|moeda|coin|memecoin)s? (?:real|verdadeir[oa]|aut[eê]ntic[oa]|pr[oó]pri[oa]) d[ao] tonkfun|(?:lan[cç]ad|criad|emitid)[oa]s? pel[ao] (?:equipe|time)(?: d[ao] tonkfun)?")),
  may("team promise", w("(?:todos|todo mundo|os holders|os usu[aá]rios|os compradores|os investidores) (?:ser[aã]o|v[aã]o ser|vai ser) (?:reembolsad|compensad|ressarcid|indenizad)[oa]s?|(?:os )?reembolsos? (?:ser[aá]|ser[aã]o|v[aã]o ser) (?:enviad|pag|feit)[oa]s?|(?:prometeu|prometeram) (?:um |o |os )?(?:reembolsos?|ressarcimento|compensa[cç][aã]o)")),
  may("trade advice", w("agora [eé] (?:a )?(?:hora|momento) (?:de|para) (?:comprar|vender|entrar)")),
];

const FR: ClaimRule[] = [
  may("official token", w("(?:est|c'est|sont) (?:le |la )?(?:vrai|v[eé]ritable|propre) (?:jeton|token|coin) de tonkfun|(?:est|c'est|sont) (?:le |la )?(?:jeton|token|coin) (?:propre|v[eé]ritable) de tonkfun|(?:lanc[eé]|cr[eé][eé]|[eé]mis)e?s? par l'[eé]quipe(?: de tonkfun)?")),
  may("team promise", w("(?:tout le monde|tous|toutes|les holders|les d[eé]tenteurs|les utilisateurs|les acheteurs|chacun) (?:sera|seront|va [eê]tre|vont [eê]tre) (?:rembours[eé]|indemnis[eé]|d[eé]dommag[eé]|compens[eé])e?s?|(?:les |le )?remboursements? (?:sera|seront|va [eê]tre|vont [eê]tre) (?:envoy[eé]|vers[eé]|effectu[eé]|pay[eé])s?|(?:a|ont) promis (?:des |un |le )?(?:remboursements?|d[eé]dommagements?|indemnisations?)")),
  may("trade advice", w("c'est (?:le )?moment d'(?:acheter|vendre)")),
];

const DE: ClaimRule[] = [
  may("official token", w("(?:ist|sind|war) (?:der |die |das )?(?:echte|wahre|eigene)n? (?:token|coin|memecoin) von tonkfun|(?:ist|sind|war) tonkfuns (?:eigener|echter|offizieller) (?:token|coin)|(?:vom|durch das) team (?:\\p{L}+ )?(?:gestartet|erstellt|herausgegeben|gelauncht)")),
  may("team promise", w("(?:alle|jeder|jede|die holder|die halter|die nutzer|die k[aä]ufer|alle anleger|alle holder) (?:wird|werden) (?:\\p{L}+ ){0,2}(?:entsch[aä]digt|erstattet|r[uü]ckerstattet|ausgeglichen|ausgezahlt)|(?:erstattungen?|entsch[aä]digungen?|r[uü]ckerstattungen?) (?:wird|werden) (?:\\p{L}+ ){0,2}(?:gesendet|ausgezahlt|[uü]berwiesen|verschickt)|(?:hat|haben) (?:eine |die )?(?:erstattung|entsch[aä]digung|r[uü]ckerstattung)\\p{L}* versprochen")),
  may("trade advice", w("jetzt ist (?:der )?(?:richtige |beste )?(?:zeitpunkt|moment) (?:zum|um zu) (?:kaufen|verkaufen|einsteigen)")),
];

const TR: ClaimRule[] = [
  may("team promise", w("(?:herkese|tüm (?:yatırımcılara|kullanıcılara|holderlara|sahiplere)|yatırımcılara|kullanıcılara) (?:\\p{L}+ ){0,2}(?:iade|telafi|tazminat|geri ödeme)\\p{L}* (?:yapılacak|edilecek|ödenecek|verilecek)|(?:para )?iade(?:si)? (?:yapılacak|edilecek)|(?:herkes|tüm yatırımcılar|kullanıcılar) (?:\\p{L}+ ){0,2}(?:iade|tazminat|telafi)\\p{L}* (?:alacak|alacaklar)")),
];

const VI: ClaimRule[] = [
  may("team promise", w("(?:mọi người|tất cả(?: mọi người)?|người nắm giữ|các holder|holder|nhà đầu tư|người mua|người dùng) (?:\\p{L}+ ){0,2}sẽ (?:được )?(?:hoàn tiền|hoàn trả|bồi thường|đền bù)|tiền (?:hoàn|bồi thường|đền bù) sẽ được (?:gửi|trả|chuyển)")),
];

const ID: ClaimRule[] = [
  may("team promise", w("(?:semua(?: orang)?|semua holder|para holder|holder|pengguna|pembeli|investor|kalian) (?:akan|bakal) (?:mendapat|mendapatkan|menerima|dapat|diberi) (?:refund|kompensasi|ganti rugi|pengembalian dana)|(?:refund|kompensasi|ganti rugi|pengembalian dana) (?:akan|bakal) (?:dikirim|dibayar|diberikan|dicairkan)|(?:semua(?: orang)?|holder|pengguna) (?:akan|bakal) (?:di-?refund|dikompensasi|diganti rugi)")),
];

export const FORMS_LATIN: readonly ClaimRule[] = [...EN, ...ES, ...PT, ...FR, ...DE, ...TR, ...VI, ...ID];
