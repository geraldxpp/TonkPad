// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildKnowledge } from "@/shared/bot/knowledge";

type Contact = { kind: "email" | "link"; text: string; href: string };

/** This build's settings, as the route would read them from the environment. */
const build = vi.hoisted(() => ({ invites: null as ReadonlySet<string> | null, contact: null as Contact | null, contactReads: 0 }));

vi.mock("@/shared/tonk/invites", () => ({ launchInvites: () => build.invites }));
vi.mock("@/modules/security/lib/contact", () => ({
  securityContact: () => {
    build.contactReads += 1;
    return build.contact;
  },
}));

const INVITED = "0xabcdef0123456789abcdef0123456789abcdef01";
const EMAIL: Contact = { kind: "email", text: "security@tonkfun.fun", href: "mailto:security@tonkfun.fun" };
const LINK: Contact = { kind: "link", text: "tonkfun.fun/security-report", href: "https://tonkfun.fun/security-report" };

/** The route on a fresh server instance: it works its answer out once per instance. */
async function serve() {
  vi.resetModules();
  const { GET } = await import("@/app/api/bot/site/route");
  return (headers: Record<string, string> = {}) => GET(new Request("http://localhost/api/bot/site", { headers }));
}

beforeEach(() => {
  build.invites = null;
  build.contact = null;
  build.contactReads = 0;
});

describe("GET /api/bot/site", () => {
  it("answers the pack's hash, whether Launch is invite-only and the contact, and nothing else", async () => {
    const response = await (await serve())();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("cache-control")).toBe("public, max-age=300");
    expect(await response.json()).toEqual({ v: 1, hash: buildKnowledge().hash, inviteOnly: false, contact: null });
  });

  it("says Launch is invite-only without naming anyone invited", async () => {
    build.invites = new Set([INVITED]);
    const response = await (await serve())();
    const text = await response.text();
    expect(JSON.parse(text)).toMatchObject({ inviteOnly: true });
    expect(text.toLowerCase()).not.toContain(INVITED.slice(2));
  });

  it.each([
    ["an e-mail address", EMAIL],
    ["a link", LINK],
  ])("passes the Security page's contact: %s", async (_case, contact) => {
    build.contact = contact;
    expect(await (await (await serve())()).json()).toMatchObject({ contact });
  });

  it("works the answer out once per server instance", async () => {
    const get = await serve();
    const first = await (await get()).json();
    build.contact = EMAIL;
    expect(await (await get()).json()).toEqual(first);
    expect(build.contactReads).toBe(1);
  });

  it("limits each client to its allowance, with a 429 that's never cached", async () => {
    const get = await serve();
    const client = { "x-real-ip": "198.51.100.30" };
    for (let i = 0; i < 10; i++) expect((await get(client)).status).toBe(200);
    const refused = await get(client);
    expect(refused.status).toBe(429);
    expect(refused.headers.get("cache-control")).toBe("no-store");
    expect(Number(refused.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await get({ "x-real-ip": "198.51.100.31" })).status).toBe(200);
  });
});
