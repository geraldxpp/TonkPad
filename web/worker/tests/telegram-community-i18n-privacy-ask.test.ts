import { describe, expect, it } from "vitest";
import { LOCALES, type Locale } from "@/shared/i18n/config";
import { DICTIONARIES as SITE } from "@/shared/i18n/dictionaries";
import { BOT_DICTIONARIES } from "../src/telegram/i18n";

const CODES: Locale[] = LOCALES.map((l) => l.code);

/**
 * A chosen inline result (Telegram's chosen_inline_result): the bot asks for it only while Ask TonkFun can be offered, through setMySettings' inline
 * feedback (profile-settings.ts), and reads only Ask TonkFun's (inline.ts onChosen).
 */
const CHOSEN: Record<Locale, string> = {
  en: "While Ask TonkFun can be used, it also asks Telegram to tell it which of its results you choose, with the text you typed for it.",
  es: "Mientras se puede usar «Preguntar a TonkFun», también le pide a Telegram que le indique cuál de sus resultados eliges, junto con el texto que escribiste para obtenerlo.",
  pt: "Enquanto «Perguntar ao TonkFun» pode ser usado, ele também pede ao Telegram que informe a ele qual dos resultados dele você escolhe, com o texto que você digitou para obtê-lo.",
  fr: "Tant que « Demander à TonkFun » peut être utilisé, il demande aussi à Telegram de lui indiquer lequel de ses résultats vous choisissez, avec le texte que vous avez tapé pour l’obtenir.",
  de: "Solange „TonkFun fragen“ nutzbar ist, bittet er Telegram außerdem, ihm mitzuteilen, welches seiner Ergebnisse du wählst, samt dem Text, den du dafür eingegeben hast.",
  ru: "Пока можно спрашивать через «Спросить TonkFun», он также просит Telegram сообщать ему, какой из его результатов вы выбираете, вместе с текстом, который вы для него ввели.",
  tr: "“TonkFun’a sor” kullanılabildiği sürece, sonuçlarından hangisini seçtiğinizi ve bunun için yazdığınız metni kendisine bildirmesini de Telegram’dan ister.",
  zh: "在可以使用「向 TonkFun 提问」期间，它还会请 Telegram 告诉它你选择了它的哪个结果，以及你为此输入的文字。",
  ja: "「TonkFun に質問する」が使える間は、ボットの結果のどれを選んだかと、そのために入力したテキストも伝えるよう、ボットが Telegram に求めます。",
  ko: "‘TonkFun에게 질문하기’를 쓸 수 있는 동안에는, 봇의 결과 중 어떤 것을 골랐는지와 그 결과를 얻으려고 입력한 텍스트도 알려 달라고 봇이 Telegram에 요청합니다.",
  vi: "Trong thời gian có thể dùng “Hỏi TonkFun”, bot cũng đề nghị Telegram cho bot biết bạn chọn kết quả nào của bot, kèm văn bản bạn đã nhập để có kết quả đó.",
  id: "Selama “Tanya TonkFun” bisa dipakai, bot juga meminta Telegram memberi tahu hasil mana yang Anda pilih, beserta teks yang Anda ketik untuk mendapatkannya.",
};

/**
 * How long a question chosen with Ask TonkFun is kept, and with what: its user ID alone, until it's answered or dropped, 10 minutes at most (60 s waiting
 * for its post in inline-pending.ts, after up to 5 minutes in the poller's buffer while the bot is busy, then the check's and the answer's queues).
 */
const ASK_KEPT: Record<Locale, string> = {
  en: "with your user ID, until it's answered or dropped (at most 10 minutes)",
  es: "con tu identificador de usuario, hasta que se responde o se descarta (10 minutos como máximo)",
  pt: "com seu ID de usuário, até ser respondida ou descartada (no máximo 10 minutos)",
  fr: "avec votre identifiant d’utilisateur, jusqu’à ce qu’elle reçoive une réponse ou soit abandonnée (10 minutes au plus)",
  de: "mit deiner Nutzer-ID, bis sie beantwortet oder verworfen ist (höchstens 10 Minuten)",
  ru: "вместе с вашим ID — пока бот не ответит на него или не отбросит его (не дольше 10 минут)",
  tr: "kullanıcı kimliğinizle birlikte, “TonkFun’a sor” ile paylaşılan satırla eşleştirip yanıtlamak için, yanıtlanana ya da atılana kadar (en fazla 10 dakika)",
  zh: "连同你的用户 ID，保留到回答完毕或被丢弃为止（最多 10 分钟）",
  ja: "あなたのユーザー ID とともに、回答するか破棄するまで（最長 10 分間）",
  ko: "사용자 ID와 함께 답하거나 버릴 때까지(최대 10분)",
  vi: "kèm ID người dùng của bạn, cho đến khi được trả lời hoặc bị bỏ đi (tối đa 10 phút)",
  id: "beserta ID pengguna Anda, sampai pertanyaan itu dijawab atau dibuang (paling lama 10 menit)",
};

/**
 * What relaxed mode keeps up and tells the team (mod/actions-rules.ts unknownLink, on the lead hit alone): a forward named like the team that holds
 * no unknown link (one that holds one has the unknown link lead, and goes to the check), and words the member didn't write that hold one: the bot's own
 * card or message, or an admin's message forwarded by the admin's ID (mod/rules-scan.ts botsOwnOf).
 */
const KEPT_UP: Record<Locale, string> = {
  en: "in relaxed mode, it leaves up a message you forwarded from someone named like the team (if it holds no link outside its allow-list), or a card or message of its own, or an admin's message, that you shared or forwarded and that holds such a link",
  es: "en modo flexible, deja publicado un mensaje que reenviaste de alguien cuyo nombre imita al del equipo (si no contiene ningún enlace fuera de su lista de sitios permitidos), o una ficha de token o un mensaje del propio bot, o un mensaje de un administrador, que compartiste o reenviaste y que sí contiene un enlace así",
  pt: "no modo flexível, ele mantém publicada uma mensagem que você encaminhou de alguém cujo nome imita o da equipe (se ela não contiver nenhum link fora da lista de sites permitidos dele), ou um resumo de token ou uma mensagem do próprio bot, ou uma mensagem de um administrador, que você compartilhou ou encaminhou e que contenha um link assim",
  fr: "en mode souple, il laisse en ligne un message que vous avez transféré depuis quelqu’un dont le nom imite celui de l’équipe (s’il ne contient aucun lien absent de sa liste de sites autorisés), ou une fiche de token ou un message du bot lui-même, ou le message d’un administrateur, que vous avez partagé ou transféré et qui contient un tel lien",
  de: "im lockeren Modus eine Nachricht stehen lässt, die du von jemandem weitergeleitet hast, dessen Name dem des Teams ähnelt (sofern sie keinen Link enthält, der nicht auf seiner Liste erlaubter Seiten steht), oder eine Token-Karte oder Nachricht des Bots selbst oder eine Nachricht eines Admins, die du geteilt oder weitergeleitet hast und die einen solchen Link enthält",
  ru: "в мягком режиме он оставляет пересланное вами сообщение от того, чьё имя похоже на имя команды (если в нём нет ссылок не из его списка разрешённых сайтов), или карточку токена либо сообщение самого бота или админа, которыми вы поделились или которые переслали и в которых такая ссылка есть",
  tr: "esnek modda, adı ekibinkine benzeyen birinden ilettiğiniz ve izin verilen siteler listesinde olmayan bir bağlantı içermeyen bir mesajı ya da paylaştığınız veya ilettiğiniz ve böyle bir bağlantı içeren, botun kendisine ait bir token kartını veya mesajı ya da bir yöneticinin mesajını",
  zh: "在宽松模式下，当它保留你转发的、来自名字仿冒团队者且不含任何不在其允许网站列表中的链接的消息，或你分享或转发的、含有此类链接的机器人自身代币卡片、机器人消息或管理员消息时",
  ja: "「ゆるめ」モードで、あなたが転送した、チームに似た名前の相手からのメッセージのうち許可リストにないリンクを含まないものや、あなたが共有または転送した、ボット自身のトークンカードやメッセージ、管理者のメッセージのうちそうしたリンクを含むもの",
  ko: "느슨함 모드에서 사용자가 전달한, 팀과 비슷한 이름을 가진 사람의 메시지 중 허용 목록에 없는 링크가 없는 것이나, 사용자가 공유하거나 전달한 봇 자신의 토큰 카드나 메시지 또는 관리자의 메시지 중 그런 링크가 담긴 것",
  vi: "ở chế độ thoải mái, bot để nguyên một tin nhắn bạn chuyển tiếp từ người có tên giống đội ngũ (nếu tin nhắn không chứa liên kết nào ngoài danh sách trang được phép), hoặc một thẻ token hay tin nhắn của chính bot, hay tin nhắn của một quản trị viên, mà bạn chia sẻ hoặc chuyển tiếp và có chứa liên kết như vậy",
  id: "dalam mode longgar, bot membiarkan pesan yang Anda teruskan dari seseorang yang namanya mirip tim (jika pesan itu tidak berisi tautan di luar daftar situs yang diizinkan), atau kartu token atau pesan milik bot sendiri, atau pesan seorang admin, yang Anda bagikan atau teruskan dan berisi tautan seperti itu",
};

/**
 * The privacy page (the site's privacy.* keys) on inline mode's Ask TonkFun and on what the team's admin chat sees, in every language, beside the bot's
 * own words: Ask TonkFun is quoted as the bot titles it there (inline.ask). The English wording is held by PrivacyView.test.tsx.
 */
describe("the privacy page on Ask TonkFun and the admin chat, in every language", () => {
  it.each(CODES)("%s names inline mode's Ask result as the bot titles it, among the ways to ask, what a private chat sends and what it ignores in other groups (agent/triggers-via.ts askPost, inline-pending.ts)", (code) => {
    const ask = BOT_DICTIONARIES[code].inline.ask;
    expect(SITE[code].privacy.ai.sent).toContain(ask);
    expect(SITE[code].privacy.rights.choose).toContain(ask);
    expect(SITE[code].privacy.reads.groups).toContain(ask);
  });

  it.each(CODES)("%s says the bot asks Telegram for the chosen result and its query only while Ask TonkFun can be used (inline.ts onChosen, profile-settings.ts)", (code) => {
    const { inline } = SITE[code].privacy.reads;
    expect(inline).toContain(CHOSEN[code]);
    expect(inline).toContain(BOT_DICTIONARIES[code].inline.ask);
  });

  it.each(CODES)("%s keeps the question chosen with Ask TonkFun with the user ID alone, until it's answered or dropped, 10 minutes at most, and says the team's alerts quote it (inline-pending.ts, community/qa-posted.ts)", (code) => {
    const ask = BOT_DICTIONARIES[code].inline.ask;
    const { reads, keeps } = SITE[code].privacy;
    expect(keeps.memory).toContain(ASK_KEPT[code]);
    for (const text of [reads.profile, keeps.memory, keeps.admins]) expect(text, code).toContain(ask);
  });

  it.each(CODES)("%s tells the team, with no action, of what relaxed mode keeps up: a forward named like the team, and words the member didn't write with an unknown link (mod/actions-rules.ts)", (code) => {
    expect(SITE[code].privacy.keeps.admins).toContain(KEPT_UP[code]);
  });

  it.each(CODES)("%s lists the admin chat's refusal alerts (two within 10 minutes) beside reports and reviews", (code) => {
    const { admins } = SITE[code].privacy.keeps;
    expect(admins).toContain("10");
    expect(admins).toContain("/report");
    expect(admins).toContain("Claude");
  });
});
