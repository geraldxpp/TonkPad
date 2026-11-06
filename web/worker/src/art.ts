import type { LaunchpadId } from "@/shared/types/launchpad";

/**
 * Token art URLs. Metadata often points at a public IPFS gateway (ipfs.io and
 * friends) that answers hot-linked images with 429s, so IPFS links are
 * re-pointed at a gateway that serves them: Pump.fun's own for its tokens
 * (their art is pinned there), Filebase's public one for everything else.
 * The result is served as a 256 px copy from Helius's Cloudflare image CDN.
 */
const CDN_PREFIX = "https://cdn.helius-rpc.com/cdn-cgi/image/";
const PUMP_GATEWAY = "https://pump.mypinata.cloud";
const PUBLIC_GATEWAY = "https://ipfs.filebase.io";

const CID = "(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{50,})";
const IPFS_SCHEME = new RegExp(`^ipfs://(?:ipfs/)?${CID}(/[^?#]*)?`);
const IPFS_PATH = new RegExp(`^https?://[^/]+/ipfs/${CID}(/[^?#]*)?`);
const IPFS_SUBDOMAIN = new RegExp(`^https?://${CID}\\.ipfs\\.[^/]+(/[^?#]*)?`);

/** The content id (and any path inside it) of an IPFS link, in any of its three spellings. */
export function ipfsLocation(url: string): { cid: string; path: string } | null {
  const match = IPFS_SCHEME.exec(url) ?? IPFS_PATH.exec(url) ?? IPFS_SUBDOMAIN.exec(url);
  if (!match) return null;
  const path = match[2] && match[2] !== "/" ? match[2] : "";
  return { cid: match[1], path };
}

/** A resized copy from Helius's image CDN. */
export function cdnImage(source: string, width = 256): string {
  return `${CDN_PREFIX}width=${width},quality=80,format=auto/${source}`;
}

/** The URL the app shows for a token's art, or null when the metadata has none it can use. */
export function artUrl(source: string, launchpad: LaunchpadId): string | null {
  const ipfs = ipfsLocation(source);
  if (ipfs) {
    const gateway = launchpad === "pump" || source.startsWith(PUMP_GATEWAY) ? PUMP_GATEWAY : PUBLIC_GATEWAY;
    return cdnImage(`${gateway}/ipfs/${ipfs.cid}${ipfs.path}`);
  }
  return /^https?:\/\//.test(source) ? cdnImage(source) : null;
}

/**
 * Art when the metadata gives none (DAS sometimes can't read it either):
 * Pump.fun serves every one of its tokens' images by mint address.
 */
export function launchpadArt(address: string, launchpad: LaunchpadId): string | null {
  return launchpad === "pump" ? cdnImage(`https://images.pump.fun/coin-image/${address}`) : null;
}

/** Re-derives an art URL saved by an older worker (snapshots), so it gets the gateway fix too. */
export function repointArt(image: string | null, launchpad: LaunchpadId): string | null {
  if (!image?.startsWith(CDN_PREFIX)) return image;
  const source = image.slice(CDN_PREFIX.length).replace(/^[^/]*\//, "");
  return artUrl(source, launchpad);
}
