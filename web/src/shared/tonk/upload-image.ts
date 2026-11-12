import type { Locale } from "@/shared/i18n/config";
import { WalletActionError } from "@/shared/wallet/types";
import { wallet } from "@/shared/wallet/wallet";
import { TonkApiError } from "./api";
import { allowedImage, IMAGE_TYPES, MAX_IMAGE_BYTES, uploadMessage } from "./image";

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

async function sha256Hex(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Why an upload stopped, as the picker words it: the file, the wallet, or the server's code. */
export type UploadProblem = "type" | "size" | "rejected" | "expired" | "signature" | "limit" | "unreadable" | "hidden" | "busy" | "invite" | "closed" | "failed";

const SERVER_CODES: readonly string[] = ["type", "size", "expired", "signature", "limit", "unreadable", "hidden", "busy", "invite", "closed"];

export function problemOf(error: unknown): UploadProblem {
  if (error instanceof WalletActionError) return error.code === "rejected" ? "rejected" : "failed";
  if (error instanceof TonkApiError && SERVER_CODES.includes(error.code)) return error.code as UploadProblem;
  return "failed";
}

/** The file's own type and size, checked before anything is signed. */
export function fileProblem(file: File): UploadProblem | null {
  if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) return "type";
  return file.size > MAX_IMAGE_BYTES ? "size" : null;
}

interface UploadOptions {
  file: File;
  /** The connected Robinhood Chain wallet: it signs, and the server counts its uploads. */
  owner: string;
  lang: Locale;
  /** This language's message template (t.tokenImage.message). */
  template: string;
  /** Called once the wallet has signed, as the file goes up. */
  onSigned?: () => void;
}

/**
 * Uploads a token image: the wallet signs this site, itself, the file's
 * SHA-256 and the time (a message, free, no transaction), and the server
 * checks all of it before it re-encodes and stores the image. Resolves with
 * the stored image's address; throws a WalletActionError or TonkApiError.
 */
export async function uploadTokenImage({ file, owner, lang, template, onSigned }: UploadOptions): Promise<string> {
  const hash = await sha256Hex(file);
  const time = new Date().toISOString();
  const signature = await wallet.signEvmMessage(uploadMessage(template, { site: window.location.host, wallet: owner, hash, time }));
  onSigned?.();
  const form = new FormData();
  form.set("file", file);
  form.set("wallet", owner);
  form.set("time", time);
  form.set("signature", signature);
  form.set("lang", lang);
  let res: Response;
  try {
    res = await fetch("/api/tonk/image", { method: "POST", body: form, cache: "no-store" });
  } catch {
    throw new TonkApiError("unavailable");
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new TonkApiError(record(body) && typeof body.error === "string" ? body.error : "unavailable");
  const url = record(body) ? allowedImage(body.url) : "";
  if (!url) throw new TonkApiError("unavailable");
  return url;
}
