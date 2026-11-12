import { del, list, put } from "@vercel/blob";
import { imagePath, tokenImageUrl } from "../image";
import { tonkMode } from "../networks";

/**
 * Where token images are kept, and each wallet's recent uploads (for the
 * limit of ten an hour). Serverless instances share no memory, so on Vercel
 * both live in the owner's Blob store: the count holds across instances, and
 * only uploads landing at the very same moment could slip past it together.
 */
export interface ImageStore {
  /** Stores the image as token-art/<hash>.webp and resolves with its public address. */
  save(hash: string, webp: Uint8Array): Promise<string>;
  /** How many uploads this wallet (lowercase) made since `since` (ms). */
  uploadsSince(wallet: string, since: number): Promise<number>;
  /** Counts one upload by this wallet. */
  noteUpload(wallet: string, at: number): Promise<void>;
}

const LOG_PREFIX = "token-art-log/";
/** An image's address never changes what it holds, so it may be cached for a year. */
const YEAR_SECONDS = 365 * 24 * 60 * 60;

/**
 * The owner's Vercel Blob store. Each upload is also noted as a tiny marker
 * under token-art-log/<wallet>/ (its name has a random part, so it can't be
 * guessed, and it holds nothing but "1"); markers older than the hour are
 * deleted as the count is taken.
 */
export function blobStore(token: string): ImageStore {
  return {
    async save(hash, webp) {
      // Content-addressed: writing the same name again writes the same bytes.
      const blob = await put(imagePath(hash), Buffer.from(webp), { access: "public", token, contentType: "image/webp", addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: YEAR_SECONDS });
      return blob.url;
    },
    async uploadsSince(wallet, since) {
      const { blobs } = await list({ prefix: `${LOG_PREFIX}${wallet}/`, limit: 100, token });
      const old = blobs.filter((blob) => blob.uploadedAt.getTime() < since);
      if (old.length > 0) await del(old.map((blob) => blob.url), { token }).catch(() => undefined);
      return blobs.length - old.length;
    },
    async noteUpload(wallet, at) {
      await put(`${LOG_PREFIX}${wallet}/${at}.txt`, "1", { access: "public", token, contentType: "text/plain", addRandomSuffix: true, cacheControlMaxAge: 60 });
    },
  };
}

/** Images and counts in this process's memory: the e2e builds' and the unit tests' store, which never uploads anywhere. */
export function memoryStore(host: string): ImageStore & { stored: ReadonlyMap<string, Uint8Array> } {
  const stored = new Map<string, Uint8Array>();
  const uploads = new Map<string, number[]>();
  return {
    stored,
    async save(hash, webp) {
      stored.set(hash, webp);
      return tokenImageUrl(hash, host);
    },
    async uploadsSince(wallet, since) {
      const recent = (uploads.get(wallet) ?? []).filter((at) => at >= since);
      uploads.set(wallet, recent);
      return recent.length;
    },
    async noteUpload(wallet, at) {
      uploads.set(wallet, [...(uploads.get(wallet) ?? []), at]);
    },
  };
}

let memory: ImageStore | null = null;

/**
 * This deployment's store: none where Launch is off; in memory in the e2e
 * builds (the stub wallet's, never production), whatever keys are set;
 * otherwise the Blob store, once the owner has connected one
 * (BLOB_READ_WRITE_TOKEN). Without it uploads answer "closed".
 */
export function imageStore(host: string): ImageStore | null {
  if (tonkMode() === "off") return null;
  if (process.env.NEXT_PUBLIC_WALLET_STUB === "1") return (memory ??= memoryStore(host));
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  return token ? blobStore(token) : null;
}
