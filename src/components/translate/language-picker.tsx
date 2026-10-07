"use client";

/**
 * The language picker. Desktop: a popover with a cmdk list. Mobile: a bottom
 * sheet. Both render the same rows: the native name in its own script beside
 * the English name, always sorted by English name, searchable in both names.
 * Rendered in a portal with an opaque surface above everything else. It closes
 * with Escape, an outside click, or a selection, and works fully by keyboard.
 * Choosing the language already set on the other side swaps the two.
 */

import { memo, useMemo, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Command } from "cmdk";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { searchLanguages, type Language } from "@/lib/languages";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";

type PickerProps = {
  side: "source" | "target";
  value: Language | undefined;
  otherValue: Language | undefined;
  onChoose: (code: string) => void;
};

function LanguageRow({
  language,
  selected,
  onSelect,
}: {
  language: Language;
  selected: boolean;
  onSelect: (code: string) => void;
}) {
  return (
    <Command.Item
      value={`${language.english} ${language.native}`}
      onSelect={() => onSelect(language.code)}
      className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm outline-none data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
      aria-label={`${language.english}, ${language.native}`}
    >
      <Check aria-hidden className={cn("size-4 shrink-0 text-accent-green-text", !selected && "invisible")} />
      <span lang={language.bcp47} dir={language.dir} className="min-w-0 flex-1 truncate">
        {language.native}
      </span>
      <span className="type-small shrink-0 text-muted-foreground">{language.english}</span>
    </Command.Item>
  );
}

function LanguageList({ value, onChoose, side }: PickerProps & { onChoose: (code: string) => void }) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchLanguages(query), [query]);

  return (
    <Command shouldFilter={false} className="flex h-full min-h-0 flex-col overflow-hidden bg-surface">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
        <Search aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <Command.Input
          value={query}
          onValueChange={setQuery}
          placeholder={copy.translate.searchLanguages}
          className="type-body h-11 w-full bg-transparent outline-none placeholder:text-muted-foreground"
          aria-label={copy.translate.searchLanguages}
        />
      </div>
      <Command.List className="scroll-surface max-h-[min(24rem,60vh)] min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5">
        {results.length === 0 ? (
          <Command.Empty className="type-small py-6 text-center text-muted-foreground">
            {copy.translate.noLanguageMatches}
          </Command.Empty>
        ) : (
          results.map((language) => (
            <LanguageRow
              key={language.code}
              language={language}
              selected={language.code === value?.code}
              onSelect={onChoose}
            />
          ))
        )}
      </Command.List>
      <span className="sr-only">{side === "source" ? copy.translate.chooseSource : copy.translate.chooseTarget}</span>
    </Command>
  );
}

function LanguagePickerInner({ side, value, otherValue, onChoose }: PickerProps) {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();
  const ariaLabel = side === "source" ? copy.translate.chooseSource : copy.translate.chooseTarget;
  // When the native name is the same as the English one, showing both is noise.
  const sameName =
    value?.native.trim().toLowerCase() === value?.english.trim().toLowerCase();

  const trigger = (
    <Button
      variant="outline"
      role="combobox"
      aria-expanded={open}
      aria-label={ariaLabel}
      className="h-11 w-full justify-between gap-2 px-3 font-normal"
    >
      <span className="flex min-w-0 items-center gap-2">
        {value ? (
          <span lang={value.bcp47} dir={value.dir} className="truncate font-medium">
            {value.native}
          </span>
        ) : null}
        {!sameName ? <span className="type-small hidden shrink-0 text-muted-foreground sm:inline">{value?.english}</span> : null}
      </span>
      <ChevronDown aria-hidden className="size-4 shrink-0 text-muted-foreground" />
    </Button>
  );

  const choose = (code: string) => {
    setOpen(false);
    onChoose(code);
  };

  if (isMobile) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        {/* The sheet variant of the picker */}
        <button
          type="button"
          aria-label={ariaLabel}
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className="flex h-11 w-full items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 text-sm shadow-xs outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <span className="flex min-w-0 items-center gap-2">
            {value ? (
              <span lang={value.bcp47} dir={value.dir} className="truncate font-medium">
                {value.native}
              </span>
            ) : null}
            {!sameName ? (
              <span className="type-small shrink-0 text-muted-foreground">{value?.english}</span>
            ) : null}
          </span>
          <ChevronDown aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        </button>
        <DialogContent
          showCloseButton={false}
          className="top-auto bottom-0 left-0 right-0 h-auto max-h-[80vh] translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-b-none rounded-t-xl border-t p-0 sm:max-w-none"
        >
          <DialogTitle className="sr-only">{ariaLabel}</DialogTitle>
          <div className="max-h-[75vh] overflow-hidden">
            <LanguageList side={side} value={value} otherValue={otherValue} onChoose={choose} />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(22rem,calc(100vw-2rem))] p-0"
        // Opaque surface above everything else. Nothing underneath shows through.
        style={{ background: "var(--surface)" }}
      >
        <LanguageList side={side} value={value} otherValue={otherValue} onChoose={choose} />
      </PopoverContent>
    </Popover>
  );
}

export const LanguagePicker = memo(LanguagePickerInner);
