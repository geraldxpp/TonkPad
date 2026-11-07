/**
 * Verified issuers of tokenized stocks and RWAs (Mission score v2, approved by
 * the owner on 7 Nov 2026). Their tokens hold mint and freeze authority by
 * design, so the score doesn't punish them for it.
 *
 * Neither issuer publishes its authority addresses as text, so they were read
 * on-chain from mints the issuers list themselves (see `proof`). Anyone can
 * hand their own token's authorities to these addresses, so a token counts
 * only when both authorities match AND Jupiter verifies it under the issuer's
 * tag (sources/jupiter.ts).
 */
export type IssuerId = "xstocks" | "ondo";

export interface Issuer {
  /** Shown in the badge's tooltip; not translated. */
  name: string;
  mintAuthority: string;
  freezeAuthority: string;
  /** The tag Jupiter's token list gives this issuer's tokens. */
  jupiterTag: string;
  /** Issuer pages that list mints carrying these authorities. */
  proof: readonly string[];
}

export const ISSUERS: Record<IssuerId, Issuer> = {
  xstocks: {
    name: "xStocks",
    mintAuthority: "7pt9tkctJPK7PPNQJ77GKg8ZffSF6QxoMiCFYHxrtaCj",
    freezeAuthority: "JDq14BWvqCRFNu1krb12bcRpbGtJZ1FLEakMw6FdxJNs",
    jupiterTag: "xstocks",
    proof: ["https://xstocks.com/products"],
  },
  ondo: {
    name: "Ondo Global Markets",
    mintAuthority: "9foMHsSDq7nMg4WPusSz9eY7tyxyukqborA8GyU5cUxD",
    freezeAuthority: "51QVCuHfL1FeNjd8BDeffCKhCcAYoULnVB3yjNhShiuK",
    jupiterTag: "ondo",
    proof: ["https://docs.ondo.finance/addresses"],
  },
};

/** The issuer whose mint AND freeze authority a token carries, or null. */
export function issuerByAuthorities(mintAuthority: string | null, freezeAuthority: string | null): IssuerId | null {
  for (const id of Object.keys(ISSUERS) as IssuerId[]) {
    const issuer = ISSUERS[id];
    if (mintAuthority === issuer.mintAuthority && freezeAuthority === issuer.freezeAuthority) return id;
  }
  return null;
}
