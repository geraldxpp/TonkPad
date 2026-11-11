import { getI18n } from "@/shared/i18n/server";
import { getSecurityData } from "./data/get-security-data";
import { SecurityView } from "./SecurityView";

/**
 * The Security page, for the launchpad's mainnet release: how to report a
 * vulnerability, the scope, the rules, the rewards and what was checked.
 * Static: everything comes from the dictionaries, public build-time values
 * and the frozen build.
 */
export async function SecurityPage() {
  const [{ t }, data] = await Promise.all([getI18n(), getSecurityData()]);
  return <SecurityView s={t.security} data={data} />;
}
