"use client";

/**
 * Settings: appearance (light, dark, follow the device), keep history with a
 * clear action, the "On this device" block (the faster models switch, the
 * experimental graphics device switch, every saved model with its size and a
 * Remove button, storage used, saved translations, and Erase everything),
 * installing the app, and a link to the How it works section on the page.
 */

import { memo, useCallback, useEffect, useState } from "react";
import { Info, Monitor, Moon, Sun, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useTranslatorState } from "@/components/translate/translator-provider";
import { useSettings } from "@/hooks/use-settings";
import { deleteModelCache, deleteModelEntries, savedModels } from "@/lib/model-cache";
import { languageByCode } from "@/lib/languages";
import { useInstallPrompt } from "@/hooks/use-install-prompt";
import { STORAGE_KEYS, storageRemove } from "@/lib/storage";
import { formatBytes, mbWhole } from "@/lib/format";
import { allEngines } from "@/lib/engines";
import { copy as strings } from "@/lib/copy";
import { toast } from "@/hooks/use-toast";
import type { Settings } from "@/hooks/use-settings";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onHowItWorks: () => void;
};

type SavedModel = { modelId: string; name: string; bytes: number; engineId: string | null };

function SettingsSheetInner({ open, onOpenChange, onHowItWorks }: Props) {
  const { settings, updateSettings, engine, history } = useTranslatorState();
  const { removeFullModelFor } = useSettings();

  // Pair keys of the "always use the full model" choices, for the list below.
  const fullModelChoices = settings.fullModelFor;
  const onRemoveChoice = useCallback(
    (pairKey: string) => {
      removeFullModelFor(pairKey);
      toast({ description: strings.settings.removedChoice });
    },
    [removeFullModelFor],
  );
  const pairName = useCallback((pairKey: string) => {
    const [src, tgt] = pairKey.split("|");
    return `${languageByCode(src)?.english ?? src} to ${languageByCode(tgt)?.english ?? tgt}`;
  }, []);
  const install = useInstallPrompt();

  // The real numbers for the On this device block, read while the sheet is
  // open. Never during render.
  const [savedModelList, setSavedModelList] = useState<SavedModel[]>([]);
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const sizes = await savedModels();
      const engines = allEngines();
      const list: SavedModel[] = [];
      for (const [modelId, bytes] of sizes) {
        const engineForModel = engines.find((candidate) => candidate.modelId === modelId);
        list.push({ modelId, bytes, name: engineForModel?.name ?? modelId, engineId: engineForModel?.id ?? null });
      }
      list.sort((a, b) => a.name.localeCompare(b.name));
      setSavedModelList(list);
    } catch {
      setSavedModelList([]);
    }
    try {
      const estimate = await navigator.storage?.estimate?.();
      if (estimate && typeof estimate.usage === "number" && typeof estimate.quota === "number") {
        setStorage({ usage: estimate.usage, quota: estimate.quota });
      } else {
        setStorage(null);
      }
    } catch {
      setStorage(null);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void refresh();
  }, [open, refresh, engine.status, engine.readyTick]);

  const onRemoveModel = useCallback(
    async (model: SavedModel) => {
      setRemoving(model.modelId);
      try {
        await deleteModelEntries(model.modelId);
        if (model.engineId != null && (engine.engineInfo?.id === model.engineId || engine.desiredEngine?.id === model.engineId)) {
          // The engine in memory came from those files. Drop it, so the next
          // use sets up again honestly instead of running on removed files.
          engine.reset();
        }
        const remaining = await savedModels();
        if (remaining.size === 0) storageRemove(STORAGE_KEYS.modelReady);
        toast({ description: strings.settings.removedNote });
        await refresh();
      } finally {
        setRemoving(null);
      }
    },
    [engine, refresh],
  );

  const onEraseEverything = async () => {
    await deleteModelCache();
    history.clear();
    storageRemove(STORAGE_KEYS.settings);
    storageRemove(STORAGE_KEYS.history);
    storageRemove(STORAGE_KEYS.modelReady);
    storageRemove(STORAGE_KEYS.setupCrash);
    engine.reset();
    // A reload presents the true fresh state, including the first visit hero.
    window.location.reload();
  };

  const setTheme = (theme: Settings["theme"]) => updateSettings({ theme });

  const storageFraction =
    storage && storage.quota > 0 ? Math.min(100, (storage.usage / storage.quota) * 100) : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle className="type-heading">{strings.settings.title}</SheetTitle>
          <SheetDescription className="sr-only">{strings.settings.title}</SheetDescription>
        </SheetHeader>

        <div className="scroll-surface min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {/* Appearance */}
          <section aria-labelledby="settings-appearance">
            <Label id="settings-appearance" className="type-small font-medium text-muted-foreground">
              {strings.settings.appearance}
            </Label>
            <RadioGroup
              value={settings.theme}
              onValueChange={(value) => setTheme(value as Settings["theme"])}
              className="mt-2 grid grid-cols-3 gap-2"
            >
              {(
                [
                  { value: "light", label: strings.settings.light, icon: Sun },
                  { value: "dark", label: strings.settings.dark, icon: Moon },
                  { value: "system", label: strings.settings.system, icon: Monitor },
                ] as const
              ).map((option) => (
                <Label
                  key={option.value}
                  htmlFor={`theme-${option.value}`}
                  className="flex h-11 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-border bg-surface text-center text-sm font-normal shadow-xs outline-none transition-colors data-[state=checked]:border-accent-green-text data-[state=checked]:text-foreground has-[button[data-state=checked]]:border-accent-green-text"
                >
                  <RadioGroupItem id={`theme-${option.value}`} value={option.value} className="sr-only" />
                  <option.icon aria-hidden className="size-4 text-muted-foreground" />
                  {option.label}
                </Label>
              ))}
            </RadioGroup>
          </section>

          <Separator className="my-5" />

          {/* History */}
          <section aria-labelledby="settings-history">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="keep-history" className="type-body cursor-pointer font-normal">
                {strings.settings.keepHistory}
              </Label>
              <Switch
                id="keep-history"
                checked={settings.keepHistory}
                onCheckedChange={(checked) => updateSettings({ keepHistory: checked })}
                aria-label={strings.settings.keepHistory}
              />
            </div>
            <p className="type-small mt-1 text-muted-foreground">{strings.settings.keepHistoryHint}</p>
            <div className="mt-3">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={history.entries.length === 0}
                    className="type-small text-muted-foreground"
                  >
                    <Trash2 aria-hidden className="size-4" />
                    {strings.settings.clearHistory}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="type-heading">{strings.history.clearTitle}</AlertDialogTitle>
                    <AlertDialogDescription className="type-small">{strings.history.clearBody}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{strings.history.clearCancel}</AlertDialogCancel>
                    <AlertDialogAction onClick={() => history.clear()}>{strings.history.clearConfirm}</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </section>

          <Separator className="my-5" />

          {/* On this device */}
          <section aria-labelledby="settings-device">
            <h3 id="settings-device" className="type-small font-medium text-muted-foreground">
              {strings.settings.onThisDevice}
            </h3>

            <div className="mt-3 flex items-center justify-between gap-3">
              <Label htmlFor="fast-models" className="type-body cursor-pointer font-normal">
                {strings.settings.fastModels}
              </Label>
              <Switch
                id="fast-models"
                checked={settings.useFastModels}
                onCheckedChange={(checked) => updateSettings({ useFastModels: checked })}
                aria-label={strings.settings.fastModels}
              />
            </div>
            <p className="type-small mt-1 text-muted-foreground">{strings.settings.fastModelsHint}</p>

            <div className="mt-4 flex items-center justify-between gap-3">
              <Label htmlFor="webgpu" className="type-body cursor-pointer font-normal">
                {strings.settings.webgpu}
              </Label>
              <Switch
                id="webgpu"
                checked={settings.useWebGPU}
                onCheckedChange={(checked) => updateSettings({ useWebGPU: checked })}
                aria-label={strings.settings.webgpu}
              />
            </div>
            <p className="type-small mt-1 text-muted-foreground">{strings.settings.webgpuHint}</p>

            <div className="mt-4 flex items-center justify-between gap-3">
              <Label htmlFor="hide-large-languages" className="type-body cursor-pointer font-normal">
                {strings.settings.hideLargeLanguages}
              </Label>
              <Switch
                id="hide-large-languages"
                checked={settings.hideLargeLanguages}
                onCheckedChange={(checked) => updateSettings({ hideLargeLanguages: checked })}
                aria-label={strings.settings.hideLargeLanguages}
              />
            </div>
            <p className="type-small mt-1 text-muted-foreground">{strings.settings.hideLargeLanguagesHint}</p>

            <div className="mt-5" role="group" aria-labelledby="idle-unload-label">
              <Label id="idle-unload-label" className="type-body font-normal">
                {strings.settings.idleUnload}
              </Label>
              <p className="type-small mt-1 text-muted-foreground">{strings.settings.idleUnloadHint}</p>
              <RadioGroup
                value={String(settings.idleUnloadMinutes)}
                onValueChange={(value) => {
                  const minutes = Number(value);
                  if (minutes === 5 || minutes === 15 || minutes === 0) updateSettings({ idleUnloadMinutes: minutes });
                }}
                className="mt-2 grid grid-cols-3 gap-2"
              >
                {(
                  [
                    { value: "5", label: strings.settings.idleUnload5 },
                    { value: "15", label: strings.settings.idleUnload15 },
                    { value: "0", label: strings.settings.idleUnloadNever },
                  ] as const
                ).map((option) => (
                  <Label
                    key={option.value}
                    htmlFor={`idle-unload-${option.value}`}
                    className="flex h-11 cursor-pointer items-center justify-center rounded-lg border border-border bg-surface text-center text-sm font-normal shadow-xs outline-none transition-colors data-[state=checked]:border-accent-green-text data-[state=checked]:text-foreground has-[button[data-state=checked]]:border-accent-green-text"
                  >
                    <RadioGroupItem id={`idle-unload-${option.value}`} value={option.value} className="sr-only" />
                    {option.label}
                  </Label>
                ))}
              </RadioGroup>
            </div>

            <h4 className="type-small mt-5 font-medium text-muted-foreground">{strings.settings.savedModels}</h4>
            {savedModelList.length === 0 ? (
              <p className="type-small mt-1.5 text-muted-foreground">{strings.settings.savedModelsEmpty}</p>
            ) : (
              <ul className="mt-1.5 space-y-1.5">
                {savedModelList.map((model) => (
                  <li
                    key={model.modelId}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="type-small truncate">{model.name}</p>
                      <p className="type-small text-muted-foreground tabular-nums">
                        {strings.settings.savedModelSize(mbWhole(model.bytes))}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void onRemoveModel(model)}
                      disabled={removing === model.modelId}
                      aria-label={strings.settings.removeModelAria(model.name)}
                      className="type-small h-8 shrink-0 text-muted-foreground"
                    >
                      <Trash2 aria-hidden className="size-3.5" />
                      {strings.settings.removeModel}
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            <h4 className="type-small mt-5 font-medium text-muted-foreground">{strings.settings.fullModelChoices}</h4>
            {fullModelChoices.length === 0 ? (
              <p className="type-small mt-1.5 text-muted-foreground">{strings.settings.fullModelChoicesEmpty}</p>
            ) : (
              <ul className="mt-1.5 space-y-1.5">
                {fullModelChoices.map((pairKey) => (
                  <li
                    key={pairKey}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2"
                  >
                    <p className="type-small truncate">{pairName(pairKey)}</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onRemoveChoice(pairKey)}
                      aria-label={strings.settings.removeModelAria(pairName(pairKey))}
                      className="type-small h-8 shrink-0 text-muted-foreground"
                    >
                      <Trash2 aria-hidden className="size-3.5" />
                      {strings.settings.removeModel}
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            <dl className="mt-4 space-y-2.5">
              {storage ? (
                <>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="type-body">{strings.settings.storageUsed}</dt>
                    <dd className="type-small text-muted-foreground tabular-nums">
                      {strings.settings.storageLine(formatBytes(storage.usage), formatBytes(storage.quota))}
                    </dd>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-hover">
                    <div
                      className="h-full rounded-full bg-accent-green-text"
                      style={storageFraction != null ? { width: `${storageFraction}%` } : undefined}
                    />
                  </div>
                </>
              ) : null}
              <div className="flex items-baseline justify-between gap-3">
                <dt className="type-body">{strings.settings.historyLabel}</dt>
                <dd className="type-small text-muted-foreground tabular-nums">
                  {strings.settings.historyCount(history.entries.length)}
                </dd>
              </div>
            </dl>
            <div className="mt-4">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="type-small text-danger">
                    <Trash2 aria-hidden className="size-4" />
                    {strings.settings.erase}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="type-heading">{strings.settings.eraseTitle}</AlertDialogTitle>
                    <AlertDialogDescription className="type-small">{strings.settings.eraseBody}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{strings.settings.eraseCancel}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => void onEraseEverything()}
                      className="bg-danger text-on-danger hover:bg-danger/90"
                    >
                      {strings.settings.eraseConfirm}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </section>

          <Separator className="my-5" />

          {/* Install */}
          {install.available ? (
            <>
              <section aria-labelledby="settings-install">
                <h3 id="settings-install" className="type-small font-medium text-muted-foreground">
                  {strings.settings.installLabel}
                </h3>
                <p className="type-small mt-1 text-muted-foreground">{strings.settings.installHint}</p>
                <div className="mt-3">
                  <Button variant="outline" size="sm" onClick={() => void install.install()} className="type-small">
                    {strings.settings.install}
                  </Button>
                </div>
              </section>
              <Separator className="my-5" />
            </>
          ) : null}

          {/* How it works, on the page */}
          <section>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onOpenChange(false);
                onHowItWorks();
              }}
              className="type-small text-accent-green-text"
            >
              <Info aria-hidden className="size-4" />
              {strings.settings.howItWorks}
            </Button>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export const SettingsSheet = memo(SettingsSheetInner);
