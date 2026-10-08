"use client";

/**
 * The details view reached from the status badge once setup has finished:
 * the same facts the setup card's Details disclosure shows, in a dialog.
 * Clicking the badge is the quiet way back to this after setup.
 */

import { memo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EngineDetails } from "@/components/translate/engine-details";
import { copy } from "@/lib/copy";

function EngineDetailsDialogInner({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="type-heading">{copy.details.dialogTitle}</DialogTitle>
          <DialogDescription className="type-small">{copy.details.dialogBody}</DialogDescription>
        </DialogHeader>
        <EngineDetails />
      </DialogContent>
    </Dialog>
  );
}

export const EngineDetailsDialog = memo(EngineDetailsDialogInner);

/** Convenience wrapper that owns its own open state. */
export function EngineDetailsDialogButton({ children }: { children: (open: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {children(() => setOpen(true))}
      <EngineDetailsDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
