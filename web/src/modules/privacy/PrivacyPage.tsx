import { htmlLang } from "@/shared/i18n/config";
import { getI18n } from "@/shared/i18n/server";
import { UPDATED } from "./lib/bot";
import { PrivacyView } from "./PrivacyView";

/**
 * The Telegram bot's privacy policy (/privacy/telegram), the public link set
 * in @BotFather. Static: everything comes from the dictionaries.
 */
export async function PrivacyPage() {
  const { lang, t, href } = await getI18n();
  const updated = new Intl.DateTimeFormat(htmlLang(lang), { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(UPDATED);
  return <PrivacyView p={t.privacy} href={href} updated={updated} />;
}
