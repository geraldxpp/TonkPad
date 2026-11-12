/** Where vulnerability reports go: an email address (a mailto: link) or an https page. */
export interface SecurityContact {
  kind: "email" | "link";
  /** What the page shows: the address, or the link without its https://. */
  text: string;
  href: string;
}

// The local part leaves out ? # & %, which a mailto: link would read as its query or fragment.
const EMAIL = /^[A-Za-z0-9.!$'*+/=^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
const MAX_LENGTH = 200;

/**
 * Reads a contact value: an email address (optionally written as mailto:) or
 * an https:// link. Anything else (blank, another scheme, credentials in the
 * link, too long) is no contact, and the page says "Coming soon".
 */
export function parseContact(value: string | undefined): SecurityContact | null {
  const raw = value?.trim() ?? "";
  if (!raw || raw.length > MAX_LENGTH) return null;
  const email = raw.replace(/^mailto:/i, "");
  if (EMAIL.test(email)) return { kind: "email", text: email, href: `mailto:${email}` };
  if (!/^https:\/\//i.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || !url.hostname.includes(".")) return null;
  const path = url.pathname === "/" ? "" : url.pathname;
  return { kind: "link", text: `${url.host}${path}${url.search}${url.hash}`, href: url.href };
}

/** This build's security contact. NEXT_PUBLIC_ values are inlined at build time. */
export function securityContact(): SecurityContact | null {
  return parseContact(process.env.NEXT_PUBLIC_SECURITY_CONTACT);
}
