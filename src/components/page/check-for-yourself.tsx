"use client";

/**
 * Check for yourself. A deep navy band (the surface colour with a hairline
 * border in dark mode) holding a live panel built from real data: every
 * request this page has made since it opened, grouped as this app's own
 * files, translation model files, and anything else. Two counters sit above
 * the list: translations this visit, and requests made while translating.
 * After setup, the second one stays at zero however many translations are
 * done. Nothing unexpected is ever hidden.
 */

import { memo, useSyncExternalStore } from "react";
import { ChevronDown } from "lucide-react";
import { useEngineContext } from "@/hooks/use-engine";
import {
  getNetLogSnapshot,
  getServerNetLogSnapshot,
  subscribeNetLog,
  type NetGroup,
  type NetLogSnapshot,
} from "@/lib/netlog";
import { formatBytes } from "@/lib/format";
import { copy } from "@/lib/copy";

function useNetLog(): NetLogSnapshot {
  return useSyncExternalStore(subscribeNetLog, getNetLogSnapshot, getServerNetLogSnapshot);
}

function GroupRow({ name, group, emptyNote }: { name: string; group: NetGroup; emptyNote?: string }) {
  const right =
    group.count > 0
      ? `${copy.sections.checkRequests(group.count)} · ${formatBytes(group.bytes)}`
      : (emptyNote ?? copy.sections.checkRequests(0));

  // A group with nothing in it is a plain row. Anything else can be opened to
  // see every request it holds.
  if (group.entries.length === 0) {
    return (
      <div className="band-line flex items-center justify-between gap-4 border-t py-3.5">
        <span className="type-body font-medium">{name}</span>
        <span className="band-muted type-small shrink-0 text-end tabular-nums">{right}</span>
      </div>
    );
  }

  return (
    <details className="band-line group border-t">
      <summary className="-mx-2 flex cursor-pointer list-none items-center justify-between gap-4 rounded-lg px-2 py-3.5 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60">
        <span className="type-body font-medium">{name}</span>
        <span className="band-muted type-small flex shrink-0 items-center gap-1.5 text-end tabular-nums">
          {right}
          <ChevronDown aria-hidden className="size-3.5 transition-transform duration-200 group-open:rotate-180" />
        </span>
      </summary>
      <ul className="scroll-surface band-muted type-small max-h-64 space-y-1 overflow-y-auto pb-4">
        {group.entries.map((entry, index) => (
          <li key={`${entry.path}-${index}`} className="flex items-baseline justify-between gap-4">
            <span className="min-w-0 truncate" dir="ltr">
              {entry.path}
            </span>
            <span className="shrink-0 tabular-nums">
              {entry.size > 0 ? formatBytes(entry.size) : copy.sections.checkSizeUnknown}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function CheckForYourselfInner() {
  const net = useNetLog();
  const engine = useEngineContext();
  const ready = engine.status === "ready";
  const s = copy.sections;

  return (
    <section id="check-for-yourself" className="band section-gap reveal">
      <div className="mx-auto w-full max-w-[1120px] px-4 py-10 sm:px-6 md:py-14 lg:px-8">
        <h2 className="type-heading">{s.checkHeading}</h2>
        <p className="band-muted type-body text-column mt-3">{s.checkLead}</p>

        <div className="mt-8 grid gap-6 sm:grid-cols-2 sm:gap-10">
          <div>
            <p className="type-figure">{net.translations}</p>
            <p className="band-muted type-small mt-1">{s.checkTranslations}</p>
          </div>
          <div>
            <p className="type-figure">{net.whileTranslating}</p>
            <p className="band-muted type-small mt-1">{s.checkWhileTranslating}</p>
          </div>
        </div>

        <div className="mt-8">
          <GroupRow name={s.checkOwnFiles} group={net.own} />
          <GroupRow name={s.checkModelFiles} group={net.model} />
          <GroupRow name={s.checkOther} group={net.other} emptyNote={s.checkOtherEmpty} />
        </div>

        <p className="band-muted type-small text-column mt-7">{s.checkDevtools}</p>
        {ready ? <p className="band-muted type-small text-column mt-2">{s.checkOffline}</p> : null}
      </div>
    </section>
  );
}

export const CheckForYourself = memo(CheckForYourselfInner);
