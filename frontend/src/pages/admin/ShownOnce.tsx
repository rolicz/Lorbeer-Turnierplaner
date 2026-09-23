import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

import { copyText } from "../../utils/clipboard";
import Button from "../../ui/primitives/Button";
import { cn } from "../../ui/cn";

type CopyAction = { label: string; text: string };

/**
 * A secret the server hands out exactly once — an invite code, a reset link (L6). Shown in
 * `font-mono` inside an `inset`, with Copy buttons and the line that says it will not be
 * shown again; no list ever repeats it. When the clipboard is blocked the text is selected
 * so a long-press copies it by hand.
 */
export default function ShownOnce({
  value,
  valueClassName,
  copies,
  note,
  testId,
}: {
  value: string;
  /** Size and spacing of the secret itself (a code is big, a URL breaks anywhere). */
  valueClassName?: string;
  copies: CopyAction[];
  /** The muted line under it — how long it lasts. */
  note?: React.ReactNode;
  testId?: string;
}) {
  const textRef = useRef<HTMLDivElement | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(null), 2000);
    return () => window.clearTimeout(t);
  }, [copied]);

  async function onCopy(action: CopyAction) {
    const ok = await copyText(action.text);
    if (ok) {
      setBlocked(false);
      setCopied(action.label);
      return;
    }
    setBlocked(true);
    const el = textRef.current;
    const sel = window.getSelection?.();
    if (el && sel) {
      const range = document.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  return (
    <div className="inset space-y-3 p-3" data-shown-once={testId}>
      <div ref={textRef} className={cn("select-all font-mono text-text-normal", valueClassName)}>
        {value}
      </div>
      <div className="flex flex-wrap gap-2">
        {copies.map((c) => (
          <Button key={c.label} type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => void onCopy(c)}>
            {copied === c.label ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
            <span>{copied === c.label ? "Copied" : c.label}</span>
          </Button>
        ))}
      </div>
      {blocked ? (
        <p className="text-xs text-text-muted">This browser blocked the clipboard. Select the text and copy it.</p>
      ) : null}
      <p className="text-xs text-text-muted">
        {note}
        {note ? " " : null}It will not be shown again.
      </p>
    </div>
  );
}
