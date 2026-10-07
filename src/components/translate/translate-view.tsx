"use client";

/**
 * The translate view. Top row: source language, swap, target language.
 * Below: the two panes, side by side on desktop, stacked on mobile. The panes
 * are the visual centre and get the most room at every size.
 */

import { memo, useCallback } from "react";
import { LanguagePicker } from "@/components/translate/language-picker";
import { SwapButton } from "@/components/translate/swap-button";
import { InputPane } from "@/components/translate/input-pane";
import { OutputPane } from "@/components/translate/output-pane";
import { StatusBadge } from "@/components/translate/status-badge";
import { useTranslatorState } from "@/components/translate/translator-provider";

function TranslateViewInner() {
  const { srcLang, tgtLang, srcCode, tgtCode, setPair } = useTranslatorState();

  const onChooseSource = useCallback(
    (code: string) => {
      if (code === tgtCode) {
        // Picking the language already set on the other side swaps the two.
        setPair(tgtCode, srcCode);
      } else {
        setPair(code, tgtCode);
      }
    },
    [srcCode, tgtCode, setPair],
  );

  const onChooseTarget = useCallback(
    (code: string) => {
      if (code === srcCode) {
        setPair(tgtCode, srcCode);
      } else {
        setPair(srcCode, code);
      }
    },
    [srcCode, tgtCode, setPair],
  );

  const onSwap = useCallback(() => {
    setPair(tgtCode, srcCode);
  }, [srcCode, tgtCode, setPair]);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-6 sm:px-6">
      <div className="mb-3 flex justify-end">
        <StatusBadge className="max-w-full" />
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-3">
        <LanguagePicker side="source" value={srcLang} otherValue={tgtLang} onChoose={onChooseSource} />
        <SwapButton onClick={onSwap} />
        <LanguagePicker side="target" value={tgtLang} otherValue={srcLang} onChoose={onChooseTarget} />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-4 md:mt-4 md:grid-cols-2">
        <InputPane />
        <OutputPane />
      </div>
    </div>
  );
}

export const TranslateView = memo(TranslateViewInner);
