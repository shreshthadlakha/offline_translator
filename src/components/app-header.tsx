"use client";

/**
 * Page header. Wordmark on the left, History, Batch, Share and Settings on the
 * right, collapsing into a menu on small screens. Slim and sticky, with a
 * hairline border that appears once the page scrolls.
 */

import { memo, useEffect, useState } from "react";
import { History, Layers, Link2, MoreHorizontal, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ShareAction, ShareFallbackDialog, useShareAction } from "@/components/share/share-action";
import { copy } from "@/lib/copy";

type Props = {
  onOpenHistory: () => void;
  onOpenBatch: () => void;
  onOpenSettings: () => void;
};

function AppHeaderInner({ onOpenHistory, onOpenBatch, onOpenSettings }: Props) {
  // The mobile menu item shares directly (no button inside a button): the
  // action and its fallback dialog come from the same hook the desktop
  // button uses.
  const { onShare, manualUrl, setManualUrl } = useShareAction();
  // A hairline border appears once the page scrolls.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      data-scrolled={scrolled ? "true" : undefined}
      className="sticky top-0 z-40 border-b border-transparent bg-background transition-colors duration-200 data-[scrolled=true]:border-border"
    >
      <div className="mx-auto flex w-full max-w-[1120px] items-center justify-between gap-3 px-4 py-2.5 sm:px-6 lg:px-8">
        <div className="type-wordmark select-none">{copy.app.wordmark}</div>

        <nav aria-label={copy.app.wordmark} className="hidden items-center gap-0.5 md:flex">
          <Button variant="ghost" size="sm" aria-label={copy.nav.history} onClick={onOpenHistory} className="type-small">
            <History aria-hidden className="size-4" />
            <span className="hidden lg:inline">{copy.nav.history}</span>
          </Button>
          <Button variant="ghost" size="sm" aria-label={copy.nav.batch} onClick={onOpenBatch} className="type-small">
            <Layers aria-hidden className="size-4" />
            <span className="hidden lg:inline">{copy.nav.batch}</span>
          </Button>
          <ShareAction />
          <Button variant="ghost" size="sm" aria-label={copy.nav.settings} onClick={onOpenSettings} className="type-small">
            <Settings2 aria-hidden className="size-4" />
            <span className="hidden lg:inline">{copy.nav.settings}</span>
          </Button>
        </nav>

        <div className="md:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label={copy.nav.openMenu}>
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuLabel className="type-small">{copy.nav.menu}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onOpenHistory} className="type-small">
                <History aria-hidden className="size-4" />
                {copy.nav.history}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onOpenBatch} className="type-small">
                <Layers aria-hidden className="size-4" />
                {copy.nav.batch}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void onShare()} className="type-small">
                <Link2 aria-hidden className="size-4" />
                {copy.nav.share}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onOpenSettings} className="type-small">
                <Settings2 aria-hidden className="size-4" />
                {copy.nav.settings}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <ShareFallbackDialog manualUrl={manualUrl} onClose={() => setManualUrl(null)} />
    </header>
  );
}

export const AppHeader = memo(AppHeaderInner);
