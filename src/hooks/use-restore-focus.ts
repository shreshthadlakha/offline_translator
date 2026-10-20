"use client";

/**
 * Focus restoration for overlays opened from controlled state (no Radix
 * trigger wiring): Radix returns focus to a trigger ref that does not exist
 * in that pattern, so focus lands on <body> and keyboard users are dropped
 * out of the page. This hook records the focused element when the overlay
 * opens and returns an onCloseAutoFocus handler that puts it back.
 */

import { useEffect, useRef } from "react";

export function useRestoreFocus(open: boolean) {
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    // Captured at open time: the button that was used to open the overlay,
    // or whatever held focus before it opened.
    if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
      openerRef.current = document.activeElement;
    }
  }, [open]);

  const onCloseAutoFocus = (event: { preventDefault: () => void; defaultPrevented: boolean }) => {
    // Radix's default action focuses the (missing) trigger, i.e. <body>.
    event.preventDefault();
    openerRef.current?.focus();
    openerRef.current = null;
  };

  return { onCloseAutoFocus };
}
