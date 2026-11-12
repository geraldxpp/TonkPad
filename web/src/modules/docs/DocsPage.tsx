import { getI18n } from "@/shared/i18n/server";
import { getDocsData } from "./data/get-docs-data";
import { DocsView } from "./DocsView";

/**
 * Module 11: Docs. How tonkfun.fun and its launchpad work, in plain words,
 * checked against the deployed contracts (frozen build 5c199225). The page
 * is static; its live figures (the launch fee, the reserves, the starting
 * cap, the graduation point and the paused state) are read from the
 * launchpad in the browser.
 */
export async function DocsPage() {
  const [{ t, href }, data] = await Promise.all([getI18n(), getDocsData()]);
  return <DocsView t={t} href={href} data={data} />;
}
