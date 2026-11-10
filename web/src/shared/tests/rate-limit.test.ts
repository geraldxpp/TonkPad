// @vitest-environment node
// The swap routes load the server engine, which needs Node's own Uint8Array.
import { describe, expect, it } from "vitest";
import { POST as build } from "@/app/api/swap/build/route";
import { GET as quote } from "@/app/api/swap/quote/route";
import { POST as send } from "@/app/api/swap/send/route";
import { GET as status } from "@/app/api/swap/status/route";
import { GET as token } from "@/app/api/swap/token/route";
import { GET as balances } from "@/app/api/wallet/[chain]/[owner]/route";
import { ALLOWANCES, clientAddress, createLimiter, overLimit, type RouteGroup } from "@/shared/lib/rate-limit";

const from = (headers: Record<string, string>) => new Request("http://localhost/api/swap/quote", { headers });

describe("a client's allowance", () => {
  it("lets a burst through, then says how long to wait, and earns requests back over time", () => {
    let time = 0;
    const take = createLimiter({ burst: 3, perSecond: 0.5 }, () => time);
    expect([take("a"), take("a"), take("a")]).toEqual([0, 0, 0]);
    expect(take("a")).toBe(2);
    expect(take("b")).toBe(0);
    time = 2_000;
    expect(take("a")).toBe(0);
    expect(take("a")).toBe(2);
  });

  it("forgets the longest-known client once it remembers 10,000 busy ones", () => {
    const take = createLimiter({ burst: 1, perSecond: 0.001 }, () => 0);
    expect(take("first")).toBe(0);
    expect(take("first")).toBeGreaterThan(0);
    for (let i = 1; i < 10_000; i++) take(`client-${i}`);
    expect(take("newcomer")).toBe(0);
    expect(take("first")).toBe(0);
  });
});

describe("the client's address", () => {
  it("reads Vercel's headers, preferring x-real-ip, else the first x-forwarded-for hop", () => {
    expect(clientAddress(from({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.1" }))).toBe("203.0.113.7");
    expect(clientAddress(from({ "x-forwarded-for": "198.51.100.1, 10.0.0.1" }))).toBe("198.51.100.1");
    expect(clientAddress(from({ "x-real-ip": "::ffff:203.0.113.7" }))).toBe("203.0.113.7");
  });

  it("counts an IPv6 client by its /64, however it writes its address", () => {
    expect(clientAddress(from({ "x-real-ip": "2001:db8:a:b:1111:2222:3333:4444" }))).toBe("2001:db8:a:b::/64");
    expect(clientAddress(from({ "x-real-ip": "2001:DB8:A:B::9" }))).toBe("2001:db8:a:b::/64");
    expect(clientAddress(from({ "x-real-ip": "2001:db8::1" }))).toBe("2001:db8:0:0::/64");
  });

  it("leaves local requests and ones without an address unlimited", () => {
    for (const address of ["127.0.0.1", "::1", "::ffff:127.0.0.1", "localhost"]) expect(clientAddress(from({ "x-real-ip": address }))).toBeNull();
    expect(clientAddress(from({}))).toBeNull();
  });
});

describe("the limit on a route group", () => {
  it("refuses with a 429 that's never cached and says when to retry", async () => {
    const request = from({ "x-real-ip": "198.51.100.20" });
    for (let i = 0; i < ALLOWANCES.build.burst; i++) expect(overLimit(request, "build")).toBeNull();
    const refused = overLimit(request, "build");
    expect(refused?.status).toBe(429);
    expect(refused?.headers.get("cache-control")).toBe("no-store");
    expect(Number(refused?.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await refused?.json()).toEqual({ error: "busy" });
    expect(overLimit(from({ "x-real-ip": "198.51.100.21" }), "build")).toBeNull();
    expect(overLimit(from({ "x-real-ip": "198.51.100.20" }), "quote")).toBeNull();
  });

  it("never limits local requests", () => {
    for (let i = 0; i < 100; i++) expect(overLimit(from({ "x-forwarded-for": "::1" }), "build")).toBeNull();
  });
});

/** Each route, called with a request it refuses before reaching any provider. */
const ROUTES: [string, RouteGroup, (ip: string) => Promise<Response>][] = [
  ["/api/swap/quote", "quote", (ip) => quote(new Request("http://x/api/swap/quote?chain=eth", { headers: { "x-real-ip": ip } }))],
  ["/api/swap/build", "build", (ip) => build(new Request("http://x/api/swap/build", { method: "POST", body: "{}", headers: { "x-real-ip": ip } }))],
  ["/api/swap/send", "send", (ip) => send(new Request("http://x/api/swap/send", { method: "POST", body: "{}", headers: { "x-real-ip": ip } }))],
  ["/api/swap/status", "status", (ip) => status(new Request("http://x/api/swap/status?chain=eth", { headers: { "x-real-ip": ip } }))],
  ["/api/swap/token", "token", (ip) => token(new Request("http://x/api/swap/token?chain=eth", { headers: { "x-real-ip": ip } }))],
  [
    "/api/wallet/[chain]/[owner]",
    "balances",
    (ip) => balances(new Request("http://x/api/wallet/eth/nobody", { headers: { "x-real-ip": ip } }), { params: Promise.resolve({ chain: "eth", owner: "nobody" }) }),
  ],
];

describe.each(ROUTES)("%s", (_, group, call) => {
  it(`allows ${group}'s burst from one client, then refuses with a 429`, async () => {
    const ip = `192.0.2.${ROUTES.findIndex(([, g]) => g === group) + 1}`;
    for (let i = 0; i < ALLOWANCES[group].burst; i++) expect((await call(ip)).status).not.toBe(429);
    expect((await call(ip)).status).toBe(429);
  });
});
