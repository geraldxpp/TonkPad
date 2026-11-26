/**
 * Words inside a username or a link's host (usernames are Latin letters,
 * digits and _; words.ts compiles these as plain regular expressions, since
 * usernames run words together: "TonkfunSupport", "tonkfun-claim.xyz").
 */

/**
 * "Support", "admin", "help desk" and the like inside a username (usernames
 * are Latin letters, digits and _), on its folded form (names.ts fold: "_"
 * becomes a space, "0" an o). Plain regular expressions: usernames run words
 * together, so most have no edges ("TonkfunSupport").
 */
export const SUPPORT_SOURCES: readonly string[] = [
  "support(?!er|ive)", "suport", "soporte", "suporte", "(?<!b)adm[il]n(?!ton)", "help ?(desk|center|centre|line|team)", "customer ?(care|service|support|success)", "service ?desk", "assistance",
  "hilfe", "kundendienst", "destek", "kefu", "cskh", "ho ?tro", "bantuan", "dukungan", "podderzhk", "(?<![a-z])mods?(?![a-z])", "moderator", "tech ?team", "official ?team",
];

/** Drainer bait inside a link's host or a username, on its folded form with the spaces removed ("tonkfun-claim.xyz" → "tonkfunclaimxyz"). */
export const DRAINER_NAME_SOURCES: readonly string[] = [
  "claim", "airdrop", "reward", "bonus", "giveaway", "rectif", "walletsync", "syncwallet", "walletconnect", "connectwallet", "validatewallet", "walletvalidat", "migrat", "whitelist", "presale", "refund", "compensat",
];
