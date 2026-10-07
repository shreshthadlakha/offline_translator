"use client";

import { memo } from "react";
import { ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { copy } from "@/lib/copy";

function SwapButtonInner({ onClick }: { onClick: () => void; stacked?: boolean }) {
  return (
    <Button
      variant="outline"
      size="icon"
      aria-label={copy.translate.swap}
      onClick={onClick}
      className="shrink-0"
    >
      {/* The panes stack vertically on small screens, so the swap arrow turns with them. */}
      <ArrowLeftRight aria-hidden className="rotate-90 md:rotate-0" />
    </Button>
  );
}

export const SwapButton = memo(SwapButtonInner);
