"use client";

/**
 * Quiet footer. The privacy line and a link to the plain language explanation.
 * Sticks to the bottom of the viewport and is pushed down naturally when the
 * content is taller.
 */

import { memo } from "react";
import { Lock } from "lucide-react";
import { copy } from "@/lib/copy";

function AppFooterInner({ onOpenHowItWorks }: { onOpenHowItWorks: () => void }) {
  return (
    <footer className="mt-auto border-t bg-background">
      <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-2 px-4 py-4 sm:px-6">
        <p className="type-small inline-flex items-center gap-1.5 text-muted-foreground">
          <Lock aria-hidden className="size-3.5" />
          {copy.app.privacyLine}
        </p>
        <button
          type="button"
          onClick={onOpenHowItWorks}
          className="type-small rounded-lg px-2 py-1 text-accent-green-text outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {copy.nav.howItWorks}
        </button>
      </div>
    </footer>
  );
}

export const AppFooter = memo(AppFooterInner);
