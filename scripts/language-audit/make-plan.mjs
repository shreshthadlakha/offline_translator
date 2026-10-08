// Builds the browser test plans for the language audit (two rounds).
// Round 1 (en->X) uses the fixed English sentence set.
// Round 2 (X->en) uses the NLLB-generated source sets (needs gen-refs done).
// Usage: node scripts/language-audit/make-plan.mjs <round1|round2>
import { writeFileSync, readFileSync, existsSync } from 'node:fs';

const round = process.argv[2] || 'round1';
const EN = JSON.parse(readFileSync('scripts/quality-gate/test-sets.json', 'utf8')).en;

// New single-pair models (Xenova, verified in hub-audit.json).
const SINGLE_EN_TO = ['afr_Latn', 'ces_Latn', 'dan_Latn', 'fin_Latn', 'hun_Latn', 'ind_Latn', 'ron_Latn', 'swe_Latn', 'ukr_Cyrl', 'vie_Latn'];
const SINGLE_TO_EN = ['afr_Latn', 'ces_Latn', 'dan_Latn', 'fin_Latn', 'hun_Latn', 'ind_Latn', 'swe_Latn', 'ukr_Cyrl', 'vie_Latn', 'kor_Hang', 'pol_Latn', 'tha_Thai'];

/** NLLB code -> the code used in opus-mt model names. */
const OPUUS_CODE = {
  afr_Latn: 'af', ces_Latn: 'cs', dan_Latn: 'da', fin_Latn: 'fi',
  hun_Latn: 'hu', ind_Latn: 'id', ron_Latn: 'ro', swe_Latn: 'sv',
  ukr_Cyrl: 'uk', vie_Latn: 'vi', kor_Hang: 'ko', pol_Latn: 'pl',
  tha_Thai: 'th',
};
const opusName = (code) => OPUUS_CODE[code] ?? code.split('_')[0].toLowerCase();

// en->X through the many-target group model: pair -> tag.
const EN_MUL_TAGS = {
  amh_Ethi: 'amh', asm_Beng: 'asm', ben_Beng: 'ben', bul_Cyrl: 'bul',
  cat_Latn: 'cat', zho_Hant: 'zho_Hant', hrv_Latn: 'hrv', ell_Grek: 'ell',
  guj_Gujr: 'guj', hau_Latn: 'hau_Latn', heb_Hebr: 'heb', kan_Knda: 'kan',
  zsm_Latn: 'zlm_Latn', mal_Mlym: 'mal', mar_Deva: 'mar', nob_Latn: 'nob',
  ory_Orya: 'ori', pbt_Arab: 'pus', pes_Arab: 'pes', por_Latn: 'por',
  pan_Guru: 'pan_Guru', srp_Cyrl: 'srp_Cyrl', sin_Sinh: 'sin', tam_Taml: 'tam',
  tel_Telu: 'tel', tur_Latn: 'tur', urd_Arab: 'urd', yor_Latn: 'yor',
  zul_Latn: 'zul', jpn_Jpan: 'jpn',
};
// X->en through the many-source group model (tagless).
const MUL_EN_LANGS = [
  'amh_Ethi', 'asm_Beng', 'ben_Beng', 'bul_Cyrl', 'cat_Latn', 'zho_Hant',
  'hrv_Latn', 'ell_Grek', 'guj_Gujr', 'hau_Latn', 'heb_Hebr', 'kan_Knda',
  'zsm_Latn', 'mal_Mlym', 'mar_Deva', 'npi_Deva', 'nob_Latn', 'ory_Orya',
  'pbt_Arab', 'pes_Arab', 'por_Latn', 'pan_Guru', 'ron_Latn', 'srp_Cyrl',
  'sin_Sinh', 'swh_Latn', 'tam_Taml', 'tel_Telu', 'urd_Arab', 'yor_Latn',
  'zul_Latn',
];
// Romance group models (specialized; compared against the mul models).
const EN_ROMANCE_TAGS = { cat_Latn: 'ca', por_Latn: 'pt' };
const ROMANCE_EN_LANGS = ['cat_Latn', 'por_Latn', 'ron_Latn'];

const tests = [];
const add = (id, modelId, tag, pairs) => tests.push({ id, modelId, langTag: tag ?? null, pairs });

if (round === 'round1') {
  for (const code of SINGLE_EN_TO) {
    add(`opus-en-${opusName(code)}`, `Xenova/opus-mt-en-${opusName(code)}`, null, [
      { key: `en->${code}`, src: 'eng_Latn', tgt: code, tag: null, sentences: EN },
    ]);
  }
  add('opus-en-mul', 'Xenova/opus-mt-en-mul', null, Object.entries(EN_MUL_TAGS).map(([code, tag]) => ({
    key: `en->${code}`, src: 'eng_Latn', tgt: code, tag, sentences: EN,
  })));
  add('opus-en-romance', 'Xenova/opus-mt-en-ROMANCE', null, Object.entries(EN_ROMANCE_TAGS).map(([code, tag]) => ({
    key: `en->${code}`, src: 'eng_Latn', tgt: code, tag, sentences: EN,
  })));
} else {
  // Round 2 needs the generated sources.
  const refsPath = 'scripts/language-audit/nllb-refs-new.json';
  if (!existsSync(refsPath)) throw new Error('run gen-refs first');
  const refs = JSON.parse(readFileSync(refsPath, 'utf8'));
  const src = (code) => refs.sources[code];
  for (const code of SINGLE_TO_EN) {
    add(`opus-${opusName(code)}-en`, `Xenova/opus-mt-${opusName(code)}-en`, null, [
      { key: `${code}->en`, src: code, tgt: 'eng_Latn', tag: null, sentences: src(code) },
    ]);
  }
  add('opus-mul-en', 'Xenova/opus-mt-mul-en', null, MUL_EN_LANGS.map((code) => ({
    key: `${code}->en`, src: code, tgt: 'eng_Latn', tag: null, sentences: src(code),
  })));
  add('opus-romance-en', 'Xenova/opus-mt-ROMANCE-en', null, ROMANCE_EN_LANGS.map((code) => ({
    key: `${code}->en`, src: code, tgt: 'eng_Latn', tag: null, sentences: src(code),
  })));
}

const plan = { round, generatedAt: new Date().toISOString(), tests };
writeFileSync(`scripts/language-audit/plan-${round}.json`, JSON.stringify(plan, null, 2));
console.log(`${round}: ${tests.length} models, ${tests.reduce((n, t) => n + t.pairs.length, 0)} pair tests`);
