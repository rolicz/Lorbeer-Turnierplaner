import { cupColorVarForKey } from "../../cupColors";
import { cn } from "../cn";

type CupOwnerBadgeProps = {
  cupKey: string;
  cupName: string;
  size?: "sm" | "md";
  title?: string;
  className?: string;
};

export default function CupOwnerBadge({
  cupKey,
  cupName,
  size = "sm",
  title,
  className,
}: CupOwnerBadgeProps) {
  const varName = cupColorVarForKey(cupKey);
  const sizeCls =
    size === "md"
      ? "h-7 w-7 text-[13px]"
      : "h-6 w-6 text-[11px]";

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full border shadow-sm shrink-0",
        sizeCls,
        className
      )}
      style={{
        borderColor: `rgb(var(${varName}) / 0.55)`,
        backgroundColor: `rgb(var(${varName}) / 0.14)`,
        color: `rgb(var(${varName}))`,
      }}
      title={title ?? `${cupName} owner`}
    >
      <i className="fa-solid fa-crown" aria-hidden="true" />
    </span>
  );
}
