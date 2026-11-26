/**
 * Phone numbers written the local way (secrets-contacts.ts maskContacts):
 * WhatsApp links, trunk-0 mobiles, parenthesised area codes, French
 * five-pair numbers, and digit runs right after a phone word in the 12
 * languages ("tel 5551234567", "mi número es 612 345 678", "电话
 * 13812345678"). A run of digits beside no phone word and in none of these
 * shapes stays: it is far more often an amount, a block or a date.
 */

/**
 * Words that say a number is a phone number (regular-expression sources with
 * no capturing groups; a space stands for any run of spaces). Never a bare "number" (en), and
 * no word as common as "line" or "text": "the number 1000000000 is the max
 * supply" is an amount.
 */
const PHONE_WORDS = [
  "phone", "telephone", "tel", "cell", "mobile", "call", "whatsapp", "whats app", "wa", "wapp", "viber", "zalo", "sms",
  "tel[ée]fono", "n[úu]mero", "ll[áa]ma(?:me)?", "celular", "cel", "m[óo]vil", "wsp",
  "telefone", "zap", "whats", "ligar?", "ligue",
  "t[ée]l[ée]phone", "t[ée]l", "appel(?:le|ez)", "portable", "num[ée]ro",
  "telefon", "handy", "handynummer", "telefonnummer", "ruf", "anrufen",
  "numaram", "telefonum",
  "điện thoại", "đt", "sđt", "gọi",
  "telepon", "telp", "nomor hp", "no hp", "nomor wa", "no wa",
  "телефон", "тел", "номер телефона", "позвони(?:те)?", "звони(?:те)?", "вотсап", "ватсап",
];
/** The same in scripts without spaces: matched anywhere, as words.ts does. */
const PHONE_WORDS_CJK = ["电话", "電話", "手机", "手機", "微信", "携帯", "전화", "연락처", "핸드폰", "휴대폰", "카톡"];

/**
 * Digits with at most one space or hyphen between them, an area code in
 * brackets allowed: the run a phone word introduces. No dots, so a price
 * ("0.00001234") is never one; dotted numbers have their own shapes (NANP,
 * the French pairs).
 */
const RUN = "(?:\\(\\d{1,4}\\)[ \\u00A0-]?)?\\+?\\d(?:[ \\u00A0-]?\\d){6,14}";
/** Never the start of an amount ("0.5"), nor the middle of a longer run. */
const END = "(?![\\p{L}\\p{N}]|[.,]\\d)";
/** Up to three short words and some punctuation between the phone word and the number ("call me on", "es", "мне"). */
const GAP = "((?:[\\s:：,.-]+\\p{L}{1,8}){0,3}[\\s:：,.\\-#№]*)";

const AFTER_WORD = new RegExp(`(?<![\\p{L}\\p{N}_])((?:${PHONE_WORDS.map((w) => w.replace(/ /g, "\\s+")).join("|")}))${GAP}(${RUN})${END}`, "giu");
const AFTER_CJK = new RegExp(`((?:${PHONE_WORDS_CJK.join("|")}))${GAP}(${RUN})${END}`, "gu");
/** wa.me/<digits>, and a phone= query (api.whatsapp.com/send?phone=…). */
const WHATSAPP = /(?<=(?:\bwa\.me\/|[?&]phone=))\+?\d{6,15}(?!\d)/giu;
/** A trunk 0, then 9 to 12 digits in one run, beside no dot or comma: 081234567890, 07911123456. */
const TRUNK_MOBILE = /(?<![\p{L}\p{N}+.,-])0\d{9,12}(?![\p{L}\p{N}]|[.,]\d)/gu;
/** A parenthesised area code: (11) 91234-5678. */
const AREA_CODE = /(?<![\p{L}\p{N}])\(\d{2,4}\)[ .-]?\d{4,5}[ .-]?\d{4}(?![\p{L}\p{N}]|[.,]\d)/gu;
/** France's five pairs after a trunk 0: 06 12 34 56 78. */
const PAIRS = /(?<![\p{L}\p{N}+.,-])0[1-9](?:[ .-]\d{2}){4}(?![\p{L}\p{N}]|[.,-]\d)/gu;
/** "or", "/" and the like: a second number right after a masked one is a phone number too ("call me on … or 98765 43210"). */
const JOINS = ["or", "and", "/", "o", "y", "ou", "e", "oder", "und", "или", "и", "veya", "hoặc", "atau", "或", "또는"];

const digits = (text: string) => text.replace(/\D/g, "").length;
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The text with the local phone formats above replaced by `mask`. */
export function maskLocalPhones(text: string, mask: string): string {
  const keepWord = (match: string, word: string, gap: string, run: string) => (digits(run) >= 7 && digits(run) <= 15 ? `${word}${gap}${mask}` : match);
  const chained = new RegExp(`(${escape(mask)}\\s*(?:${JOINS.map(escape).join("|")})\\s*)(${RUN})${END}`, "giu");
  return text
    .replace(WHATSAPP, mask)
    .replace(AFTER_WORD, keepWord)
    .replace(AFTER_CJK, keepWord)
    .replace(AREA_CODE, mask)
    .replace(TRUNK_MOBILE, mask)
    .replace(PAIRS, mask)
    .replace(chained, (match, lead: string, run: string) => (digits(run) >= 7 && digits(run) <= 15 ? `${lead}${mask}` : match));
}
