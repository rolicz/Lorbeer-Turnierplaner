import { ThumbsDown, ThumbsUp } from "lucide-react";
import type React from "react";

import Button from "./Button";

export default function VoteButton({
  direction,
  active,
  count,
  onVote,
  voteDisabled = false,
  title,
  className = "h-8 px-2 inline-flex items-center justify-center gap-1",
}: {
  direction: "up" | "down";
  active: boolean;
  count: number;
  onVote: () => void;
  voteDisabled?: boolean;
  title?: string;
  className?: string;
}) {
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (voteDisabled) return;
    onVote();
  };

  const Icon = direction === "up" ? ThumbsUp : ThumbsDown;

  return (
    <Button
      variant="ghost"
      type="button"
      onClick={handleClick}
      title={title}
      className={className}
    >
      <Icon size={14} className={active ? "text-accent" : undefined} aria-hidden="true" />
      <span className="tabular-nums">{count}</span>
    </Button>
  );
}
