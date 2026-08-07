import { cn } from "./cn";

/**
 * Country flag for a league's nation, rendered from the bundled `flag-icons`
 * CSS (imported once in `main.tsx`) — no network request, crisp on every OS.
 *
 * Decorative only: the league name always sits next to it, so the flag is
 * `aria-hidden`.
 */
export type NationFlagSize = "sm" | "md";

// `.fi` is 1.333em wide / 1em tall, so the font size drives the whole footprint
// and keeps the 4:3 aspect ratio intact.
const SIZE_CLASS: Record<NationFlagSize, string> = {
  sm: "text-[10.5px]", // ~14px wide
  md: "text-[13.5px]", // ~18px wide
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
      className={cn("fi", `fi-${code}`, SIZE_CLASS[size], "shrink-0 rounded-[2px]", className)}
      aria-hidden="true"
    />
  );
}
