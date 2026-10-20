import { IndicProcessor, mosesTokenizeEn, mosesDetokenizeEn, transliterate } from "./processor";

const ip = new IndicProcessor();

// Moses tokenizer sanity (compare with sacremoses behavior)
const cases: Array<[string, string[]]> = [
  ["Who will win the election?", ["Who", "will", "win", "the", "election", "?"]],
  ["I would like a cup of tea, please.", ["I", "would", "like", "a", "cup", "of", "tea", ",", "please", "."]],
  ["Voter turnout in the state elections was higher than expected.", ["Voter", "turnout", "in", "the", "state", "elections", "was", "higher", "than", "expected", "."]],
  ["The meeting is scheduled for 15 March 2025 at 3:30 PM.", ["The", "meeting", "is", "scheduled", "for", "15", "March", "2025", "at", "3:30", "PM", "."]],
  ["Mr. Smith went to Washington.", ["Mr.", "Smith", "went", "to", "Washington", "."]],
  ["It costs 5,300 rupees.", ["It", "costs", "5,300", "rupees", "."]],
];
let pass = 0;
for (const [input, expected] of cases) {
  const got = mosesTokenizeEn(input);
  const ok = JSON.stringify(got) === JSON.stringify(expected);
  if (ok) pass++;
  else console.log("MISMATCH:", input, "\n  got:", JSON.stringify(got), "\n  exp:", JSON.stringify(expected));
}
console.log(`moses tokenize: ${pass}/${cases.length}`);

// Roundtrip detokenize
const dt = mosesDetokenizeEn(mosesTokenizeEn("I would like a cup of tea, please."));
console.log("detok roundtrip:", dt === "I would like a cup of tea , please.".replace(" ,", ",") ? "ok-ish" : dt);

// Transliteration sanity: Devanagari -> Bengali
console.log("dev->ben:", transliterate("हम कल सुबह बाजार जा रहे हैं ।", "hi", "bn"));
console.log("dev->tam:", transliterate("नमस्ते आजे तमे केवा छो ?", "hi", "ta"));
console.log("ben->dev:", transliterate("আমি দয়া করে এক কাপ চা চাই।", "bn", "hi"));

// Full preprocess examples
const pre1 = ip.preprocess("Who will win the election?", "eng_Latn", "hin_Deva");
console.log("pre en->hi:", JSON.stringify(pre1.text));
const pre2 = ip.preprocess("आमि दয়া করে এক কাপ চা চাই।", "ben_Beng", "eng_Latn");
console.log("pre bn->en:", JSON.stringify(pre2.text));
const pre3 = ip.preprocess("مجھے ایک کپ چائے چاہیے پلیز۔", "urd_Arab", "eng_Latn");
console.log("pre ur->en:", JSON.stringify(pre3.text));

// Postprocess: the raw model output for ben (transliterated Devanagari)
const post1 = ip.postprocess("आमि दय़ा करे एक काप चा चाइ ।", "ben_Beng", new Map());
console.log("post ben:", post1);
const post2 = ip.postprocess("नमस्ते आजे तमे केवा छो ?", "guj_Gujr", new Map());
console.log("post guj:", post2);
const post3 = ip.postprocess("हम कल सुबह बाजार जा रहे हैं ।", "hin_Deva", new Map());
console.log("post hin:", post3);
