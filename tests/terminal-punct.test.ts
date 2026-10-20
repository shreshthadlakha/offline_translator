// Terminal punctuation restoration: mark kinds, target script marks, closers,
// ellipsis, mid-clause stops, and scripts that write no terminal marks.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { restoreTerminalPunctuation } from "../src/lib/terminal-punct.ts";

describe("restoreTerminalPunctuation", () => {
  test("adds a plain period for Latin targets", () => {
    assert.equal(restoreTerminalPunctuation("Hello there.", "Bonjour", "fra_Latn"), "Bonjour.");
  });

  test("adds the matching exclamation and question marks", () => {
    assert.equal(restoreTerminalPunctuation("Watch out!", "Attention", "fra_Latn"), "Attention!");
    assert.equal(restoreTerminalPunctuation("Is it?", "Est-ce que", "fra_Latn"), "Est-ce que?");
  });

  test("never rewrites a mark the model produced", () => {
    assert.equal(restoreTerminalPunctuation("Hello there.", "Bonjour !", "fra_Latn"), "Bonjour !");
    assert.equal(restoreTerminalPunctuation("Hello!", "Bonjour.", "fra_Latn"), "Bonjour.");
  });

  test("ideographic full stop for Chinese", () => {
    assert.equal(restoreTerminalPunctuation("Hello there.", "你好", "zho_Hans"), "你好。");
    assert.equal(restoreTerminalPunctuation("Hello there.", "你好", "zho_Hant"), "你好。");
  });

  test("danda for Devanagari", () => {
    assert.equal(restoreTerminalPunctuation("Hello there.", "नमस्ते", "hin_Deva"), "नमस्ते।");
  });

  test("Arabic question mark and Urdu full stop", () => {
    assert.equal(restoreTerminalPunctuation("How are you?", "كيف حالك", "arb_Arab"), "كيف حالك؟");
    assert.equal(restoreTerminalPunctuation("Hello there.", "خوش آمديد", "urd_Arab"), "خوش آمديد۔");
  });

  test("Thai and neighbours never get a mark", () => {
    assert.equal(restoreTerminalPunctuation("Hello there.", "สวัสดี", "tha_Thai"), "สวัสดี");
  });

  test("the mark goes inside closing quotes", () => {
    assert.equal(restoreTerminalPunctuation('He said "Hello."', 'He said "Bonjour"', "fra_Latn"), 'He said "Bonjour."');
    assert.equal(restoreTerminalPunctuation("« Quote. »", "« Citation »", "fra_Latn"), "« Citation. »");
  });

  test("an ellipsis source never triggers restoration", () => {
    assert.equal(restoreTerminalPunctuation("Wait…", "Attends", "fra_Latn"), "Attends");
    assert.equal(restoreTerminalPunctuation("Wait...", "Attends", "fra_Latn"), "Attends");
  });

  test("an output stopping at a comma or colon is left alone", () => {
    assert.equal(restoreTerminalPunctuation("Hello there.", "Bonjour,", "fra_Latn"), "Bonjour,");
    assert.equal(restoreTerminalPunctuation("Hello there.", "Bonjour :", "fra_Latn"), "Bonjour :");
  });

  test("empty output and empty source change nothing", () => {
    assert.equal(restoreTerminalPunctuation("Hello.", "", "fra_Latn"), "");
    assert.equal(restoreTerminalPunctuation("", "Bonjour", "fra_Latn"), "Bonjour");
  });

  test("plain trailing whitespace is trimmed when the mark is added", () => {
    assert.equal(restoreTerminalPunctuation("Hello there.", "Bonjour ", "fra_Latn"), "Bonjour.");
  });
});
