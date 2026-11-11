/**
 * The guarded launch's invite list (prompts/08-internal-audit.md, section 7):
 * while NEXT_PUBLIC_TONK_LAUNCH_INVITES names creator wallets, this site's
 * Creator Studio launches only for them. Others see "Launch is invite-only
 * for now", and the server won't build their launch.
 *
 * This is a soft gate, kept by this site alone. The launchpad contract stays
 * permissionless: anyone can still launch by calling it directly, so the
 * list is a way to start small, not a security boundary.
 */

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/**
 * The invited wallets, lowercase, or null when no list is set (Launch open
 * to every wallet). A list whose entries are all malformed invites nobody:
 * a typo closes Launch rather than opening it.
 */
export function parseInvites(value: string | undefined): ReadonlySet<string> | null {
  const entries = (value ?? "").split(/[\s,;]+/).filter(Boolean);
  if (entries.length === 0) return null;
  return new Set(entries.filter((entry) => ADDRESS.test(entry)).map((entry) => entry.toLowerCase()));
}

/** Inlined at build time, so the browser and the server read the same list. */
const BUILD_INVITES = parseInvites(process.env.NEXT_PUBLIC_TONK_LAUNCH_INVITES);

/** This build's invite list, or null when Launch is open to every wallet. */
export const launchInvites = (): ReadonlySet<string> | null => BUILD_INVITES;

/** Whether this wallet may launch here: always while no list is set; otherwise only a wallet on it. */
export function isInvited(creator: string | null, invites: ReadonlySet<string> | null = BUILD_INVITES): boolean {
  if (invites === null) return true;
  return creator !== null && invites.has(creator.toLowerCase());
}
