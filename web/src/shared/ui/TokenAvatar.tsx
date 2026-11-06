import Image from "next/image";
import type { LaunchpadId } from "@/shared/types/launchpad";
import { PadMark } from "./PadMark";

interface TokenAvatarProps {
  art: string;
  pad: LaunchpadId;
}

/** 40 px token art with its launchpad mark tucked into the bottom-right corner. */
export function TokenAvatar({ art, pad }: TokenAvatarProps) {
  return (
    <span className="relative block size-11 flex-none">
      <Image src={art} alt="" width={40} height={40} className="size-10 rounded-xl" />
      <PadMark pad={pad} size={18} ring="var(--surface)" className="absolute left-[26px] top-[26px]" />
    </span>
  );
}
