// Sentence splitting: the main path (Intl.Segmenter where Node has it) and
// the fallback splitter, line handling, the trailing fragment, long-sentence
// splitting and the CJK-aware joins.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  segmentText,
  splitByRegex,
  trailingFragment,
  flatSentences,
  joinSentences,
  joinLines,
} from "../src/lib/segment.ts";

const HAS_SEGMENTER = typeof Intl !== "undefined" && "Segmenter" in Intl;

describe("splitByRegex (the fallback, M-12)", () => {
  test("plain sentences split on the terminator", () => {
    assert.deepEqual(splitByRegex("Hello world. How are you?"), ["Hello world.", "How are you?"]);
  });

  test("decimals are not split mid number", () => {
    assert.deepEqual(splitByRegex("Pi is 3.14 rounded. Ok!"), ["Pi is 3.14 rounded.", "Ok!"]);
  });

  test("abbreviations are not split", () => {
    assert.deepEqual(splitByRegex("Mr. Smith arrived. He sat down."), ["Mr. Smith arrived.", "He sat down."]);
    assert.deepEqual(splitByRegex("See p. 4 for details."), ["See p. 4 for details."]);
  });

  test("URLs are not split mid token", () => {
    assert.deepEqual(splitByRegex("Visit example.com. It works."), ["Visit example.com.", "It works."]);
  });

  test("terminator runs stay together", () => {
    assert.deepEqual(splitByRegex("Wait... really?!"), ["Wait...", "really?!"]);
  });

  test("script-specific terminators split", () => {
    assert.deepEqual(splitByRegex("यह एक वाक्य है। दूसरा वाक्य।"), ["यह एक वाक्य है।", "दूसरा वाक्य।"]);
    assert.deepEqual(splitByRegex("これは文です。次の文です。"), ["これは文です。", "次の文です。"]);
  });

  test("no terminator means one sentence", () => {
    assert.deepEqual(splitByRegex("just some words"), ["just some words"]);
    assert.deepEqual(splitByRegex(""), []);
  });
});

describe("segmentText", () => {
  test("empty input has no lines", () => {
    assert.deepEqual(segmentText("", "en").lines, []);
  });

  test("lines are preserved, empty lines included", () => {
    const result = segmentText("One.\n\nTwo.", "en");
    assert.equal(result.lines.length, 3);
    assert.deepEqual(result.lines[1], []);
  });

  test("main path (Intl.Segmenter) splits plain English", () => {
    if (!HAS_SEGMENTER) return; // fallback tested above
    const result = segmentText("Hello world. How are you?", "en");
    assert.equal(result.lines.length, 1);
    assert.equal(result.lines[0]?.length, 2);
  });

  test("emoji survive a round trip", () => {
    const text = "👩‍👩‍👧‍👦 arrived. Nice!";
    const result = segmentText(text, "en");
    const joined = joinLines(result.lines.map((l) => l));
    assert.ok(joined.includes("👩‍👩‍👧‍👦"));
  });

  test("long sentences are split at soft breaks under the limit", () => {
    const clause = "this is a fairly long clause with several words in it,";
    const text = (clause + " ").repeat(30).trim();
    const result = segmentText(text, "en");
    const all = result.lines[0] ?? [];
    assert.ok(all.length > 1, "expected the long sentence to be split");
    for (const piece of all) assert.ok(piece.length <= 210, `piece too long: ${piece.length}`);
  });
});

describe("trailingFragment", () => {
  test("null when everything ends with a terminator", () => {
    assert.equal(trailingFragment({ lines: [["One.", "Two."]] }), null);
  });

  test("the last unterminated sentence is the fragment", () => {
    const fragment = trailingFragment({ lines: [["One."], [], ["still typing"]] });
    assert.ok(fragment);
    assert.equal(fragment?.text, "still typing");
    assert.equal(fragment?.line, 2);
    assert.equal(fragment?.index, 0);
  });

  test("trailing whitespace does not count as a terminator", () => {
    const segments = segmentText("Done.\nincomplete ", "en");
    const fragment = trailingFragment(segments);
    assert.ok(fragment != null, "the trailing line is still the fragment");
    assert.equal(fragment?.text, "incomplete");
  });
});

describe("flatSentences and joins", () => {
  test("flatSentences walks lines in order", () => {
    const flat = flatSentences({ lines: [["a.", "b."], [], ["c."]] });
    assert.deepEqual(flat.map((s) => s.text), ["a.", "b.", "c."]);
    assert.deepEqual(flat.map((s) => s.line), [0, 0, 2]);
  });

  test("Latin sentences join with spaces", () => {
    assert.equal(joinSentences(["Hello.", "World."]), "Hello. World.");
  });

  test("CJK sentences join without spaces", () => {
    assert.equal(joinSentences(["これは文です。", "次の文です。"]), "これは文です。次の文です。");
  });

  test("joinLines rebuilds paragraph shape", () => {
    assert.equal(joinLines([["a.", "b."], [], ["c."]]), "a. b.\n\nc.");
  });
});
