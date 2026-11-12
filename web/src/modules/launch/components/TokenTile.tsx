import { TokenArt } from "@/shared/ui/TokenArt";
import { LETTER_TILE, tokenLetter } from "./types";

interface TokenTileProps {
  form: { name: string; ticker: string; image: string };
  /** Rendered size in px, for the image. */
  size: number;
  /** The tile's box and corners. */
  className: string;
  /** The letter's size, when there is no image. */
  letterClassName: string;
}

/** The token's tile in the studio: its uploaded image, cropped square by the server, else its letter on the brand teal. */
export function TokenTile({ form, size, className, letterClassName }: TokenTileProps) {
  if (form.image) return <TokenArt src={form.image} label={tokenLetter(form)} size={size} brand className={`${className} object-cover`} />;
  return (
    <span aria-hidden="true" className={`${LETTER_TILE} ${className} ${letterClassName}`}>
      {tokenLetter(form)}
    </span>
  );
}
