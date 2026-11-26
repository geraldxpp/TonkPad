import { type ClaimRule, inText as t, may, never, words as w } from "./claims-rule";

/**
 * Banned claims in Russian (whole words; "ё" is matched as "е") and in
 * Chinese (simplified and traditional), Japanese and Korean, matched inside
 * running text. The same families as claims-latin.ts.
 */

const RU: ClaimRule[] = [
  may("guaranteed", w("гарантирован\\p{L}*|гаранти(?:я|и|ю|ей|й)|гарантиру\\p{L}*")),
  may("risk-free", w("без (?:всякого |какого-либо )?риск(?:а|ов)|безрисков\\p{L}*|нулев\\p{L}* риск")),
  never("can't lose", w("не (?:сможете |можете |можешь |сможешь )?(?:потеря|проигра)\\p{L}*|(?:невозможно|нельзя) (?:потерять|проиграть)|верн\\p{L}* (?:прибыль|заработок)|легкие деньги")),
  may("safe to buy", w("безопасно (?:покупать|купить|вкладывать|инвестировать)|(?:безопасн|надежн)\\p{L}* (?:инвестици|вложени)\\p{L}*")),
  never("not a scam", w("не (?:скам|мошенничеств\\p{L}*|развод|обман|раг ?пул|раг|scam|rug)")),
  may("legit", w("легит\\p{L}*")),
  may("to the moon", w("(?:на|до) лун(?:у|ы)|полетит|улетит|взлетит|выстрелит|иксанет")),
  may("price target", w("целев\\p{L}* цен\\p{L}*|цель по цене")),
  never("zero fees", w("без комисси\\p{L}*|нулев\\p{L}* комисси\\p{L}*|комисси\\p{L}* (?:нет|ноль)|бесплатн\\p{L}* торг\\p{L}*")),
  may("official partner", w("официальн\\p{L}* (?:партнер|сотрудничеств)\\p{L}*|в партнерстве с")),
  may("will be listed", w("(?:будет|будут) (?:\\p{L}+ ){0,2}(?:залистен|листинг)\\p{L}*|листинг на")),
  may("airdrop live", w("(?:эйрдроп|аирдроп|airdrop) (?:уже )?(?:запущен|подтвержден|активен|идет|начался)|(?:подтвержденн|официальн)\\p{L}* (?:эйрдроп|аирдроп|airdrop)")),
  may("presale", w("(?:пресейл|предпродажа) (?:уже )?(?:запущен\\p{L}*|открыт\\p{L}*|идет|начал\\p{L}*)")),
];

const ZH: ClaimRule[] = [
  may("guaranteed", t("保证|保證|担保|擔保")),
  may("risk-free", t("无风险|無風險|零风险|零風險|没有风险|沒有風險|毫无风险|毫無風險")),
  never("can't lose", t("稳赚|穩賺|包赚|包賺|必赚|必賺|只赚不赔|只賺不賠|不会亏|不會虧|不可能亏|不可能虧")),
  may("safe to buy", t("放心(?:买|買|购买|購買|投资|投資)|(?:购买|購買|买入|買入)(?:是|很|也)?安全|安全的投[资資]")),
  never("not a scam", t("不是(?:骗局|騙局|诈骗|詐騙|骗子|騙子|割韭菜|rug)|不[会會](?:跑路|rug)")),
  may("legit", t("靠谱|靠譜|正规项目|正規項目")),
  may("to the moon", t("冲上月球|衝上月球|登月|起飞|起飛|暴涨|暴漲|飞天|飛天")),
  may("price target", t("目标价|目標價|价格目标|價格目標")),
  never("zero fees", t("零手续费|零手續費|免手续费|免手續費|无手续费|無手續費|没有手续费|沒有手續費|零费用|零費用|免费交易|免費交易")),
  may("official partner", t("官方合作|官方伙伴|官方夥伴|战略合作|戰略合作")),
  may("will be listed", t("(?:将|將|即将|即將)上(?:线|線|市|币|幣)|上币|上幣")),
  may("airdrop live", t("空投(?:已|已经|已經)(?:开始|開始|上线|上線|确认|確認|开放|開放|启动|啟動)|官方空投|领取空投|領取空投")),
  may("presale", t("预售|預售|私募")),
];

const JA: ClaimRule[] = [
  may("guaranteed", t("保証")),
  may("risk-free", t("リスク(?:なし|ゼロ|フリー)|ノーリスク|無リスク")),
  never("can't lose", t("確実に(?:儲|稼|利益)|絶対に(?:儲|稼)|損(?:しない|することはない)|負けない")),
  may("safe to buy", t("(?:買っ|購入し)ても安全|安全な投資|安心して(?:購入|買)")),
  never("not a scam", t("(?:詐欺|スキャム|ラグ(?:プル)?)(?:では|じゃ)(?:ない|ありません)")),
  may("legit", t("正規のプロジェクト|legit")),
  may("to the moon", t("月まで|ムーン(?!ショット)|爆上げ|爆騰")),
  may("price target", t("目標価格|価格目標")),
  never("zero fees", t("手数料(?:は)?(?:無料|ゼロ|なし|かからない)|ゼロ手数料")),
  may("official partner", t("公式パートナー|公式提携|正式提携")),
  may("will be listed", t("上場(?:する|予定|します|決定|が決定)")),
  may("airdrop live", t("エアドロップ(?:が|は)?(?:開始|確定|実施中)|公式エアドロップ")),
  may("presale", t("プレセール|先行販売")),
];

const KO: ClaimRule[] = [
  may("guaranteed", t("보장|보증")),
  may("risk-free", t("무위험|(?:위험|리스크)(?:이|가|은|는)? ?(?:전혀 )?없")),
  never("can't lose", t("손해(?:를)? ?(?:보지 않|볼 일(?:이)? 없)|잃지 않|무조건 (?:수익|이익|오름|오릅)|확정 수익|절대 (?:손해|잃지)")),
  may("safe to buy", t("(?:사도|매수해도|구매해도) ?안전|안전한 투자")),
  never("not a scam", t("(?:사기|스캠|러그(?:풀)?)(?:가|이)? ?아니")),
  may("legit", t("정식 프로젝트|legit")),
  may("to the moon", t("투더문|달까지|떡상|폭등")),
  may("price target", t("목표 ?가격|목표가")),
  never("zero fees", t("수수료(?:가|는)? ?(?:없|무료|0(?![.,]?\\d))|무료 거래|제로 수수료")),
  may("official partner", t("공식 ?(?:파트너|제휴|협력)")),
  may("will be listed", t("상장 ?(?:예정|될|됩니다|확정)")),
  may("airdrop live", t("에어드(?:랍|롭)(?:이|은|가)? ?(?:시작|확정|진행)|공식 에어드(?:랍|롭)")),
  may("presale", t("프리세일|사전 ?판매")),
];

export const CLAIMS_OTHER: readonly ClaimRule[] = [...RU, ...ZH, ...JA, ...KO];
