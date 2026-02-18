import { useQuery } from "@tanstack/react-query";
import type { VoteVotersResponse } from "../../api/types";
import InlineLoading from "./InlineLoading";

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

  if (!open) return null;

  const upvoters = votersQ.data?.upvoters ?? [];
  const downvoters = votersQ.data?.downvoters ?? [];

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/65" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 sm:inset-0 sm:flex sm:items-center sm:justify-center p-3 sm:p-6">
        <div className="card-outer w-full max-w-lg p-3 sm:p-4 max-h-[84vh] overflow-hidden">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-text-normal">{title}</div>
            </div>
            <button
              type="button"
              className="icon-button h-10 w-10 p-0 inline-flex items-center justify-center"
              onClick={onClose}
              aria-label="Close"
              title="Close"
            >
              <i className="fa-solid fa-xmark" aria-hidden="true" />
            </button>
          </div>

          <div className="mt-3 max-h-[calc(84vh-6rem)] overflow-y-auto pr-1 space-y-3">
            {votersQ.isLoading ? <InlineLoading label="Loading…" /> : null}
            {!votersQ.isLoading && !upvoters.length && !downvoters.length ? (
              <div className="card-inner-flat rounded-2xl text-sm text-text-muted">No votes yet.</div>
            ) : null}

            {upvoters.length ? (
              <div className="card-inner-flat rounded-2xl p-3 space-y-2">
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
              </div>
            ) : null}

            {downvoters.length ? (
              <div className="card-inner-flat rounded-2xl p-3 space-y-2">
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
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
