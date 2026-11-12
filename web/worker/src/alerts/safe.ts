import { decodeFunctionData, formatEther, formatUnits } from "viem";
import { OWNER_CALLS, SAFE_ABI } from "./abi";
import { type Alert, type AlertContext, eth, nameOf, short, txLink } from "./alert";
import type { ChainEvent } from "./events";
import type { SafeChange } from "./safe-events";
import { type Address, type Hex, lower, type RawTx } from "./types";

/** One call a Safe made. */
export interface SafeCall {
  to: Address;
  value: bigint;
  data: Hex;
  operation: number;
}

const MULTI_SEND = "0x8d80ff0a";

/** A MultiSend batch's calls (Safe{Wallet}'s batches): each is 1 byte operation, 20 to, 32 value, 32 length, then data. */
export function expandMultiSend(call: SafeCall): SafeCall[] {
  if (call.operation !== 1 || !call.data.startsWith(MULTI_SEND)) return [call];
  let packed: string;
  try {
    packed = (decodeFunctionData({ abi: SAFE_ABI, data: call.data }).args?.[0] as Hex).slice(2);
  } catch {
    return [call];
  }
  const calls: SafeCall[] = [];
  for (let at = 0; at + 170 <= packed.length && calls.length < 50; ) {
    const operation = parseInt(packed.slice(at, at + 2), 16);
    const to = lower(`0x${packed.slice(at + 2, at + 42)}`);
    const value = BigInt(`0x${packed.slice(at + 42, at + 106)}`);
    const length = Number(BigInt(`0x${packed.slice(at + 106, at + 170)}`)) * 2;
    if (at + 170 + length > packed.length) break;
    calls.push({ operation, to, value, data: `0x${packed.slice(at + 170, at + 170 + length)}` });
    at += 170 + length;
  }
  return calls.length > 0 ? calls : [call];
}

const tokens = (raw: unknown) => `${Number(formatUnits(BigInt(raw as bigint), 18)).toLocaleString("en-US")} tokens`;

/** A call worded for the owner: `setLaunchFee(0.01 ETH) on the launchpad`. */
export function describeCall(call: SafeCall, ctx: AlertContext): { text: string; ownerOnly: boolean } {
  const target = nameOf(ctx, call.to);
  const sends = call.value > BigInt(0) ? `, sending ${eth(call.value)}` : "";
  const ours = call.to === ctx.launchpad || call.to === ctx.migrator;
  if (!ours) return { text: `a call to ${target}${call.data.length > 2 ? ` (${call.data.slice(0, 10)})` : ""}${sends}`, ownerOnly: false };
  try {
    const { functionName, args = [] } = decodeFunctionData({ abi: OWNER_CALLS, data: call.data });
    const a = args as readonly unknown[];
    const shown: Record<string, () => string> = {
      setLaunchFee: () => `${formatEther(a[0] as bigint)} ETH`,
      setDefaultVirtualReserves: () => `${formatEther(a[0] as bigint)} ETH, ${tokens(a[1])}`,
      setTestnetVirtualReserves: () => `${formatEther(a[0] as bigint)} ETH, ${tokens(a[1])}`,
      excludeAddressFromTokenCrew: () => `${ctx.token(lower(a[0] as string))}, ${lower(a[1] as string)}${a.length > 2 ? `, ${String(a[2])}` : ""}`,
      executePendingMigration: () => ctx.token(lower(a[0] as string)),
    };
    const shownArgs = shown[functionName]?.() ?? a.map((arg) => (typeof arg === "string" ? lower(arg) : String(arg))).join(", ");
    return { text: `${functionName}(${shownArgs}) on ${target}${sends}`, ownerOnly: true };
  } catch {
    return { text: `a call to ${target} (${call.data.slice(0, 10)})${sends}`, ownerOnly: false };
  }
}

/** A plain Safe logs only that it ran; its call is in the transaction's own calldata. */
function callFromTx(tx: RawTx | undefined, safe: Address): SafeCall | null {
  if (!tx || !tx.to || lower(tx.to) !== safe) return null;
  try {
    const { functionName, args } = decodeFunctionData({ abi: SAFE_ABI, data: tx.input as Hex });
    if (functionName !== "execTransaction") return null;
    const [to, value, data, operation] = args;
    return { to: lower(to), value, data, operation };
  } catch {
    return null;
  }
}

/** How each change to the Safe reads: its title, and the line before its subject. */
const CHANGES: Record<SafeChange, [string, string]> = {
  addedOwner: ["added a signer", "New signer:"],
  removedOwner: ["removed a signer", "Removed signer:"],
  changedThreshold: ["changed its threshold", "Signatures now needed:"],
  enabledModule: ["enabled a module", "A module can act without the signers:"],
  disabledModule: ["disabled a module", "Disabled module:"],
  changedGuard: ["changed its transaction guard", "Guard:"],
  changedModuleGuard: ["changed its module guard", "Module guard:"],
  changedFallbackHandler: ["changed its fallback handler", "Fallback handler:"],
};

/**
 * Every transaction an owner Safe runs, with each call it made: owner-only
 * calls on either contract (including setters that log nothing), anything
 * else it did, failures, and changes to the Safe itself (signers, threshold,
 * modules), since whoever controls the Safe controls both contracts.
 */
export function safeAlerts(events: readonly ChainEvent[], txs: ReadonlyMap<string, RawTx>, ctx: AlertContext): Alert[] {
  const byTx = new Map<string, Array<Extract<ChainEvent, { source: "safe" }>>>();
  for (const event of events) if (event.source === "safe") byTx.set(event.tx, [...(byTx.get(event.tx) ?? []), event]);
  const alerts: Alert[] = [];
  for (const [hash, list] of byTx) {
    const safe = list[0].safe;
    const block = list[0].block;
    for (const event of list) {
      if (event.kind !== "safeConfig") continue;
      const [title, lead] = CHANGES[event.change];
      alerts.push({
        key: `safe-config:${hash}:${event.logIndex}`,
        severity: event.change === "enabledModule" ? "critical" : "warning",
        title: `Owner Safe ${short(safe)} ${title}`,
        lines: [`${lead} ${event.subject}. Whoever controls this Safe controls the contracts. Block ${block}.`, txLink(ctx, hash)],
      });
    }
    const logged: SafeCall[] = list.flatMap((e) => (e.kind === "safeTx" || e.kind === "safeModuleTx" ? [{ to: e.to, value: e.value, data: e.data, operation: e.operation }] : []));
    const results = list.flatMap((e) => (e.kind === "safeResult" ? [e] : []));
    if (logged.length === 0 && results.length === 0) continue;
    const plain = logged.length === 0 ? callFromTx(txs.get(hash), safe) : null;
    const calls = (plain ? [plain] : logged).flatMap(expandMultiSend).map((call) => describeCall(call, ctx));
    const failed = results.some((r) => !r.ok);
    const viaModule = list.some((e) => e.kind === "safeModuleTx" || (e.kind === "safeResult" && e.viaModule));
    const touchesUs = calls.some((call) => call.ownerOnly);
    alerts.push({
      key: `safe:${hash}`,
      severity: failed || touchesUs ? "warning" : "info",
      title: `Owner Safe ${failed ? "transaction FAILED" : touchesUs ? "acted on the contracts" : "made a transaction"}`,
      lines: [
        `${short(safe)}${viaModule ? " (through a module)" : ""}, block ${block}:`,
        ...(calls.length > 0 ? calls.slice(0, 8).map((call) => `• ${call.text}`) : ["• a call the watcher couldn't read"]),
        ...(calls.length > 8 ? [`• and ${calls.length - 8} more`] : []),
        txLink(ctx, hash),
      ],
    });
  }
  return alerts;
}
