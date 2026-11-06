import type { LaunchpadId } from "@/shared/types/launchpad";
import { PadMark } from "./PadMark";
import { TokenArt } from "./TokenArt";

interface TokenAvatarProps {
  art: string;
  /** The ticker; its first letter stands in when there is no art. */
  label: string;
  pad: LaunchpadId;
}

/** 40 px token art with its launchpad mark tucked into the bottom-right corner. */
export function TokenAvatar({ art, label, pad }: TokenAvatarProps) {
  return (
    <span className="relative block size-11 flex-none">
      <TokenArt src={art} label={label} size={40} className="size-10 rounded-xl" />
      <PadMark pad={pad} size={18} ring="var(--surface)" className="absolute left-[26px] top-[26px]" />
    </span>
  );
}
