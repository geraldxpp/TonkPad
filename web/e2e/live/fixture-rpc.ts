import { createServer } from "node:http";
import { FIXTURE_HOLDINGS, FIXTURE_RPC_PORT, STUB_WALLET } from "./wallet-fixtures";

/**
 * A local JSON-RPC stand-in for the live e2e run: /sol answers the two
 * Solana reads the balance route makes, /rh the three Robinhood Chain ones.
 * The stub wallets hold FIXTURE_HOLDINGS; any other wallet holds nothing.
 */
type Params = unknown[];
const word = (value: bigint) => `0x${value.toString(16).padStart(64, "0")}`;

function solana(method: string, params: Params): unknown {
  const owner = params[0];
  const mine = owner === STUB_WALLET.sol;
  if (method === "getBalance") return { context: { slot: 1 }, value: mine ? FIXTURE_HOLDINGS.sol.lamports : 0 };
  if (method === "getTokenAccountsByOwner") {
    const { tokens, decimals } = FIXTURE_HOLDINGS.sol;
    const account = { account: { data: { parsed: { info: { tokenAmount: { amount: tokens, decimals } } } } } };
    return { context: { slot: 1 }, value: mine ? [account] : [] };
  }
  throw new Error(`unexpected ${method}`);
}

function robinhood(method: string, params: Params): unknown {
  if (method === "eth_getBalance") return `0x${(String(params[0]).toLowerCase() === STUB_WALLET.rh ? FIXTURE_HOLDINGS.rh.wei : BigInt(0)).toString(16)}`;
  if (method === "eth_call") {
    const { data } = params[0] as { data: string };
    if (data === "0x313ce567") return word(BigInt(FIXTURE_HOLDINGS.rh.decimals));
    const holder = `0x${data.slice(-40)}`;
    return word(holder === STUB_WALLET.rh ? FIXTURE_HOLDINGS.rh.tokens : BigInt(0));
  }
  throw new Error(`unexpected ${method}`);
}

const server = createServer((request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" }).end('{"ok":true}');
    return;
  }
  let body = "";
  request.on("data", (chunk) => (body += chunk));
  request.on("end", () => {
    const answer = request.url === "/sol" ? solana : request.url === "/rh" ? robinhood : null;
    try {
      const { id, method, params } = JSON.parse(body) as { id: number; method: string; params: Params };
      if (!answer) throw new Error("unknown chain");
      response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ jsonrpc: "2.0", id, result: answer(method, params) }));
    } catch (error) {
      response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32600, message: String(error) } }));
    }
  });
});

server.listen(FIXTURE_RPC_PORT, "127.0.0.1");
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => server.close(() => process.exit(0)));
