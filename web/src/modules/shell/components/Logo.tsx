import Image from "next/image";
import logo from "../assets/tonkpad-logo.png";

interface LogoProps {
  size?: number;
}

/** The Tonkpad.fun emblem: the T in a chain ring with the green lock. */
export function Logo({ size = 40 }: LogoProps) {
  return (
    <Image
      src={logo}
      alt=""
      width={size}
      height={size}
      loading="eager"
      fetchPriority="high"
      className="rounded-full"
      style={{ width: size, height: size }}
    />
  );
}
