/**
 * Token images (prompts/12-token-images.md). A creator's image is re-encoded
 * on the server and stored under its own hash, `token-art/<sha256>.webp`, on
 * one storage host. A token's metadata is untrusted, so the app only ever
 * shows an image from that exact host and path: any other address in it is
 * ignored, and a token can never make visitors load an outside image.
 *
 * No imports, so next.config.ts can read the host the same way.
 */

/** What an upload may be: PNG, JPEG, WebP or GIF, up to 2 MB. */
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
/** What is stored: a square WebP this many pixels a side. */
export const IMAGE_SIZE = 512;
/** Uploads per wallet per hour. */
export const UPLOADS_PER_HOUR = 10;
/** How long an upload's signature counts, and how far ahead of the server's clock it may be. */
export const SIGNATURE_MAX_AGE_MS = 5 * 60_000;
export const SIGNATURE_MAX_AHEAD_MS = 60_000;

const HOSTNAME = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/**
 * The storage host as configured: one exact hostname, e.g. the Blob store's
 * `<id>.public.blob.vercel-storage.com`. Anything else (a wildcard, a URL, a
 * port) is no host at all, so a typo turns images off instead of widening them.
 */
export function parseImageHost(value: string | undefined): string | null {
  const host = (value ?? "").trim().toLowerCase();
  return HOSTNAME.test(host) ? host : null;
}

/** This build's image host (inlined in the browser; read at start in the worker), or null while images aren't set up. */
export const imageHost = (): string | null => parseImageHost(process.env.NEXT_PUBLIC_TONK_IMAGE_HOST);

export const IMAGE_PREFIX = "token-art/";
export const imagePath = (hash: string) => `${IMAGE_PREFIX}${hash}.webp`;
export const tokenImageUrl = (hash: string, host: string) => `https://${host}/${imagePath(hash)}`;

/** No address of ours is longer: a 253-character host, the path and the hash. */
const MAX_URL = 400;
const IMAGE_URL = /^https:\/\/([a-z0-9.-]+)\/token-art\/([0-9a-f]{64})\.webp$/;

/** The hash of one of our stored images, from its exact address; null for any other text. */
export function tokenImageHash(value: unknown, host: string | null = imageHost()): string | null {
  if (typeof value !== "string" || host === null || value.length > MAX_URL) return null;
  const match = IMAGE_URL.exec(value);
  return match && match[1] === host ? match[2] : null;
}

/** An image address the app may show, rebuilt from its hash; "" for anything else. */
export function allowedImage(value: unknown, host: string | null = imageHost()): string {
  const hash = tokenImageHash(value, host);
  return hash && host ? tokenImageUrl(hash, host) : "";
}

/**
 * The owner's hide list (TONK_HIDDEN_IMAGES): image hashes, or image links,
 * separated by spaces or commas. Read on the server and in the worker only;
 * it isn't public, so the browser never has it and never sees a hidden image.
 */
export function parseHiddenImages(value: string | undefined): ReadonlySet<string> {
  return new Set((value ?? "").toLowerCase().match(/[0-9a-f]{64}/g) ?? []);
}

/** The hide list as this server or worker was started with. */
export const hiddenImages = (): ReadonlySet<string> => parseHiddenImages(process.env.TONK_HIDDEN_IMAGES);

/** An allowed image that isn't hidden; "" otherwise, so the token shows its letter. */
export function visibleImage(value: unknown, hidden: ReadonlySet<string>, host: string | null = imageHost()): string {
  const hash = tokenImageHash(value, host);
  return hash && host && !hidden.has(hash) ? tokenImageUrl(hash, host) : "";
}

/** What an upload's signature covers: the site, the wallet, the uploaded file's SHA-256 and when it was signed. */
export interface UploadClaim {
  site: string;
  wallet: string;
  hash: string;
  /** ISO 8601 with milliseconds, e.g. 2026-11-12T10:00:00.000Z. */
  time: string;
}

/** The text the wallet signs (EIP-191): the language's template with the claim filled in. The server rebuilds it the same way. */
export const uploadMessage = (template: string, claim: UploadClaim) =>
  template.replace(/\{(site|wallet|hash|time)\}/g, (_, key: keyof UploadClaim) => claim[key]);

export const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/** Whether a signature from `time` still counts at `now`: at most five minutes old, and not from the future. */
export function signedRecently(time: string, now: number): boolean {
  const at = ISO_TIME.test(time) ? Date.parse(time) : NaN;
  return Number.isFinite(at) && at <= now + SIGNATURE_MAX_AHEAD_MS && now - at <= SIGNATURE_MAX_AGE_MS;
}
