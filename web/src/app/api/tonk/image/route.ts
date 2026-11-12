import { overLimit } from "@/shared/lib/rate-limit";
import { hiddenImages, imageHost, MAX_IMAGE_BYTES } from "@/shared/tonk/image";
import { launchInvites } from "@/shared/tonk/invites";
import { TonkError } from "@/shared/tonk/server/client";
import { imageStore } from "@/shared/tonk/server/image-store";
import { uploadImage } from "@/shared/tonk/server/image-upload";
import { tonkErrorResponse, tonkJson } from "@/shared/tonk/server/respond";

/** The form around a 2 MB file: its fields and boundaries take far less than this. */
const MAX_BODY = MAX_IMAGE_BYTES + 64 * 1024;

/**
 * A creator's token image: POST /api/tonk/image (multipart: file, wallet,
 * time, signature, lang). Checked, re-encoded and stored by
 * shared/tonk/server/image-upload.ts; the answer is the image's address.
 * Closed where Launch is off, and until the owner's Blob store and image
 * host are set.
 */
export async function POST(request: Request) {
  const limited = overLimit(request, "tonkImage");
  if (limited) return limited;
  try {
    const host = imageHost();
    const store = host ? imageStore(host) : null;
    if (!host || !store) throw new TonkError("closed", "token images aren't set up", 404);
    if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY) throw new TonkError("size", "too large", 413);
    const form = await request.formData().catch(() => null);
    const site = request.headers.get("host");
    if (!form || !site) throw new TonkError("invalid", "not a form", 400);
    return tonkJson(await uploadImage(form, { store, host, site, invites: launchInvites(), hidden: hiddenImages(), now: Date.now() }));
  } catch (error) {
    return tonkErrorResponse(error);
  }
}
