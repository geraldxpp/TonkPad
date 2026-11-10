import { createServer } from "node:http";
import { toFunctionSelector } from "viem";
import { FIXTURE_LAUNCHPAD, STUB_BALANCE, STUB_WALLET, TESTNET_RPC_PORT } from "./fixtures";

/**
 * A local JSON-RPC stand-in for Robinhood Chain Testnet: the chain id, the
 * gas price, a wallet's balance, and the launchpad's four settings. Anything
 * else is refused, so a test can't simulate or send a launch through it.
 */
const hex = (value: string | number) => `0x${BigInt(value).toString(16)}`;
const word = (value: string | number) => `0x${BigInt(value).toString(16).padStart(64, "0")}`;

const CALLS: Record<string, string> = {
  [toFunctionSelector("function launchFee()")]: word(FIXTURE_LAUNCHPAD.launchFee),
  [toFunctionSelector("function defaultVirtualEth()")]: word(FIXTURE_LAUNCHPAD.virtualEth),
  [toFunctionSelector("function defaultVirtualTokens()")]: word(FIXTURE_LAUNCHPAD.virtualTokens),
  [toFunctionSelector("function paused()")]: word(0),
};

function answer(method: string, params: unknown[]): string {
  if (method === "eth_chainId") return hex(FIXTURE_LAUNCHPAD.chainId);
  if (method === "eth_gasPrice") return hex(FIXTURE_LAUNCHPAD.gasPrice);
  if (method === "eth_getBalance") return hex(String(params[0]).toLowerCase() === STUB_WALLET ? STUB_BALANCE : 0);
  if (method === "eth_call") {
    const result = CALLS[String((params[0] as { data?: string }).data).slice(0, 10)];
    if (result) return result;
  }
  throw new Error(`unexpected ${method}`);
}

interface Call {
  id: number;
  method: string;
  params: unknown[];
}

function reply({ id, method, params }: Call) {
  try {
    return { jsonrpc: "2.0", id, result: answer(method, params ?? []) };
  } catch (error) {
    return { jsonrpc: "2.0", id, error: { code: -32601, message: String(error) } };
  }
}

const server = createServer((request, response) => {
  const json = (body: unknown) => response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(body));
  if (request.method === "GET" && request.url === "/health") return json({ ok: true });
  let body = "";
  request.on("data", (chunk) => (body += chunk));
  request.on("end", () => {
    try {
      const calls = JSON.parse(body) as Call | Call[];
      json(Array.isArray(calls) ? calls.map(reply) : reply(calls));
    } catch {
      json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } });
    }
  });
});

server.listen(TESTNET_RPC_PORT, "127.0.0.1");
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => server.close(() => process.exit(0)));
