"use client";

/**
 * The footer. The privacy line and a "How it works" link that scrolls up to
 * the "Where your words go" section. Sticks to the bottom of the viewport and
 * is pushed down naturally when the content is taller.
 */

import { memo } from "react";
import { Lock } from "lucide-react";
import { copy } from "@/lib/copy";

function AppFooterInner({ onHowItWorks }: { onHowItWorks: () => void }) {
  return (
    <footer className="mt-auto border-t bg-background">
      <div className="mx-auto flex w-full max-w-[1120px] flex-wrap items-center justify-between gap-2 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 lg:px-8">
        <p className="type-small inline-flex items-center gap-1.5 text-muted-foreground">
          <Lock aria-hidden className="size-3.5" />
          {copy.app.privacyLine}
        </p>
        <button
          type="button"
          onClick={onHowItWorks}
          className="type-small rounded-lg px-2 py-1 text-accent-green-text outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/60"
        >
          {copy.nav.howItWorks}
        </button>
      </div>
    </footer>
  );
}

export const AppFooter = memo(AppFooterInner);
