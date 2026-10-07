"use client";

/**
 * The output pane. A read only, selectable region with lang and dir from the
 * target language, showing the assembled translation. Newly arrived sentences
 * settle in with a soft fade and a tiny rise. Failed sentences show a small
 * inline message and never block the rest.
 */

import { memo, Fragment, useCallback } from "react";
import { Copy, Download, Flag, Square, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslatorState } from "@/components/translate/translator-provider";
import { useSpeech } from "@/hooks/use-speech";
import { toast } from "@/hooks/use-toast";
import { copy } from "@/lib/copy";

function downloadTextFile(text: string, filename: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function isoDate(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function OutputPaneInner() {
  const { output, tgtLang, srcCode, flagCurrent } = useTranslatorState();
  const speech = useSpeech(tgtLang, output.plainText);

  const onCopy = useCallback(async () => {
    const text = output.plainText;
    if (text.trim().length === 0) return;
    try {
      await navigator.clipboard.writeText(text);
      toast({ description: copy.translate.copied });
    } catch {
      toast({ description: copy.translate.copyFailed });
    }
  }, [output.plainText]);

  const onDownload = useCallback(() => {
    const text = output.plainText;
    if (text.trim().length === 0) return;
    const base = srcCode.split("_")[0] ?? "translation";
    downloadTextFile(text, `translation-${base}-${isoDate()}.txt`);
  }, [output.plainText, srcCode]);

  const onListen = useCallback(() => {
    if (speech.speaking) {
      speech.stop();
    } else {
      speech.speak();
    }
  }, [speech]);

  const hasOutput = output.hasAnyOutput || output.plainText.trim().length > 0;

  return (
    <section aria-label={copy.translate.translation} className="surface-card flex min-h-[16rem] flex-col overflow-hidden md:min-h-[20rem]">
      <header className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
        <h2 className="type-small font-medium text-muted-foreground">{copy.translate.translation}</h2>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label={speech.speaking ? copy.translate.stopListening : copy.translate.listenAria}
            onClick={onListen}
            disabled={!hasOutput || !speech.hasVoice}
            title={speech.speechSupported && !speech.hasVoice ? copy.translate.noVoice : undefined}
            className="text-muted-foreground"
          >
            {speech.speaking ? <Square aria-hidden className="size-4" /> : <Volume2 aria-hidden className="size-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={copy.translate.copyAria}
            onClick={() => void onCopy()}
            disabled={!hasOutput}
            className="text-muted-foreground"
          >
            <Copy aria-hidden className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={copy.translate.downloadAria}
            onClick={onDownload}
            disabled={!hasOutput}
            className="text-muted-foreground"
          >
            <Download aria-hidden className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={copy.translate.flagAria}
            onClick={flagCurrent}
            disabled={!hasOutput}
            title={copy.translate.flagAria}
            className="text-muted-foreground"
          >
            <Flag aria-hidden className="size-4" />
          </Button>
        </div>
      </header>

      <div
        aria-label={copy.translate.outputAriaLabel}
        lang={tgtLang?.bcp47}
        dir={tgtLang?.dir ?? "ltr"}
        className="type-pane scroll-surface user-select-text min-h-0 flex-1 overflow-y-auto px-4 py-3.5 whitespace-pre-wrap"
      >
        {!hasOutput && output.totalSentences === 0 ? (
          <p className="text-muted-foreground">{copy.translate.outputEmpty}</p>
        ) : (
          output.lines.map((spans, lineIndex) => (
            <p key={lineIndex} className="min-h-[1.6em]">
              {spans.map((span, spanIndex) => {
                if (span.text.length === 0) {
                  if (span.state === "pending") {
                    return (
                      <span key={spanIndex} aria-hidden className="text-muted-foreground">
                        {"\u2026"}
                      </span>
                    );
                  }
                  return null;
                }
                return (
                  <Fragment key={spanIndex}>
                    {span.spaceBefore ? " " : ""}
                    <span key={`${lineIndex}-${spanIndex}`} className={span.changed ? "arrive" : undefined}>
                      {span.text}
                    </span>
                    {span.state === "failed" ? (
                      <span className="mt-1 block text-danger" style={{ fontSize: "0.8125rem", lineHeight: 1.45 }}>
                        {copy.translate.sentenceFailed}
                      </span>
                    ) : null}
                  </Fragment>
                );
              })}
            </p>
          ))
        )}
      </div>

      {speech.speechSupported && !speech.hasVoice && hasOutput ? (
        <footer className="border-t px-4 py-3">
          <p className="type-small text-muted-foreground">{copy.translate.noVoice}</p>
        </footer>
      ) : null}
    </section>
  );
}

export const OutputPane = memo(OutputPaneInner);
