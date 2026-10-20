/**
 * The language registry. One typed list drives the picker, the engine and the
 * speech and layout settings. Nothing else in the code hard codes a language.
 *
 * Codes are NLLB-200 codes, verified against the model's tokenizer
 * (all 56 are in the model's language set). The picker always sorts by the
 * English name with a locale aware comparison.
 */

export type Language = {
  /** NLLB-200 code used by the translation model, e.g. 'fra_Latn' */
  code: string;
  english: string;
  native: string;
  dir: "ltr" | "rtl";
  /** BCP 47 tag for the lang attribute, Intl.Segmenter and speech */
  bcp47: string;
  /** Preferred speech language tag, when a regional form helps voice matching */
  speech?: string;
};

export const LANGUAGES: Language[] = [
  { code: "afr_Latn", english: "Afrikaans", native: "Afrikaans", dir: "ltr", bcp47: "af", speech: "af-ZA" },
  { code: "amh_Ethi", english: "Amharic", native: "አማርኛ", dir: "ltr", bcp47: "am", speech: "am-ET" },
  { code: "arb_Arab", english: "Arabic", native: "العربية", dir: "rtl", bcp47: "ar" },
  { code: "asm_Beng", english: "Assamese", native: "অসমীয়া", dir: "ltr", bcp47: "as" },
  { code: "ben_Beng", english: "Bengali", native: "বাংলা", dir: "ltr", bcp47: "bn", speech: "bn-IN" },
  { code: "bul_Cyrl", english: "Bulgarian", native: "Български", dir: "ltr", bcp47: "bg", speech: "bg-BG" },
  { code: "cat_Latn", english: "Catalan", native: "Català", dir: "ltr", bcp47: "ca", speech: "ca-ES" },
  { code: "zho_Hans", english: "Chinese (Simplified)", native: "简体中文", dir: "ltr", bcp47: "zh-Hans", speech: "zh-CN" },
  { code: "zho_Hant", english: "Chinese (Traditional)", native: "繁體中文", dir: "ltr", bcp47: "zh-Hant", speech: "zh-Hant" },
  { code: "hrv_Latn", english: "Croatian", native: "Hrvatski", dir: "ltr", bcp47: "hr", speech: "hr-HR" },
  { code: "ces_Latn", english: "Czech", native: "Čeština", dir: "ltr", bcp47: "cs", speech: "cs-CZ" },
  { code: "dan_Latn", english: "Danish", native: "Dansk", dir: "ltr", bcp47: "da", speech: "da-DK" },
  { code: "nld_Latn", english: "Dutch", native: "Nederlands", dir: "ltr", bcp47: "nl", speech: "nl-NL" },
  { code: "eng_Latn", english: "English", native: "English", dir: "ltr", bcp47: "en", speech: "en-US" },
  { code: "fin_Latn", english: "Finnish", native: "Suomi", dir: "ltr", bcp47: "fi", speech: "fi-FI" },
  { code: "fra_Latn", english: "French", native: "Français", dir: "ltr", bcp47: "fr", speech: "fr-FR" },
  { code: "deu_Latn", english: "German", native: "Deutsch", dir: "ltr", bcp47: "de", speech: "de-DE" },
  { code: "ell_Grek", english: "Greek", native: "Ελληνικά", dir: "ltr", bcp47: "el", speech: "el-GR" },
  { code: "guj_Gujr", english: "Gujarati", native: "ગુજરાતી", dir: "ltr", bcp47: "gu", speech: "gu-IN" },
  { code: "hau_Latn", english: "Hausa", native: "Hausa", dir: "ltr", bcp47: "ha" },
  { code: "heb_Hebr", english: "Hebrew", native: "עברית", dir: "rtl", bcp47: "he", speech: "he-IL" },
  { code: "hin_Deva", english: "Hindi", native: "हिन्दी", dir: "ltr", bcp47: "hi", speech: "hi-IN" },
  { code: "hun_Latn", english: "Hungarian", native: "Magyar", dir: "ltr", bcp47: "hu", speech: "hu-HU" },
  { code: "ind_Latn", english: "Indonesian", native: "Bahasa Indonesia", dir: "ltr", bcp47: "id", speech: "id-ID" },
  { code: "ita_Latn", english: "Italian", native: "Italiano", dir: "ltr", bcp47: "it", speech: "it-IT" },
  { code: "jpn_Jpan", english: "Japanese", native: "日本語", dir: "ltr", bcp47: "ja", speech: "ja-JP" },
  { code: "kan_Knda", english: "Kannada", native: "ಕನ್ನಡ", dir: "ltr", bcp47: "kn", speech: "kn-IN" },
  { code: "kor_Hang", english: "Korean", native: "한국어", dir: "ltr", bcp47: "ko", speech: "ko-KR" },
  { code: "zsm_Latn", english: "Malay", native: "Bahasa Melayu", dir: "ltr", bcp47: "ms", speech: "ms-MY" },
  { code: "mal_Mlym", english: "Malayalam", native: "മലയാളം", dir: "ltr", bcp47: "ml", speech: "ml-IN" },
  { code: "mar_Deva", english: "Marathi", native: "मराठी", dir: "ltr", bcp47: "mr", speech: "mr-IN" },
  { code: "npi_Deva", english: "Nepali", native: "नेपाली", dir: "ltr", bcp47: "ne", speech: "ne-NP" },
  { code: "nob_Latn", english: "Norwegian Bokmål", native: "Norsk bokmål", dir: "ltr", bcp47: "nb", speech: "nb-NO" },
  { code: "ory_Orya", english: "Odia", native: "ଓଡ଼ିଆ", dir: "ltr", bcp47: "or", speech: "or-IN" },
  { code: "pbt_Arab", english: "Pashto", native: "پښتو", dir: "rtl", bcp47: "ps" },
  { code: "pes_Arab", english: "Persian", native: "فارسی", dir: "rtl", bcp47: "fa", speech: "fa-IR" },
  { code: "pol_Latn", english: "Polish", native: "Polski", dir: "ltr", bcp47: "pl", speech: "pl-PL" },
  { code: "por_Latn", english: "Portuguese", native: "Português", dir: "ltr", bcp47: "pt", speech: "pt-BR" },
  { code: "pan_Guru", english: "Punjabi", native: "ਪੰਜਾਬੀ", dir: "ltr", bcp47: "pa", speech: "pa-IN" },
  { code: "ron_Latn", english: "Romanian", native: "Română", dir: "ltr", bcp47: "ro", speech: "ro-RO" },
  { code: "rus_Cyrl", english: "Russian", native: "Русский", dir: "ltr", bcp47: "ru", speech: "ru-RU" },
  { code: "srp_Cyrl", english: "Serbian", native: "Српски", dir: "ltr", bcp47: "sr", speech: "sr-RS" },
  { code: "sin_Sinh", english: "Sinhala", native: "සිංහල", dir: "ltr", bcp47: "si", speech: "si-LK" },
  { code: "spa_Latn", english: "Spanish", native: "Español", dir: "ltr", bcp47: "es", speech: "es-ES" },
  { code: "swh_Latn", english: "Swahili", native: "Kiswahili", dir: "ltr", bcp47: "sw" },
  { code: "swe_Latn", english: "Swedish", native: "Svenska", dir: "ltr", bcp47: "sv", speech: "sv-SE" },
  { code: "tgl_Latn", english: "Tagalog", native: "Tagalog", dir: "ltr", bcp47: "tl", speech: "tl-PH" },
  { code: "tam_Taml", english: "Tamil", native: "தமிழ்", dir: "ltr", bcp47: "ta", speech: "ta-IN" },
  { code: "tel_Telu", english: "Telugu", native: "తెలుగు", dir: "ltr", bcp47: "te", speech: "te-IN" },
  { code: "tha_Thai", english: "Thai", native: "ไทย", dir: "ltr", bcp47: "th", speech: "th-TH" },
  { code: "tur_Latn", english: "Turkish", native: "Türkçe", dir: "ltr", bcp47: "tr", speech: "tr-TR" },
  { code: "ukr_Cyrl", english: "Ukrainian", native: "Українська", dir: "ltr", bcp47: "uk", speech: "uk-UA" },
  { code: "urd_Arab", english: "Urdu", native: "اردو", dir: "rtl", bcp47: "ur", speech: "ur-PK" },
  { code: "vie_Latn", english: "Vietnamese", native: "Tiếng Việt", dir: "ltr", bcp47: "vi", speech: "vi-VN" },
  { code: "yor_Latn", english: "Yoruba", native: "Yorùbá", dir: "ltr", bcp47: "yo" },
  { code: "zul_Latn", english: "Zulu", native: "isiZulu", dir: "ltr", bcp47: "zu", speech: "zu-ZA" },
];

const collator = new Intl.Collator("en", { sensitivity: "base" });

/** The registry sorted by English name, always, including when filtered. */
export const SORTED_LANGUAGES: Language[] = [...LANGUAGES].sort((a, b) => collator.compare(a.english, b.english));

const BY_CODE = new Map(SORTED_LANGUAGES.map((l) => [l.code, l]));

export function languageByCode(code: string): Language | undefined {
  return BY_CODE.get(code);
}

/** Search matching either the English or the native name, keeping the sort. */
export function searchLanguages(query: string): Language[] {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return SORTED_LANGUAGES;
  return SORTED_LANGUAGES.filter(
    (l) =>
      l.english.toLocaleLowerCase().includes(q) ||
      l.native.toLocaleLowerCase().includes(q),
  );
}
