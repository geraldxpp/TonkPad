"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { rememberReferrer } from "@/shared/tonk/referral";

/** Remembers the referrer in `?ref=` on this device, on whichever page a visitor lands. It renders nothing. */
export function ReferralCapture({ chainId }: { chainId: number }) {
  const ref = useSearchParams().get("ref");
  useEffect(() => {
    rememberReferrer(window.localStorage, chainId, ref);
  }, [chainId, ref]);
  return null;
}
