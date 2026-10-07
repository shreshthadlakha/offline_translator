"use client";

/**
 * The share control. Builds a link that carries the text and language pair in
 * the URL fragment, which browsers never send to a server. No server stores
 * anything. Says plainly that anyone with the link can read what's in it.
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

function ShareActionInner() {
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

  const copyManual = useCallback(async () => {
    if (!manualUrl) return;
    try {
      await navigator.clipboard.writeText(manualUrl);
      toast({ description: copy.translate.copied });
      setManualUrl(null);
    } catch {
      // The link stays visible for manual copy.
    }
  }, [manualUrl]);

  return (
    <>
      <Button variant="ghost" size="sm" aria-label={copy.share.aria} onClick={() => void onShare()} className="type-small">
        <Link2 aria-hidden className="size-4" />
        <span className="hidden lg:inline">{copy.nav.share}</span>
      </Button>

      <Dialog open={manualUrl !== null} onOpenChange={(open) => !open && setManualUrl(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="type-heading">{copy.share.manualLabel}</DialogTitle>
            <DialogDescription className="type-small text-muted-foreground">{copy.share.clipboardBlocked}</DialogDescription>
          </DialogHeader>
          <Input readOnly value={manualUrl ?? ""} aria-label={copy.share.manualLabel} onFocus={(e) => e.target.select()} />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setManualUrl(null)}>
              {copy.nav.close}
            </Button>
            <Button size="sm" onClick={() => void copyManual()}>
              {copy.share.copyLink}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export const ShareAction = memo(ShareActionInner);
