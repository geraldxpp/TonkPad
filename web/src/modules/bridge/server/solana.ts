import { AddressLookupTableAccount, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import type { RpcCall } from "@/shared/wallet/rpc";
import { BridgeError, isRecord } from "./config";
import type { SolanaInstructions } from "./plan";

/** Solana's packet limit: a serialized transaction can't be larger. */
const MAX_TX_BYTES = 1_232;

async function lookupTable(rpc: RpcCall, address: string): Promise<AddressLookupTableAccount> {
  const info = await rpc("getAccountInfo", [address, { encoding: "base64", commitment: "confirmed" }]);
  const value = isRecord(info) && isRecord(info.value) ? info.value : null;
  const data = value && Array.isArray(value.data) && typeof value.data[0] === "string" ? value.data[0] : null;
  if (!data) throw new BridgeError("unavailable", "solana: lookup table missing");
  return new AddressLookupTableAccount({ key: new PublicKey(address), state: AddressLookupTableAccount.deserialize(Buffer.from(data, "base64")) });
}

/** The unsigned v0 transaction for Relay's deposit, with a fresh blockhash. Base64, for the wallet to sign. */
export async function assembleRelayTransaction(plan: SolanaInstructions, payer: string, rpc: RpcCall): Promise<string> {
  const [blockhash, tables] = await Promise.all([rpc("getLatestBlockhash", [{ commitment: "confirmed" }]), Promise.all(plan.addressLookupTableAddresses.map((address) => lookupTable(rpc, address)))]);
  const recent = isRecord(blockhash) && isRecord(blockhash.value) && typeof blockhash.value.blockhash === "string" ? blockhash.value.blockhash : null;
  if (!recent) throw new BridgeError("unavailable", "solana: no blockhash");
  const instructions = plan.instructions.map(
    (ix) =>
      new TransactionInstruction({
        programId: new PublicKey(ix.programId),
        keys: ix.keys.map((key) => ({ pubkey: new PublicKey(key.pubkey), isSigner: key.isSigner, isWritable: key.isWritable })),
        data: Buffer.from(ix.data, "hex"),
      }),
  );
  const message = new TransactionMessage({ payerKey: new PublicKey(payer), recentBlockhash: recent, instructions }).compileToV0Message(tables);
  const bytes = new VersionedTransaction(message).serialize();
  if (bytes.length > MAX_TX_BYTES) throw new BridgeError("no-route", "solana: transaction too large");
  return Buffer.from(bytes).toString("base64");
}
