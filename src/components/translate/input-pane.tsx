"use client";

/**
 * The input pane. A textarea with lang and dir from the source language.
 * Enter translates. Shift and Enter inserts a line break. Hide input is a
 * real switch with a visible on and off state, blurring the text with a
 * strong CSS blur while typing, the caret and translation carry on as normal.
 * Under the empty input, three short example sentences fill the box when
 * clicked. They only show while the source language is English, and they
 * disappear once there is text.
 */

import { memo, useEffect, useRef } from "react";
import { Switch } from "@/components/ui/switch";
import { useTranslatorState } from "@/components/translate/translator-provider";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";

function InputPaneInner() {
  const { input, setInput, srcLang, settings, updateSettings, translateNow } = useTranslatorState();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hidden = settings.hideInput;

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      translateNow();
    }
  };

  // When hide input is on, the blur must not swallow the first click into the
  // textarea. Focus stays usable because the blur is a filter, not a pointer
  // event block.
  useEffect(() => {
    if (hidden) textareaRef.current?.focus({ preventScroll: true });
  }, [hidden]);

  // Example chips: only for English, and only while the box is empty.
  const showExamples = srcLang?.code === "eng_Latn" && input.trim().length === 0;

  return (
    <section aria-label={copy.translate.source} data-hide-input={hidden ? "true" : undefined} className="flex min-w-0 flex-col">
      <header className="flex items-center justify-between gap-3 px-4 py-2">
        <h2 className="type-small font-medium text-muted-foreground">{copy.translate.source}</h2>
        <div className="flex items-center gap-2.5">
          <label
            htmlFor="hide-input"
            title={copy.translate.hideInputHelper}
            className="type-small cursor-pointer select-none text-muted-foreground"
          >
            {copy.translate.hideInput}
          </label>
          <Switch
            id="hide-input"
            checked={hidden}
            onCheckedChange={(checked) => updateSettings({ hideInput: checked })}
            aria-label={copy.translate.hideInput}
          />
        </div>
      </header>

      <div className="flex min-h-[clamp(320px,50vh,520px)] flex-col">
        <textarea
          ref={textareaRef}
          id="source-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={copy.translate.inputPlaceholder}
          aria-label={copy.translate.inputAriaLabel}
          lang={srcLang?.bcp47}
          dir={srcLang?.dir ?? "ltr"}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          className={cn(
            "type-pane scroll-surface min-h-0 w-full flex-1 resize-none bg-transparent px-4 py-3 outline-none placeholder:text-muted-foreground",
            "caret-(--accent-green)",
            hidden && "masked",
          )}
        />

        {showExamples ? (
          <div className="px-4 pb-3" role="group" aria-label={copy.translate.exampleLabel}>
            <ul className="flex flex-wrap gap-2">
              {copy.translate.examples.map((sentence) => (
                <li key={sentence}>
                  <button
                    type="button"
                    onClick={() => setInput(sentence)}
                    className="type-small max-w-full truncate rounded-full border border-border bg-surface px-3 py-1.5 text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/60"
                  >
                    {sentence}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export const InputPane = memo(InputPaneInner);
