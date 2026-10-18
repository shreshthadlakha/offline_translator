"use client";

/**
 * Local history. Newest first, grouped by day, with the language pair shown.
 * Each entry can be restored, copied, deleted, or flagged. A flag is for the
 * person's own reference. Nothing is reported anywhere. Hide input also masks
 * the source text shown here.
 */

import { memo, useMemo, useState } from "react";
import { Copy, Flag, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useTranslatorState } from "@/components/translate/translator-provider";
import { toast } from "@/hooks/use-toast";
import { languageByCode } from "@/lib/languages";
import { copy as strings } from "@/lib/copy";
import type { HistoryEntry } from "@/hooks/use-history";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function dayLabel(timestamp: number): string {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(date, today)) return strings.history.today;
  if (sameDay(date, yesterday)) return strings.history.yesterday;
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "long", day: "numeric" }).format(date);
}

function dayKey(timestamp: number): string {
  return new Date(timestamp).toDateString();
}

const HistoryItem = memo(function HistoryItem({
  entry,
  hidden,
  onRestore,
  onCopy,
  onDelete,
  onToggleFlag,
}: {
  entry: HistoryEntry;
  hidden: boolean;
  onRestore: (entry: HistoryEntry) => void;
  onCopy: (entry: HistoryEntry) => void;
  onDelete: (id: string) => void;
  onToggleFlag: (id: string, flagged: boolean) => void;
}) {
  const srcLang = languageByCode(entry.src);
  const tgtLang = languageByCode(entry.tgt);
  return (
    <article className="surface-card p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="type-small text-muted-foreground">
          {strings.history.pair(srcLang?.english ?? entry.src, tgtLang?.english ?? entry.tgt)}
        </p>
        {entry.flagged ? (
          <span className="type-small inline-flex shrink-0 items-center gap-1 rounded-full border border-highlight/60 bg-highlight/25 px-2 py-0.5 text-foreground">
            <Flag aria-hidden className="size-3 text-accent-green-text" />
            {strings.history.flaggedBadge}
          </span>
        ) : null}
      </div>
      <p
        lang={srcLang?.bcp47}
        dir={srcLang?.dir ?? "ltr"}
        className={cn("native-text type-small line-clamp-3 text-muted-foreground", hidden && "masked")}
      >
        {entry.sourceText}
      </p>
      <p lang={tgtLang?.bcp47} dir={tgtLang?.dir ?? "ltr"} className="native-text type-body mt-1.5 line-clamp-3">
        {entry.targetText}
      </p>
      <div className="mt-3 flex items-center justify-end gap-1">
        <Button
          variant="ghost"
          size="icon"
          aria-label={strings.history.restoreAria}
          title={strings.history.restoreAria}
          onClick={() => onRestore(entry)}
          className="text-muted-foreground"
        >
          <RotateCcw aria-hidden className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={strings.history.copyAria}
          title={strings.history.copyAria}
          onClick={() => onCopy(entry)}
          className="text-muted-foreground"
        >
          <Copy aria-hidden className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={strings.history.flagAria}
          title={strings.history.flagAria}
          aria-pressed={entry.flagged}
          onClick={() => onToggleFlag(entry.id, !entry.flagged)}
          className={entry.flagged ? "text-accent-green-text" : "text-muted-foreground"}
        >
          <Flag aria-hidden className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={strings.history.deleteAria}
          title={strings.history.deleteAria}
          onClick={() => onDelete(entry.id)}
          className="text-muted-foreground"
        >
          <Trash2 aria-hidden className="size-4" />
        </Button>
      </div>
    </article>
  );
});

function HistorySheetInner({ open, onOpenChange }: Props) {
  const { history, settings, setInput, setPair } = useTranslatorState();
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const visible = useMemo(
    () => (flaggedOnly ? history.entries.filter((e) => e.flagged) : history.entries),
    [history.entries, flaggedOnly],
  );

  const groups = useMemo(() => {
    const result: { label: string; entries: HistoryEntry[] }[] = [];
    for (const entry of visible) {
      const label = dayLabel(entry.createdAt);
      const last = result[result.length - 1];
      if (last && dayKey(entry.createdAt) === dayKey(last.entries[0]!.createdAt)) {
        last.entries.push(entry);
      } else {
        result.push({ label, entries: [entry] });
      }
    }
    return result;
  }, [visible]);

  const onRestore = (entry: HistoryEntry) => {
    setInput(entry.sourceText);
    setPair(entry.src, entry.tgt);
    onOpenChange(false);
  };

  const onCopy = async (entry: HistoryEntry) => {
    try {
      await navigator.clipboard.writeText(entry.targetText);
      toast({ description: strings.translate.copied });
    } catch {
      toast({ description: strings.translate.copyFailed });
    }
  };

  const emptyMessage = flaggedOnly ? strings.history.emptyFlagged : strings.history.empty;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle className="type-heading">{strings.history.title}</SheetTitle>
          <SheetDescription className="sr-only">{strings.history.title}</SheetDescription>
        </SheetHeader>

        <div className="flex items-center justify-between gap-2 border-b px-4 py-2">
          <div role="group" aria-label={strings.history.title} className="flex gap-1">
            <Button
              variant={!flaggedOnly ? "secondary" : "ghost"}
              size="sm"
              aria-pressed={!flaggedOnly}
              onClick={() => setFlaggedOnly(false)}
              className="type-small h-8"
            >
              {strings.history.showAll}
            </Button>
            <Button
              variant={flaggedOnly ? "secondary" : "ghost"}
              size="sm"
              aria-pressed={flaggedOnly}
              onClick={() => setFlaggedOnly(true)}
              className="type-small h-8"
            >
              {strings.history.flaggedOnly}
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirmClear(true)}
            disabled={history.entries.length === 0}
            className="type-small h-8 text-muted-foreground"
          >
            {strings.history.clear}
          </Button>
        </div>

        <div className="scroll-surface min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
          {visible.length === 0 ? (
            <p className="type-small px-2 py-8 text-center text-muted-foreground">{emptyMessage}</p>
          ) : (
            groups.map((group) => (
              <section key={group.label}>
                <h3 className="type-small mb-2 px-1 font-medium text-muted-foreground">{group.label}</h3>
                <div className="space-y-3">
                  {group.entries.map((entry) => (
                    <HistoryItem
                      key={entry.id}
                      entry={entry}
                      hidden={settings.hideInput}
                      onRestore={onRestore}
                      onCopy={onCopy}
                      onDelete={history.remove}
                      onToggleFlag={history.setFlagged}
                    />
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </SheetContent>

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="type-heading">{strings.history.clearTitle}</AlertDialogTitle>
            <AlertDialogDescription className="type-small">{strings.history.clearBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{strings.history.clearCancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                history.clear();
                setConfirmClear(false);
              }}
            >
              {strings.history.clearConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}

export const HistorySheet = memo(HistorySheetInner);
