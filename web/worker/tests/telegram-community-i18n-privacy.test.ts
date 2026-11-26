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

/**
 * The bot's privacy page (the site's privacy.* keys) beside the bot's own
 * words, in every language: what the page promises must match what the bot
 * does and says. The English wording is held by PrivacyView.test.tsx.
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

  it.each(CODES)("%s lists the admin chat's refusal alerts (two within 10 minutes) beside reports and reviews", (code) => {
    const { admins } = SITE[code].privacy.keeps;
    expect(admins).toContain("10");
    expect(admins).toContain("/report");
    expect(admins).toContain("Claude");
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
