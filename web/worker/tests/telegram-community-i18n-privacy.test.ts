import { describe, expect, it } from "vitest";
import { LOCALES, type Locale } from "@/shared/i18n/config";
import { DICTIONARIES as SITE } from "@/shared/i18n/dictionaries";
import { COMMUNITY_DICTIONARIES } from "../src/telegram/i18n/community";

const CODES: Locale[] = LOCALES.map((l) => l.code);

/** “In the formats it recognises”: the bot masks the phone and e-mail formats it knows before a model call, not every way of writing one (mod/secrets.ts, maskForModel). */
const FORMATS: Record<Locale, string> = {
  en: "in the formats it recognises",
  es: "en los formatos que reconoce",
  pt: "nos formatos que reconhece",
  fr: "dans les formats qu’il reconnaît",
  de: "in den Formaten, die er erkennt",
  ru: "в тех форматах, которые он распознаёт",
  tr: "tanıdığı biçimlerde",
  zh: "仅限它能识别的格式",
  ja: "認識できる形式であれば",
  ko: "인식할 수 있는 형식이면",
  vi: "ở những định dạng bot nhận ra được",
  id: "dalam format yang dikenalinya",
};

/** Who a review is for: someone muted or banned, or with a warning on record (appeal.ts); a removal with no offence, or a new member's text-only days, has nothing to review. */
const REVIEWABLE: Record<Locale, string> = {
  en: "If it mutes or bans you, or records a warning,",
  es: "Si te silencia o te expulsa definitivamente, o registra una advertencia contra ti,",
  pt: "Se ele silenciar ou banir você, ou registrar uma advertência contra você,",
  fr: "Si le bot vous réduit au silence, vous bannit ou enregistre un avertissement contre vous,",
  de: "Schaltet er dich stumm, sperrt er dich oder speichert er eine Verwarnung gegen dich,",
  ru: "Если бот запретил вам писать, забанил вас или записал вам предупреждение,",
  tr: "Bot sizi susturursa, yasaklarsa ya da hakkınızda bir uyarı kaydederse",
  zh: "如果它将你禁言或封禁，或给你记了一次警告，",
  ja: "ボットがあなたの発言を制限した場合、BAN した場合、または警告を記録した場合は、",
  ko: "봇이 사용자의 채팅을 제한했거나 사용자를 차단했거나 경고를 기록했다면",
  vi: "Nếu bot cấm chat bạn, cấm bạn khỏi nhóm hoặc ghi nhận một lần cảnh cáo đối với bạn,",
  id: "Jika bot membisukan Anda, memblokir Anda secara permanen, atau mencatat peringatan untuk Anda,",
};

/** The members' messages among those still to delete: a delete Telegram hasn't confirmed keeps their IDs in the records (telegram-out-deletes.ts). */
const MEMBERS_MESSAGES: Record<Locale, string> = {
  en: "its own and members' messages it removed",
  es: "tanto los suyos como los que retiró a miembros",
  pt: "tanto as próprias quanto as que ele removeu de membros",
  fr: "les siens comme ceux qu’il a retirés à des membres",
  de: "seine eigenen und von ihm entfernte Nachrichten von Mitgliedern",
  ru: "его собственные и убранные им сообщения участников",
  tr: "kendi mesajları ve üyelerden kaldırdığı mesajlar",
  zh: "包括它自己的消息和它移除的成员消息",
  ja: "ボット自身のものと、ボットが取り除いたメンバーのもの",
  ko: "봇 자신의 메시지와, 봇이 지우기로 한 멤버의 메시지",
  vi: "gồm tin nhắn của chính bot và tin nhắn thành viên mà bot đã gỡ",
  id: "baik pesannya sendiri maupun pesan anggota yang dihapusnya",
};

/** The username, in each language's own word for it: Telegram sends it, and the bot uses it only as it uses the name (reads.profile names it twice). */
const USERNAME: Record<Locale, string> = {
  en: "username",
  es: "nombre de usuario",
  pt: "nome de usuário",
  fr: "nom d’utilisateur",
  de: "Benutzernamen",
  ru: "юзернейм",
  tr: "kullanıcı adınız",
  zh: "用户名",
  ja: "ユーザー名",
  ko: "사용자 이름",
  vi: "tên người dùng",
  id: "nama pengguna",
};

/** Link-free messages Claude's check reads once the rules removed them: a new member's forward, reply to another chat or another bot's link buttons, and a forward named like the team (community/pipeline-mod.ts removedLink). */
const REMOVED: Record<Locale, string> = {
  en: "forwards, replies to other chats and messages with another bot's link buttons, if it removed them",
  es: "reenvíos, respuestas a mensajes de otros chats y mensajes con los botones de enlace de otro bot, si los eliminó",
  pt: "encaminhamentos, respostas a mensagens de outras conversas e mensagens com os botões de link de outro bot, se ele os removeu",
  fr: "les transferts, les réponses à des messages d’autres discussions et les messages portant les boutons de lien d’un autre bot, s’il les a supprimés",
  de: "Weiterleitungen, Antworten auf Nachrichten aus anderen Chats und Nachrichten mit Link-Buttons eines anderen Bots, wenn er sie entfernt hat",
  ru: "пересланные сообщения, ответы на сообщения из других чатов и сообщения с кнопками-ссылками другого бота, если он их удалил",
  tr: "iletilmiş mesajlar, başka sohbetlerdeki mesajlara verilen yanıtlar ve başka bir botun bağlantı düğmelerini içeren mesajlar (bunları kaldırdıysa)",
  zh: "转发的消息、对其他聊天中消息的回复，以及带有其他机器人链接按钮的消息（仅限它已删除的）",
  ja: "転送メッセージ・ほかのチャットのメッセージへの返信・ほかのボットのリンクボタンが付いたメッセージのうちボットが削除したもの",
  ko: "전달 메시지·다른 채팅의 메시지에 대한 답장·다른 봇의 링크 버튼이 달린 메시지 중 봇이 삭제한 것",
  vi: "tin nhắn chuyển tiếp, tin nhắn trả lời tin nhắn ở cuộc trò chuyện khác và tin nhắn có nút liên kết của bot khác, nếu bot đã gỡ chúng",
  id: "pesan terusan, balasan ke pesan dari obrolan lain, dan pesan dengan tombol tautan dari bot lain, jika bot menghapusnya",
};

/** Only what it recognises as a recovery phrase or key is removed and never sent (mod/secrets.ts findSecret: words split on spaces): a phrase written without spaces isn't. */
const RECOGNISES: Record<Locale, string> = {
  en: "The bot removes anything it recognises as one",
  es: "El bot elimina todo lo que reconoce como tal",
  pt: "O bot remove tudo o que reconhece como uma delas",
  fr: "Le bot supprime tout ce qu’il reconnaît comme tel",
  de: "Der Bot entfernt alles, was er als solches erkennt",
  ru: "Бот удаляет всё, в чём распознаёт сид-фразу или ключ",
  tr: "kurtarma ifadesi ya da özel anahtar olarak tanıdığı her şeyi kaldırır",
  zh: "机器人会删除它识别为助记词或私钥的任何内容",
  ja: "シードフレーズや秘密鍵と認識したものを削除し",
  ko: "시드 문구나 개인 키로 인식한 것을 삭제하며",
  vi: "Bot sẽ gỡ mọi thứ mà bot nhận ra là như vậy",
  id: "Bot menghapus apa pun yang dikenalinya sebagai salah satunya",
};

/**
 * The bot's privacy page (the site's privacy.* keys) beside the bot's own
 * words, in every language: what the page promises must match what the bot
 * does and says. Ask TonkFun and the admin chat have their own file
 * (telegram-community-i18n-privacy-ask.test.ts); the English wording is held
 * by PrivacyView.test.tsx.
 */
describe("the privacy page, in every language", () => {
  it.each(CODES)("%s names everyone who receives the data: Anthropic, Telegram and the bot's host, Railway", (code) => {
    const { recipients } = SITE[code].privacy.rights;
    for (const name of ["Anthropic", "Telegram", "Railway"]) expect(recipients, code).toContain(name);
  });

  it.each(CODES)("%s says unprompted answers may answer a question nobody asked the bot, in the bot's own word for them", (code) => {
    const choose = SITE[code].privacy.rights.choose.toLocaleLowerCase(code);
    expect(choose).toContain(COMMUNITY_DICTIONARIES[code].admin.counters.proactive.toLocaleLowerCase(code));
    expect(choose).toContain("tonkfun.fun");
  });

  it.each(CODES)("%s says Telegram sends the username too, and that it is used only as the name is (the group's rules read both)", (code) => {
    const { profile } = SITE[code].privacy.reads;
    expect(profile.split(USERNAME[code]).length - 1, code).toBe(2);
  });

  it.each(CODES)("%s lists the forwards, replies to other chats and other bots' link buttons it removed among what Claude's check reads (mod/triage.ts removedLink)", (code) => {
    expect(SITE[code].privacy.ai.sent).toContain(REMOVED[code]);
  });

  it.each(CODES)("%s says which messages go to Anthropic with the commands members use", (code) => {
    const { sent } = SITE[code].privacy.ai;
    expect(sent).toContain("/ask");
    expect(sent).toContain("Anthropic");
    expect(sent).toContain("3");
  });

  it.each(CODES)("%s hides phone numbers and e-mail addresses only in the formats it recognises, not all of them", (code) => {
    expect(SITE[code].privacy.ai.sent).toContain(FORMATS[code]);
  });

  it.each(CODES)("%s promises to remove, and never send, only what it recognises as a seed phrase or a private key", (code) => {
    expect(SITE[code].privacy.ai.secrets).toContain(RECOGNISES[code]);
  });

  it.each(CODES)("%s offers a review to someone muted, banned or warned, the cases a review accepts", (code) => {
    const { decisions } = SITE[code].privacy.ai;
    expect(decisions).toContain(REVIEWABLE[code]);
    expect(decisions).toContain(COMMUNITY_DICTIONARIES[code].mod.why);
  });

  it.each(CODES)("%s keeps members' messages it removed among the IDs still to delete, for 2 days at most", (code) => {
    const { cleanup } = SITE[code].privacy.keeps;
    expect(cleanup).toContain(MEMBERS_MESSAGES[code]);
    expect(cleanup).toContain("2");
  });

  it.each(CODES)("%s keeps a check 15 minutes at most, and 45 when Telegram delays posting it (the joiners stay muted while it waits, 30 minutes at most)", (code) => {
    const { checks } = SITE[code].privacy.keeps;
    expect(checks).toContain("15");
    expect(checks).toContain("45");
  });
});
