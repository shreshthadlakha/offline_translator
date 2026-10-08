"use client";

/**
 * The output pane. A read only, selectable region with lang and dir from the
 * target language, showing the assembled translation. Newly arrived sentences
 * settle in with a soft fade and a tiny rise. Failed sentences show a small
 * inline message and never block the rest.
 *
 * Until setup has finished, this pane holds the setup card in place of the
 * empty state, so the one time download and its single progress bar are
 * always in view. When setup finishes, a small check draws in and the pane
 * says "Ready. Works offline now." before settling into the normal empty
 * state.
 */

import { memo, Fragment, useCallback, useEffect, useState } from "react";
import { Copy, Download, Flag, Square, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SetupCard } from "@/components/translate/setup-card";
import { useTranslatorState } from "@/components/translate/translator-provider";
import { useSpeech } from "@/hooks/use-speech";
import { toast } from "@/hooks/use-toast";
import { secondsPrecise } from "@/lib/format";
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

/** The quiet confirmation once setup finishes. A small check draws in. */
function ReadyNote() {
  return (
    <div role="status" className="my-auto flex items-center gap-3 px-1">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-green/15 text-accent-green-text">
        <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden="true">
          <path
            className="check-draw"
            d="M5 12.5 L10 17.5 L19 7"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <p className="type-body font-medium">{copy.setup.readyNote}</p>
    </div>
  );
}

function OutputPaneInner() {
  const { output, tgtLang, srcCode, flagCurrent, engine, heavyAsk } = useTranslatorState();
  const speech = useSpeech(tgtLang, output.plainText);

  // When the engine becomes ready, show the quiet confirmation briefly, then
  // fall through to the normal empty state. The note hides itself once the
  // ready tick it belongs to has been noted as shown long enough.
  const [hiddenAfterTick, setHiddenAfterTick] = useState(0);
  useEffect(() => {
    if (engine.status !== "ready") return;
    const tick = engine.readyTick;
    const timer = setTimeout(() => setHiddenAfterTick(tick), 3200);
    return () => clearTimeout(timer);
  }, [engine.status, engine.readyTick]);
  const showReadyNote = engine.status === "ready" && engine.readyTick > hiddenAfterTick;

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
  const hasContent = hasOutput || output.totalSentences > 0;

  let content: React.ReactNode;
  if (engine.status !== "ready") {
    // Until setup has finished, the setup card sits in the output pane in
    // place of the empty state, whatever was typed. Pending sentences can't
    // translate before the engine exists, so the one time download and its
    // single progress bar stay in view the whole time.
    content = <SetupCard />;
  } else if (hasContent) {
    content = output.lines.map((spans, lineIndex) => (
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
    ));
  } else if (showReadyNote) {
    content = <ReadyNote />;
  } else {
    content = <p className="text-muted-foreground">{copy.translate.outputEmpty}</p>;
  }

  // The honest ask for a full model pair can open while a small model is
  // loaded and ready: the setup card mounts just for the dialog, over
  // whatever the pane is already showing.
  if (engine.status === "ready" && heavyAsk.open) {
    content = (
      <>
        {content}
        <SetupCard />
      </>
    );
  }

  return (
    <section
      aria-label={copy.translate.translation}
      className="flex min-w-0 flex-col border-t md:border-t-0 md:border-l"
    >
      <header className="flex items-center justify-between gap-2 px-4 py-2">
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

      {/* Progress while translating, and the quiet timing line afterwards. */}
      {engine.status === "ready" && (output.pendingCount > 0 || output.lastTranslatedMs != null) && output.totalSentences > 0 ? (
        <div className="border-b px-4 py-1.5" aria-live="polite">
          <p className="type-small text-muted-foreground tabular-nums">
            {output.pendingCount > 0
              ? copy.translate.translatingSentence(Math.min(output.doneCount + 1, output.totalSentences), output.totalSentences)
              : copy.translate.translatedIn(secondsPrecise(output.lastTranslatedMs ?? 0))}
          </p>
        </div>
      ) : null}

      <div
        aria-label={copy.translate.outputAriaLabel}
        lang={tgtLang?.bcp47}
        dir={tgtLang?.dir ?? "ltr"}
        className="type-pane scroll-surface user-select-text flex min-h-[clamp(320px,50vh,520px)] flex-col overflow-y-auto px-4 py-3 whitespace-pre-wrap"
      >
        {content}
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
