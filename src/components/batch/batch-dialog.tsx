"use client";

/**
 * Batch mode. Paste text or upload a plain text file, translate the whole
 * thing, watch progress, cancel if needed, then copy or download the result.
 * Queued at batch priority so live typing is never starved.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy, Download, FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTranslatorState } from "@/components/translate/translator-provider";
import { toast } from "@/hooks/use-toast";
import { translationCache } from "@/lib/cache";
import { languageByCode } from "@/lib/languages";
import { flatSentences, joinLines, segmentText } from "@/lib/segment";
import { SPEED_CONFIG } from "@/lib/speed-config";
import { copy as strings } from "@/lib/copy";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type BatchState = {
  phase: "input" | "running" | "done" | "cancelled";
  text: string;
  total: number;
  done: number;
  failed: number;
};

const INITIAL: BatchState = { phase: "input", text: "", total: 0, done: 0, failed: 0 };

let batchIdCounter = 0;

export function BatchDialog({ open, onOpenChange }: Props) {
  const { engine, srcCode, tgtCode, srcLang, tgtLang, maybeStartSetup } = useTranslatorState();
  const [state, setState] = useState<BatchState>(INITIAL);
  const [batchText, setBatchText] = useState("");
  /** One entry per queued job: the sentences it carries. */
  const pendingRef = useRef(new Map<string, string[]>());
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      // Cancel any run still going when the dialog closes.
      for (const id of pendingRef.current.keys()) engine.cancel(id);
      pendingRef.current.clear();
      setState(INITIAL);
      setBatchText("");
    }
  }, [open, engine]);

  const sentences = useMemo(
    () => (state.phase === "input" ? [] : flatSentences(segmentText(state.text, srcLang?.bcp47 ?? "en"))),
    [state.phase, state.text, srcLang?.bcp47],
  );

  // Assemble the result from the cache, not from arrival order.
  const resultText = useMemo(() => {
    if (state.phase === "input") return "";
    const segments = segmentText(state.text, srcLang?.bcp47 ?? "en");
    return joinLines(
      segments.lines.map((line) => line.map((sentence) => translationCache.get(srcCode, tgtCode, sentence) ?? "")),
    );
  }, [state.phase, state.text, srcCode, tgtCode, srcLang?.bcp47, state.done]);

  const start = useCallback(() => {
    const text = batchText.trim();
    if (text.length === 0) return;
    maybeStartSetup();
    const segments = segmentText(text, srcLang?.bcp47 ?? "en");
    const all = flatSentences(segments);
    setState({ phase: "running", text, total: all.length, done: 0, failed: 0 });
  }, [batchText, maybeStartSetup, srcLang?.bcp47]);

  // Queue work once the engine is ready. If setup was needed, this runs after
  // it finishes, so whatever was pasted gets translated. Sentences are grouped
  // into one inference call per group, which is faster per sentence than one
  // call each when the engine benefits from batching (see lib/speed-config.ts).
  useEffect(() => {
    if (state.phase !== "running" || engine.status !== "ready") return;
    const segments = segmentText(state.text, srcLang?.bcp47 ?? "en");
    const all = flatSentences(segments);
    const pendingSentences = new Set<string>();
    for (const group of pendingRef.current.values()) {
      for (const sentence of group) pendingSentences.add(sentence);
    }
    const toTranslate: string[] = [];
    for (const s of all) {
      if (translationCache.get(srcCode, tgtCode, s.text) !== undefined) continue;
      if (pendingSentences.has(s.text)) continue;
      toTranslate.push(s.text);
    }
    for (let i = 0; i < toTranslate.length; i += SPEED_CONFIG.batch.groupSize) {
      const group = toTranslate.slice(i, i + SPEED_CONFIG.batch.groupSize);
      const id = `b-${Date.now().toString(36)}-${batchIdCounter++}`;
      pendingRef.current.set(id, group);
      engine.translate(id, group, srcCode, tgtCode, "batch");
    }
    const queued = toTranslate.length;
    const alreadyCached = all.length - queued;
    if (queued === 0) {
      setState((prev) => ({ ...prev, phase: "done", done: all.length }));
    } else if (alreadyCached > 0) {
      setState((prev) => ({ ...prev, done: alreadyCached }));
    }
  }, [state.phase, state.text, engine.status, engine.readyTick, engine, srcCode, tgtCode, srcLang?.bcp47]);

  // Track results and errors.
  useEffect(() => {
    if (state.phase !== "running") return;
    return engine.subscribe((message) => {
      if (message.type === "result" && message.id && pendingRef.current.has(message.id)) {
        const group = pendingRef.current.get(message.id) ?? [];
        pendingRef.current.delete(message.id);
        // The results land in the shared cache, and the assembled output is
        // derived from it, never from arrival order.
        group.forEach((sentence, index) => {
          translationCache.set(srcCode, tgtCode, sentence, message.texts[index] ?? "");
        });
        setState((prev) => {
          const done = prev.done + group.length;
          const finished = done >= prev.total && pendingRef.current.size === 0;
          return { ...prev, done, phase: finished ? "done" : "running" };
        });
      } else if (message.type === "error" && message.id && pendingRef.current.has(message.id)) {
        const group = pendingRef.current.get(message.id) ?? [];
        pendingRef.current.delete(message.id);
        setState((prev) => {
          const done = prev.done + group.length;
          const failed = prev.failed + group.length;
          const finished = done >= prev.total && pendingRef.current.size === 0;
          return { ...prev, done, failed, phase: finished ? "done" : "running" };
        });
      }
    });
  }, [engine, state.phase, srcCode, tgtCode]);

  const cancel = useCallback(() => {
    for (const id of pendingRef.current.keys()) engine.cancel(id);
    pendingRef.current.clear();
    setState((prev) => ({ ...prev, phase: "cancelled" }));
  }, [engine]);

  const onCopyResult = useCallback(async () => {
    if (resultText.trim().length === 0) return;
    try {
      await navigator.clipboard.writeText(resultText);
      toast({ description: strings.translate.copied });
    } catch {
      toast({ description: strings.translate.copyFailed });
    }
  }, [resultText]);

  const onDownloadResult = useCallback(() => {
    if (resultText.trim().length === 0) return;
    const blob = new Blob([resultText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const base = srcCode.split("_")[0] ?? "batch";
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, "0");
    anchor.href = url;
    anchor.download = `translation-${base}-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [resultText, srcCode]);

  const onPickFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = await file.text();
      setBatchText(text);
    } catch {
      toast({ description: strings.batch.fileReadError });
    }
  }, []);

  const running = state.phase === "running";
  const hasResult = (state.phase === "done" || state.phase === "cancelled") && resultText.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="type-heading">{strings.batch.title}</DialogTitle>
          <DialogDescription className="type-small text-muted-foreground">
            {strings.batch.intro} {languageByCode(srcCode)?.english} to {languageByCode(tgtCode)?.english}.
          </DialogDescription>
        </DialogHeader>

        {state.phase === "input" ? (
          <div className="space-y-3">
            <Textarea
              value={batchText}
              onChange={(event) => setBatchText(event.target.value)}
              placeholder={strings.batch.pastePlaceholder}
              aria-label={strings.batch.pastePlaceholder}
              lang={srcLang?.bcp47}
              dir={srcLang?.dir ?? "ltr"}
              className="scroll-surface min-h-40"
            />
            <div className="flex items-center justify-between gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,text/plain"
                className="hidden"
                onChange={(event) => void onPickFile(event.target.files?.[0])}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                aria-label={strings.batch.fileAria}
                className="type-small"
              >
                <FileUp aria-hidden className="size-4" />
                {strings.batch.chooseFile}
              </Button>
              <Button size="sm" onClick={start} disabled={batchText.trim().length === 0} className="type-small">
                {strings.batch.translate}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <p className="type-small text-muted-foreground tabular-nums">
                  {strings.batch.progress(state.done, state.total)}
                </p>
                {running ? (
                  <Button variant="ghost" size="sm" onClick={cancel} className="type-small h-8">
                    {strings.batch.cancel}
                  </Button>
                ) : null}
              </div>
              <Progress
                value={state.total > 0 ? Math.round((state.done / state.total) * 100) : 0}
                aria-label={strings.batch.progress(state.done, state.total)}
              />
            </div>

            {state.phase === "cancelled" ? (
              <p className="type-small text-muted-foreground">{strings.batch.cancelled}</p>
            ) : null}
            {state.phase === "done" ? <p className="type-small text-muted-foreground">{strings.batch.done}</p> : null}
            {state.phase === "running" && engine.status === "error" ? (
              <p className="type-small text-danger" role="alert">
                {engine.error?.code === "memory" ? strings.setup.outOfMemory : strings.setup.downloadFailed}
              </p>
            ) : null}
            {state.failed > 0 ? (
              <p className="type-small text-danger">{strings.translate.sentenceFailed}</p>
            ) : null}

            <div
              lang={tgtLang?.bcp47}
              dir={tgtLang?.dir ?? "ltr"}
              className="scroll-surface type-body max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border bg-surface p-3"
              aria-label={strings.batch.title}
            >
              {resultText.length > 0 ? resultText : "\u00a0"}
            </div>

            <div className="flex items-center justify-end gap-2">
              {hasResult ? (
                <>
                  <Button variant="outline" size="sm" onClick={() => void onCopyResult()} className="type-small">
                    <Copy aria-hidden className="size-4" />
                    {strings.batch.copy}
                  </Button>
                  <Button variant="outline" size="sm" onClick={onDownloadResult} className="type-small">
                    <Download aria-hidden className="size-4" />
                    {strings.batch.download}
                  </Button>
                </>
              ) : null}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  for (const id of pendingRef.current.keys()) engine.cancel(id);
                  pendingRef.current.clear();
                  setState(INITIAL);
                  setBatchText("");
                }}
                disabled={running && engine.status !== "error"}
                className="type-small"
              >
                {strings.batch.clear}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
