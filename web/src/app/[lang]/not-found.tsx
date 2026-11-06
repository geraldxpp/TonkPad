import { LaterPanel } from "@/modules/shell/components/LaterPanel";
import { getI18n } from "@/shared/i18n/server";

/** The 404 inside the app shell, in the page's language (title: [...rest]/page.tsx). */
export default async function NotFound() {
  const { t } = await getI18n();
  return (
    <LaterPanel title={t.notFound.title} badge="404">
      {t.notFound.body}
    </LaterPanel>
  );
}
