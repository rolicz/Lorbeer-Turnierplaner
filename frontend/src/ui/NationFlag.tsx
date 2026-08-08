import { cn } from "./cn";

/**
 * Country flag for a league's nation, rendered from the bundled `flag-icons`
 * CSS (imported once in `main.tsx`) — no network request, crisp on every OS.
 *
 * Decorative only: the league name always sits next to it, so the flag is
 * `aria-hidden`.
 */
export type NationFlagSize = "sm" | "md";

// Outer box matches ClubBadge's footprint exactly (16px / 22px square), so a
// flag and a crest/monogram stacked in adjacent rows start their text at the
// same offset. The `.fi` span inside is 1.333em x 1em (4:3), driven by the
// inherited font size, and sits centered in the box.
const BOX_CLASS: Record<NationFlagSize, string> = {
  sm: "h-4 w-4 text-[10.5px]", // flag ~14 x 10.5px
  md: "h-[22px] w-[22px] text-[13.5px]", // flag ~18 x 13.5px
};

export default function NationFlag({
  nation,
  size = "sm",
  className,
}: {
  nation?: string | null;
  size?: NationFlagSize;
  className?: string;
}) {
  const code = typeof nation === "string" ? nation.trim().toLowerCase() : "";
  if (!code) return null;

  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center", BOX_CLASS[size], className)}
      aria-hidden="true"
    >
      <span className={cn("fi", `fi-${code}`, "rounded-[2px]")} />
    </span>
  );
}
