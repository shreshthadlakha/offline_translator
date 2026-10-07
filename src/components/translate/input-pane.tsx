"use client";

/**
 * The input pane. A textarea with lang and dir from the source language.
 * Enter translates. Shift and Enter inserts a line break. Hide input blurs
 * the text with a strong CSS blur while typing, the caret and translation
 * carry on as normal.
 */

import { memo, useEffect, useRef } from "react";
import { EyeOff, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SetupCard } from "@/components/translate/setup-card";
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

  return (
    <section
      aria-label={copy.translate.source}
      data-hide-input={hidden ? "true" : undefined}
      className="surface-card flex min-h-[16rem] flex-col overflow-hidden md:min-h-[20rem]"
    >
      <header className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
        <h2 className="type-small font-medium text-muted-foreground">{copy.translate.source}</h2>
        <div className="flex items-center gap-2">
          {hidden ? (
            <span className="type-small inline-flex items-center gap-1.5 rounded-full border border-border bg-hover px-2.5 py-1 text-muted-foreground">
              <EyeOff aria-hidden className="size-3.5" />
              {copy.translate.hideInputChip}
            </span>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            aria-label={copy.translate.hideInput}
            aria-pressed={hidden}
            title={copy.translate.hideInputHelper}
            onClick={() => updateSettings({ hideInput: !hidden })}
            className="type-small h-8 px-2.5 text-muted-foreground"
          >
            {hidden ? <Eye aria-hidden className="size-4" /> : <EyeOff aria-hidden className="size-4" />}
            <span className="hidden sm:inline">{copy.translate.hideInput}</span>
          </Button>
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <textarea
          ref={textareaRef}
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
            "type-pane scroll-surface h-full w-full resize-none bg-transparent px-4 py-3.5 outline-none placeholder:text-muted-foreground",
            "caret-(--accent-green)",
            hidden && "masked",
          )}
        />
      </div>

      <footer className="border-t px-4 pb-3.5 pt-3">
        <SetupCard className="mb-2.5" />
        <div className="flex items-center justify-between gap-3">
          <p className="type-small hidden text-muted-foreground sm:block">{copy.translate.hint}</p>
          <Button onClick={translateNow} disabled={input.trim().length === 0} className="shrink-0">
            {copy.translate.translateNow}
          </Button>
        </div>
      </footer>
    </section>
  );
}

export const InputPane = memo(InputPaneInner);
