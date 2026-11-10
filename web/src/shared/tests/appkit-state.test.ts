import { describe, expect, it } from "vitest";
import { type AppKitView, sameSnapshot, toSnapshot } from "@/shared/wallet/appkit-state";

const SOL = "FLRettWhwj1oyn19GMQVF3xdGUtgZft4mRXBHTuWSuCv";
const RH = "0x7a5e00000000000000000000000000000000c0de";

const view = (patch: Partial<AppKitView> = {}): AppKitView => ({
  initialized: true,
  open: false,
  activeNamespace: "solana",
  accounts: { solana: undefined, eip155: undefined },
  ...patch,
});

describe("AppKit state → wallet snapshot", () => {
  it("is disconnected and settled once AppKit is set up with no session", () => {
    expect(toSnapshot(view())).toEqual({ active: null, accounts: {}, pending: false });
  });

  it("stays pending until AppKit is set up, while its picker is open and while a session comes back", () => {
    expect(toSnapshot(view({ initialized: false })).pending).toBe(true);
    expect(toSnapshot(view({ open: true })).pending).toBe(true);
    expect(toSnapshot(view({ accounts: { solana: { isConnected: false, status: "reconnecting" }, eip155: undefined } })).pending).toBe(true);
    expect(toSnapshot(view({ accounts: { solana: undefined, eip155: { isConnected: false, status: "connecting" } } })).pending).toBe(true);
  });

  it("maps each namespace to its chain and follows AppKit's active one", () => {
    const both = { solana: { isConnected: true, address: SOL, status: "connected" }, eip155: { isConnected: true, address: RH, status: "connected" } };
    expect(toSnapshot(view({ accounts: both }))).toEqual({ active: "sol", accounts: { sol: SOL, rh: RH }, pending: false });
    expect(toSnapshot(view({ accounts: both, activeNamespace: "eip155" })).active).toBe("rh");
  });

  it("falls back to the connected chain when the active namespace has no account", () => {
    const evmOnly = { solana: { isConnected: false, status: "disconnected" }, eip155: { isConnected: true, address: RH, status: "connected" } };
    expect(toSnapshot(view({ accounts: evmOnly, activeNamespace: "solana" }))).toEqual({ active: "rh", accounts: { rh: RH }, pending: false });
  });

  it("ignores an account marked connected without an address", () => {
    expect(toSnapshot(view({ accounts: { solana: { isConnected: true }, eip155: undefined } })).accounts).toEqual({});
  });

  it("compares snapshots by what they show", () => {
    const a = toSnapshot(view({ accounts: { solana: { isConnected: true, address: SOL }, eip155: undefined } }));
    expect(sameSnapshot(a, { active: "sol", accounts: { sol: SOL }, pending: false })).toBe(true);
    expect(sameSnapshot(a, { ...a, pending: true })).toBe(false);
    expect(sameSnapshot(a, { active: "sol", accounts: { sol: SOL, rh: RH }, pending: false })).toBe(false);
  });
});
