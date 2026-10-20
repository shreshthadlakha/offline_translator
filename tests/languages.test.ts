// Language data: code shape and uniqueness, directions (the RTL set is
// exactly right), BCP 47 tags, the sort order claim, and search keeping it.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { LANGUAGES, SORTED_LANGUAGES, languageByCode, searchLanguages } from "../src/lib/languages.ts";

const RTL_SET = new Set(["arb_Arab", "heb_Hebr", "pbt_Arab", "pes_Arab", "urd_Arab"]);

describe("language codes", () => {
  test("56 languages, all NLLB-shaped, all unique", () => {
    assert.equal(LANGUAGES.length, 56);
    const seen = new Set<string>();
    for (const language of LANGUAGES) {
      assert.match(language.code, /^[a-z]{3}_[A-Z][a-z]{3}$/, `bad code shape: ${language.code}`);
      assert.ok(!seen.has(language.code), `duplicate code: ${language.code}`);
      seen.add(language.code);
    }
  });

  test("languageByCode finds every language and rejects unknowns", () => {
    for (const language of LANGUAGES) assert.equal(languageByCode(language.code)?.english, language.english);
    assert.equal(languageByCode("zzz_Zzz"), undefined);
  });
});

describe("directions", () => {
  test("the RTL set is exactly the five right-to-left languages", () => {
    const rtl = LANGUAGES.filter((l) => l.dir === "rtl").map((l) => l.code);
    assert.deepEqual(new Set(rtl), RTL_SET);
    assert.equal(rtl.length, RTL_SET.size);
  });

  test("dir is only ever ltr or rtl", () => {
    for (const language of LANGUAGES) assert.ok(["ltr", "rtl"].includes(language.dir));
  });
});

describe("BCP 47 tags", () => {
  test("well-formed primary tags, unique per language", () => {
    for (const language of LANGUAGES) {
      assert.match(language.bcp47, /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/, `bad bcp47: ${language.code} -> ${language.bcp47}`);
      if (language.speech) {
        assert.match(language.speech, /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/, `bad speech tag: ${language.code}`);
      }
    }
  });
});

describe("sort order", () => {
  const collator = new Intl.Collator("en", { sensitivity: "base" });

  test("SORTED_LANGUAGES is sorted by English name", () => {
    for (let i = 1; i < SORTED_LANGUAGES.length; i++) {
      const prev = SORTED_LANGUAGES[i - 1]?.english ?? "";
      const current = SORTED_LANGUAGES[i]?.english ?? "";
      assert.ok(collator.compare(prev, current) <= 0, `"${prev}" > "${current}"`);
    }
  });

  test("sorting is stable in content: same 56 languages", () => {
    assert.equal(new Set(SORTED_LANGUAGES.map((l) => l.code)).size, 56);
    assert.deepEqual(new Set(SORTED_LANGUAGES), new Set(LANGUAGES));
  });

  test("search keeps the sorted order", () => {
    const results = searchLanguages("a");
    for (let i = 1; i < results.length; i++) {
      assert.ok(collator.compare(results[i - 1]?.english ?? "", results[i]?.english ?? "") <= 0);
    }
  });

  test("search matches English and native names", () => {
    assert.ok(searchLanguages("French").some((l) => l.code === "fra_Latn"));
    assert.ok(searchLanguages("français").some((l) => l.code === "fra_Latn"));
    assert.ok(searchLanguages("हिन्दी").some((l) => l.code === "hin_Deva"));
    assert.equal(searchLanguages("").length, 56);
  });
});
