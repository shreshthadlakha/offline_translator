"use client";

/**
 * The share control. Builds a link that carries the text and language pair in
 * the URL fragment, which browsers never send to a server. No server stores
 * anything. Says plainly that anyone with the link can read what's in it.
 *
 * The share logic lives in a hook so both places that trigger it (the header
 * button and the mobile overflow menu item) call it directly, without
 * nesting buttons inside buttons.
 */

import { memo, useCallback, useState } from "react";
import { Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useTranslatorState } from "@/components/translate/translator-provider";
import { toast } from "@/hooks/use-toast";
import { encodeShare } from "@/lib/share";
import { copy } from "@/lib/copy";

/** The share action: build the fragment link and put it on the clipboard,
 *  with a manual-copy fallback when the clipboard is blocked. */
export function useShareAction() {
  const { input, output, srcCode, tgtCode } = useTranslatorState();
  const [manualUrl, setManualUrl] = useState<string | null>(null);

  const onShare = useCallback(async () => {
    const text = output.hasAnyOutput ? output.plainText : input;
    if (text.trim().length === 0 || !output.hasAnyOutput) {
      toast({ description: copy.share.nothingToShare });
      return;
    }
    const result = await encodeShare({ s: text, src: srcCode, tgt: tgtCode });
    if (!result.ok) {
      toast({ description: copy.share.tooLong });
      return;
    }
    try {
      await navigator.clipboard.writeText(result.url);
      toast({ description: copy.share.linkCopied });
    } catch {
      setManualUrl(result.url);
    }
  }, [input, output, srcCode, tgtCode]);

  return { onShare, manualUrl, setManualUrl };
}

/** The clipboard-blocked fallback dialog, shared by every share entry point. */
export function ShareFallbackDialog({
  manualUrl,
  onClose,
}: {
  manualUrl: string | null;
  onClose: () => void;
}) {
  const copyManual = useCallback(async () => {
    if (!manualUrl) return;
    try {
      await navigator.clipboard.writeText(manualUrl);
      toast({ description: copy.translate.copied });
      onClose();
    } catch {
      // The link stays visible for manual copy.
    }
  }, [manualUrl, onClose]);

  return (
    <Dialog open={manualUrl !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="type-heading">{copy.share.manualLabel}</DialogTitle>
          <DialogDescription className="type-small text-muted-foreground">{copy.share.clipboardBlocked}</DialogDescription>
        </DialogHeader>
        <Input readOnly value={manualUrl ?? ""} aria-label={copy.share.manualLabel} onFocus={(e) => e.target.select()} />
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onClose}>
            {copy.nav.close}
          </Button>
          <Button size="sm" onClick={() => void copyManual()}>
            {copy.share.copyLink}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ShareActionInner() {
  const { onShare, manualUrl, setManualUrl } = useShareAction();

  return (
    <>
      <Button variant="ghost" size="sm" aria-label={copy.share.aria} onClick={() => void onShare()} className="type-small">
        <Link2 aria-hidden className="size-4" />
        <span className="hidden lg:inline">{copy.nav.share}</span>
      </Button>

      <ShareFallbackDialog manualUrl={manualUrl} onClose={() => setManualUrl(null)} />
    </>
  );
}

export const ShareAction = memo(ShareActionInner);
