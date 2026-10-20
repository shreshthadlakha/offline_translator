// Pinned model records: every revision is a commit sha, every routable
// engine has its pin, and every pinned file carries a sha256 and a size.
// These are the guarantees the app's verify-then-cache downloads rest on.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { MODEL_REVISIONS, allEngines, ENGINE_TABLE, restoredPair, engineForPair } from "../src/lib/engines.ts";
import { INDICTRANS2_BUNDLES } from "../src/lib/indictrans2/bundles.ts";
import { BERGAMOT_PAIRS, BERGAMOT_REVISION, BERGAMOT_RUNTIME, BERGAMOT_MIRROR } from "../src/lib/bergamot/bundles.ts";
import { NLLB_BUNDLE } from "../src/lib/nllb/bundles.ts";

const SHA256 = /^[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;

describe("MODEL_REVISIONS pins", () => {
  test("every revision is a 40-hex commit sha", () => {
    for (const [repo, revision] of Object.entries(MODEL_REVISIONS)) {
      assert.ok(repo.includes("/"), `repo shape: ${repo}`);
      assert.match(revision, COMMIT, `bad revision for ${repo}: ${revision}`);
    }
  });

  test("every transformers-based routable engine is pinned", () => {
    for (const engine of allEngines()) {
      if (engine.kind === "nllb") continue; // pinned in NLLB_BUNDLE
      if (engine.kind === "bergamot") continue; // pinned in BERGAMOT_PAIRS
      if (engine.kind === "indictrans2") continue; // pinned in INDICTRANS2_BUNDLES
      assert.ok(MODEL_REVISIONS[engine.modelId] != null, `unpinned opus engine: ${engine.id} (${engine.modelId})`);
    }
  });
});

describe("IndicTrans2 bundles", () => {
  test("two bundles, pinned commits, sha256 and byte sizes on every file", () => {
    for (const [key, bundle] of Object.entries(INDICTRANS2_BUNDLES)) {
      assert.ok(["en-indic", "indic-en"].includes(key));
      assert.match(bundle.commit, COMMIT);
      assert.ok(bundle.repo.length > 0);
      let total = 0;
      for (const file of bundle.files) {
        assert.match(file.sha256, SHA256, `bad sha for ${key}/${file.name}`);
        assert.ok(Number.isInteger(file.bytes) && file.bytes > 0, `bad bytes for ${key}/${file.name}`);
        total += file.bytes;
      }
      assert.equal(total, bundle.totalBytes, `totalBytes mismatch for ${key}`);
    }
  });

  test("both bundles have their revision in MODEL_REVISIONS", () => {
    for (const bundle of Object.values(INDICTRANS2_BUNDLES)) {
      assert.equal(MODEL_REVISIONS[bundle.repo], bundle.commit);
    }
  });
});

describe("Bergamot pins", () => {
  test("every pair file is pinned with sha256 and size, totals add up", () => {
    for (const [pair, entry] of Object.entries(BERGAMOT_PAIRS)) {
      assert.ok(pair.includes("-"), `pair key shape: ${pair}`);
      assert.ok(entry.modelId.startsWith(`${BERGAMOT_MIRROR}/`), `modelId mirror: ${entry.modelId}`);
      let total = 0;
      for (const file of entry.files) {
        assert.match(file.sha256, SHA256, `bad sha for ${pair}/${file.name}`);
        assert.ok(Number.isInteger(file.bytes) && file.bytes > 0, `bad bytes for ${pair}/${file.name}`);
        total += file.bytes;
      }
      assert.equal(total, entry.totalBytes, `totalBytes mismatch for ${pair}`);
    }
  });

  test("the runtime is pinned (both files) and the revision is a commit", () => {
    assert.match(BERGAMOT_REVISION, COMMIT);
    for (const file of [BERGAMOT_RUNTIME.glue, BERGAMOT_RUNTIME.wasm]) {
      assert.match(file.sha256, SHA256);
      assert.ok(file.bytes > 0);
    }
  });

  test("every routable bergamot engine has its pins", () => {
    const bergamotEngines = Object.values(ENGINE_TABLE).filter((e) => e.kind === "bergamot" && !e.disabled);
    for (const engine of bergamotEngines) {
      // The pair key is the modelId's last path segment ("ru-en").
      const pairKey = engine.modelId.split("/").pop() ?? "";
      assert.ok(BERGAMOT_PAIRS[pairKey] != null, `bergamot engine without pins: ${engine.id} -> ${pairKey}`);
    }
    assert.ok(bergamotEngines.length >= 30);
  });
});

describe("NLLB lean bundle", () => {
  test("seven files, all pinned with sha256 and size, totals add up", () => {
    assert.equal(NLLB_BUNDLE.files.length, 7);
    let total = 0;
    for (const file of NLLB_BUNDLE.files) {
      assert.match(file.sha256, SHA256, `bad sha for ${file.name}`);
      assert.ok(Number.isInteger(file.bytes) && file.bytes > 0, `bad bytes for ${file.name}`);
      total += file.bytes;
    }
    assert.equal(total, NLLB_BUNDLE.totalBytes);
  });

  test("the bundle commit is the same revision MODEL_REVISIONS pins", () => {
    assert.equal(MODEL_REVISIONS[NLLB_BUNDLE.repo], NLLB_BUNDLE.commit);
  });
});

describe("restoredPair (M-1)", () => {
  const base = {
    lastSrc: "eng_Latn",
    lastTgt: "fra_Latn",
    lastSmallSrc: "eng_Latn",
    lastSmallTgt: "fra_Latn",
    useFastModels: true,
    fullModelFor: [] as string[],
  };

  test("a small saved pair is kept as-is", () => {
    const result = restoredPair({ ...base, lastTgt: "tur_Latn" });
    assert.deepEqual(result, { src: "eng_Latn", tgt: "tur_Latn", changed: false });
  });

  test("fast models off keeps the last pair (deliberate choice, M-1)", () => {
    const result = restoredPair({ ...base, lastTgt: "tur_Latn", useFastModels: false });
    assert.deepEqual(result, { src: "eng_Latn", tgt: "tur_Latn", changed: false });
  });

  test("a large last pair with fast models on falls back to the last small pair", () => {
    const result = restoredPair({
      ...base,
      lastTgt: "pus_Latn" in {} ? "pus_Latn" : "pbt_Arab", // pbt needs the full model
      lastSmallTgt: "tur_Latn",
    });
    assert.deepEqual(result, { src: "eng_Latn", tgt: "tur_Latn", changed: true });
  });

  test("a per-pair full-model override on the last pair falls back to small", () => {
    const result = restoredPair({
      ...base,
      lastTgt: "tur_Latn",
      fullModelFor: ["eng_Latn|tur_Latn"],
      lastSmallTgt: "fra_Latn",
    });
    assert.deepEqual(result, { src: "eng_Latn", tgt: "fra_Latn", changed: true });
  });

  test("invalid codes fall back to the default pair", () => {
    const result = restoredPair({ ...base, lastSrc: "nope", lastTgt: "also-nope" });
    assert.deepEqual(result, { src: "eng_Latn", tgt: "fra_Latn", changed: false });
  });

  test("a large last pair and a large last small pair open on the default", () => {
    const result = restoredPair({
      ...base,
      lastTgt: "pbt_Arab",
      lastSmallSrc: "eng_Latn",
      lastSmallTgt: "pbt_Arab",
    });
    assert.deepEqual(result, { src: "eng_Latn", tgt: "fra_Latn", changed: true });
  });
});

describe("engineForPair routing basics", () => {
  test("fast models off routes everything to the full model", () => {
    assert.equal(engineForPair("eng_Latn", "fra_Latn", false).kind, "nllb");
  });

  test("non-English pairs need the full model", () => {
    assert.equal(engineForPair("fra_Latn", "deu_Latn", true).kind, "nllb");
  });

  test("English to French uses a small model", () => {
    const engine = engineForPair("eng_Latn", "fra_Latn", true);
    assert.equal(engine.kind, "opus");
    assert.ok(engine.expectedBytes > 50 * 1024 * 1024);
  });

  test("English to Hindi uses IndicTrans2", () => {
    assert.equal(engineForPair("eng_Latn", "hin_Deva", true).kind, "indictrans2");
  });

  test("English to Croatian uses Bergamot", () => {
    assert.equal(engineForPair("eng_Latn", "hrv_Latn", true).kind, "bergamot");
  });

  test("Pashto has no small model in either direction", () => {
    assert.equal(engineForPair("eng_Latn", "pbt_Arab", true).kind, "nllb");
    assert.equal(engineForPair("pbt_Arab", "eng_Latn", true).kind, "nllb");
  });
});
