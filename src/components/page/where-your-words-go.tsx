"use client";

/**
 * Where your words go. A short section with a heading, two sentences, and one
 * simple inline diagram drawn with the design tokens. Two rows: the usual
 * route through a company's servers and back, and this app's route, a small
 * loop on the person's own device. The footer's How it works link scrolls
 * here.
 */

import { memo } from "react";
import { copy } from "@/lib/copy";

/** One box in the diagram. Plain words, drawn with the tokens. */
function DiagramBox({ children }: { children: React.ReactNode }) {
  return (
    <span className="diagram-label inline-flex items-center rounded-[var(--radius-control)] border border-border bg-surface px-3 py-2 text-foreground">
      {children}
    </span>
  );
}

function ArrowRight() {
  return (
    <svg viewBox="0 0 48 12" aria-hidden="true" fill="none" className="h-3 w-10 shrink-0 text-muted-foreground sm:w-12">
      <line x1="1" y1="6" x2="39" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M39 1.5 46 6 39 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowLeft() {
  return (
    <svg viewBox="0 0 48 12" aria-hidden="true" fill="none" className="h-3 w-10 shrink-0 text-muted-foreground sm:w-12">
      <line x1="47" y1="6" x2="9" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M9 1.5 2 6 9 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** You, then your device, in a small loop: out and straight back. */
function LoopConnector() {
  return (
    <svg viewBox="0 0 64 44" aria-hidden="true" fill="none" className="h-11 w-16 shrink-0 text-muted-foreground">
      <line x1="1" y1="8" x2="53" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M53 3.5 61 8 53 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M58 16 C 58 36, 6 36, 6 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M1.5 20.5 6 14.5 10.5 20.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function WhereYourWordsGoInner() {
  const d = copy.sections.diagram;
  return (
    <section id="where-your-words-go" className="section-gap reveal">
      <div className="mx-auto w-full max-w-[1120px] px-4 sm:px-6 lg:px-8">
        <h2 className="type-heading">{copy.sections.whereHeading}</h2>
        <p className="type-lead text-column mt-4 text-muted-foreground">{copy.sections.whereBody}</p>

        <div className="mt-10 space-y-8 sm:mt-12 sm:space-y-10">
          <figure role="img" aria-label={d.mostTranslatorsAlt}>
            <figcaption className="type-small font-medium text-muted-foreground">{d.mostTranslators}</figcaption>
            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-3 sm:gap-x-3">
              <DiagramBox>{d.you}</DiagramBox>
              <ArrowRight />
              <DiagramBox>{d.servers}</DiagramBox>
              <ArrowLeft />
              <DiagramBox>{d.you}</DiagramBox>
            </div>
          </figure>

          <figure role="img" aria-label={d.thisOneAlt}>
            <figcaption className="type-small font-medium text-muted-foreground">{d.thisOne}</figcaption>
            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-3 sm:gap-x-3">
              <DiagramBox>{d.you}</DiagramBox>
              <LoopConnector />
              <DiagramBox>{d.device}</DiagramBox>
            </div>
          </figure>
        </div>
      </div>
    </section>
  );
}

export const WhereYourWordsGo = memo(WhereYourWordsGoInner);
