export const SITE_NAME = "tonkfun.fun";

/** "Explore" → "Explore — tonkfun.fun", the title every screen uses. */
export function pageTitle(name: string): string {
  return `${name} — ${SITE_NAME}`;
}
