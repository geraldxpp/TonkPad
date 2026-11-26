import type { Locale } from "@/shared/i18n/config";

/**
 * What a negation near a banned claim can be part of without denying it
 * (agent/claims.ts). An intensifier or framing phrase negates something else
 * ("no doubt it's legit", "nobody denies it's guaranteed", "not financial
 * advice but…", "毫无疑问", "間違いない"): it is masked before the negation
 * check. A contrast word ends a negation's reach ("not a promise, but it is
 * guaranteed"). And a question answered "yes" ("Is it legit? It is.",
 * "保证赚钱吗？当然。") stands as a claim, whatever its "whether", 吗 or
 * không. Patterns run over claims.ts's normalized text (lower case, NFKC,
 * straight apostrophes).
 */
export interface Frames {
  /** Intensifiers and frames, masked before the negation check. */
  intensifiers: RegExp;
  /** The same phrases opening a sentence: an answer that says yes ("No doubt."). */
  opensWithIntensifier: RegExp;
  /** Words that end a negation's reach before a claim, or null. */
  contrast: RegExp | null;
  /** What opens an answer that says yes, whatever follows ("Yes, …"). */
  affirm: RegExp;
  /** What opens an answer that restates the claim ("It is."): a yes only without a negation ("It is not."). */
  restate: RegExp;
}

const EDGE = "[\\p{L}\\p{M}\\p{N}_]";

interface Words {
  intensifiers: string;
  contrast?: string;
  affirm: string;
  restate?: string;
  /** Chinese, Japanese and Korean: matched inside running text, not as whole words. */
  running?: boolean;
}

const WORDS: Record<Locale, Words> = {
  en: {
    intensifiers: "no doubts?(?: about it)?|no questions?(?: asked)?|without (?:a |any )?(?:doubt|question)|there(?:'s| is) no denying(?: (?:it|that))?|no denying(?: (?:it|that))?|(?:can't|cannot|can not|couldn't|could not) stress (?:this |that |it )?enough|(?:couldn't|could not|can't|cannot|can not) be (?:any )?more|nothing (?:could|can|would) be more|nothing is more|nothing to worry about|no (?:need|reason) to (?:worry|doubt)|(?:don't|do not|dont|never) (?:you )?worry|no worries|not to worry|not (?:a|one) (?:single )?doubt|not (?:a|the) (?:shadow|hint) of (?:a )?doubt|(?:nobody|no one|no-one) (?:can|could|would|will) (?:say|tell you|argue|claim) otherwise|no matter (?:what|how)|(?:wouldn't|would not) be surprised|(?:nobody|no one|no-one|none of us) (?:can |could |would |will )?(?:deny|denies|doubt|doubts|question|argue)|(?:can't|cannot|can not|couldn't|won't|wouldn't|don't|do not|doesn't|does not) (?:deny|doubt|argue with)|(?:not|no) (?:financial|investment) advice|not (?:an? )?advice|not (?:only|just|merely)|never (?:seen|heard of|met|known|been) (?:\\p{L}+ )?(?:so|as|more|this|such)|(?:can't|cannot|can not|won't|will not|couldn't) go wrong|no wonder|not gonna lie|not going to lie|no lie|no cap|no kidding|no joke|nothing but",
    contrast: "but|however|although|though",
    affirm: "yes|yeah|yep|yup|sure|of course|absolutely|definitely|certainly|indeed|correct|totally|100 ?%|for sure",
    restate: "it is|it's|it does|it will|it can|they are|they do|right",
  },
  es: {
    intensifiers: "sin (?:ninguna |alguna |lugar a )?dudas?|no (?:hay|cabe|queda|tengo|tengas) (?:ninguna |la menor )?duda|nadie (?:puede |podr[aá] |va a )?(?:negar|niega|dudar|duda)|no se puede negar|no (?:es|son) (?:un )?consejos? (?:financieros?|de inversi[oó]n)|no s[oó]lo|no (?:te )?vas a equivocar|nada m[aá]s que|no (?:te preocupes|se preocupen?|os preocup[eé]is)|sin preocupaci[oó]n(?:es)?|(?:es )?imposible que no|no hay (?:forma|manera|modo) de que no|no (?:puede|podr[ií]a) ser m[aá]s|nadie (?:puede|podr[aá]) decir (?:lo )?contrario",
    contrast: "pero|sino|aunque|sin embargo|no obstante",
    affirm: "s[ií]|claro|por supuesto|desde luego|definitivamente|totalmente|correcto",
    restate: "lo es|as[ií] es|seguro",
  },
  pt: {
    intensifiers: "sem (?:nenhuma |qualquer |sombra de )?d[uú]vidas?|n[aã]o (?:h[aá]|resta|tenho|tenha) (?:nenhuma |a menor )?d[uú]vida|ningu[eé]m (?:pode |vai |consegue )?(?:negar|nega|duvidar|duvida)|n[aã]o (?:d[aá] para|tem como|se pode|h[aá] como) negar|n[aã]o (?:[eé]|s[aã]o) (?:um )?conselhos? (?:financeiros?|de investimento)|n[aã]o s[oó]|n[aã]o apenas|n[aã]o tem erro|nada al[eé]m de|n[aã]o (?:tenha|tenham|tenhas|precisa ter) medo|n[aã]o (?:se preocupe(?:m)?|te preocupes)|sem preocupa[cç](?:[aã]o|[oõ]es)|imposs[ií]vel (?:que )?n[aã]o|n[aã]o tem como n[aã]o|n[aã]o (?:pode|poderia) ser mais|ningu[eé]m (?:pode|vai) dizer o contr[aá]rio",
    contrast: "mas|por[eé]m|contudo|todavia|no entanto|embora",
    affirm: "sim|claro|com certeza|certamente|exatamente|correto",
    restate: "[eé] sim|isso mesmo|[eé]",
  },
  fr: {
    intensifiers: "sans (?:aucun |le moindre |nul )?doute|(?:nul|aucun|pas de|pas l'ombre d'un) doute|il n'y a (?:aucun|pas de|nul) doute|personne ne (?:peut |pourra )?(?:nier|nie|douter|doute)|on ne peut (?:pas )?(?:nier|douter)|impossible de (?:nier|douter)|(?:ce )?n'est pas (?:un )?conseil (?:financier|en investissement)|non seulement|rien que|il ne fait (?:aucun|pas de|nul|plus aucun) doute|ne (?:vous inqui[eé]tez|t'inqui[eè]tes?) pas|pas d'inqui[eé]tude|aucun souci|(?:il est )?impossible que (?:ce |ça |cela )?ne soit pas|personne ne (?:peut|pourra) dire le contraire",
    contrast: "mais|pourtant|cependant|toutefois|n[eé]anmoins",
    affirm: "oui|bien s[uû]r|absolument|certainement|tout [àa] fait|exactement",
    restate: "c'est (?:le cas|s[uû]r)|il l'est|elle l'est",
  },
  de: {
    intensifiers: "ohne (?:jeden |jeglichen |den geringsten )?zweifel|(?:kein|keinen|keine) zweifel|ohne frage|zweifellos|niemand (?:kann |wird )?(?:bestreiten|bestreitet|leugnen|leugnet|anzweifeln|zweifeln|zweifelt)|nicht zu (?:leugnen|bestreiten)|(?:keine|kein) (?:finanz|anlage)beratung|nicht nur|nichts als|nichts anderes als|keine frage|kein wunder|keine sorge|(?:mach|macht) (?:dir|euch) keine sorgen|machen sie sich keine sorgen|(?:k[oö]nnte|kann) nicht (?:mehr|besser)|niemand kann (?:etwas anderes|das gegenteil) (?:sagen|behaupten)",
    contrast: "aber|sondern|jedoch|doch|trotzdem|allerdings",
    affirm: "ja|klar|nat[uü]rlich|auf jeden fall|absolut|genau|definitiv",
    restate: "sicher|ist es|es ist",
  },
  ru: {
    intensifiers: "без (?:всяких |никаких |малейших )?сомнени\\p{L}*|(?:нет|никаких) (?:никаких )?сомнени\\p{L}*|не (?:может|могу|можем) не|никто не (?:может |сможет |станет )?(?:отрицать|отрицает|сомневаться|сомневается|поспорит)|нельзя (?:отрицать|не признать)|не (?:является )?финансов\\p{L}* (?:совет\\p{L}*|рекомендаци\\p{L}*)|не только|не просто|ничего кроме|не (?:сомневайтесь|сомневайся|переживайте|переживай|волнуйтесь|волнуйся|беспокойтесь|беспокойся)|без вопросов|вне (?:всяких )?сомнени\\p{L}*|не может быть (?:еще )?(?:более|лучше)|никто не скажет (?:обратного|иначе)",
    contrast: "но|однако|зато|хотя",
    affirm: "да|конечно|безусловно|разумеется|естественно|именно|еще как",
    restate: "точно|так и есть|это так",
  },
  tr: {
    intensifiers: "(?:hiç )?şüphe(?:si)? yok|şüphesiz|kimse (?:inkar|itiraz) ede(?:mez|meyecek)|inkar edilemez|yatırım tavsiyesi değil(?:dir)?|endişelenme(?:yin|yiniz)?|merak etme(?:yin)?|kaygılanma(?:yın)?|hiç şüphen olmasın|soru yok",
    contrast: "ama|fakat|ancak|lakin|yine de",
    affirm: "evet|elbette|tabii|tabi|kesinlikle|aynen",
  },
  vi: {
    intensifiers: "không (?:còn )?(?:nghi ngờ|phải bàn cãi|thể chối cãi|cần bàn cãi|thể phủ nhận)|chắc chắn không sai|không ai (?:có thể )?(?:phủ nhận|chối cãi|nghi ngờ)|không phải (?:là )?lời khuyên (?:tài chính|đầu tư)|không chỉ|không những|chẳng phải bàn|đừng (?:lo lắng|lo|bận tâm)|không (?:phải|cần|cần phải) lo(?: lắng)?|không có gì phải lo|yên tâm",
    contrast: "nhưng|tuy nhiên|song|mặc dù",
    affirm: "vâng|chắc chắn|tất nhiên|dĩ nhiên|đúng vậy|đảm bảo|yên tâm",
    restate: "có|đúng|phải",
  },
  id: {
    intensifiers: "tanpa (?:ragu|keraguan)|tidak (?:diragukan|perlu diragukan|ada keraguan)(?: lagi)?|tak (?:diragukan|terbantahkan|bisa dipungkiri)|tidak (?:bisa|dapat) (?:dipungkiri|disangkal|dibantah)|tidak ada yang (?:bisa |dapat )?(?:menyangkal|membantah|meragukan)|bukan (?:nasihat|saran) (?:keuangan|investasi)|tidak hanya|bukan hanya|tidak cuma|bukan cuma|jangan khawatir|(?:tidak|tak|gak|nggak) (?:perlu|usah) khawatir|tenang saja",
    contrast: "tapi|tetapi|namun|melainkan|walaupun|meskipun",
    affirm: "ya|iya|tentu|pasti|betul|benar|jelas",
  },
  zh: {
    intensifiers: "毫无疑问|毫無疑問|无可否认|無可否認|不可否认|不可否認|毋庸置疑|无庸置疑|無庸置疑|无疑|無疑|没有疑问|沒有疑問|不用怀疑|不用懷疑|不容置疑|没有人(?:能|可以|会|會)?否认|沒有人(?:能|可以|会|會)?否認|不是(?:投资|投資|财务|財務)建[议議]|不仅|不僅|不只|不光|错不了|錯不了|没错|沒錯|不得不说|不得不說|不会错|不會錯|不用担心|不用擔心|别担心|別擔心|不必担心|不必擔心|放心吧|请放心|請放心|那还用说|那還用說|还用说|還用說|不用说|不用說",
    contrast: "但是|但|可是|然而|不过|不過|却|卻",
    affirm: "当然|當然|是的|是啊|对的|對的|没错|沒錯|肯定|绝对|絕對|确实|確實|那还用说|那還用說|还用说|還用說|(?:我觉得|我覺得|我认为|我認為|我想)(?:会|會|是|能|可以)",
    restate: "对(?!于)|對(?!於)|会的|會的|能(?!否)|可以|是(?!否)|会|會",
    running: true,
  },
  ja: {
    intensifiers: "間違いない|間違いなく|間違いありません|疑いない|疑いなく|疑いようがない|違いない|違いありません|否定できない|否定できません|投資(?:の)?助言では(?:ない|ありません)|だけでなく|だけじゃなく|かもしれない|かもしれません|ないわけがない|しかない|心配(?:しないで(?:ください)?|いりません|ない|ご無用|無用)|ご心配なく|言うまでもな(?:い|く)",
    affirm: "はい|もちろん|確かに|ええ|うん",
    restate: "そうです|そうだ",
    running: true,
  },
  ko: {
    intensifiers: "의심(?:의|할)? ?(?:여지가|바가?)? ?없|틀림(?:이)? ?없|부정할 수 없|투자 ?조언이 아니|뿐만 아니라|말할 것도 없|두말할 것 없|걱정(?:하지 마(?:세요)?|마(?:세요)?|없(?:어요|습니다)?)|두말하면 잔소리",
    contrast: "하지만|그러나|그런데",
    affirm: "네|예|물론|그럼요|당연",
    restate: "그렇습니다|맞습니다",
    running: true,
  },
};

const compile = (w: Words): Frames => {
  const edge = w.running ? "" : `(?!${EDGE})`;
  const start = w.running ? "" : `(?<!${EDGE})`;
  return {
    intensifiers: new RegExp(`${start}(?:${w.intensifiers})${edge}`, "gu"),
    opensWithIntensifier: new RegExp(`^(?:${w.intensifiers})${edge}`, "u"),
    contrast: w.contrast ? new RegExp(`${start}(?:${w.contrast})${edge}`, "gu") : null,
    affirm: new RegExp(`^(?:${w.affirm})${edge}`, "u"),
    restate: new RegExp(`^(?:${w.restate ?? "(?!)"})${edge}`, "u"),
  };
};

export const FRAMES: Record<Locale, Frames> = Object.fromEntries(Object.entries(WORDS).map(([lang, w]) => [lang, compile(w)])) as Record<Locale, Frames>;

/** Every language's frames at once, for text whose language isn't known. */
export const ANY_FRAMES: Frames = (() => {
  const all = Object.values(WORDS);
  const join = (pick: (w: Words) => string | undefined, running: boolean) =>
    all.filter((w) => (w.running === true) === running).flatMap((w) => (pick(w) ? [`(?:${pick(w)})`] : [])).join("|");
  const either = (pick: (w: Words) => string | undefined, flags: string, open = false) =>
    new RegExp(`${open ? "^" : ""}(?:${open ? "" : `(?<!${EDGE})`}(?:${join(pick, false)})(?!${EDGE})|${join(pick, true)})`, flags);
  return {
    intensifiers: either((w) => w.intensifiers, "gu"),
    opensWithIntensifier: either((w) => w.intensifiers, "u", true),
    contrast: either((w) => w.contrast, "gu"),
    affirm: either((w) => w.affirm, "u", true),
    restate: either((w) => w.restate, "u", true),
  };
})();

/** `text` with every intensifier or frame replaced by "~" of the same length, so the negation check skips it and indexes stay. */
export function maskFrames(text: string, frames: Frames): string {
  return text.replace(frames.intensifiers, (phrase) => "~".repeat(phrase.length));
}
