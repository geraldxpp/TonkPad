import { type ClaimRule, inText as t, may, words as w } from "./claims-rule";

/**
 * More forms of claims-other-families.ts's families (answers#6) in Russian
 * (whole words; "ё" is matched as "е") and in Chinese, Japanese and Korean
 * (inside running text): the brand's own coin as what something is ("这就是
 * tonkfun.fun自己的币"), promises in the passive with any subject ("Всем
 * вернут деньги", "大家都会得到赔偿", "모두 환불받을 수 있습니다"), and price
 * moves said as soon to come ("Цена скоро пойдет вверх", "价格马上就要涨了").
 * An amount that grows by design (a claimable share, rewards) is no price.
 */

/** An amount, a share or rewards earlier in its sentence (read where a verb stands, after it): what grows by design, not a price. */
const NOT_AMOUNT_RU = "(?<!(?:количеств|сумм|дол|наград|вознагражден|объем|числ|баланс)\\p{L}*[^.!?;]{0,80})";

const RU: ClaimRule[] = [
  may("official token", w("(?:это|является) (?:\\p{L}+ )?(?:настоящ|реальн|собственн)\\p{L}* (?:токен|монет|коин)\\p{L}* tonkfun|(?:запущен|создан|выпущен)\\p{L}* (?:самой )?командой(?: tonkfun)?")),
  may("team promise", w("(?:всем|каждому|холдерам|пользователям|покупателям|инвесторам) (?:\\p{L}+ ){0,2}(?:вернут|возместят|компенсируют|выплатят)|(?:все|каждый|холдеры|пользователи|покупатели|инвесторы) (?:\\p{L}+ ){0,2}(?:получат|получит) (?:\\p{L}+ ){0,2}(?:компенсаци|возмещени|возврат)\\p{L}*|(?:деньги|средства|компенсаци\\p{L}*|возмещени\\p{L}*) (?:будут |будет )?(?:возвращены|выплачены|отправлены|возмещены)|(?:пообещал|пообещала|пообещали|обещал|обещали) (?:\\p{L}+ ){0,2}(?:вернуть|компенсаци|возмещени|возврат)\\p{L}*")),
  may("price move", w(`(?:(?:пойдет|пойдут) (?:\\p{L}+ )?вверх|(?:скоро|вот-вот|сейчас) (?:\\p{L}+ )?(?:вырастет|вырастут|взлетит|подорожает|подскочит))${NOT_AMOUNT_RU}`)),
];

const ZH: ClaimRule[] = [
  may("official token", t("(?:是|就是|乃是) ?tonkfun ?(?:自己|自家|官方|真正|正宗)的?(?:币|幣|代币|代幣|token|coin)|真正的 ?tonkfun ?(?:币|幣|代币|代幣)|(?:团队|團隊)(?:自己)?(?:发行|發行|推出|发布|發布)的(?:币|幣|代币|代幣)")),
  may("team promise", t("(?:大家|所有人|每个人|每個人|持有人|持币者|持幣者|用户|用戶|投资者|投資者)(?:都)?(?:会|會|将|將|可以|能)(?:得到|获得|獲得|收到|拿到|拿回)(?:全额|全額)?(?:退款|赔偿|賠償|补偿|補償|返还|返還)|(?:退款|赔偿|賠償|补偿|補償)(?:会|會|将|將)(?:发放|發放|发到|發到|退回|打到|到账|到賬)|(?:承诺|承諾|答应|答應)(?:了)?(?:退款|赔偿|賠償|补偿|補償)")),
  may("price move", t("(?:马上就要|馬上就要|马上|馬上|即将|即將|快要|就要)(?:大涨|大漲|上涨|上漲|涨|漲|翻倍|起飞|起飛)")),
];

const JA: ClaimRule[] = [
  may("team promise", t("(?:全員|皆さん|みなさん|皆様|ホルダー(?:の皆さん)?|利用者)(?:に|が|は|へ)?(?:全額)?(?:返金|補償|払い戻し)(?:され|を受け|が(?:支払われ|行われ))")),
];

const KO: ClaimRule[] = [
  may("team promise", t("(?:모두|모든 분|모든 사람|모든 홀더|홀더(?:들)?|여러분|투자자(?:들)?)(?:이|가|은|는|에게|께)? ?(?:전액 )?(?:환불|보상|배상)(?:을|를)? ?(?:받|해 드|됩|될)")),
];

export const FORMS_OTHER: readonly ClaimRule[] = [...RU, ...ZH, ...JA, ...KO];
