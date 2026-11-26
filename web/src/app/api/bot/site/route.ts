import { securityContact } from "@/modules/security/lib/contact";
import { buildKnowledge } from "@/shared/bot/knowledge";
import { overLimit } from "@/shared/lib/rate-limit";
import { launchInvites } from "@/shared/tonk/invites";

/** What the Telegram bot's worker may take from the deployed site, and nothing else. */
interface BotSiteJson {
  v: 1;
  /** This build's knowledge-pack hash: the worker compares it with its own. */
  hash: string;
  /** Whether Launch is invite-only here; never the list. */
  inviteOnly: boolean;
  /** The Security page's contact, or null when it has none. */
  contact: { kind: "email" | "link"; text: string; href: string } | null;
}

/** Every value is fixed when the site is built, so each server instance works them out once. */
let built: BotSiteJson | null = null;

function siteFacts(): BotSiteJson {
  if (!built) {
    const contact = securityContact();
    built = {
      v: 1,
      hash: buildKnowledge().hash,
      inviteOnly: launchInvites() !== null,
      contact: contact ? { kind: contact.kind, text: contact.text, href: contact.href } : null,
    };
  }
  return built;
}

/**
 * GET /api/bot/site: what the Telegram bot adds to the knowledge it builds
 * from its own checkout (prompts/15-community-agent.md, "What the site
 * adds"): this build's knowledge hash, so a worker left on older text is
 * noticed, whether Launch is invite-only, and the Security page's contact.
 */
export async function GET(request: Request): Promise<Response> {
  const limited = overLimit(request, "botSite");
  if (limited) return limited;
  return Response.json(siteFacts(), { headers: { "cache-control": "public, max-age=300" } });
}
