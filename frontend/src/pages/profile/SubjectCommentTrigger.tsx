import { MessageSquare } from "lucide-react";

import Button from "../../ui/primitives/Button";
import { cn } from "../../ui/cn";
import type { GuestbookSubjectKind } from "../../api/types";
import { subjectTriggerLabel, subjectTriggerTitle } from "./guestbookSubjects";

/**
 * The one "start a comment about this" control on a profile item (K3) — the banner, the
 * avatar and the About text all wear this and nothing else, so the three cannot drift into
 * three affordances for one job.
 *
 * It does not host a thread: it arms the guestbook's own composer with the subject
 * (`ProfilePage::onCommentOn`), because an entry must appear exactly once on this page and
 * the guestbook is where it lives. The look and the `MessageSquare` + `fmtCount` label are
 * the Ideas board's comment toggle verbatim (`pages/ideas/IdeaComments.tsx`), which is the
 * app's existing "comment on this" affordance.
 *
 * Three variants, one behaviour:
 * - `ghost` — the section-head's action slot (the About text).
 * - `solid` — inside `ImageLightbox`, where a ghost button sits on a black scrim in every
 *   theme and the light theme's ghost paints dark text on it.
 * - `overlay` — the small count badge in the banner's own corner (Roli 2026-09-19, which
 *   overruled the plan's "lightbox only"). It is a **count**, so it says nothing at zero and
 *   is absolutely positioned by its caller: it may never take part in the header's layout.
 */
export default function SubjectCommentTrigger({
  kind,
  count,
  canPost,
  onOpen,
  variant = "ghost",
  className,
}: {
  kind: GuestbookSubjectKind;
  count: number;
  canPost: boolean;
  onOpen: (kind: GuestbookSubjectKind) => void;
  variant?: "ghost" | "solid" | "overlay";
  className?: string;
}) {
  // A control that does nothing is never shown (P4): a reader with nothing to read gets
  // none. The overlay badge goes further — it carries a number and no word, so it has
  // nothing to say until there is a count, whoever is looking.
  if (!canPost && count === 0) return null;
  if (variant === "overlay" && count === 0) return null;

  const title = subjectTriggerTitle(kind, count);

  if (variant === "overlay") {
    return (
      <button
        type="button"
        onClick={() => onOpen(kind)}
        title={title}
        aria-label={title}
        data-subject-trigger={kind}
        data-subject-trigger-variant="overlay"
        /* A badge on a photograph, not on a theme surface: the scrim is black in every
           theme, exactly as `ImageLightbox` and `.overlay-scrim` already are. */
        className={cn(
          "inline-flex h-7 items-center gap-1.5 rounded-full bg-black/60 px-2 text-xs font-medium text-white backdrop-blur-[2px] transition active:scale-95 focus-ring",
          className,
        )}
      >
        <MessageSquare size={12} aria-hidden="true" />
        <span className="tabular-nums">{count}</span>
      </button>
    );
  }

  return (
    <Button
      type="button"
      variant={variant}
      onClick={() => onOpen(kind)}
      title={title}
      aria-label={title}
      data-subject-trigger={kind}
      data-subject-trigger-variant={variant}
      className={cn("inline-flex h-8 items-center gap-1.5 px-2 text-xs", className)}
    >
      <MessageSquare size={14} aria-hidden="true" />
      {subjectTriggerLabel(count)}
    </Button>
  );
}
