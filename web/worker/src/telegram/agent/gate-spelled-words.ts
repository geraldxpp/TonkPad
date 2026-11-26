import type { Locale } from "@/shared/i18n/config";

/**
 * Number words in the languages written with spaces (agent/gate-spelled.ts):
 * zero to twenty, the tens, hundred, thousand, million, billion and half,
 * with the declined and accented forms answers use. Chinese and Japanese
 * numerals, and Korean Sino-Korean ones, are read in gate-spelled.ts.
 */

/** A number word's value, or how it changes the one before it: Vietnamese mươi and Indonesian puluh make it tens, Indonesian belas adds ten. */
export type NumberWord = number | "tens" | "teen";

export interface Lexicon {
  words: ReadonlyMap<string, NumberWord>;
  /** What joins two number words: a space, a hyphen, "and". */
  join: string;
  /** Ten takes a unit after it ("on beş", "mười lăm", "dix sept"). */
  tenTakesUnit: boolean;
  /** French: 70 to 79 and 90 to 99 as sixty or eighty plus ten to nineteen. */
  frenchTeens: boolean;
}

const lexicon = (list: string, join: string, extra: Partial<Pick<Lexicon, "tenTakesUnit" | "frenchTeens">> = {}): Lexicon => {
  const words = new Map<string, NumberWord>();
  for (const entry of list.split("|")) {
    const [word, value] = entry.split("=");
    words.set(word, value === "tens" || value === "teen" ? value : Number(value));
  }
  return { words, join, tenTakesUnit: extra.tenTakesUnit ?? false, frenchTeens: extra.frenchTeens ?? false };
};

/** German 21 to 99 as one word: einundzwanzig … neunundneunzig. */
const GERMAN_TENS: Array<[string, number]> = [["zwanzig", 20], ["dreißig", 30], ["dreissig", 30], ["vierzig", 40], ["fünfzig", 50], ["sechzig", 60], ["siebzig", 70], ["achtzig", 80], ["neunzig", 90]];
const GERMAN_UNITS: Array<[string, number]> = [["ein", 1], ["zwei", 2], ["drei", 3], ["vier", 4], ["fünf", 5], ["sechs", 6], ["sieben", 7], ["acht", 8], ["neun", 9]];
const GERMAN_COMPOUNDS = GERMAN_UNITS.flatMap(([u, a]) => GERMAN_TENS.map(([t, b]) => `${u}und${t}=${a + b}`)).join("|");

export const LEXICONS: Partial<Record<Locale, Lexicon>> = {
  en: lexicon(
    "zero=0|one=1|two=2|three=3|four=4|five=5|six=6|seven=7|eight=8|nine=9|ten=10|eleven=11|twelve=12|thirteen=13|fourteen=14|fifteen=15|sixteen=16|seventeen=17|eighteen=18|nineteen=19|twenty=20|thirty=30|forty=40|fifty=50|sixty=60|seventy=70|eighty=80|ninety=90|hundred=100|thousand=1000|million=1000000|billion=1000000000|half a=0.5|half an=0.5|a half=0.5",
    "(?:-|\\s+and\\s+|\\s+)",
  ),
  es: lexicon(
    "cero=0|uno=1|un=1|una=1|dos=2|tres=3|cuatro=4|cinco=5|seis=6|siete=7|ocho=8|nueve=9|diez=10|once=11|doce=12|trece=13|catorce=14|quince=15|dieciséis=16|dieciseis=16|diecisiete=17|dieciocho=18|diecinueve=19|veinte=20|veintiuno=21|veintiún=21|veintiuna=21|veintidós=22|veintidos=22|veintitrés=23|veintitres=23|veinticuatro=24|veinticinco=25|veintiséis=26|veintiseis=26|veintisiete=27|veintiocho=28|veintinueve=29|treinta=30|cuarenta=40|cincuenta=50|sesenta=60|setenta=70|ochenta=80|noventa=90|cien=100|ciento=100|mil=1000|millón=1000000|millon=1000000|millones=1000000|medio=0.5|media=0.5",
    "(?:\\s+y\\s+|\\s+)",
  ),
  pt: lexicon(
    "zero=0|um=1|uma=1|dois=2|duas=2|três=3|tres=3|quatro=4|cinco=5|seis=6|sete=7|oito=8|nove=9|dez=10|onze=11|doze=12|treze=13|catorze=14|quatorze=14|quinze=15|dezesseis=16|dezasseis=16|dezessete=17|dezassete=17|dezoito=18|dezenove=19|dezanove=19|vinte=20|trinta=30|quarenta=40|cinquenta=50|sessenta=60|setenta=70|oitenta=80|noventa=90|cem=100|cento=100|mil=1000|milhão=1000000|milhao=1000000|milhões=1000000|milhoes=1000000|meio=0.5|meia=0.5",
    "(?:\\s+e\\s+|\\s+)",
  ),
  fr: lexicon(
    "zéro=0|zero=0|un=1|une=1|deux=2|trois=3|quatre=4|cinq=5|six=6|sept=7|huit=8|neuf=9|dix=10|onze=11|douze=12|treize=13|quatorze=14|quinze=15|seize=16|dix-sept=17|dix-huit=18|dix-neuf=19|vingt=20|trente=30|quarante=40|cinquante=50|soixante=60|soixante-dix=70|quatre-vingt=80|quatre-vingts=80|quatre-vingt-dix=90|cent=100|cents=100|mille=1000|million=1000000|millions=1000000|demi=0.5",
    "(?:-|\\s+et\\s+|\\s+)",
    { tenTakesUnit: true, frenchTeens: true },
  ),
  de: lexicon(
    `null=0|ein=1|eine=1|einen=1|einem=1|einer=1|eines=1|eins=1|zwei=2|drei=3|vier=4|fünf=5|sechs=6|sieben=7|acht=8|neun=9|zehn=10|elf=11|zwölf=12|dreizehn=13|vierzehn=14|fünfzehn=15|sechzehn=16|siebzehn=17|achtzehn=18|neunzehn=19|${GERMAN_TENS.map(([t, v]) => `${t}=${v}`).join("|")}|${GERMAN_COMPOUNDS}|hundert=100|einhundert=100|tausend=1000|eintausend=1000|million=1000000|millionen=1000000|ein halbes=0.5|halbes=0.5|halb=0.5`,
    "(?:\\s+|-)",
  ),
  ru: lexicon(
    "ноль=0|нуль=0|один=1|одна=1|одно=1|одного=1|одной=1|одному=1|два=2|две=2|двух=2|двум=2|три=3|трех=3|трёх=3|трем=3|трём=3|четыре=4|четырех=4|четырёх=4|пять=5|пяти=5|шесть=6|шести=6|семь=7|семи=7|восемь=8|восьми=8|девять=9|девяти=9|десять=10|десяти=10|одиннадцать=11|одиннадцати=11|двенадцать=12|двенадцати=12|тринадцать=13|тринадцати=13|четырнадцать=14|четырнадцати=14|пятнадцать=15|пятнадцати=15|шестнадцать=16|шестнадцати=16|семнадцать=17|семнадцати=17|восемнадцать=18|восемнадцати=18|девятнадцать=19|девятнадцати=19|двадцать=20|двадцати=20|тридцать=30|тридцати=30|сорок=40|сорока=40|пятьдесят=50|пятидесяти=50|шестьдесят=60|шестидесяти=60|семьдесят=70|семидесяти=70|восемьдесят=80|восьмидесяти=80|девяносто=90|девяноста=90|сто=100|ста=100|тысяча=1000|тысячи=1000|тысяч=1000|миллион=1000000|миллиона=1000000|миллионов=1000000|половина=0.5|половины=0.5",
    "\\s+",
  ),
  tr: lexicon(
    "sıfır=0|bir=1|iki=2|üç=3|dört=4|beş=5|altı=6|yedi=7|sekiz=8|dokuz=9|on=10|yirmi=20|otuz=30|kırk=40|elli=50|altmış=60|yetmiş=70|seksen=80|doksan=90|yüz=100|bin=1000|milyon=1000000|milyar=1000000000|yarım=0.5",
    "\\s+",
    { tenTakesUnit: true },
  ),
  vi: lexicon(
    "một=1|mốt=1|hai=2|ba=3|bốn=4|tư=4|năm=5|lăm=5|nhăm=5|sáu=6|bảy=7|bẩy=7|tám=8|chín=9|mười=10|mươi=tens|trăm=100|nghìn=1000|ngàn=1000|triệu=1000000|tỷ=1000000000|tỉ=1000000000|linh=0|lẻ=0|nửa=0.5",
    "\\s+",
    { tenTakesUnit: true },
  ),
  id: lexicon(
    "nol=0|satu=1|dua=2|tiga=3|empat=4|lima=5|enam=6|tujuh=7|delapan=8|sembilan=9|sepuluh=10|sebelas=11|belas=teen|puluh=tens|seratus=100|ratus=100|seribu=1000|ribu=1000|sejuta=1000000|juta=1000000|miliar=1000000000|setengah=0.5",
    "\\s+",
  ),
  // Korean's native numbers ("일곱 퍼센트", "열다섯"); its Sino-Korean ones are read in gate-spelled.ts.
  ko: lexicon(
    "하나=1|한=1|둘=2|두=2|셋=3|세=3|넷=4|네=4|다섯=5|여섯=6|일곱=7|여덟=8|아홉=9|열=10|스물=20|스무=20|서른=30|마흔=40|쉰=50|예순=60|일흔=70|여든=80|아흔=90",
    "\\s*",
    { tenTakesUnit: true },
  ),
};

/**
 * Words another language reads as a number that are everyday words, or
 * too short to tell, elsewhere ("on" is ten in Turkish, "once" eleven in
 * Spanish, "un" one in French): read as numbers only in their own
 * language's answers.
 */
const EVERYDAY: ReadonlySet<string> = new Set(["once", "mil", "bin", "cent", "cents", "null", "elf", "acht", "sept", "neuf", "media", "medio", "demi", "halb", "halbes", "hai", "năm", "linh", "mốt", "nol", "tư", "한", "두", "세", "네", "열", "쉰"]);

export const foreignOnly = (word: string): boolean => [...word].length <= 2 || EVERYDAY.has(word);
