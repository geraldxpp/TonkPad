// @vitest-environment node
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { LiveOverview } from "@/shared/types/live";
import { type Api, startServer } from "../src/server";

const api: Api = {
  list: (query) => ({ rows: [], matched: query.limit, total: 0, updatedAt: 1 }),
  overview: () => ({ updatedAt: 1 }) as LiveOverview,
  shell: () => ({ tape: [], chainCounts: { all: 0, sol: 0, rh: 0 }, status: { solUsd: null, ethUsd: null, rhGasGwei: null }, updatedAt: 1 }),
  health: () => ({ ok: true }),
};

const TOKEN = "test-worker-token";
const server = startServer(0, TOKEN, api);
let base = "";

beforeAll(async () => {
  if (!server.listening) await once(server, "listening");
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
});

const get = (path: string, token?: string) => fetch(base + path, { headers: token ? { "x-worker-token": token } : {} });

describe("worker HTTP server", () => {
  it("keeps /health public for the host's health check", async () => {
    const res = await get("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("serves the data only with the worker token", async () => {
    expect((await get("/v1/shell")).status).toBe(401);
    expect((await get("/v1/shell", "wrong-token")).status).toBe(401);
    const res = await get("/v1/list?limit=20", TOKEN);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ matched: 20 });
  });

  it("answers JSON errors for unknown paths and other methods", async () => {
    expect((await get("/v1/nothing", TOKEN)).status).toBe(404);
    expect((await fetch(`${base}/health`, { method: "POST" })).status).toBe(405);
  });
});
