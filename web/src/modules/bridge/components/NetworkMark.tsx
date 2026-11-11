"use client";

import { cn } from "@/shared/lib/cn";
import { TokenArt } from "@/shared/ui/TokenArt";
import type { BridgeNetwork } from "../lib/networks";

/** A network's round mark: its own logo, or its letter if that won't load. */
export function NetworkMark({ network, size, className }: { network: BridgeNetwork; size: number; className?: string }) {
  return <TokenArt src={network.logo} label={network.name} size={size} className={cn("flex-none rounded-full object-cover", className)} style={{ width: size, height: size }} />;
}
