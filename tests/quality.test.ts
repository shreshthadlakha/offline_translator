// The quality bar: every measured direction carries a valid tier, every
// language in the registry has a quality record, the tier counts the README
// claims hold, and the non-English-to-English rule of directionQuality.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { LANGUAGE_QUALITY, directionQuality } from "../src/lib/quality.ts";
import { LANGUAGES } from "../src/lib/languages.ts";
import { ENGINE_TABLE, engineForPair } from "../src/lib/engines.ts";

const TIERS = new Set(["best", "good", "limited", "full"]);

describe("quality data shape", () => {
  test("every language entry has a valid tier", () => {
    for (const entry of LANGUAGE_QUALITY) {
      assert.ok(TIERS.has(entry.tier), `bad language tier for ${entry.code}: ${entry.tier}`);
      for (const [key, dir] of Object.entries(entry.directions)) {
        assert.ok(["->en", "en->"].includes(key), `bad direction key for ${entry.code}: ${key}`);
        assert.ok(TIERS.has(dir.tier), `bad tier for ${entry.code} ${key}: ${dir.tier}`);
      }
    }
  });

  test("every registry language except English has a quality record", () => {
    const codes = new Set(LANGUAGE_QUALITY.map((l) => l.code));
    for (const language of LANGUAGES) {
      if (language.code === "eng_Latn") continue; // English is the pivot, never a target
      assert.ok(codes.has(language.code), `missing quality record for ${language.code}`);
    }
    assert.equal(codes.size, LANGUAGES.length - 1, "no extra quality records either");
  });

  test("codes in the quality data are registry codes", () => {
    const known = new Set(LANGUAGES.map((l) => l.code));
    for (const entry of LANGUAGE_QUALITY) assert.ok(known.has(entry.code));
  });
});

describe("directionQuality", () => {
  test("English source reads the en-> direction", () => {
    const q = directionQuality("eng_Latn", "fra_Latn");
    assert.ok(q);
    assert.equal(q?.tier, LANGUAGE_QUALITY.find((l) => l.code === "fra_Latn")?.directions["en->"]?.tier);
  });

  test("English target reads the ->en direction", () => {
    const q = directionQuality("fra_Latn", "eng_Latn");
    assert.equal(q?.tier, LANGUAGE_QUALITY.find((l) => l.code === "fra_Latn")?.directions["->en"]?.tier);
  });

  test("non-English pairs are unmeasured (they route to the full model)", () => {
    assert.equal(directionQuality("fra_Latn", "deu_Latn"), null);
  });

  test("unknown codes are null, never a guess", () => {
    assert.equal(directionQuality("eng_Latn", "zzz_Zzz"), null);
    assert.equal(directionQuality("zzz_Zzz", "eng_Latn"), null);
  });

  test("every fast route has measured quality behind its label", () => {
    for (const [pair, engine] of Object.entries(ENGINE_TABLE)) {
      if (engine.disabled) continue;
      const [src, tgt] = pair.split("|");
      const q = directionQuality(src ?? "", tgt ?? "");
      assert.ok(q != null && TIERS.has(q.tier), `fast route ${pair} has no measured tier`);
    }
  });
});

describe("tier counts match the README claims", () => {
  const fastRoutes = Object.entries(ENGINE_TABLE).filter(([, e]) => !e.disabled);

  test("95 fast routes, 70 best / 25 good / 0 limited", () => {
    assert.equal(fastRoutes.length, 95);
    let best = 0;
    let good = 0;
    let limited = 0;
    for (const [pair] of fastRoutes) {
      const [src, tgt] = pair.split("|");
      const tier = directionQuality(src ?? "", tgt ?? "")?.tier;
      if (tier === "best") best++;
      else if (tier === "good") good++;
      else if (tier === "limited") limited++;
    }
    assert.equal(best, 70);
    assert.equal(good, 25);
    assert.equal(limited, 0);
  });

  test("7 languages have no fast model in either direction (full)", () => {
    const full = LANGUAGES.filter(
      (l) =>
        l.code !== "eng_Latn" &&
        engineForPair(l.code, "eng_Latn", true).kind === "nllb" &&
        engineForPair("eng_Latn", l.code, true).kind === "nllb",
    );
    assert.equal(full.length, 7);
    for (const l of full) {
      assert.equal(LANGUAGE_QUALITY.find((q) => q.code === l.code)?.tier, "full");
    }
  });

  test("quality language tiers agree with what the routes actually offer", () => {
    for (const language of LANGUAGE_QUALITY) {
      if (language.tier === "full") continue;
      // A non-full language must have at least one fast direction.
      const enTo = language.directions["en->"]?.tier;
      const toEn = language.directions["->en"]?.tier;
      assert.ok(
        (enTo != null && enTo !== "full") || (toEn != null && toEn !== "full"),
        `${language.code} is ${language.tier} but has no fast direction`,
      );
    }
  });
});
