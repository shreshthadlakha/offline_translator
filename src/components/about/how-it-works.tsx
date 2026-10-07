"use client";

/**
 * A short plain language explanation of how privacy works here: what runs
 * where, what gets downloaded and from where, what is stored on the device,
 * and what the app never does. Plus an honest note on quality.
 */

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { copy } from "@/lib/copy";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const SECTIONS = [
  { title: copy.howItWorks.runsTitle, body: copy.howItWorks.runsBody },
  { title: copy.howItWorks.downloadedTitle, body: copy.howItWorks.downloadedBody },
  { title: copy.howItWorks.storedTitle, body: copy.howItWorks.storedBody },
  { title: copy.howItWorks.neverTitle, body: copy.howItWorks.neverBody },
  { title: copy.howItWorks.qualityTitle, body: copy.howItWorks.qualityBody },
];

export function HowItWorksDialog({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="type-heading">{copy.howItWorks.title}</DialogTitle>
          <DialogDescription className="sr-only">{copy.howItWorks.title}</DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] pr-3">
          <div className="space-y-5">
            {SECTIONS.map((section) => (
              <section key={section.title}>
                <h3 className="type-small font-medium text-muted-foreground">{section.title}</h3>
                <p className="type-body mt-1">{section.body}</p>
              </section>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
