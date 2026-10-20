"use client";

/**
 * Listen. Reads the translation aloud with voices already on the device, one
 * sentence at a time. Nothing is sent anywhere. If the device has no voice for
 * the language, the control says so instead of failing quietly.
 * speechSynthesis is only touched inside effects.
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Language } from "@/lib/languages";
import { segmentText } from "@/lib/segment";

const emptySubscribe = () => () => {};

export function useSpeech(language: Language | undefined, text: string) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [speaking, setSpeaking] = useState(false);
  // speechSynthesis is only read through an external store snapshot, so the
  // first render matches the server.
  const speechSupported = useSyncExternalStore(
    emptySubscribe,
    () => typeof window !== "undefined" && "speechSynthesis" in window,
    () => false,
  );
  const textRef = useRef(text);

  useEffect(() => {
    textRef.current = text;
  }, [text]);

  // Read the voice list in an effect, and listen for voiceschanged, because
  // voices often load late.
  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    const refresh = () => {
      setVoices(synth.getVoices());
    };
    refresh();
    synth.addEventListener("voiceschanged", refresh);
    return () => {
      synth.removeEventListener("voiceschanged", refresh);
      synth.cancel();
    };
  }, []);

  const voice = useMemo(() => {
    if (!language || voices.length === 0) return null;
    const lower = (v: string) => v.toLowerCase();
    // Prefer an exact regional match, then any voice for the language.
    const exact = voices.find((v) => lower(v.lang) === lower(language.speech ?? language.bcp47));
    if (exact) return exact;
    const base = language.bcp47.split("-")[0] ?? "";
    const script = language.bcp47.split("-")[1] ?? "";
    const sameBase = voices.filter((v) => lower(v.lang).startsWith(lower(base)));
    if (sameBase.length === 0) return null;
    const sameScript = sameBase.find((v) => script && lower(v.lang).includes(lower(script)));
    return sameScript ?? sameBase[0] ?? null;
  }, [language, voices]);

  const hasVoice = speechSupported && voices.length > 0 && voice !== null;

  const stop = useCallback(() => {
    if (!speechSupported) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [speechSupported]);

  const speak = useCallback(() => {
    if (!speechSupported || !voice) return;
    const synth = window.speechSynthesis;
    synth.cancel();
    const value = textRef.current.trim();
    if (value.length === 0) return;
    // Speak sentence by sentence. Some browsers cut long utterances off.
    const parts = segmentText(value, language?.bcp47 ?? "en")
      .lines.flatMap((line) => line)
      .filter((s) => s.length > 0);
    const chunks = parts.length > 0 ? parts : [value];
    let started = false;
    let remaining = chunks.length;
    for (const chunk of chunks) {
      const utterance = new SpeechSynthesisUtterance(chunk);
      utterance.voice = voice;
      utterance.lang = voice.lang;
      utterance.onstart = () => {
        if (!started) {
          started = true;
          setSpeaking(true);
        }
      };
      utterance.onend = () => {
        remaining -= 1;
        if (remaining <= 0) setSpeaking(false);
      };
      utterance.onerror = () => {
        remaining -= 1;
        if (remaining <= 0) setSpeaking(false);
      };
      synth.speak(utterance);
    }
  }, [speechSupported, voice, language]);

  // Cancel speech when the text changes, so the voice never reads stale words.
  useEffect(() => {
    return () => {
      if (speechSupported) window.speechSynthesis.cancel();
    };
  }, [speechSupported, text]);

  // Cancel when navigating away.
  useEffect(() => {
    const pageHide = () => stop();
    window.addEventListener("pagehide", pageHide);
    return () => {
      window.removeEventListener("pagehide", pageHide);
    };
  }, [stop]);

  return { speaking, hasVoice, speak, stop, speechSupported };
}
