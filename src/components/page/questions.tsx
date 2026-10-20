"use client";

/**
 * Questions. A compact set of expandable questions using real details and
 * summary elements, so they work by keyboard with no extra machinery. The
 * last section before the footer.
 */

import { memo } from "react";
import { ChevronDown } from "lucide-react";
import { copy } from "@/lib/copy";

function QuestionsInner() {
  return (
    <section id="questions" className="section-gap reveal pb-[var(--section-gap)]">
      <div className="mx-auto w-full max-w-[1120px] px-4 sm:px-6 lg:px-8">
        <h2 className="type-heading">{copy.sections.questionsHeading}</h2>

        <div className="mt-6 max-w-[46rem]">
          {copy.sections.questions.map((item) => (
            <details key={item.q} className="group border-b border-border first:border-t">
              <summary className="-mx-2 flex cursor-pointer list-none items-center justify-between gap-4 rounded-lg px-2 py-4 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60">
                <span className="type-body font-medium">{item.q}</span>
                <ChevronDown
                  aria-hidden
                  className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
                />
              </summary>
              <p className="type-body text-column pb-4 text-muted-foreground">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export const Questions = memo(QuestionsInner);
