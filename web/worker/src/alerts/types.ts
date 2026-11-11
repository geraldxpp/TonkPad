/** A lowercase 0x address. */
export type Address = `0x${string}`;
/** A 0x hex string: data, a hash or a quantity. */
export type Hex = `0x${string}`;

export const ZERO_ADDRESS: Address = "0x0000000000000000000000000000000000000000";

/** A log as eth_getLogs and receipts return it. */
export interface RawLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  transactionHash: string;
  logIndex: string;
}

/** The parts of a receipt the graduation check reads. */
export interface RawReceipt {
  transactionHash: string;
  blockNumber: string;
  status: string;
  from: string;
  to: string | null;
  logs: RawLog[];
}

/** The parts of a transaction the alerts read: its value (refunds) and its calldata (owner calls). */
export interface RawTx {
  hash: string;
  from: string;
  to: string | null;
  value: string;
  input: string;
}

/** Which of the two watched contracts. */
export type Contract = "launchpad" | "migrator";

export const lower = (value: string) => value.toLowerCase() as Address;

/** A hex quantity or block number as a JS number (block numbers stay far below 2^53). */
export const toNumber = (value: string) => Number(BigInt(value));

export const hexOf = (n: number | bigint) => `0x${n.toString(16)}` as Hex;
