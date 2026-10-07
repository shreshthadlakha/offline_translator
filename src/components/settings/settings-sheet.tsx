"use client";

/**
 * Settings: appearance (light, dark, follow the device), keep history with a
 * clear action, removing the downloaded model, installing the app, and a link
 * to the How it works explanation.
 */

import { memo } from "react";
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
import { deleteModelCache } from "@/hooks/use-engine";
import { useInstallPrompt } from "@/hooks/use-install-prompt";
import { toast } from "@/hooks/use-toast";
import { copy as strings } from "@/lib/copy";
import type { Settings } from "@/hooks/use-settings";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenHowItWorks: () => void;
};

function SettingsSheetInner({ open, onOpenChange, onOpenHowItWorks }: Props) {
  const { settings, updateSettings, engine, history } = useTranslatorState();
  const install = useInstallPrompt();
  const modelReady = engine.modelPresent;

  const onRemoveModel = async () => {
    await deleteModelCache();
    engine.reset();
    toast({ description: strings.settings.removed });
  };

  const setTheme = (theme: Settings["theme"]) => updateSettings({ theme });

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

          {/* Model */}
          <section aria-labelledby="settings-model">
            <h3 id="settings-model" className="type-small font-medium text-muted-foreground">
              {strings.settings.model}
            </h3>
            <p className="type-body mt-2">{strings.settings.removeModelNote}</p>
            <div className="mt-3">
              {modelReady ? (
                <Button variant="outline" size="sm" onClick={() => void onRemoveModel()} className="type-small">
                  <Trash2 aria-hidden className="size-4" />
                  {strings.settings.removeModel}
                </Button>
              ) : (
                <p className="type-small text-muted-foreground">{strings.settings.nothingToRemove}</p>
              )}
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

          {/* How it works */}
          <section>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onOpenChange(false);
                onOpenHowItWorks();
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
