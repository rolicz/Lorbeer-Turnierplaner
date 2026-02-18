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

  const icon = direction === "up" ? "fa-thumbs-up" : "fa-thumbs-down";

  return (
    <Button
      variant="ghost"
      type="button"
      onClick={handleClick}
      title={title}
      className={className}
    >
      <i className={"fa-solid " + icon + " " + (active ? "text-accent" : "")} aria-hidden="true" />
      <span className="tabular-nums">{count}</span>
    </Button>
  );
}
