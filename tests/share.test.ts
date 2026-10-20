// Share link encoding and decoding: both schema versions (v0 plain, v1
// deflate-raw), malformed and hostile inputs, the length cap, and round
// trips with emoji, RTL and mixed scripts.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { encodeShare, decodeShareFragment, MAX_SHARE_URL } from "../src/lib/share.ts";

// The browser-only guards read `window`. Node has the web streams and
// codecs the v1 path needs, so a minimal window makes both paths testable.
const ORIGINAL_WINDOW = (globalThis as { window?: unknown }).window;
before(() => {
  (globalThis as { window?: unknown }).window = {
    location: { href: "https://example.test/" },
  };
});
after(() => {
  if (ORIGINAL_WINDOW === undefined) delete (globalThis as { window?: unknown }).window;
  else (globalThis as { window?: unknown }).window = ORIGINAL_WINDOW;
});

describe("encodeShare", () => {
  test("round trip v1 (compressed)", async () => {
    const payload = { s: "Hello, how are you today?", src: "eng_Latn", tgt: "fra_Latn" };
    const result = await encodeShare(payload);
    assert.ok(result.ok);
    if (!result.ok) return;
    assert.ok(result.hash.startsWith("#s=v1."), "expected the compressed schema");
    const decoded = await decodeShareFragment(result.hash);
    assert.deepEqual(decoded, payload);
  });

  test("round trip survives emoji, RTL and surrogate pairs", async () => {
    const payload = {
      s: "👩‍👩‍👧‍👦 arrived. 🇮🇳 नमस्ते שלום مرحبا. Where is the station?",
      src: "eng_Latn",
      tgt: "heb_Hebr",
    };
    const result = await encodeShare(payload);
    assert.ok(result.ok);
    const decoded = await decodeShareFragment(result.ok ? result.hash : "");
    assert.deepEqual(decoded, payload);
  });

  test("the url is the page base plus the fragment", async () => {
    const result = await encodeShare({ s: "hi.", src: "eng_Latn", tgt: "fra_Latn" });
    assert.ok(result.ok);
    if (!result.ok) return;
    assert.ok(result.url.startsWith("https://example.test/#s="));
    assert.ok(result.url.endsWith(result.hash));
  });

  test("oversized payloads are refused, not truncated", async () => {
    // Incompressible text, so the deflate path cannot sneak under the cap.
    let seed = 42;
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ,.!?";
    let big = "";
    for (let i = 0; i < 60_000; i++) {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      big += chars[Math.floor((seed / 2147483648) * chars.length)] ?? "x";
    }
    const result = await encodeShare({ s: big, src: "eng_Latn", tgt: "fra_Latn" });
    assert.ok(!result.ok);
    if (!result.ok) assert.equal(result.reason, "too-long");
  });
});

describe("decodeShareFragment", () => {
  test("v0 (uncompressed) decodes", async () => {
    // Build a v0 fragment by hand: JSON -> base64url.
    const json = JSON.stringify({ s: "Plain v0 text.", src: "eng_Latn", tgt: "deu_Latn" });
    const bytes = new TextEncoder().encode(json);
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    const b64url = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    const decoded = await decodeShareFragment(`#s=v0.${b64url}`);
    assert.deepEqual(decoded, { s: "Plain v0 text.", src: "eng_Latn", tgt: "deu_Latn" });
  });

  test("garbage returns null, never throws", async () => {
    assert.equal(await decodeShareFragment(""), null);
    assert.equal(await decodeShareFragment("#other"), null);
    assert.equal(await decodeShareFragment("#s=v9.AAAA"), null);
    assert.equal(await decodeShareFragment("#s=v1.!!!not-base64!!!"), null);
    assert.equal(await decodeShareFragment("#s=v1.AAAA"), null); // not deflate
  });

  test("script payloads never execute, they decode or fail", async () => {
    const decoded = await decodeShareFragment("#s=%3Cscript%3Ealert(1)%3C%2Fscript%3E");
    assert.equal(decoded, null); // not a valid fragment shape at all
  });

  test("payload shape is validated", async () => {
    // Valid base64 of invalid JSON payloads.
    const encode = (obj: unknown) => {
      const json = JSON.stringify(obj);
      const bytes = new TextEncoder().encode(json);
      let binary = "";
      for (const b of bytes) binary += String.fromCharCode(b);
      return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    };
    assert.equal(await decodeShareFragment(`#s=v0.${encode({ s: "" })}`), null); // missing fields
    assert.equal(await decodeShareFragment(`#s=v0.${encode({ s: "x", src: 1, tgt: "y" })}`), null); // wrong types
    assert.equal(await decodeShareFragment(`#s=v0.${encode("just a string")}`), null);
  });

  test("oversized decoded text is refused", async () => {
    const big = "b".repeat(60_000);
    const encode = (obj: unknown) => {
      const json = JSON.stringify(obj);
      const bytes = new TextEncoder().encode(json);
      let binary = "";
      for (const b of bytes) binary += String.fromCharCode(b);
      return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    };
    // v0 so the size check hits the decoded text, not the URL cap.
    assert.equal(await decodeShareFragment(`#s=v0.${encode({ s: big, src: "eng_Latn", tgt: "fra_Latn" })}`), null);
  });
});

describe("MAX_SHARE_URL", () => {
  test("the cap is finite and sane", () => {
    assert.ok(MAX_SHARE_URL > 1000 && MAX_SHARE_URL < 100_000);
  });
});
