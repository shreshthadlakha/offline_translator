"use client";

/**
 * What to expect. Plain and honest, four short items: the size of the first
 * download, how older devices cope, where the quality lands, and what Listen
 * depends on.
 */

import { memo } from "react";
import { copy } from "@/lib/copy";

function WhatToExpectInner() {
  return (
    <section id="what-to-expect" className="section-gap reveal">
      <div className="mx-auto w-full max-w-[1120px] px-4 sm:px-6 lg:px-8">
        <h2 className="type-heading">{copy.sections.expectHeading}</h2>
        <ul className="text-column mt-4">
          {copy.sections.expectItems.map((item) => (
            <li key={item} className="type-body border-b border-border py-4 last:border-b-0">
              {item}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export const WhatToExpect = memo(WhatToExpectInner);
