// Tests for src/lib/terminal-punct.ts — one restoreTerminalPunctuation
// function, tests per script. Run: bun scripts/benchmark/terminal-punct.test.mjs
//
// The app (translation worker) and the benchmark scorer import the same
// module, so these cases pin the behaviour both sides share.
import { restoreTerminalPunctuation } from '../../src/lib/terminal-punct.ts';

const cases = [
  // --- Latin -> Latin: the plain mark the source used ---
  ['latin period', 'Hello world.', 'Bonjour le monde', 'fra_Latn', 'Bonjour le monde.'],
  ['latin exclaim', 'Run!', 'Cours', 'fra_Latn', 'Cours!'],
  ['latin question', 'Is it late?', 'Est-il tard', 'fra_Latn', 'Est-il tard?'],
  ['latin already terminal', 'Hello world.', 'Bonjour le monde.', 'fra_Latn', 'Bonjour le monde.'],
  ['latin source has no mark', 'Hello world', 'Bonjour le monde', 'fra_Latn', 'Bonjour le monde'],
  ['latin empty output', 'Hello world.', '', 'fra_Latn', ''],
  ['latin trailing spaces trimmed', 'Hello world.', 'Bonjour le monde  ', 'fra_Latn', 'Bonjour le monde.'],
  ['cyrillic default', 'The rain falls.', 'Дождь идёт', 'rus_Cyrl', 'Дождь идёт.'],
  ['greek default', 'The rain falls.', 'Η βροχή πέφτει', 'ell_Grek', 'Η βροχή πέφτει.'],

  // --- Chinese and Japanese: full width marks ---
  ['hans period', 'The rain falls.', '雨落下了', 'zho_Hans', '雨落下了。'],
  ['hans question', 'Is it late?', '晚了吗', 'zho_Hans', '晚了吗？'],
  ['hans exclaim', 'Run!', '快跑', 'zho_Hans', '快跑！'],
  ['hant period', 'The rain falls.', '雨落下來了', 'zho_Hant', '雨落下來了。'],
  ['jpan period', 'The rain falls.', '雨が降っている', 'jpn_Jpan', '雨が降っている。'],
  ['hans already terminal', 'The rain falls.', '雨落下了。', 'zho_Hans', '雨落下了。'],

  // --- Devanagari and Bengali: the danda ---
  ['hindi period danda', 'I am fine.', 'मैं ठीक हूँ', 'hin_Deva', 'मैं ठीक हूँ।'],
  ['hindi question ascii', 'Is it late?', 'क्या देर हो गई', 'hin_Deva', 'क्या देर हो गई?'],
  ['nepali danda', 'I am fine.', 'म ठीक छु', 'npi_Deva', 'म ठीक छु।'],
  ['bengali dari', 'I am fine.', 'আমি ভালো আছি', 'ben_Beng', 'আমি ভালো আছি।'],

  // --- Arabic and Urdu ---
  ['arabic period', 'The rain falls.', 'المطر ي falling', 'arb_Arab', 'المطر ي falling.'],
  ['arabic question mark', 'Is it late?', 'هل تأخر الوقت', 'arb_Arab', 'هل تأخر الوقت؟'],
  ['urdu full stop', 'I am fine.', 'میں ٹھیک ہوں', 'urd_Arab', 'میں ٹھیک ہوں۔'],
  ['persian default period', 'I am fine.', 'من خوبم', 'pes_Arab', 'من خوبم.'],

  // --- Amharic ---
  ['amharic wordspace', 'I am fine.', 'እኔ ደህና ነኝ', 'amh_Ethi', 'እኔ ደህና ነኝ።'],

  // --- Thai and neighbours: no sentence terminal marks, never add ---
  ['thai no mark added', 'I am fine.', 'ฉันสบายดี', 'tha_Thai', 'ฉันสบายดี'],

  // --- quotes and brackets: the mark goes inside ---
  ['mark inside closing quote', 'He said "Go home."', 'قال "اذهب إلى المنزل"', 'arb_Arab', 'قال "اذهب إلى المنزل."'],
  ['already terminal before closing quote', 'He said "Go home."', 'قال "اذهب إلى المنزل."', 'arb_Arab', 'قال "اذهب إلى المنزل."'],
  // The mark attaches directly to the last word; spacing the model wrote
  // before a closing quote is kept after the mark.
  ['guillemets latin', 'He said «Go.»', 'Il a dit « Pars »', 'fra_Latn', 'Il a dit « Pars. »'],

  // --- non Latin sources ---
  ['danda source to latin', 'मैं ठीक हूँ।', 'I am fine', 'eng_Latn', 'I am fine.'],
  ['ideographic source to latin', '雨が降っています。', 'It is raining', 'eng_Latn', 'It is raining.'],
  ['arabic question source to latin', 'هل سيأتي؟', 'will he come', 'eng_Latn', 'will he come?'],
  ['fullwidth exclaim source to hans', '早く！', '快点', 'zho_Hans', '快点！'],
  ['ellipsis source untouched', 'He said...', 'Il a dit', 'fra_Latn', 'Il a dit'],
];

let failed = 0;
for (const [name, src, out, tgt, want] of cases) {
  const got = restoreTerminalPunctuation(src, out, tgt);
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
}
console.log(failed === 0 ? `\nterminal-punct: all ${cases.length} cases passed` : `\nterminal-punct: ${failed} FAILED of ${cases.length}`);
process.exit(failed === 0 ? 0 : 1);
