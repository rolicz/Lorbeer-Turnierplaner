import { useQuery } from "@tanstack/react-query";
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
      className="max-h-[84vh] overflow-hidden"
    >
      <div className="max-h-[calc(84vh-6rem)] overflow-y-auto pr-1 space-y-3">
        {votersQ.isLoading ? <InlineLoading label="Loading…" /> : null}
        {!votersQ.isLoading && !upvoters.length && !downvoters.length ? (
          <CardSection className="text-sm text-text-muted">No votes yet.</CardSection>
        ) : null}

        {upvoters.length ? (
          <CardSection>
            <div className="inline-flex items-center gap-2 text-[12px] text-text-muted">
              <i className="fa-solid fa-thumbs-up text-status-text-green" aria-hidden="true" />
              <span>Upvotes</span>
              <span className="tabular-nums text-text-normal">{upvoters.length}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {upvoters.map((row) => (
                <span key={row.id} className="card-chip px-2 py-1 text-[12px]">
                  {row.display_name}
                </span>
              ))}
            </div>
          </CardSection>
        ) : null}

        {downvoters.length ? (
          <CardSection>
            <div className="inline-flex items-center gap-2 text-[12px] text-text-muted">
              <i className="fa-solid fa-thumbs-down text-red-300" aria-hidden="true" />
              <span>Downvotes</span>
              <span className="tabular-nums text-text-normal">{downvoters.length}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {downvoters.map((row) => (
                <span key={row.id} className="card-chip px-2 py-1 text-[12px]">
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
