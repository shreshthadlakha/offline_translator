/**
 * IndicProcessor, ported to TypeScript from the reference Python:
 *  - IndicTransToolkit 1.1.1 processor.pyx (AI4Bharat, MIT)
 *  - indic-nlp-library 0.92 normalizers, transliterator and tokenizers
 *    (Anoop Kunchukuttan, MIT)
 *  - sacremoses 0.2.0 Moses tokenizer/detokenizer/punct normalizer for
 *    English (the en subset actually used)
 *  - urduhack 1.1.1 character normalization for Urdu (MIT)
 *
 * Ported for the p5a browser proof and reused by the app worker.
 *
 * preprocess: punc_norm -> digits to ASCII -> placeholders ->
 *   (en) Moses punct normalizer + Moses tokenizer
 *   (indic) script normalizer + trivial tokenize + transliterate into the
 *   Devanagari-unified space (except Arab/Aran/Olck/Mtei/Latn scripts)
 *   -> "{src_flores} {tgt_flores} {text}"
 * postprocess: Perso-Arabic punctuation fixes -> Oriya fix -> placeholder
 *   restore -> (en) Moses detokenizer, (indic) transliterate Devanagari back
 *   to the target script + trivial detokenize.
 */

// --- FLORES -> ISO codes --------------------------------------------------------

export const FLORES_TO_ISO: Record<string, string> = {
  asm_Beng: "as", awa_Deva: "hi", ben_Beng: "bn", bho_Deva: "hi", brx_Deva: "hi",
  doi_Deva: "hi", eng_Latn: "en", gom_Deva: "kK", gon_Deva: "hi", guj_Gujr: "gu",
  hin_Deva: "hi", hne_Deva: "hi", kan_Knda: "kn", kas_Arab: "ur", kas_Deva: "hi",
  kha_Latn: "en", lus_Latn: "en", mag_Deva: "hi", mai_Deva: "hi", mal_Mlym: "ml",
  mar_Deva: "hi", mni_Beng: "bn", mni_Mtei: "hi", npi_Deva: "ne", ory_Orya: "or",
  pan_Guru: "pa", san_Deva: "hi", sat_Olck: "or", snd_Arab: "ur", snd_Deva: "hi",
  tam_Taml: "ta", tel_Telu: "te", urd_Arab: "ur", unr_Deva: "hi",
};

// --- Script ranges and transliteration (indicnlp UnicodeIndicTransliterator) ----

const SCRIPT_RANGES: Record<string, number> = {
  pa: 0x0a00, gu: 0x0a80, or: 0x0b00, ta: 0x0b80, te: 0x0c00, kn: 0x0c80,
  ml: 0x0d00, hi: 0x0900, mr: 0x0900, kK: 0x0900, sa: 0x0900, ne: 0x0900,
  sd: 0x0900, bn: 0x0980, as: 0x0980,
};

/** Tamil has no aspirated or voiced plosive letters of its own. */
function correctTamilMapping(offset: number): number {
  if (offset >= 0x15 && offset <= 0x28 && offset !== 0x1c) {
    const rem = (offset - 0x15) % 5;
    if (rem !== 0 && rem !== 4) {
      offset = 0x15 + 5 * Math.floor((offset - 0x15) / 5);
    }
  }
  if (offset === 0x2b || offset === 0x2c || offset === 0x2d) offset = 0x2a;
  if (offset === 0x36) offset = 0x37;
  return offset;
}

export function transliterate(text: string, lang1: string, lang2: string): string {
  const start1 = SCRIPT_RANGES[lang1];
  const start2 = SCRIPT_RANGES[lang2];
  if (start1 === undefined || start2 === undefined) return text;
  let out = "";
  for (const c of text) {
    const offset = c.charCodeAt(0) - start1;
    if (offset >= 0 && offset <= 0x6f && c !== "\u0964" && c !== "\u0965") {
      const corrected = lang2 === "ta" ? correctTamilMapping(offset) : offset;
      out += String.fromCharCode(start2 + corrected);
    } else {
      out += c;
    }
  }
  return out;
}

// --- Digits to ASCII ------------------------------------------------------------

const DIGITS_TABLE: Record<string, string> = {
  "\u09e6": "0", "\u0ae6": "0", "\u0ce6": "0", "\u0966": "0", "\u0660": "0",
  "\uabf0": "0", "\u0b66": "0", "\u0a66": "0", "\u1c50": "0", "\u06f0": "0",
  "\u09e7": "1", "\u0ae7": "1", "\u0967": "1", "\u0ce7": "1", "\u06f1": "1",
  "\uabf1": "1", "\u0b67": "1", "\u0a67": "1", "\u1c51": "1", "\u0c67": "1",
  "\u09e8": "2", "\u0ae8": "2", "\u0968": "2", "\u0ce8": "2", "\u06f2": "2",
  "\uabf2": "2", "\u0b68": "2", "\u0a68": "2", "\u1c52": "2", "\u0c68": "2",
  "\u09e9": "3", "\u0ae9": "3", "\u0969": "3", "\u0ce9": "3", "\u06f3": "3",
  "\uabf3": "3", "\u0b69": "3", "\u0a69": "3", "\u1c53": "3", "\u0c69": "3",
  "\u09ea": "4", "\u0aea": "4", "\u096a": "4", "\u0cea": "4", "\u06f4": "4",
  "\uabf4": "4", "\u0b6a": "4", "\u0a6a": "4", "\u1c54": "4", "\u0c6a": "4",
  "\u09eb": "5", "\u0aeb": "5", "\u096b": "5", "\u0ceb": "5", "\u06f5": "5",
  "\uabf5": "5", "\u0b6b": "5", "\u0a6b": "5", "\u1c55": "5", "\u0c6b": "5",
  "\u09ec": "6", "\u0aec": "6", "\u096c": "6", "\u0cec": "6", "\u06f6": "6",
  "\uabf6": "6", "\u0b6c": "6", "\u0a6c": "6", "\u1c56": "6", "\u0c6c": "6",
  "\u09ed": "7", "\u0aed": "7", "\u096d": "7", "\u0ced": "7", "\u06f7": "7",
  "\uabf7": "7", "\u0b6d": "7", "\u0a6d": "7", "\u1c57": "7", "\u0c6d": "7",
  "\u09ee": "8", "\u0aee": "8", "\u096e": "8", "\u0cee": "8", "\u06f8": "8",
  "\uabf8": "8", "\u0b6e": "8", "\u0a6e": "8", "\u1c58": "8", "\u0c6e": "8",
  "\u09ef": "9", "\u0aef": "9", "\u096f": "9", "\u0cef": "9", "\u06f9": "9",
  "\uabf9": "9", "\u0b6f": "9", "\u0a6f": "9", "\u1c59": "9", "\u0c6f": "9",
};

function normalizeDigits(text: string): string {
  let changed = false;
  for (const c of text) if (DIGITS_TABLE[c] !== undefined) { changed = true; break; }
  if (!changed) return text;
  return [...text].map((c) => DIGITS_TABLE[c] ?? c).join("");
}

// --- Punctuation normalization (processor.pyx _punc_norm) ------------------------

const PUNC_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\r/g, ""],
  [/\(\s*/g, "("],
  [/\s*\)/g, ")"],
  [/\s:\s?/g, ":"],
  [/\s;\s?/g, ";"],
  [/[`´‘‚’]/g, "'"],
  [/["„“”«»]/g, '"'],
  [/[–—]/g, "-"],
  [/\.\.\./g, "..."],
  [/ %/g, "%"],
  // The reference has two no-op rules ("nº " and " ºC"); omitted.
  [/ ([?!;])/g, "$1"],
  [/,\u00a0/g, ", "],
];

function puncNorm(text: string): string {
  let t = text;
  for (const [re, sub] of PUNC_REPLACEMENTS) t = t.replace(re, sub);
  t = t.replace(/[ ]{2,}/g, " ");
  t = t.replace(/\) ([.!:?;,])/g, ")$1");
  t = t.replace(/(\d) %/g, "$1%");
  t = t.replace(/"([,.]+)/g, "$1\"");
  t = t.replace(/(\d)\u00a0(\d)/g, "$1.$2");
  return t.trim();
}

// --- Placeholders (processor.pyx _wrap_with_placeholders) ------------------------

const URL_PATTERN =
  /\b(?<![\w/.])(?:(?:https?|ftp):\/\/)?(?:(?:[\w-]+\.)+(?!\.))(?:[\w/\-?#&=%.]+)+(?!\.\w+)\b/g;
const NUMERAL_PATTERN =
  /(~?\d+\.?\d*\s?%?\s?-?\s?~?\d+\.?\d*\s?%|~?\d+%|\d+[-\/.,:']\d+[-\/.,:'+]\d+(?:\.\d+)?|\d+[-\/.:'+]\d+(?:\.\d+)?)/g;
const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}/g;
const OTHER_PATTERN = /[A-Za-z0-9]*[#|@]\w+/g;

const INDIC_FAILURE_CASES = [
  "آی ڈی ", "ꯑꯥꯏꯗꯤ", "आईडी", "आई . डी . ", "आई . डी .", "आई. डी. ",
  "आई. डी.", "आय. डी. ", "आय. डी.", "आय . डी . ", "आय . डी .आइ . डी . ",
  "आइ . डी .", "आइ. डी. ", "आइ. डी.", "ऐटि", "آئی ڈی ", "ᱟᱭᱰᱤ ᱾", "आयडी",
  "ऐडि", "आइडि", "ᱟᱭᱰᱤ",
];

function wrapWithPlaceholders(text: string): { text: string; map: Map<string, string> } {
  let serial = 1;
  const map = new Map<string, string>();
  const patterns: Array<[RegExp, "url" | "numeral" | "email" | "other"]> = [
    [EMAIL_PATTERN, "email"],
    [URL_PATTERN, "url"],
    [NUMERAL_PATTERN, "numeral"],
    [OTHER_PATTERN, "other"],
  ];
  for (const [pattern, kind] of patterns) {
    const matches = new Set<string>(text.match(pattern) ?? []);
    for (const match of matches) {
      if (kind === "url" && match.replace(".", "").length < 4) continue;
      if (
        kind === "numeral" &&
        match.replace(/ /g, "").replace(/\./g, "").replace(/:/g, "").length < 4
      )
        continue;
      const base = `<ID${serial}>`;
      for (const f of [
        `<ID${serial}>`, `< ID${serial} >`, `[ID${serial}]`, `[ ID${serial} ]`,
        `[ID ${serial}]`, `<ID${serial}]`, `< ID${serial}]`, `<ID${serial} ]`,
        `<id${serial}>`, `< id${serial} >`, `[id${serial}]`, `[ id${serial} ]`,
        `[id ${serial}]`, `<id${serial}]`, `< id${serial}]`, `<id${serial} ]`,
      ])
        map.set(f, match);
      for (const c of INDIC_FAILURE_CASES) {
        for (const f of [
          `<${c}${serial}>`, `< ${c}${serial} >`, `< ${c} ${serial} >`,
          `<${c} ${serial}]`, `< ${c} ${serial} ]`, `[${c}${serial}]`,
          `[${c} ${serial}]`, `[ ${c}${serial} ]`, `[ ${c} ${serial} ]`,
          `${c} ${serial}`, `${c}${serial}`,
        ])
          map.set(f, match);
      }
      text = text.split(match).join(base);
      serial += 1;
    }
  }
  text = text.replace(/\s+/g, " ").split(">/").join(">").split("]/").join("]");
  return { text, map };
}

// --- Moses punctuation normalizer for English (sacremoses defaults) --------------

function mosesPunctNormalizeEn(text: string): string {
  const steps: Array<[RegExp, string]> = [
    [/\r/g, ""],
    [/\(/g, " ("],
    [/\)/g, ") "],
    [/ +/g, " "],
    [/\) ([.!:?;,])/g, ")$1"],
    [/\( /g, "("],
    [/ \)/g, ")"],
    [/(\d) %/g, "$1%"],
    [/ :/g, ":"],
    [/ ;/g, ";"],
    [/`/g, "'"],
    [/''/g, ' " '],
    [/„/g, '"'], [/“/g, '"'], [/”/g, '"'], [/–/g, "-"], [/—/g, " - "],
    [/ +/g, " "],
    [/´/g, "'"],
    [/([a-zA-Z])‘([a-zA-Z])/g, "$1'$2"],
    [/([a-zA-Z])’([a-zA-Z])/g, "$1'$2"],
    [/‘/g, "'"], [/‚/g, "'"], [/’/g, "'"],
    [/''/g, '"'], [/´´/g, '"'], [/…/g, "..."],
    [/\u00A0«\u00A0/g, '"'], [/«\u00A0/g, '"'], [/«/g, '"'],
    [/\u00A0»\u00A0/g, '"'], [/\u00A0»/g, '"'], [/»/g, '"'],
    [/\u00A0%/g, "%"], [/nº\u00A0/g, "nº "], [/\u00A0:/g, ":"],
    [/\u00A0ºC/g, " ºC"], [/\u00A0cm/g, " cm"],
    [/\u00A0\?/g, "?"], [/\u00A0!/g, "!"], [/\u00A0;/g, ";"],
    [/,\u00A0/g, ", "],
    [/ +/g, " "],
    [/"([,.]+)/g, "$1\""],
    [/(\d)\u00A0(\d)/g, "$1.$2"],
  ];
  let t = text;
  for (const [re, sub] of steps) t = t.replace(re, sub);
  return t.trim();
}

// --- Moses tokenizer for English (escape=False) ----------------------------------

const EN_NONBREAKING_PREFIXES = new Set(
  `A B C D E F G H I J K L M N O P Q R S T U V W X Y Z
Adj Adm Adv Asst Bart Bldg Brig Bros Capt Cmdr Col Comdr Con Corp Cpl DR Dr Drs Ens Gen Gov
Hon Hr Hosp Insp Lt MM MR MRS MS Maj Messrs Mlle Mme Mr Mrs Ms Msgr Op Ord Pfc Ph Prof Pvt
Rep Reps Res Rev Rt Sen Sens Sfc Sgt Sr St Supt Surg
v vs i.e rev e.g Rs
No Nos Art Nr pp
Jan Feb Mar Apr Jun Jul Aug Sep Oct Nov Dec`
    .split(/\s+/)
    .filter(Boolean),
);
const EN_NUMERIC_ONLY_PREFIXES = new Set(["No", "Art", "pp"]);

// Perl IsAlnum/IsAlpha/IsN approximated with Unicode property classes; the
// Indic viramas and nuktas that sacremoses adds are included.
const ALNUM = "\\p{L}\\p{M}\\p{N}\\u094D\\u093C\\u0A3C\\u0ABC\\u0B3C\\u0BCD\\u0C4D\\u0CCD\\u0D4D\\u09CD";
const ALPHA = "\\p{L}\\p{M}\\u094D\\u093C\\u0A3C\\u0ABC\\u0B3C\\u0BCD\\u0C4D\\u0CCD\\u0D4D\\u09CD";
const NUM = "\\p{N}";

const EN_APOSTROPHE_RULES: Array<[RegExp, string]> = [
  [new RegExp(`([^${ALPHA}])'([^${ALPHA}])`, "gu"), "$1 ' $2"],
  [new RegExp(`([^${ALPHA}${NUM}])'([${ALPHA}])`, "gu"), "$1 ' $2"],
  [new RegExp(`([${ALPHA}])'([^${ALPHA}])`, "gu"), "$1 ' $2"],
  [new RegExp(`([${ALPHA}])'([${ALPHA}])`, "gu"), "$1 '$2"],
  [new RegExp(`([${NUM}])'(s)`, "gu"), "$1 '$2"],
];

function handleNonbreakingPrefixes(text: string): string {
  const tokens = text.split(" ");
  const n = tokens.length;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    const m = /^(\S+)\.$/.exec(token);
    if (!m) continue;
    const prefix = m[1]!;
    const hasDotAndAlpha = prefix.includes(".") && new RegExp(`[${ALPHA}]`, "u").test(prefix);
    const isNonbreaking =
      EN_NONBREAKING_PREFIXES.has(prefix) && !EN_NUMERIC_ONLY_PREFIXES.has(prefix);
    const nextIsLower =
      i !== n - 1 && tokens[i + 1] !== undefined && /^[a-z\u00df-\u024f]/.test(tokens[i + 1]![0] ?? "");
    if (hasDotAndAlpha || isNonbreaking || nextIsLower) {
      continue;
    }
    if (
      EN_NUMERIC_ONLY_PREFIXES.has(prefix) &&
      i + 1 < n &&
      /^[0-9]+/.test(tokens[i + 1] ?? "")
    ) {
      continue;
    }
    tokens[i] = prefix + " .";
  }
  return tokens.join(" ");
}

function replaceMultidots(text: string): string {
  return text.replace(/\.{2,}/g, (match, offset: number, whole: string) => {
    const marker = " " + "DOT".repeat(match.length) + "MULTI";
    return offset + match.length < whole.length ? marker + " " : marker;
  });
}

function restoreMultidots(text: string): string {
  return text.replace(/(?:DOT)+MULTI/g, (m) =>
    ".".repeat(Math.max(1, Math.floor((m.length - 5) / 3))),
  );
}

/** Moses tokenize for English, escape=False. Returns a token list. */
export function mosesTokenizeEn(text: string): string[] {
  let t = text.replace(/\s+/g, " ").replace(/[\x00-\x1f]/g, "");
  t = t.trim();
  // Pad all "other" special characters not in IsAlnum.
  t = t.replace(new RegExp(`([^${ALNUM}\\s.'\`,-])`, "gu"), " $1 ");
  t = replaceMultidots(t);
  // Separate out "," except if within numbers e.g. 5,300.
  t = t.replace(new RegExp(`([^${NUM}])[,]`, "gu"), "$1 , ");
  t = t.replace(new RegExp(`[,]([^${NUM}])`, "gu"), " , $1");
  t = t.replace(new RegExp(`([${NUM}])[,]$`, "gu"), "$1 ,");
  for (const [re, sub] of EN_APOSTROPHE_RULES) t = t.replace(re, sub);
  t = handleNonbreakingPrefixes(t);
  t = t.replace(/\s+/g, " ").trim();
  t = t.replace(/\.' ?$/, " . ' ");
  t = restoreMultidots(t);
  return t.split(" ").filter(Boolean);
}

/** Moses detokenize for English. */
export function mosesDetokenizeEn(tokens: string[]): string {
  const IS_CURRENCY = /^[$€£¥₹₽]/u;
  const IS_PUNCT = /^[!#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/;
  const IS_ENG_CONTRACTION = /^'(?:t|d|ve|ll|s|m|re)$|^n't$/;
  const IS_OPEN_QUOTE = /^['"„“”«»`]+$/;
  const quoteCounts: Record<string, number> = {};
  let prependSpace = " ";
  let out = "";
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/u.test(token[0] ?? "")) {
      const prev = tokens[i - 1]?.slice(-1) ?? "";
      out +=
        i > 0 && /[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/u.test(prev)
          ? token
          : prependSpace + token;
      prependSpace = " ";
    } else if (IS_CURRENCY.test(token)) {
      out += prependSpace + token;
      prependSpace = "";
    } else if (IS_PUNCT.test(token)) {
      out += token;
      prependSpace = " ";
    } else if (i > 0 && IS_ENG_CONTRACTION.test(token)) {
      out += token;
      prependSpace = " ";
    } else if (IS_OPEN_QUOTE.test(token)) {
      const norm = /^[„“”]+$/.test(token) ? '"' : token;
      quoteCounts[norm] = quoteCounts[norm] ?? 0;
      if (quoteCounts[norm]! % 2 === 0) {
        if (token === "'" && i > 0 && /s$/.test(tokens[i - 1] ?? "")) {
          out += token;
          prependSpace = " ";
        } else {
          out += prependSpace + token;
          prependSpace = "";
          quoteCounts[norm] = (quoteCounts[norm] ?? 0) + 1;
        }
      } else {
        out += token;
        prependSpace = " ";
        quoteCounts[norm] = (quoteCounts[norm] ?? 0) + 1;
      }
    } else {
      out += prependSpace + token;
      prependSpace = " ";
    }
  }
  return out.replace(/ +/g, " ").trim();
}

// --- Indic normalizers (indicnlp factory defaults) -------------------------------

function baseNormalize(text: string): string {
  let t = text;
  for (const ch of ["\uFEFF", "\uFFFE", "\u2060", "\u00AD"]) t = t.split(ch).join("");
  t = t.split("\u200B").join(" ");
  t = t.split("\u00A0").join(" ");
  t = t.split("\u200C").join("");
  t = t.split("\u200D").join("");
  t = t.split("„").join('"').split("“").join('"').split("”").join('"');
  t = t.split("–").join("-").split("—").join(" - ");
  t = t.split("´").join("'").split("‘").join("'").split("‚").join("'").split("’").join("'");
  t = t.split("''").join('"').split("´´").join('"').split("…").join("...");
  return t;
}

type ScriptRule = { range: RegExp; visarga: string; rules: Array<[string, string]> };

const SCRIPT_NORMALIZERS: Record<string, ScriptRule> = {
  hi: {
    range: /[\u0900-\u097f]/,
    visarga: "\u0903",
    rules: [
      ["\u0972", "\u090f"],
      ["\u0929", "\u0928\u093C"], ["\u0931", "\u0930\u093C"], ["\u0934", "\u0933\u093C"],
      ["\u0958", "\u0915\u093C"], ["\u0959", "\u0916\u093C"], ["\u095A", "\u0917\u093C"],
      ["\u095B", "\u091C\u093C"], ["\u095C", "\u0921\u093C"], ["\u095D", "\u0922\u093C"],
      ["\u095E", "\u092B\u093C"], ["\u095F", "\u092F\u093C"],
      ["|", "\u0964"],
    ],
  },
  bn: {
    range: /[\u0980-\u09ff]/,
    visarga: "\u0983",
    rules: [
      ["\u09dc", "\u09a1\u09BC"], ["\u09dd", "\u09a2\u09BC"], ["\u09df", "\u09af\u09BC"],
      ["\u09e4", "\u0964"], ["\u09e5", "\u0965"], ["|", "\u0964"], ["\u09f7", "\u0964"],
      ["\u09c7\u09be", "\u09cb"], ["\u09c7\u09d7", "\u09cc"],
    ],
  },
  pa: {
    range: /[\u0a00-\u0a7f]/,
    visarga: "\u0a03",
    rules: [
      ["\u0a05\u0a3e", "\u0a06"], ["\u0a72\u0a3f", "\u0a07"], ["\u0a72\u0a40", "\u0a08"],
      ["\u0a73\u0a41", "\u0a09"], ["\u0a73\u0a42", "\u0a0a"], ["\u0a72\u0a47", "\u0a0f"],
      ["\u0a05\u0a48", "\u0a10"], ["\u0a73\u0a4b", "\u0a13"], ["\u0a05\u0a4c", "\u0a14"],
      ["\u0a33", "\u0a32\u0A3C"], ["\u0a36", "\u0a38\u0A3C"], ["\u0a59", "\u0a16\u0A3C"],
      ["\u0a5a", "\u0a17\u0A3C"], ["\u0a5b", "\u0a1c\u0A3C"], ["\u0a5e", "\u0a2b\u0A3C"],
      ["\u0a64", "\u0964"], ["\u0a65", "\u0965"], ["|", "\u0964"],
    ],
  },
  gu: {
    range: /[\u0a80-\u0aff]/,
    visarga: "\u0a83",
    rules: [["\u0ae4", "\u0964"], ["\u0ae5", "\u0965"]],
  },
  or: {
    range: /[\u0b00-\u0b7f]/,
    visarga: "\u0b03",
    rules: [
      ["\u0b05\u0b3e", "\u0b06"], ["\u0b0f\u0b57", "\u0b10"], ["\u0b13\u0b57", "\u0b14"],
      ["\u0b5c", "\u0b21\u0B3C"], ["\u0b5d", "\u0b22\u0B3C"],
      ["\u0b64", "\u0964"], ["\u0b65", "\u0965"], ["\u0b7c", "\u0964"],
      ["\u0b35", "\u0b2c"],
      ["\u0b47\u0b56", "\u0b58"], ["\u0b47\u0b3e", "\u0b4b"], ["\u0b47\u0b57", "\u0b4c"],
    ],
  },
  ta: {
    range: /[\u0b80-\u0bff]/,
    visarga: "\u0b83",
    rules: [
      ["\u0be4", "\u0964"], ["\u0be5", "\u0965"],
      ["\u0b92\u0bd7", "\u0b94"], ["\u0bc6\u0bbe", "\u0bca"], ["\u0bc7\u0bbe", "\u0bcb"],
      ["\u0bc6\u0bd7", "\u0bcc"],
    ],
  },
  te: {
    range: /[\u0c00-\u0c7f]/,
    visarga: "\u0c03",
    rules: [
      ["\u0c64", "\u0964"], ["\u0c65", "\u0965"], ["\u0c46\u0c56", "\u0c48"],
    ],
  },
  kn: {
    range: /[\u0c80-\u0cff]/,
    visarga: "\u0c83",
    rules: [
      ["\u0ce4", "\u0964"], ["\u0ce5", "\u0965"],
      ["\u0cbf\u0cd5", "\u0cc0"], ["\u0cc6\u0cd5", "\u0cc7"], ["\u0cc6\u0cd6", "\u0cc8"],
      ["\u0cc6\u0cc2", "\u0cca"], ["\u0cca\u0cd5", "\u0ccb"],
    ],
  },
  ml: {
    range: /[\u0d00-\u0d7f]/,
    visarga: "\u0d03",
    rules: [
      ["\u0d23\u0d4d\u200d", "\u0d7a"], ["\u0d28\u0d4d\u200d", "\u0d7b"],
      ["\u0d30\u0d4d\u200d", "\u0d7c"], ["\u0d32\u0d4d\u200d", "\u0d7d"],
      ["\u0d33\u0d4d\u200d", "\u0d7e"], ["\u0d15\u0d4d\u200d", "\u0d7f"],
      ["\u0d64", "\u0964"], ["\u0d65", "\u0965"],
      ["\u0d46\u0d3e", "\u0d4a"], ["\u0d47\u0d3e", "\u0d4b"],
      ["\u0d46\u0d57", "\u0d4c"], ["\u0d57", "\u0d4c"],
    ],
  },
};

function normalizeIndicScript(text: string, iso: string): string {
  const spec = SCRIPT_NORMALIZERS[iso];
  if (!spec) return baseNormalize(text);
  let t = baseNormalize(text);
  for (const [match, repl] of spec.rules) t = t.split(match).join(repl);
  t = t.replace(new RegExp("(" + spec.range.source + "):", "g"), "$1" + spec.visarga);
  return t;
}

// --- Urdu normalization (urduhack subset used by IndicNlp UrduNormalizer) --------

const URDU_CORRECT: Array<[string, string]> = [
  ["ﺁ", "\u0622"], ["ﺂ", "\u0622"], ["ﺃ", "\u0623"], ["ﺍ", "\u0627"], ["ﺎ", "\u0627"],
  ["ﺏ", "\u0628"], ["ﺐ", "\u0628"], ["ﺑ", "\u0628"], ["ﺒ", "\u0628"],
  ["ﭖ", "\u067e"], ["ﭘ", "\u067e"], ["ﭙ", "\u067e"],
  ["ﺕ", "\u062a"], ["ﺖ", "\u062a"], ["ﺗ", "\u062a"], ["ﺘ", "\u062a"],
  ["ﭦ", "\u0679"], ["ﭧ", "\u0679"], ["ﭨ", "\u0679"], ["ﭩ", "\u0679"],
  ["ﺛ", "\u062b"], ["ﺜ", "\u062b"], ["ﺚ", "\u062b"],
  ["ﺝ", "\u062c"], ["ﺞ", "\u062c"], ["ﺟ", "\u062c"], ["ﺠ", "\u062c"],
  ["ﺡ", "\u062d"], ["ﺣ", "\u062d"], ["ﺤ", "\u062d"], ["ﺢ", "\u062d"],
  ["ﺧ", "\u062e"], ["ﺨ", "\u062e"], ["ﺦ", "\u062e"],
  ["ﺩ", "\u062f"], ["ﺪ", "\u062f"], ["ﺬ", "\u0630"], ["ﺫ", "\u0630"],
  ["ﺭ", "\u0631"], ["ﺮ", "\u0631"], ["ﺯ", "\u0632"], ["ﺰ", "\u0632"],
  ["ﺱ", "\u0633"], ["ﺲ", "\u0633"], ["ﺳ", "\u0633"], ["ﺴ", "\u0633"],
  ["ﺵ", "\u0634"], ["ﺶ", "\u0634"], ["ﺷ", "\u0634"], ["ﺸ", "\u0634"],
  ["ﺹ", "\u0635"], ["ﺺ", "\u0635"], ["ﺻ", "\u0635"], ["ﺼ", "\u0635"],
  ["ﺽ", "\u0636"], ["ﺾ", "\u0636"], ["ﺿ", "\u0636"], ["ﻀ", "\u0636"],
  ["ﻃ", "\u0637"], ["ﻄ", "\u0637"], ["ﻅ", "\u0638"], ["ﻇ", "\u0638"], ["ﻈ", "\u0638"],
  ["ﻉ", "\u0639"], ["ﻊ", "\u0639"], ["ﻋ", "\u0639"], ["ﻌ", "\u0639"],
  ["ﻍ", "\u063a"], ["ﻏ", "\u063a"], ["ﻐ", "\u063a"],
  ["ﻑ", "\u0641"], ["ﻒ", "\u0641"], ["ﻓ", "\u0641"], ["ﻔ", "\u0641"],
  ["ﻕ", "\u0642"], ["ﻖ", "\u0642"], ["ﻗ", "\u0642"], ["ﻘ", "\u0642"],
  ["ﻝ", "\u0644"], ["ﻞ", "\u0644"], ["ﻟ", "\u0644"], ["ﻠ", "\u0644"],
  ["ﻡ", "\u0645"], ["ﻢ", "\u0645"], ["ﻣ", "\u0645"], ["ﻤ", "\u0645"],
  ["ﻥ", "\u0646"], ["ﻦ", "\u0646"], ["ﻧ", "\u0646"], ["ﻨ", "\u0646"],
  ["ﭺ", "\u0686"], ["ﭻ", "\u0686"], ["ﭼ", "\u0686"], ["ﭽ", "\u0686"],
  ["ﮈ", "\u0688"], ["ﮉ", "\u0688"], ["ﮍ", "\u0691"], ["ﮌ", "\u0691"], ["ﮋ", "\u0698"],
  ["ﮎ", "\u06a9"], ["ﮏ", "\u06a9"], ["ﮐ", "\u06a9"], ["ﮑ", "\u06a9"], ["ﻛ", "\u06a9"], ["ك", "\u06a9"],
  ["ﮒ", "\u06af"], ["ﮓ", "\u06af"], ["ﮔ", "\u06af"], ["ﮕ", "\u06af"],
  ["ﮞ", "\u06ba"], ["ﮟ", "\u06ba"],
  ["ﻮ", "\u0648"], ["ﻭ", "\u0648"], ["ﺅ", "\u0624"],
  ["ﮪ", "\u06be"], ["ﮬ", "\u06be"], ["ﮭ", "\u06be"], ["ﻬ", "\u06be"], ["ﻫ", "\u06be"], ["ﮫ", "\u06be"],
  ["ﻩ", "\u06c1"], ["ﮦ", "\u06c1"], ["ﻪ", "\u06c1"], ["ﮧ", "\u06c1"], ["ﮩ", "\u06c1"], ["ﮨ", "\u06c1"], ["ه", "\u06c1"],
  ["ة", "\u06c3"], ["ﺀ", "\u0621"],
  ["ﯼ", "\u06cc"], ["ى", "\u06cc"], ["ﯽ", "\u06cc"], ["ﻰ", "\u06cc"], ["ﻱ", "\u06cc"], ["ﻲ", "\u06cc"], ["ﯾ", "\u06cc"], ["ﯿ", "\u06cc"], ["ي", "\u06cc"],
  ["ﺋ", "\u0626"], ["ﺌ", "\u0626"],
  ["ﮮ", "\u06d2"], ["ﮯ", "\u06d2"], ["ﻳ", "\u06d2"], ["ﻴ", "\u06d2"],
];

const URDU_COMBINE: Array<[string, string]> = [
  ["\u0627\u064b", "\u0622"],
  ["\u0627\u0654", "\u0623"],
  ["\u06d2\u0654", "\u06d3"],
];

const URDU_DIACRITICS = /[\u064e\u064b\u0670\u0650\u064f\u064d]/g;

function normalizeUrdu(text: string): string {
  let t = baseNormalize(text);
  t = t.replace(/\s+/g, " ").trim();
  t = t.replace(URDU_DIACRITICS, "");
  for (const [from, to] of URDU_CORRECT) t = t.split(from).join(to);
  for (const [from, to] of URDU_COMBINE) t = t.split(from).join(to);
  // digits_space: spaces between Urdu characters and digits.
  t = t.replace(/([\u0621-\u065f\u066e-\u06d3])(?=[0-9])/g, "$1 ");
  t = t.replace(/([0-9])(?=[\u0621-\u064a\u066e-\u06d3])/g, "$1 ");
  // all_punctuations_space (Urdu punctuation set).
  const punct = "\u061b\u060c\u066b\u061f\u06d4\u066a";
  t = t.replace(new RegExp("([\\u0621-\\u06d3])(?=[" + punct + "])", "g"), "$1 ");
  t = t.replace(new RegExp("(?<=[" + punct + "])(?=[^" + punct + "0-9 \\n])", "g"), " ");
  // english_characters_space.
  t = t.replace(/([\u0621-\u065f\u066e-\u06d3])(?=[a-zA-Z])/g, "$1 ");
  t = t.replace(/([a-zA-Z])(?=[\u0621-\u065f\u066e-\u06d3])/g, "$1 ");
  return t;
}

// --- Indic trivial tokenize / detokenize ------------------------------------------

function escapeCharClass(s: string): string {
  return s.replace(/[\\\]\[\-\^]/g, (c) => "\\" + c);
}

const ASCII_PUNCT = "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~";
const TRIVIAL_INDIC_PUNCT =
  ASCII_PUNCT + "\u0964\u0965\uAAF1\uAAF0\uABEB\uABEC\uABED\uABEE\uABEF\u1C7E\u1C7F";
const TRIVIAL_URDU_PUNCT =
  ASCII_PUNCT + "\u0609\u060A\u060C\u061E\u066A\u066B\u066C\u066D\u06D4";

function trivialTokenize(text: string, iso: string): string[] {
  const punct = iso === "ur" ? TRIVIAL_URDU_PUNCT : TRIVIAL_INDIC_PUNCT;
  const pattern = new RegExp("([" + escapeCharClass(punct) + "])", "g");
  let s = text.replace(/\t/g, " ").replace(pattern, " $1 ");
  s = s.replace(/[ ]+/g, " ").trim();
  s = s.replace(/([0-9]+ [,.:/] )+([0-9]+)/g, (m) => m.replace(/ /g, ""));
  return s.split(" ").filter(Boolean);
}

export function trivialDetokenize(text: string): string {
  let s = text;
  s = s.replace(/([0-9]+ [,.:/] )+([0-9]+)/g, (m) => m.replace(/ /g, ""));
  s = s.replace(/ ([!%)\]},.:;>?\u0964\u0965])/g, "$1");
  s = s.replace(/([#$(\[{<@]) /g, "$1");
  s = s.replace(/ ([-\/\\]) /g, "$1");
  for (const punc of ["'", '"', "`"]) {
    let cnt = 0;
    let out = "";
    for (const c of s) {
      if (c === punc) {
        out += cnt % 2 === 0 ? "@RA" : "@LA";
        cnt += 1;
      } else out += c;
    }
    s = out.replace(/@RA /g, punc).replace(/ @LA/g, punc).replace(/@RA/g, punc).replace(/@LA/g, punc);
  }
  return s;
}

// --- The processor -----------------------------------------------------------------

export type PreprocessResult = {
  /** The final string fed to the source tokenizer, tags included. */
  text: string;
  /** Placeholder map for postprocessing. */
  placeholders: Map<string, string>;
};

export class IndicProcessor {
  preprocess(sent: string, srcLang: string, tgtLang: string): PreprocessResult {
    let s = puncNorm(sent);
    s = normalizeDigits(s);
    const { text: wrapped, map } = wrapWithPlaceholders(s);
    s = wrapped;

    const iso = FLORES_TO_ISO[srcLang] ?? "hi";
    const scriptPart = srcLang.split("_")[1] ?? "";
    const doTransliterate = !["Arab", "Aran", "Olck", "Mtei", "Latn"].includes(scriptPart);

    let processed: string;
    if (iso === "en") {
      const normed = mosesPunctNormalizeEn(s.trim());
      processed = mosesTokenizeEn(normed).join(" ");
    } else {
      const normed = iso === "ur" ? normalizeUrdu(s) : normalizeIndicScript(s, iso);
      let joined = trivialTokenize(normed, iso).join(" ");
      if (doTransliterate) {
        joined = transliterate(joined, iso, "hi");
        joined = joined.split(" ् ").join("्");
      }
      processed = joined;
    }
    processed = processed.trim();
    return { text: `${srcLang} ${tgtLang} ${processed}`, placeholders: map };
  }

  postprocess(sent: string, lang: string, placeholders: Map<string, string>): string {
    let s = sent;
    const parts = lang.split("_");
    const lCode = parts[0] ?? "";
    const sCode = parts.slice(1).join("_");
    const iso = FLORES_TO_ISO[lang] ?? "hi";

    if (sCode === "Arab" || sCode === "Aran") {
      s = s.split(" ؟").join("؟").split(" ۔").join("۔").split(" ،").join("،").split("ٮ۪").join("ؠ");
    }
    if (lCode === "ory") {
      s = s.split("ଯ଼").join("ୟ");
    }
    for (const [k, v] of placeholders) {
      s = s.split(k).join(v);
    }
    if (lang === "eng_Latn") {
      return mosesDetokenizeEn(s.split(" "));
    }
    const xlated = transliterate(s, "hi", iso);
    return trivialDetokenize(xlated);
  }
}
