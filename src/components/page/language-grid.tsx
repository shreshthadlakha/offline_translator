"use client";

/**
 * Every language, in its own script. A grid of the whole registry, each cell
 * showing the native name large and the English name small, in alphabetical
 * order by English name. The native name carries its own lang and dir, so
 * scripts render correctly, right to left ones included, while the English
 * name and the note under it stay left to right. Under the names sits a quiet
 * note about what translating into this language needs on this device: a
 * small model, a small group model, or the large one. It reflects the pair
 * the cell would create with the current source language, so it updates
 * whenever the source changes. Clicking a cell sets it as the target language
 * (swapping if it matches the source), scrolls smoothly up to the tool, and
 * focuses the input.
 */

import { memo, useCallback } from "react";
import { usePairState } from "@/components/translate/translator-provider";
import { useSettings } from "@/hooks/use-settings";
import { SORTED_LANGUAGES } from "@/lib/languages";
import { engineForPair, hasFullModelOverride, pairCost, resultingPair } from "@/lib/engines";
import { mbWhole } from "@/lib/format";
import { copy } from "@/lib/copy";

function LanguageGridInner() {
  const { chooseTarget, srcCode, tgtCode } = usePairState();
  const { settings } = useSettings();

  // The cost note for each cell, for the pair choosing this language would
  // create (including the swap when it is already the source).
  const noteFor = useCallback(
    (code: string) => {
      const pair = resultingPair("target", code, srcCode, tgtCode);
      const fastOn = settings.useFastModels && !hasFullModelOverride(settings.fullModelFor, pair.src, pair.tgt);
      const cost = pairCost(pair.src, pair.tgt, fastOn);
      if (cost.kind === "large") {
        // No small model for this pair: the honest experimental wording. The
        // grid still shows every script (that is its purpose); picking one
        // with the switch off leads to the plain notice, never to a load.
        if (fastOn && engineForPair(pair.src, pair.tgt, true).kind === "nllb") return copy.translate.costExperimental;
        return copy.translate.costLarge;
      }
      const t = copy.translate;
      if (cost.kind === "group") {
        if (cost.tier === "good") return t.costGroupApproximate(mbWhole(cost.expectedBytes));
        if (cost.tier === "limited") return t.costGroupLimited(mbWhole(cost.expectedBytes));
        return t.costGroup(mbWhole(cost.expectedBytes));
      }
      if (cost.tier === "good") return t.costFastApproximate(mbWhole(cost.expectedBytes));
      if (cost.tier === "limited") return t.costFastLimited(mbWhole(cost.expectedBytes));
      return t.costFast(mbWhole(cost.expectedBytes));
    },
    [srcCode, tgtCode, settings.useFastModels, settings.fullModelFor],
  );

  const onPick = useCallback(
    (code: string) => {
      chooseTarget(code);
      // Scroll smoothly up to the tool, then focus the input.
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      document.getElementById("tool")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
      document.getElementById("source-input")?.focus({ preventScroll: true });
    },
    [chooseTarget],
  );

  return (
    <section id="languages" className="section-gap reveal">
      <div className="mx-auto w-full max-w-[1120px] px-4 sm:px-6 lg:px-8">
        <h2 className="type-heading">{copy.sections.languagesHeading}</h2>
        <p className="type-lead text-column mt-3 text-muted-foreground">{copy.sections.languagesLead}</p>

        <ul className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {SORTED_LANGUAGES.map((language) => (
            <li key={language.code}>
              <button
                type="button"
                onClick={() => onPick(language.code)}
                className="flex min-h-14 w-full flex-col items-start gap-0.5 rounded-[var(--radius-control)] border border-border px-3.5 py-3 text-start transition-colors outline-none hover:bg-surface hover:shadow-[var(--shadow-card)] focus-visible:ring-[3px] focus-visible:ring-ring/60"
              >
                <span lang={language.bcp47} dir={language.dir} className="native-text type-body font-medium">
                  {language.native}
                </span>
                <span className="type-small text-muted-foreground">{language.english}</span>
                <span className="type-small text-muted-foreground">{noteFor(language.code)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export const LanguageGrid = memo(LanguageGridInner);
