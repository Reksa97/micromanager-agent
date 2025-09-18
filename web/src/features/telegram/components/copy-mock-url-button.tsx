"use client";

import { useCallback, useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

interface CopyMockUrlButtonProps {
  url: string;
}

export function CopyMockUrlButton({ url }: CopyMockUrlButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Telegram mock URL copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy Telegram mock URL", error);
      toast.error("Unable to copy mock URL");
    }
  }, [url]);

  return (
    <Button type="button" variant="outline" size="sm" onClick={handleCopy} className="gap-2">
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {copied ? "Copied" : "Copy Telegram Mock URL"}
    </Button>
  );
}
