import {
  AddressLookupTableAccount,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { SOL_MINT, USDC_MINT } from "../tokens";
import { SwapError } from "./config";
import type { JupBuild, JupInstruction } from "./jupiter";

const TOKEN_PROGRAM = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ATA_PROGRAM = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const COMPUTE_BUDGET = "ComputeBudget111111111111111111111111111111";
/** Extra compute for the fee transfer the app adds to Jupiter's route. */
const FEE_COMPUTE_UNITS = 20_000;
/** Solana's packet limit: a serialized transaction can't be larger. */
export const MAX_TX_BYTES = 1_232;
/** The least SOL a new (empty) system account can receive: transfers below it to an empty fee wallet fail. */
export const RENT_EXEMPT_MIN = BigInt(890_880);

/** tonkfun.fun's fee on a Solana swap: SOL or USDC, from the input before the route or the output after it. */
export interface SolanaFee {
  side: "in" | "out";
  mint: string;
  amount: bigint;
  wallet: string;
}

/** Which side pays the fee: the input when it's SOL or USDC, else the output when that is; null for token-to-token. */
export function feeSide(inputMint: string, outputMint: string): { side: "in" | "out"; mint: string } | null {
  const fee = (mint: string) => mint === SOL_MINT || mint === USDC_MINT;
  if (fee(inputMint)) return { side: "in", mint: inputMint };
  if (fee(outputMint)) return { side: "out", mint: outputMint };
  return null;
}

/** A wallet's associated account for a classic SPL mint. */
export function associatedAccount(owner: string, mint: string): PublicKey {
  return PublicKey.findProgramAddressSync([new PublicKey(owner).toBuffer(), TOKEN_PROGRAM.toBuffer(), new PublicKey(mint).toBuffer()], ATA_PROGRAM)[0];
}

const toInstruction = (ix: JupInstruction) =>
  new TransactionInstruction({
    programId: new PublicKey(ix.programId),
    keys: ix.accounts.map((account) => ({ pubkey: new PublicKey(account.pubkey), isSigner: account.isSigner, isWritable: account.isWritable })),
    data: Buffer.from(ix.data, "base64"),
  });

/** The fee as one instruction: a SOL transfer, or a USDC TransferChecked between the two associated accounts. */
function feeInstruction(fee: SolanaFee, taker: string): TransactionInstruction {
  const from = new PublicKey(taker);
  if (fee.mint === SOL_MINT) return SystemProgram.transfer({ fromPubkey: from, toPubkey: new PublicKey(fee.wallet), lamports: fee.amount });
  const data = Buffer.alloc(10);
  data.writeUInt8(12, 0); // TransferChecked
  data.writeBigUInt64LE(fee.amount, 1);
  data.writeUInt8(6, 9); // USDC decimals
  return new TransactionInstruction({
    programId: TOKEN_PROGRAM,
    keys: [
      { pubkey: associatedAccount(taker, fee.mint), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(fee.mint), isSigner: false, isWritable: false },
      { pubkey: associatedAccount(fee.wallet, fee.mint), isSigner: false, isWritable: true },
      { pubkey: from, isSigner: true, isWritable: false },
    ],
    data,
  });
}

/** Jupiter's compute limit plus room for the fee transfer. */
function withFeeCompute(ix: JupInstruction): JupInstruction {
  const data = Buffer.from(ix.data, "base64");
  if (ix.programId !== COMPUTE_BUDGET || data[0] !== 2 || data.length < 5) return ix;
  const next = Buffer.from(data);
  next.writeUInt32LE(Math.min(1_400_000, data.readUInt32LE(1) + FEE_COMPUTE_UNITS), 1);
  return { ...ix, data: next.toString("base64") };
}

/** The network cost in lamports: one signature, the priority fee (limit × price) and any landing tip. */
export function networkFee(build: JupBuild): bigint {
  let units = BigInt(200_000);
  let microLamports = BigInt(0);
  for (const ix of build.computeBudgetInstructions) {
    const data = Buffer.from(ix.data, "base64");
    if (data[0] === 2 && data.length >= 5) units = BigInt(data.readUInt32LE(1));
    if (data[0] === 3 && data.length >= 9) microLamports = data.readBigUInt64LE(1);
  }
  let tip = BigInt(0);
  if (build.tipInstruction) {
    const data = Buffer.from(build.tipInstruction.data, "base64");
    if (data.length >= 12 && data.readUInt32LE(0) === 2) tip = data.readBigUInt64LE(4);
  }
  return BigInt(5_000) + (units * microLamports) / BigInt(1_000_000) + tip;
}

/**
 * The unsigned v0 transaction: compute budget, an input-side fee, Jupiter's
 * setup, swap and cleanup (which unwraps SOL), an output-side fee, then any
 * tip. Base64, for the wallet to sign. Throws when it doesn't fit.
 */
export function assembleSolanaTransaction(build: JupBuild, taker: string, fee: SolanaFee | null): string {
  const feeIx = fee && fee.amount > BigInt(0) ? feeInstruction(fee, taker) : null;
  const instructions = [
    ...build.computeBudgetInstructions.map((ix) => toInstruction(feeIx ? withFeeCompute(ix) : ix)),
    ...(feeIx && fee?.side === "in" ? [feeIx] : []),
    ...build.setupInstructions.map(toInstruction),
    toInstruction(build.swapInstruction),
    ...(build.cleanupInstruction ? [toInstruction(build.cleanupInstruction)] : []),
    ...build.otherInstructions.map(toInstruction),
    ...(feeIx && fee?.side === "out" ? [feeIx] : []),
    ...(build.tipInstruction ? [toInstruction(build.tipInstruction)] : []),
  ];
  const tables = Object.entries(build.lookupTables).map(
    ([key, addresses]) =>
      new AddressLookupTableAccount({
        key: new PublicKey(key),
        state: {
          deactivationSlot: BigInt("18446744073709551615"),
          lastExtendedSlot: 0,
          lastExtendedSlotStartIndex: 0,
          addresses: addresses.map((address) => new PublicKey(address)),
        },
      }),
  );
  const message = new TransactionMessage({
    payerKey: new PublicKey(taker),
    recentBlockhash: new PublicKey(Uint8Array.from(build.blockhash)).toBase58(),
    instructions,
  }).compileToV0Message(tables);
  let bytes: Uint8Array;
  try {
    bytes = new VersionedTransaction(message).serialize();
  } catch {
    throw new SwapError("no-route", "solana: transaction too large");
  }
  // web3.js serializes past the packet limit without complaint; the network would refuse it.
  if (bytes.length > MAX_TX_BYTES) throw new SwapError("no-route", "solana: transaction too large");
  return Buffer.from(bytes).toString("base64");
}
