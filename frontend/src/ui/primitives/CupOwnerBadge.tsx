import { Crown } from "lucide-react";

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
  const sizeCls = size === "md" ? "h-7 w-7" : "h-6 w-6";
  const iconSize = size === "md" ? 14 : 12;

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
      <Crown size={iconSize} strokeWidth={2.25} aria-hidden="true" />
    </span>
  );
}
