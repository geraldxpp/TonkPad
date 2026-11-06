export const SITE_NAME = "Tonkpad.fun";

/** "Explore" → "Explore — Tonkpad.fun", the title every screen uses. */
export function pageTitle(name: string): string {
  return `${name} — ${SITE_NAME}`;
}
