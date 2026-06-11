import { cn } from "../cn";

export default function LoadingPlaceholder({ heightClassName, className }: {
  heightClassName?: string;
  className?: string;
}) {
  return (
    <div
      className={cn("skeleton rounded-xl", heightClassName ?? "h-12", className)}
      role="status"
      aria-label="Loading…"
    />
  );
}
