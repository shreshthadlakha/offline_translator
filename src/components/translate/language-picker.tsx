"use client";

/**
 * The language picker. Desktop: a popover with a cmdk list. Mobile: a bottom
 * sheet. Both render the same rows: the native name in its own script beside
 * the English name, always sorted by English name, searchable in both names.
 * Rendered in a portal with an opaque surface above everything else. It closes
 * with Escape, an outside click, or a selection, and works fully by keyboard.
 * Choosing the language already set on the other side swaps the two.
 *
 * The trigger is a light, text like control in the tool card's top row. On the
 * target side it shows the Ctrl or Cmd K shortcut hint.
 */

import { memo, useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Command } from "cmdk";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSettings } from "@/hooks/use-settings";
import { searchLanguages, type Language } from "@/lib/languages";
import { pairCost, resultingPair } from "@/lib/engines";
import { mbWhole } from "@/lib/format";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";

type PickerProps = {
  side: "source" | "target";
  value: Language | undefined;
  otherValue: Language | undefined;
  onChoose: (code: string) => void;
  /** Controlled open state, used by the Ctrl or Cmd K shortcut. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Show the keyboard shortcut hint on the control. */
  showShortcut?: boolean;
};

// The shortcut label depends on the keyboard, so it is detected once on the
// client. Read through an external store: the server snapshot is empty, so
// the first client render matches the server, and the label arrives right
// after hydration without a warning.
let shortcutLabelCache: string | null | undefined;
function getShortcutLabel(): string | null {
  if (shortcutLabelCache === undefined) {
    const platform = `${navigator.platform ?? ""} ${navigator.userAgent ?? ""}`;
    const isApple = /Mac|iPhone|iPad|iPod/.test(platform);
    shortcutLabelCache = isApple ? copy.translate.pickerShortcutMac : copy.translate.pickerShortcutOther;
  }
  return shortcutLabelCache;
}
const subscribeToNothing = () => () => {};

function LanguageRow({
  language,
  selected,
  note,
  onSelect,
}: {
  language: Language;
  selected: boolean;
  note: string | null;
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
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span lang={language.bcp47} dir={language.dir} className="min-w-0 truncate">
            {language.native}
          </span>
          <span className="type-small shrink-0 text-muted-foreground">{language.english}</span>
        </span>
        {note ? <span className="type-small mt-0.5 block text-muted-foreground">{note}</span> : null}
      </span>
    </Command.Item>
  );
}

function LanguageList({ value, otherValue, onChoose, side, noteFor }: PickerProps & { onChoose: (code: string) => void; noteFor: (code: string) => string | null }) {
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
              note={noteFor(language.code)}
              onSelect={onChoose}
            />
          ))
        )}
      </Command.List>
      <span className="sr-only">{side === "source" ? copy.translate.chooseSource : copy.translate.chooseTarget}</span>
    </Command>
  );
}

function LanguagePickerInner({ side, value, otherValue, onChoose, open, onOpenChange, showShortcut }: PickerProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isOpen = open ?? uncontrolledOpen;
  const { settings } = useSettings();
  const setOpen = useCallback(
    (next: boolean) => {
      if (onOpenChange) onOpenChange(next);
      else setUncontrolledOpen(next);
    },
    [onOpenChange],
  );

  // The quiet cost note for each row: what the pair created by choosing this
  // language would need. Updates when the other side changes.
  const noteFor = useCallback(
    (code: string) => {
      const src = side === "source" ? (value?.code ?? "eng_Latn") : (otherValue?.code ?? "eng_Latn");
      const tgt = side === "target" ? (value?.code ?? "fra_Latn") : (otherValue?.code ?? "fra_Latn");
      const pair = resultingPair(side, code, src, tgt);
      const cost = pairCost(pair.src, pair.tgt, settings.useFastModels);
      if (cost.kind === "fast") return copy.translate.costFast(mbWhole(cost.expectedBytes));
      if (cost.kind === "group") return copy.translate.costGroup(mbWhole(cost.expectedBytes));
      return copy.translate.costLarge;
    },
    [side, value, otherValue, settings.useFastModels],
  );

  const isMobile = useIsMobile();
  const ariaLabel = side === "source" ? copy.translate.chooseSource : copy.translate.chooseTarget;
  // When the native name is the same as the English one, showing both is noise.
  const sameName = value?.native.trim().toLowerCase() === value?.english.trim().toLowerCase();

  const shortcutLabel = useSyncExternalStore(subscribeToNothing, getShortcutLabel, () => null);
  const shortcut = showShortcut ? shortcutLabel : null;

  // A light, text like control.
  const trigger = (
    <button
      type="button"
      aria-haspopup="listbox"
      aria-expanded={isOpen}
      aria-label={ariaLabel}
      onClick={() => setOpen(true)}
      className="group flex min-h-11 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-start transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/60"
    >
      {value ? (
        <span lang={value.bcp47} dir={value.dir} className="type-body min-w-0 truncate font-medium">
          {value.native}
        </span>
      ) : null}
      {!sameName ? (
        <span className="type-small hidden shrink-0 text-muted-foreground sm:inline">{value?.english}</span>
      ) : null}
      {showShortcut && shortcut ? (
        <kbd className="kbd-hint hidden md:inline-flex" aria-hidden="true">
          {shortcut}
        </kbd>
      ) : null}
      <ChevronDown aria-hidden className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );

  const choose = (code: string) => {
    setOpen(false);
    onChoose(code);
  };

  if (isMobile) {
    return (
      <Dialog open={isOpen} onOpenChange={setOpen}>
        {/* The sheet variant of the picker */}
        {trigger}
        <DialogContent
          showCloseButton={false}
          className="top-auto bottom-0 left-0 right-0 h-auto max-h-[80vh] translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-b-none rounded-t-xl border-t p-0 sm:max-w-none"
        >
          <DialogTitle className="sr-only">{ariaLabel}</DialogTitle>
          <DialogDescription className="sr-only">{copy.translate.searchLanguages}</DialogDescription>
          <div className="max-h-[75vh] overflow-hidden">
            <LanguageList side={side} value={value} otherValue={otherValue} onChoose={choose} noteFor={noteFor} />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Popover open={isOpen} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(22rem,calc(100vw-2rem))] p-0"
        // Opaque surface above everything else. Nothing underneath shows through.
        style={{ background: "var(--surface)" }}
      >
        <LanguageList side={side} value={value} otherValue={otherValue} onChoose={choose} noteFor={noteFor} />
      </PopoverContent>
    </Popover>
  );
}

export const LanguagePicker = memo(LanguagePickerInner);
