import { useQuery } from "@tanstack/react-query";
import { ThumbsDown, ThumbsUp } from "lucide-react";

import type { VoteVotersResponse } from "../../api/types";
import CardSection from "./CardSection";
import InlineLoading from "./InlineLoading";
import Modal from "./Modal";

export default function VoteVotersModal({
  open,
  title = "Votes",
  queryKey,
  queryFn,
  onClose,
}: {
  open: boolean;
  title?: string;
  queryKey: readonly unknown[];
  queryFn: () => Promise<VoteVotersResponse>;
  onClose: () => void;
}) {
  const votersQ = useQuery({
    queryKey,
    queryFn,
    enabled: open,
    staleTime: 10_000,
  });

  const upvoters = votersQ.data?.upvoters ?? [];
  const downvoters = votersQ.data?.downvoters ?? [];

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      fullScreenOnMobile
      maxWidth="max-w-lg"
      scrollBody
      className="max-h-[84vh] overflow-hidden"
    >
      <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-3">
        {votersQ.isLoading ? <InlineLoading label="Loading…" /> : null}
        {!votersQ.isLoading && !upvoters.length && !downvoters.length ? (
          <CardSection className="text-sm text-text-muted">No votes yet.</CardSection>
        ) : null}

        {upvoters.length ? (
          <CardSection>
            <div className="inline-flex items-center gap-2 text-xs text-text-muted">
              <ThumbsUp size={14} className="text-status-text-green" aria-hidden="true" />
              <span>Upvotes</span>
              <span className="tabular-nums text-text-normal">{upvoters.length}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {upvoters.map((row) => (
                <span key={row.id} className="chip">
                  {row.display_name}
                </span>
              ))}
            </div>
          </CardSection>
        ) : null}

        {downvoters.length ? (
          <CardSection>
            <div className="inline-flex items-center gap-2 text-xs text-text-muted">
              <ThumbsDown size={14} className="text-loss" aria-hidden="true" />
              <span>Downvotes</span>
              <span className="tabular-nums text-text-normal">{downvoters.length}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {downvoters.map((row) => (
                <span key={row.id} className="chip">
                  {row.display_name}
                </span>
              ))}
            </div>
          </CardSection>
        ) : null}
      </div>
    </Modal>
  );
}
