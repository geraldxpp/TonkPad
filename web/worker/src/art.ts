import { artUrl, CDN_PREFIX, cdnImage, ipfsLocation } from "@/shared/lib/token-art";
import type { LaunchpadId } from "@/shared/types/launchpad";

export { artUrl, cdnImage, ipfsLocation };

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
