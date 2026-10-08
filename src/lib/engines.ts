/**
 * The engine table. One full multilingual model (NLLB-200) covers every
 * pair, small single pair Opus-MT models cover the pairs with a verified
 * conversion, and group models cover whole language families with one
 * download.
 *
 * Group models take a language tag, ">>hrv<<", at the start of the source
 * text. The pair entry records the tag; the worker adds it and never shows
 * it anywhere.
 *
 * Every entry was verified against the Hugging Face Hub (repo, quantized ONNX
 * files, sizes, licenses) by the research recorded in scripts/hub-research.json
 * and scripts/language-audit/hub-audit.json. Entries must also pass a ten
 * sentence quality gate in the browser against the full model's output; the
 * gate's verdicts live in scripts/language-audit/gate-results.json. Models
 * that failed were removed.
 *
 * Sizes are the q8 download bundle: the quantized ONNX encoder and decoder
 * plus tokenizer and config files.
 */

export type EngineKind = "nllb" | "opus";

export type EngineDescriptor = {
  /** Stable key, used in the protocol and the saved model list. */
  id: string;
  kind: EngineKind;
  modelId: string;
  /** Plain language name, shown in Details and Settings. */
  name: string;
  /** q8 bundle size in bytes, verified from the Hub. */
  expectedBytes: number;
  license: string;
  licenseUrl: string;
  /** Who made the model. */
  attribution: string;
  /** True for group models: one model, many languages, a tag per pair. */
  group?: boolean;
};

/** What a language pair needs: an engine, plus the tag for group models. */
export type PairEngine = EngineDescriptor & {
  /** The ">>tag<<" language code for group models. Absent otherwise. */
  tag?: string;
};

export const NLLB_ENGINE: EngineDescriptor = {
  id: "nllb-200-distilled-600M",
  kind: "nllb",
  modelId: "Xenova/nllb-200-distilled-600M",
  name: "NLLB-200 (distilled 600M)",
  expectedBytes: 911962632,
  license: "CC BY-NC 4.0",
  licenseUrl: "https://huggingface.co/facebook/nllb-200-distilled-600M",
  attribution: "Meta AI",
};

/** Single pair models: one pair, one small model, no language tag. */
function opus(
  id: string,
  modelId: string,
  name: string,
  expectedBytes: number,
  license: string,
  licenseUrl: string,
): EngineDescriptor {
  return { id, kind: "opus", modelId, name, expectedBytes, license, licenseUrl, attribution: "Helsinki NLP" };
}

/**
 * The engine table. Keys are registry codes joined with "|".
 *
 * Single pair entries first: the popular pairs with a verified Opus-MT
 * conversion, in both directions where the conversion exists.
 */
export const ENGINE_TABLE: Record<string, PairEngine> = {
  // --- English to French, Spanish, German, Italian, Dutch (verified, shipped) ---
  "eng_Latn|fra_Latn": opus("opus-en-fr", "Xenova/opus-mt-en-fr", "Opus-MT English to French", 113111807, "Apache-2.0", "https://huggingface.co/Helsinki-NLP/opus-mt-en-fr"),
  "fra_Latn|eng_Latn": opus("opus-fr-en", "Xenova/opus-mt-fr-en", "Opus-MT French to English", 113111807, "Apache-2.0", "https://huggingface.co/Helsinki-NLP/opus-mt-fr-en"),
  "eng_Latn|spa_Latn": opus("opus-en-es", "Xenova/opus-mt-en-es", "Opus-MT English to Spanish", 119377345, "Apache-2.0", "https://huggingface.co/Helsinki-NLP/opus-mt-en-es"),
  "spa_Latn|eng_Latn": opus("opus-es-en", "Xenova/opus-mt-es-en", "Opus-MT Spanish to English", 119377310, "Apache-2.0", "https://huggingface.co/Helsinki-NLP/opus-mt-es-en"),
  "eng_Latn|deu_Latn": opus("opus-en-de", "Xenova/opus-mt-en-de", "Opus-MT English to German", 111519854, "CC BY 4.0", "https://huggingface.co/Helsinki-NLP/opus-mt-en-de"),
  "deu_Latn|eng_Latn": opus("opus-de-en", "Xenova/opus-mt-de-en", "Opus-MT German to English", 111519819, "Apache-2.0", "https://huggingface.co/Helsinki-NLP/opus-mt-de-en"),
  "eng_Latn|ita_Latn": opus("opus-en-it", "Xenova/opus-mt-en-it", "Opus-MT English to Italian", 136474118, "Apache-2.0", "https://huggingface.co/Helsinki-NLP/opus-mt-en-it"),
  "ita_Latn|eng_Latn": opus("opus-it-en", "Xenova/opus-mt-it-en", "Opus-MT Italian to English", 136865467, "Apache-2.0", "https://huggingface.co/Helsinki-NLP/opus-mt-it-en"),
  "eng_Latn|nld_Latn": opus("opus-en-nl", "Xenova/opus-mt-en-nl", "Opus-MT English to Dutch", 121631490, "Apache-2.0", "https://huggingface.co/Helsinki-NLP/opus-mt-en-nl"),
  "nld_Latn|eng_Latn": opus("opus-nl-en", "Xenova/opus-mt-nl-en", "Opus-MT Dutch to English", 121631492, "Apache-2.0", "https://huggingface.co/Helsinki-NLP/opus-mt-nl-en"),
  // --- English to Russian, Chinese, Arabic, Hindi (verified, shipped) ---
  "eng_Latn|rus_Cyrl": opus("opus-en-ru", "Xenova/opus-mt-en-ru", "Opus-MT English to Russian", 117767433, "Apache-2.0", "https://huggingface.co/Helsinki-NLP/opus-mt-en-ru"),
  "rus_Cyrl|eng_Latn": opus("opus-ru-en", "Xenova/opus-mt-ru-en", "Opus-MT Russian to English", 117767433, "CC BY 4.0", "https://huggingface.co/Helsinki-NLP/opus-mt-ru-en"),
  "eng_Latn|zho_Hans": opus("opus-en-zh", "Xenova/opus-mt-en-zh", "Opus-MT English to Chinese", 119495650, "Apache-2.0", "https://huggingface.co/Helsinki-NLP/opus-mt-en-zh"),
  "zho_Hans|eng_Latn": opus("opus-zh-en", "Xenova/opus-mt-zh-en", "Opus-MT Chinese to English", 119495923, "CC BY 4.0", "https://huggingface.co/Helsinki-NLP/opus-mt-zh-en"),
  "eng_Latn|arb_Arab": opus("opus-en-ar", "Xenova/opus-mt-en-ar", "Opus-MT English to Arabic", 117602860, "Apache-2.0", "https://huggingface.co/Helsinki-NLP/opus-mt-en-ar"),
  "arb_Arab|eng_Latn": opus("opus-ar-en", "Xenova/opus-mt-ar-en", "Opus-MT Arabic to English", 117621540, "Apache-2.0", "https://huggingface.co/Helsinki-NLP/opus-mt-ar-en"),
  "eng_Latn|hin_Deva": opus("opus-en-hi", "Xenova/opus-mt-en-hi", "Opus-MT English to Hindi", 116657716, "Apache-2.0", "https://huggingface.co/Helsinki-NLP/opus-mt-en-hi"),
  "hin_Deva|eng_Latn": opus("opus-hi-en", "Xenova/opus-mt-hi-en", "Opus-MT Hindi to English", 115710250, "Apache-2.0", "https://huggingface.co/Helsinki-NLP/opus-mt-hi-en"),
  // --- Japanese to English, Turkish to English (verified, shipped) ---
  "jpn_Jpan|eng_Latn": opus("opus-ja-en", "Xenova/opus-mt-ja-en", "Opus-MT Japanese to English", 114701074, "Apache-2.0", "https://huggingface.co/Helsinki-NLP/opus-mt-ja-en"),
  "tur_Latn|eng_Latn": opus("opus-tr-en", "Xenova/opus-mt-tr-en", "Opus-MT Turkish to English", 116553011, "Apache-2.0", "https://huggingface.co/Helsinki-NLP/opus-mt-tr-en"),

  // --- More single pairs, verified on the Hub and through the browser
  // quality gate (scripts/language-audit/gate-results.json) ---
  "eng_Latn|afr_Latn": opus("opus-en-af", "Xenova/opus-mt-en-af", "Opus-MT English to Afrikaans", 110916369, "Apache-2.0", "https://huggingface.co/Helsinki-NLP/opus-mt-en-af"),
  "afr_Latn|eng_Latn": opus("opus-af-en", "Xenova/opus-mt-af-en", "Opus-MT Afrikaans to English", 110916369, "Apache-2.0", "https://huggingface.co/Helsinki-NLP/opus-mt-af-en"),
  "eng_Latn|ces_Latn": opus("opus-en-cs", "Xenova/opus-mt-en-cs", "Opus-MT English to Czech", 116695600, "Apache-2.0", "https://huggingface.co/Helsinki-NLP/opus-mt-en-cs"),
  "ces_Latn|eng_Latn": opus("opus-cs-en", "Xenova/opus-mt-cs-en", "Opus-MT Czech to English", 116695600, "Apache-2.0", "https://huggingface.co/Helsinki-NLP/opus-mt-cs-en"),
  "eng_Latn|dan_Latn": opus("opus-en-da", "Xenova/opus-mt-en-da", "Opus-MT English to Danish", 112559065, "Apache-2.0", "https://huggingface.co/Helsinki-NLP/opus-mt-en-da"),
  "dan_Latn|eng_Latn": opus("opus-da-en", "Xenova/opus-mt-da-en", "Opus-MT Danish to English", 112559063, "Apache-2.0", "https://huggingface.co/Helsinki-NLP/opus-mt-da-en"),
  "eng_Latn|fin_Latn": opus("opus-en-fi", "Xenova/opus-mt-en-fi", "Opus-MT English to Finnish", 119430062, "Apache-2.0", "https://huggingface.co/Helsinki-NLP/opus-mt-en-fi"),
  "fin_Latn|eng_Latn": opus("opus-fi-en", "Xenova/opus-mt-fi-en", "Opus-MT Finnish to English", 113395438, "Apache-2.0", "https://huggingface.co/Helsinki-NLP/opus-mt-fi-en"),
  "eng_Latn|hun_Latn": opus("opus-en-hu", "Xenova/opus-mt-en-hu", "Opus-MT English to Hungarian", 116699390, "Apache-2.0", "https://huggingface.co/Helsinki-NLP/opus-mt-en-hu"),
  "hun_Latn|eng_Latn": opus("opus-hu-en", "Xenova/opus-mt-hu-en", "Opus-MT Hungarian to English", 116699390, "Apache-2.0", "https://huggingface.co/Helsinki-NLP/opus-mt-hu-en"),
  "eng_Latn|ind_Latn": opus("opus-en-id", "Xenova/opus-mt-en-id", "Opus-MT English to Indonesian", 107915165, "Apache-2.0", "https://huggingface.co/Helsinki-NLP/opus-mt-en-id"),
  "ind_Latn|eng_Latn": opus("opus-id-en", "Xenova/opus-mt-id-en", "Opus-MT Indonesian to English", 107915167, "Apache-2.0", "https://huggingface.co/Helsinki-NLP/opus-mt-id-en"),
  "eng_Latn|ron_Latn": opus("opus-en-ro", "Xenova/opus-mt-en-ro", "Opus-MT English to Romanian", 113247080, "Apache-2.0", "https://huggingface.co/Helsinki-NLP/opus-mt-en-ro"),
  "eng_Latn|swe_Latn": opus("opus-en-sv", "Xenova/opus-mt-en-sv", "Opus-MT English to Swedish", 109758487, "Apache-2.0", "https://huggingface.co/Helsinki-NLP/opus-mt-en-sv"),
  "swe_Latn|eng_Latn": opus("opus-sv-en", "Xenova/opus-mt-sv-en", "Opus-MT Swedish to English", 109758487, "Apache-2.0", "https://huggingface.co/Helsinki-NLP/opus-mt-sv-en"),
  "eng_Latn|ukr_Cyrl": opus("opus-en-uk", "Xenova/opus-mt-en-uk", "Opus-MT English to Ukrainian", 116527003, "Apache-2.0", "https://huggingface.co/Helsinki-NLP/opus-mt-en-uk"),
  "ukr_Cyrl|eng_Latn": opus("opus-uk-en", "Xenova/opus-mt-uk-en", "Opus-MT Ukrainian to English", 116527003, "Apache-2.0", "https://huggingface.co/Helsinki-NLP/opus-mt-uk-en"),
  "eng_Latn|vie_Latn": opus("opus-en-vi", "Xenova/opus-mt-en-vi", "Opus-MT English to Vietnamese", 106645280, "Apache-2.0", "https://huggingface.co/Helsinki-NLP/opus-mt-en-vi"),
  "vie_Latn|eng_Latn": opus("opus-vi-en", "Xenova/opus-mt-vi-en", "Opus-MT Vietnamese to English", 106706954, "Apache-2.0", "https://huggingface.co/Helsinki-NLP/opus-mt-vi-en"),
  "kor_Hang|eng_Latn": opus("opus-ko-en", "Xenova/opus-mt-ko-en", "Opus-MT Korean to English", 119601626, "Apache-2.0", "https://huggingface.co/Helsinki-NLP/opus-mt-ko-en"),
  "pol_Latn|eng_Latn": opus("opus-pl-en", "Xenova/opus-mt-pl-en", "Opus-MT Polish to English", 117618157, "Apache-2.0", "https://huggingface.co/Helsinki-NLP/opus-mt-pl-en"),
  "tha_Thai|eng_Latn": opus("opus-th-en", "Xenova/opus-mt-th-en", "Opus-MT Thai to English", 117356397, "Apache-2.0", "https://huggingface.co/Helsinki-NLP/opus-mt-th-en"),
};

// --- Group models -----------------------------------------------------------------
//
// One model covers several pairs. The engine carries the download; each pair
// entry below adds the tag the worker prepends to the source text.
//
// The language audit tested every group pair in the browser against the full
// model's output on ten sentences, scored it with chrF calibrated on the
// already shipped pairs (floor: en->zh at 46.0; the removed hallucinating
// en->ja had scored 5.4), and reviewed every output by hand. Only the pairs
// that cleared all three kept the group route: hallucinations (Amharic,
// Persian, Swahili, Nepali, Marathi, Tamil, Yoruba, Pashto and more), mid word
// truncations (English to Greek, Assamese, Odia), central noun substitutions
// (Hebrew, Bengali, Urdu, Malay) and clause dropping (Traditional Chinese)
// were all rejected, with the reasons recorded per pair in
// scripts/language-audit/verdicts.json. Those languages use the full model,
// with the honest heavy ask before their one time download.

const EN_MUL = opus("opus-en-mul", "Xenova/opus-mt-en-mul", "Opus-MT English to Croatian, Serbian, Bulgarian and Norwegian", 118280580, "Apache-2.0", "https://huggingface.co/Helsinki-NLP/opus-mt-en-mul");
EN_MUL.group = true;
const MUL_EN = opus("opus-mul-en", "Xenova/opus-mt-mul-en", "Opus-MT Croatian, Serbian, Bulgarian, Norwegian and Greek to English", 118351797, "Apache-2.0", "https://huggingface.co/Helsinki-NLP/opus-mt-mul-en");
MUL_EN.group = true;
const EN_ROMANCE = opus("opus-en-romance", "Xenova/opus-mt-en-ROMANCE", "Opus-MT English to Portuguese", 119232615, "Apache-2.0", "https://huggingface.co/Helsinki-NLP/opus-mt-en-ROMANCE");
EN_ROMANCE.group = true;
const ROMANCE_EN = opus("opus-romance-en", "Xenova/opus-mt-ROMANCE-en", "Opus-MT Portuguese and Romanian to English", 119234926, "Apache-2.0", "https://huggingface.co/Helsinki-NLP/opus-mt-ROMANCE-en");
ROMANCE_EN.group = true;

/** English to X through the many target model: pair -> language tag. */
const EN_MUL_PAIRS: Record<string, string> = {
  "eng_Latn|hrv_Latn": "hrv",
  "eng_Latn|bul_Cyrl": "bul",
  "eng_Latn|srp_Cyrl": "srp_Cyrl",
  "eng_Latn|nob_Latn": "nob",
};

/**
 * X to English through the many source model: tagless, no prefix needed.
 * Greek to English only: the English to Greek direction of this model
 * truncates sentences mid word and was rejected by the audit.
 */
const MUL_EN_PAIRS = [
  "hrv_Latn", "bul_Cyrl", "srp_Cyrl", "nob_Latn", "ell_Grek",
];

/** English to Portuguese through the Romance group model. */
const EN_ROMANCE_PAIRS: Record<string, string> = {
  "eng_Latn|por_Latn": "pt",
};

/** Portuguese and Romanian to English: tagless Romance model. */
const ROMANCE_EN_PAIRS = ["por_Latn", "ron_Latn"];

for (const [pair, tag] of Object.entries(EN_MUL_PAIRS)) {
  ENGINE_TABLE[pair] = { ...EN_MUL, tag };
}
for (const code of MUL_EN_PAIRS) {
  ENGINE_TABLE[`${code}|eng_Latn`] = { ...MUL_EN };
}
for (const [pair, tag] of Object.entries(EN_ROMANCE_PAIRS)) {
  ENGINE_TABLE[pair] = { ...EN_ROMANCE, tag };
}
for (const code of ROMANCE_EN_PAIRS) {
  ENGINE_TABLE[`${code}|eng_Latn`] = { ...ROMANCE_EN };
}

/**
 * The engine to use for a pair. Order of choice: a single pair small model,
 * then a verified group small model, then the full model. A pair of two non
 * English languages uses the full model; nothing pivots through English.
 */
export function engineForPair(src: string, tgt: string, fastModelsEnabled: boolean): PairEngine {
  if (fastModelsEnabled) {
    const fast = ENGINE_TABLE[`${src}|${tgt}`];
    if (fast) return fast;
  }
  return NLLB_ENGINE;
}

/** What a pair costs to set up: which kind of engine and how many bytes. */
export type PairCost = {
  kind: "fast" | "group" | "large";
  expectedBytes: number;
};

/**
 * The up front cost of a pair, for the quiet notes beside every language in
 * the picker and the language grid. English on either side can have a small
 * model; a pair of two non English languages always needs the full model.
 */
export function pairCost(src: string, tgt: string, fastModelsEnabled: boolean): PairCost {
  const engine = engineForPair(src, tgt, fastModelsEnabled);
  if (engine.kind === "nllb") return { kind: "large", expectedBytes: engine.expectedBytes };
  return { kind: engine.group ? "group" : "fast", expectedBytes: engine.expectedBytes };
}

/**
 * The pair that would result from picking a language on one side, including
 * the swap that happens when it is already set on the other side.
 */
export function resultingPair(side: "source" | "target", code: string, src: string, tgt: string): { src: string; tgt: string } {
  if (side === "source") {
    return code === tgt ? { src: code, tgt: src } : { src: code, tgt };
  }
  return code === src ? { src: tgt, tgt: code } : { src, tgt: code };
}

/** Every engine the app can end up with, for listings and licenses. */
export function allEngines(): EngineDescriptor[] {
  const seen = new Map<string, EngineDescriptor>();
  for (const pair of Object.values(ENGINE_TABLE)) {
    if (!seen.has(pair.id)) seen.set(pair.id, pair);
  }
  return [NLLB_ENGINE, ...seen.values()];
}

export function engineById(id: string): EngineDescriptor | undefined {
  return allEngines().find((engine) => engine.id === id);
}
