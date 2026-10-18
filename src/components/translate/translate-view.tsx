"use client";

/**
 * The tool, as one card. The pickers and the swap sit in the card's top row as
 * light text like controls, the two panes are divided by a thin divider, and
 * the card's bottom row carries the hint and the Translate button. Until setup
 * has finished, the output pane holds the setup card in place of the empty
 * state. Ctrl or Cmd K opens the target language picker.
 */

import { memo, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { LanguagePicker } from "@/components/translate/language-picker";
import { SwapButton } from "@/components/translate/swap-button";
import { InputPane } from "@/components/translate/input-pane";
import { OutputPane } from "@/components/translate/output-pane";
import { StatusBadge } from "@/components/translate/status-badge";
import { DetailsPanel } from "@/components/translate/details-panel";
import { usePairState, useTranslatorState } from "@/components/translate/translator-provider";
import { copy } from "@/lib/copy";
function TranslateButtonInner() {
  const { input, translateNow } = useTranslatorState();
  return (
    <Button onClick={translateNow} disabled={input.trim().length === 0} className="shrink-0">
      {copy.translate.translateNow}
    </Button>
  );
}

/** Kept apart so a keystroke only re renders the button, not the whole card. */
const TranslateButton = memo(TranslateButtonInner);

function TranslateViewInner() {
  const { chooseSource, chooseTarget, setPair, srcCode, tgtCode, srcLang, tgtLang } = usePairState();
  const { targetPickerOpen, setTargetPickerOpen } = useTranslatorState();

  // Ctrl or Cmd K opens the target language picker, the language being
  // translated into.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") return;
      // Don't open it behind an open dialog or sheet.
      if (document.querySelector('[data-state="open"][role="dialog"]')) return;
      event.preventDefault();
      setTargetPickerOpen(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setTargetPickerOpen]);

  const onSwap = useCallback(() => {
    setPair(tgtCode, srcCode);
  }, [setPair, srcCode, tgtCode]);

  return (
    <section
      id="tool"
      aria-label={copy.translate.viewLabel}
      className="surface-card mt-6 overflow-hidden md:mt-8"
    >
      {/* Top row: light, text like controls for the pair, and the status badge. */}
      <div className="flex flex-wrap items-center gap-x-1 gap-y-2 border-b px-2 py-2 sm:px-3">
        <LanguagePicker side="source" value={srcLang} otherValue={tgtLang} onChoose={chooseSource} />
        <SwapButton onClick={onSwap} />
        <LanguagePicker
          side="target"
          value={tgtLang}
          otherValue={srcLang}
          onChoose={chooseTarget}
          open={targetPickerOpen}
          onOpenChange={setTargetPickerOpen}
          showShortcut
        />
        <div className="ms-auto min-w-0 max-w-full sm:max-w-[26rem]">
          <StatusBadge className="max-w-full" />
        </div>
      </div>

      {/* The panes, side by side on desktop with a thin divider between them. */}
      <div className="grid grid-cols-1 md:grid-cols-2">
        <InputPane />
        <OutputPane />
      </div>

      {/* Bottom row: the hint and the Translate button. */}
      <div className="flex items-center justify-between gap-3 border-t px-4 py-3">
        <p className="type-small hidden text-muted-foreground sm:block">{copy.translate.hint}</p>
        <TranslateButton />
      </div>

      {/* Engine details, collapsible and remembered between visits. */}
      <DetailsPanel />
    </section>
  );
}

export const TranslateView = memo(TranslateViewInner);
