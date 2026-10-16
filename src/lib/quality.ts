/**
 * Honest quality tiers per language, GENERATED from the benchmark data
 * (scripts/benchmark/quality-table.json; regenerate with
 * `bun scripts/benchmark/gen-quality.mjs` after any route change).
 *
 * Every routed direction was scored with chrF++ on the same 200 professional
 * FLORES-200 translations, against the published full NLLB-200 600M score
 * for that direction. Tier meaning:
 *   best     "pass": within 2 chrF of the published full-model score.
 *   good     "borderline": 2-5 chrF below, or passing with more flagged
 *            sentences than the bar allows.
 *   limited  "fail": 5+ chrF below the full model (still the best
 *            browser-ready option we found; labeled honestly).
 *   full     the full model serves this direction.
 *
 * gap is local chrF++ minus the published full-model chrF++ (positive means
 * the small model scored ABOVE the full model's published number).
 */

export type QualityTier = "best" | "good" | "limited" | "full";

export type DirectionQuality = {
  tier: QualityTier;
  /** chrF++ gap vs the published full-model score, when measured. */
  gap: number | null;
};

export type LanguageQuality = {
  code: string;
  english: string;
  /** The weaker direction decides the language-level label. */
  tier: QualityTier;
  /** Per direction: "en->" for English-to-x and "->en" for x-to-English,
   *  full "src->tgt" keys for anything else. */
  directions: Record<string, DirectionQuality>;
};

export const LANGUAGE_QUALITY: LanguageQuality[] = [
  {
    "code": "afr_Latn",
    "english": "Afrikaans",
    "tier": "good",
    "directions": {
      "->en": {
        "tier": "best",
        "gap": -0.31
      },
      "en->": {
        "tier": "good",
        "gap": -4.34
      }
    }
  },
  {
    "code": "amh_Ethi",
    "english": "Amharic",
    "tier": "full",
    "directions": {
      "->en": {
        "tier": "full",
        "gap": null
      },
      "en->": {
        "tier": "full",
        "gap": null
      }
    }
  },
  {
    "code": "arb_Arab",
    "english": "Arabic",
    "tier": "good",
    "directions": {
      "->en": {
        "tier": "good",
        "gap": -3.57
      },
      "en->": {
        "tier": "good",
        "gap": -1.84
      }
    }
  },
  {
    "code": "asm_Beng",
    "english": "Assamese",
    "tier": "best",
    "directions": {
      "->en": {
        "tier": "best",
        "gap": 1.93
      },
      "en->": {
        "tier": "best",
        "gap": 4.24
      }
    }
  },
  {
    "code": "ben_Beng",
    "english": "Bengali",
    "tier": "best",
    "directions": {
      "->en": {
        "tier": "best",
        "gap": 2.81
      },
      "en->": {
        "tier": "best",
        "gap": 5.06
      }
    }
  },
  {
    "code": "bul_Cyrl",
    "english": "Bulgarian",
    "tier": "best",
    "directions": {
      "->en": {
        "tier": "best",
        "gap": -0.39
      },
      "en->": {
        "tier": "best",
        "gap": 5.43
      }
    }
  },
  {
    "code": "cat_Latn",
    "english": "Catalan",
    "tier": "best",
    "directions": {
      "->en": {
        "tier": "best",
        "gap": -0.76
      },
      "en->": {
        "tier": "best",
        "gap": 3.45
      }
    }
  },
  {
    "code": "zho_Hans",
    "english": "Chinese (Simplified)",
    "tier": "good",
    "directions": {
      "->en": {
        "tier": "good",
        "gap": -4.03
      },
      "en->": {
        "tier": "good",
        "gap": 2.76
      }
    }
  },
  {
    "code": "zho_Hant",
    "english": "Chinese (Traditional)",
    "tier": "best",
    "directions": {
      "->en": {
        "tier": "best",
        "gap": 1.35
      },
      "en->": {
        "tier": "best",
        "gap": 8.04
      }
    }
  },
  {
    "code": "hrv_Latn",
    "english": "Croatian",
    "tier": "best",
    "directions": {
      "->en": {
        "tier": "best",
        "gap": 0.65
      },
      "en->": {
        "tier": "best",
        "gap": 5.6
      }
    }
  },
  {
    "code": "ces_Latn",
    "english": "Czech",
    "tier": "good",
    "directions": {
      "->en": {
        "tier": "good",
        "gap": -4.11
      },
      "en->": {
        "tier": "best",
        "gap": -1.29
      }
    }
  },
  {
    "code": "dan_Latn",
    "english": "Danish",
    "tier": "best",
    "directions": {
      "->en": {
        "tier": "best",
        "gap": -1.98
      },
      "en->": {
        "tier": "best",
        "gap": 1.42
      }
    }
  },
  {
    "code": "nld_Latn",
    "english": "Dutch",
    "tier": "good",
    "directions": {
      "->en": {
        "tier": "good",
        "gap": -2.62
      },
      "en->": {
        "tier": "best",
        "gap": 0.41
      }
    }
  },
  {
    "code": "fin_Latn",
    "english": "Finnish",
    "tier": "good",
    "directions": {
      "->en": {
        "tier": "good",
        "gap": -2.59
      },
      "en->": {
        "tier": "best",
        "gap": 3.8
      }
    }
  },
  {
    "code": "fra_Latn",
    "english": "French",
    "tier": "best",
    "directions": {
      "->en": {
        "tier": "best",
        "gap": -1.3
      },
      "en->": {
        "tier": "best",
        "gap": 0.18
      }
    }
  },
  {
    "code": "deu_Latn",
    "english": "German",
    "tier": "good",
    "directions": {
      "->en": {
        "tier": "good",
        "gap": -2.89
      },
      "en->": {
        "tier": "best",
        "gap": -0.75
      }
    }
  },
  {
    "code": "ell_Grek",
    "english": "Greek",
    "tier": "good",
    "directions": {
      "->en": {
        "tier": "good",
        "gap": -2.05
      },
      "en->": {
        "tier": "best",
        "gap": 2.05
      }
    }
  },
  {
    "code": "guj_Gujr",
    "english": "Gujarati",
    "tier": "best",
    "directions": {
      "->en": {
        "tier": "best",
        "gap": 2.2
      },
      "en->": {
        "tier": "best",
        "gap": 4.97
      }
    }
  },
  {
    "code": "hau_Latn",
    "english": "Hausa",
    "tier": "full",
    "directions": {
      "->en": {
        "tier": "full",
        "gap": null
      },
      "en->": {
        "tier": "full",
        "gap": null
      }
    }
  },
  {
    "code": "heb_Hebr",
    "english": "Hebrew",
    "tier": "best",
    "directions": {
      "->en": {
        "tier": "full",
        "gap": null
      },
      "en->": {
        "tier": "best",
        "gap": 2.48
      }
    }
  },
  {
    "code": "hin_Deva",
    "english": "Hindi",
    "tier": "best",
    "directions": {
      "->en": {
        "tier": "best",
        "gap": 3.18
      },
      "en->": {
        "tier": "best",
        "gap": 3.66
      }
    }
  },
  {
    "code": "hun_Latn",
    "english": "Hungarian",
    "tier": "good",
    "directions": {
      "->en": {
        "tier": "good",
        "gap": -3.26
      },
      "en->": {
        "tier": "best",
        "gap": 0.21
      }
    }
  },
  {
    "code": "ind_Latn",
    "english": "Indonesian",
    "tier": "good",
    "directions": {
      "->en": {
        "tier": "best",
        "gap": -1.42
      },
      "en->": {
        "tier": "good",
        "gap": -4.15
      }
    }
  },
  {
    "code": "ita_Latn",
    "english": "Italian",
    "tier": "good",
    "directions": {
      "->en": {
        "tier": "good",
        "gap": -2.57
      },
      "en->": {
        "tier": "best",
        "gap": 0.13
      }
    }
  },
  {
    "code": "jpn_Jpan",
    "english": "Japanese",
    "tier": "best",
    "directions": {
      "->en": {
        "tier": "best",
        "gap": 2.29
      },
      "en->": {
        "tier": "best",
        "gap": 5.31
      }
    }
  },
  {
    "code": "kan_Knda",
    "english": "Kannada",
    "tier": "best",
    "directions": {
      "->en": {
        "tier": "best",
        "gap": 1.91
      },
      "en->": {
        "tier": "best",
        "gap": 2.98
      }
    }
  },
  {
    "code": "kor_Hang",
    "english": "Korean",
    "tier": "best",
    "directions": {
      "->en": {
        "tier": "best",
        "gap": 0.4
      },
      "en->": {
        "tier": "full",
        "gap": null
      }
    }
  },
  {
    "code": "zsm_Latn",
    "english": "Malay",
    "tier": "good",
    "directions": {
      "->en": {
        "tier": "good",
        "gap": -2.2
      },
      "en->": {
        "tier": "best",
        "gap": 2.09
      }
    }
  },
  {
    "code": "mal_Mlym",
    "english": "Malayalam",
    "tier": "best",
    "directions": {
      "->en": {
        "tier": "best",
        "gap": 2.1
      },
      "en->": {
        "tier": "best",
        "gap": 7.3
      }
    }
  },
  {
    "code": "mar_Deva",
    "english": "Marathi",
    "tier": "best",
    "directions": {
      "->en": {
        "tier": "best",
        "gap": 3.53
      },
      "en->": {
        "tier": "best",
        "gap": 5.64
      }
    }
  },
  {
    "code": "npi_Deva",
    "english": "Nepali",
    "tier": "best",
    "directions": {
      "->en": {
        "tier": "best",
        "gap": 2.31
      },
      "en->": {
        "tier": "best",
        "gap": 6.34
      }
    }
  },
  {
    "code": "nob_Latn",
    "english": "Norwegian Bokmål",
    "tier": "best",
    "directions": {
      "->en": {
        "tier": "best",
        "gap": 0.83
      },
      "en->": {
        "tier": "best",
        "gap": 3.28
      }
    }
  },
  {
    "code": "ory_Orya",
    "english": "Odia",
    "tier": "best",
    "directions": {
      "->en": {
        "tier": "best",
        "gap": 2.22
      },
      "en->": {
        "tier": "best",
        "gap": 3.19
      }
    }
  },
  {
    "code": "pbt_Arab",
    "english": "Pashto",
    "tier": "full",
    "directions": {
      "->en": {
        "tier": "full",
        "gap": null
      },
      "en->": {
        "tier": "full",
        "gap": null
      }
    }
  },
  {
    "code": "pes_Arab",
    "english": "Persian",
    "tier": "best",
    "directions": {
      "->en": {
        "tier": "best",
        "gap": -1.26
      },
      "en->": {
        "tier": "best",
        "gap": 3.79
      }
    }
  },
  {
    "code": "pol_Latn",
    "english": "Polish",
    "tier": "good",
    "directions": {
      "->en": {
        "tier": "good",
        "gap": -4.93
      },
      "en->": {
        "tier": "full",
        "gap": null
      }
    }
  },
  {
    "code": "por_Latn",
    "english": "Portuguese",
    "tier": "good",
    "directions": {
      "->en": {
        "tier": "good",
        "gap": -4.75
      },
      "en->": {
        "tier": "good",
        "gap": -2.54
      }
    }
  },
  {
    "code": "pan_Guru",
    "english": "Punjabi",
    "tier": "best",
    "directions": {
      "->en": {
        "tier": "best",
        "gap": 1.81
      },
      "en->": {
        "tier": "best",
        "gap": 3.86
      }
    }
  },
  {
    "code": "ron_Latn",
    "english": "Romanian",
    "tier": "good",
    "directions": {
      "->en": {
        "tier": "good",
        "gap": -2.55
      },
      "en->": {
        "tier": "best",
        "gap": -1.36
      }
    }
  },
  {
    "code": "rus_Cyrl",
    "english": "Russian",
    "tier": "good",
    "directions": {
      "->en": {
        "tier": "best",
        "gap": -0.9
      },
      "en->": {
        "tier": "good",
        "gap": -2.34
      }
    }
  },
  {
    "code": "srp_Cyrl",
    "english": "Serbian",
    "tier": "best",
    "directions": {
      "->en": {
        "tier": "best",
        "gap": 0.36
      },
      "en->": {
        "tier": "best",
        "gap": 7.82
      }
    }
  },
  {
    "code": "sin_Sinh",
    "english": "Sinhala",
    "tier": "full",
    "directions": {
      "->en": {
        "tier": "full",
        "gap": null
      },
      "en->": {
        "tier": "full",
        "gap": null
      }
    }
  },
  {
    "code": "spa_Latn",
    "english": "Spanish",
    "tier": "good",
    "directions": {
      "->en": {
        "tier": "good",
        "gap": -2.42
      },
      "en->": {
        "tier": "best",
        "gap": 0.32
      }
    }
  },
  {
    "code": "swh_Latn",
    "english": "Swahili",
    "tier": "good",
    "directions": {
      "->en": {
        "tier": "full",
        "gap": null
      },
      "en->": {
        "tier": "good",
        "gap": -4.34
      }
    }
  },
  {
    "code": "swe_Latn",
    "english": "Swedish",
    "tier": "good",
    "directions": {
      "->en": {
        "tier": "good",
        "gap": -2.7
      },
      "en->": {
        "tier": "best",
        "gap": 0.82
      }
    }
  },
  {
    "code": "tgl_Latn",
    "english": "Tagalog",
    "tier": "full",
    "directions": {
      "->en": {
        "tier": "full",
        "gap": null
      },
      "en->": {
        "tier": "full",
        "gap": null
      }
    }
  },
  {
    "code": "tam_Taml",
    "english": "Tamil",
    "tier": "best",
    "directions": {
      "->en": {
        "tier": "best",
        "gap": 1.71
      },
      "en->": {
        "tier": "best",
        "gap": 5.01
      }
    }
  },
  {
    "code": "tel_Telu",
    "english": "Telugu",
    "tier": "good",
    "directions": {
      "->en": {
        "tier": "good",
        "gap": 1.37
      },
      "en->": {
        "tier": "best",
        "gap": 5.8
      }
    }
  },
  {
    "code": "tha_Thai",
    "english": "Thai",
    "tier": "best",
    "directions": {
      "->en": {
        "tier": "best",
        "gap": 1.19
      },
      "en->": {
        "tier": "best",
        "gap": 10.02
      }
    }
  },
  {
    "code": "tur_Latn",
    "english": "Turkish",
    "tier": "good",
    "directions": {
      "->en": {
        "tier": "good",
        "gap": -2.18
      },
      "en->": {
        "tier": "best",
        "gap": 3.89
      }
    }
  },
  {
    "code": "ukr_Cyrl",
    "english": "Ukrainian",
    "tier": "good",
    "directions": {
      "->en": {
        "tier": "good",
        "gap": -2.34
      },
      "en->": {
        "tier": "best",
        "gap": 5.15
      }
    }
  },
  {
    "code": "urd_Arab",
    "english": "Urdu",
    "tier": "best",
    "directions": {
      "->en": {
        "tier": "best",
        "gap": 1.26
      },
      "en->": {
        "tier": "best",
        "gap": 3.25
      }
    }
  },
  {
    "code": "vie_Latn",
    "english": "Vietnamese",
    "tier": "good",
    "directions": {
      "->en": {
        "tier": "good",
        "gap": -2.16
      },
      "en->": {
        "tier": "best",
        "gap": 2.8
      }
    }
  },
  {
    "code": "yor_Latn",
    "english": "Yoruba",
    "tier": "full",
    "directions": {
      "->en": {
        "tier": "full",
        "gap": null
      },
      "en->": {
        "tier": "full",
        "gap": null
      }
    }
  },
  {
    "code": "zul_Latn",
    "english": "Zulu",
    "tier": "full",
    "directions": {
      "->en": {
        "tier": "full",
        "gap": null
      },
      "en->": {
        "tier": "full",
        "gap": null
      }
    }
  }
];

const BY_CODE = new Map(LANGUAGE_QUALITY.map((l) => [l.code, l]));

/** Quality of one direction, or null when unmeasured. */
export function directionQuality(src: string, tgt: string): DirectionQuality | null {
  const lang = src === "eng_Latn" ? BY_CODE.get(tgt) : BY_CODE.get(src);
  if (!lang) return null;
  if (src === "eng_Latn") return lang.directions["en->"] ?? null;
  if (tgt === "eng_Latn") return lang.directions["->en"] ?? null;
  return null;
}

/** The language-level tier shown beside the language name. */
export function languageQuality(code: string): QualityTier | null {
  return BY_CODE.get(code)?.tier ?? null;
}
