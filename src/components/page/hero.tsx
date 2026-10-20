"use client";

/**
 * The hero. A large serif headline and one muted line under it, then the tool
 * card. Returning visitors get the compact hero: the inline script in the
 * document head sets data-hero="compact" before first paint, and CSS renders
 * the smaller headline with no subline. The markup never changes, so there is
 * no flash, no layout shift and no hydration mismatch.
 */

import { memo } from "react";
import { copy } from "@/lib/copy";

function HeroInner() {
  return (
    <section className="pt-6 text-center md:pt-10 lg:pt-12" aria-label={copy.app.wordmark}>
      <h1 className="type-display hero-headline">{copy.hero.headline}</h1>
      <p className="type-lead hero-subline muted-foreground mx-auto mt-4 max-w-[62ch] text-balance">
        {copy.hero.subline}
      </p>
    </section>
  );
}

export const Hero = memo(HeroInner);
