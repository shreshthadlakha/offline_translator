"use client";

/**
 * Page header. Wordmark on the left, History, Batch, Share and Settings on the
 * right, collapsing into a menu on small screens.
 */

import { memo } from "react";
import { History, Layers, MoreHorizontal, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ShareAction } from "@/components/share/share-action";
import { copy } from "@/lib/copy";

type Props = {
  onOpenHistory: () => void;
  onOpenBatch: () => void;
  onOpenSettings: () => void;
};

function AppHeaderInner({ onOpenHistory, onOpenBatch, onOpenSettings }: Props) {
  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
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
              <DropdownMenuItem asChild>
                <button type="button" className="type-small flex w-full cursor-pointer items-center gap-2 outline-none">
                  <ShareAction />
                </button>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onOpenSettings} className="type-small">
                <Settings2 aria-hidden className="size-4" />
                {copy.nav.settings}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}

export const AppHeader = memo(AppHeaderInner);
