"use client";

import Image from "next/image";
import { type CSSProperties, useState } from "react";
import { cn } from "@/shared/lib/cn";

interface TokenArtProps {
  /** A path under /public or a remote URL; "" when the token has no art yet. */
  src: string;
  /** The fallback tile shows this text's first letter (the ticker). */
  label: string;
  /** Rendered size in px. */
  size: number;
  alt?: string;
  eager?: boolean;
  className?: string;
  style?: CSSProperties;
}

/**
 * Token art. Remote art (live tokens) is shown as-is, without Next's image
 * optimiser: thousands of new tokens a day would run through its quota, and
 * the worker already points at a resized CDN copy. When there is no art, or
 * it fails to load, a letter tile takes its place.
 */
export function TokenArt({ src, label, size, alt = "", eager = false, className, style }: TokenArtProps) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span
        role={alt ? "img" : undefined}
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : true}
        className={cn("inline-flex items-center justify-center bg-raised font-display font-bold text-text-2", className)}
        style={{ fontSize: Math.round(size * 0.42), ...style }}
      >
        {label.trim().charAt(0).toUpperCase() || "?"}
      </span>
    );
  }
  return (
    <Image
      src={src}
      alt={alt}
      width={size}
      height={size}
      unoptimized={/^https?:\/\//.test(src)}
      loading={eager ? "eager" : undefined}
      onError={() => setFailed(true)}
      className={className}
      style={style}
    />
  );
}
