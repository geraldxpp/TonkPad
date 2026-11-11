import type { ChainId } from "@/shared/types/chain";
import type { PortfolioAsset } from "./types";

/**
 * One CSV cell. Token names are written by whoever made the token, and a
 * spreadsheet runs a cell that starts with = + - or @ as a formula, so text
 * like that is quoted out with a leading apostrophe. Numbers are left alone.
 */
export function csvCell(value: string | number): string {
  if (typeof value === "number") return String(value);
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

export interface CsvLabels {
  asset: string;
  ticker: string;
  network: string;
  address: string;
  quantity: string;
  price: string;
  value: string;
  change: string;
}

/** The holdings on screen as a spreadsheet. */
export function holdingsCsv(assets: readonly PortfolioAsset[], labels: CsvLabels, chainName: (chain: ChainId) => string): string {
  const header = [labels.asset, labels.ticker, labels.network, labels.address, labels.quantity, labels.price, labels.value, labels.change].map(csvCell).join(",");
  const rows = assets.map((asset) =>
    [csvCell(asset.name), csvCell(asset.symbol), csvCell(chainName(asset.chain)), csvCell(asset.native ? "" : asset.address), csvCell(asset.balance), csvCell(asset.priceUsd ?? ""), csvCell(asset.valueUsd === null ? "" : Number(asset.valueUsd.toFixed(2))), csvCell(asset.change.h24 ?? "")].join(","),
  );
  return [header, ...rows].join("\r\n") + "\r\n";
}

/** Saves text as a file in the browser. */
export function downloadText(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
