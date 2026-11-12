import { verifyMessage } from "viem";
import { DEFAULT_LOCALE, isLocale } from "@/shared/i18n/config";
import { DICTIONARIES } from "@/shared/i18n/dictionaries";
import { IMAGE_TYPES, MAX_IMAGE_BYTES, signedRecently, tokenImageHash, UPLOADS_PER_HOUR, uploadMessage } from "../image";
import { isInvited } from "../invites";
import { type ImageRefusal, TonkError } from "./client";
import { reencode, sha256, UnreadableImage } from "./image-encode";
import type { ImageStore } from "./image-store";

/** What an upload is checked against. */
export interface UploadContext {
  store: ImageStore;
  /** The configured image host: the stored image's address must be on it. */
  host: string;
  /** The site the request reached (its Host): the one the signed message must name. */
  site: string;
  /** The guarded launch's invite list, or null while Launch is open to every wallet. */
  invites: ReadonlySet<string> | null;
  hidden: ReadonlySet<string>;
  now: number;
}

export interface UploadResult {
  url: string;
  hash: string;
}

const HOUR_MS = 60 * 60_000;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const SIGNATURE = /^0x[0-9a-fA-F]{130}$/;
const refuse = (code: ImageRefusal | "invalid" | "invite" | "closed", status: number) => new TonkError(code, `image upload: ${code}`, status);

/**
 * One token image upload, POST /api/tonk/image as multipart form data: the
 * file, the uploader's wallet, when they signed, their signature and the
 * language of the message they signed. In order:
 *
 * 1. Its type and size: PNG, JPEG, WebP or GIF, up to 2 MB.
 * 2. Its signature: the wallet signed this site, itself, this exact file's
 *    SHA-256 and a time within the last five minutes (EIP-191, checked with
 *    viem), so it can't be replayed for another image, wallet or site.
 * 3. While Launch is invite-only, only an invited wallet may upload.
 * 4. Ten uploads per wallet per hour, counted before the image is decoded.
 * 5. Re-encoded to a 512 × 512 WebP with nothing else kept; nothing is stored
 *    unless it decodes, nor an image on the owner's hide list.
 */
export async function uploadImage(form: FormData, ctx: UploadContext): Promise<UploadResult> {
  const [file, wallet, time, signature, lang] = ["file", "wallet", "time", "signature", "lang"].map((key) => form.get(key));
  if (!(file instanceof Blob) || typeof wallet !== "string" || !ADDRESS.test(wallet) || typeof time !== "string" || typeof signature !== "string" || !SIGNATURE.test(signature)) throw refuse("invalid", 400);
  if (file.size > MAX_IMAGE_BYTES) throw refuse("size", 413);
  if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) throw refuse("type", 415);
  if (!signedRecently(time, ctx.now)) throw refuse("expired", 401);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const locale = typeof lang === "string" && isLocale(lang) ? lang : DEFAULT_LOCALE;
  const message = uploadMessage(DICTIONARIES[locale].tokenImage.message, { site: ctx.site, wallet, hash: sha256(bytes), time });
  const signed = await verifyMessage({ address: wallet as `0x${string}`, message, signature: signature as `0x${string}` }).catch(() => false);
  if (!signed) throw refuse("signature", 401);
  if (!isInvited(wallet, ctx.invites)) throw refuse("invite", 403);

  const uploader = wallet.toLowerCase();
  if ((await ctx.store.uploadsSince(uploader, ctx.now - HOUR_MS)) >= UPLOADS_PER_HOUR) throw refuse("limit", 429);
  await ctx.store.noteUpload(uploader, ctx.now);

  const { webp, hash } = await reencode(bytes).catch((error: unknown) => {
    throw error instanceof UnreadableImage ? refuse("unreadable", 422) : error;
  });
  if (ctx.hidden.has(hash)) throw refuse("hidden", 422);
  const url = await ctx.store.save(hash, webp);
  // A store on another host than the one the app shows would store images nobody sees: not set up yet.
  if (tokenImageHash(url, ctx.host) !== hash) throw refuse("closed", 404);
  return { url, hash };
}
