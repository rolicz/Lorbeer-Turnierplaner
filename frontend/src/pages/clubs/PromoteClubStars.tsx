/**
 * "Make this rating global" (L12) — the one control of the per-group star overlay.
 *
 * A star edit is the editing group's own rating; a site admin can make the rating this
 * group counts today the global one, which every group counts **from today on**. The
 * server decides whether there is anything to promote (`current_is_global`) and writes
 * forward-only, so no finished match anywhere changes; no confirmation, because
 * promoting again is the way back.
 *
 * Renders nothing unless the viewer is a site admin and the group's rating differs from
 * the global one. Reads the same cache entry as `ClubStarHistory`, and the promote
 * answers the new history, so the list above it updates in the same frame.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Globe } from "lucide-react";

import { getClubStarHistory, promoteClubStars } from "../../api/clubs.api";
import { qk } from "../../api/queryKeys";
import Button from "../../ui/primitives/Button";
import { ErrorToastOnError } from "../../ui/primitives/ErrorToast";

export default function PromoteClubStars({ clubId, isAdmin }: { clubId: number; isAdmin: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: qk.clubStarHistory(clubId),
    queryFn: () => getClubStarHistory(clubId),
    enabled: isAdmin,
    staleTime: 60_000,
  });
  const mut = useMutation({
    mutationFn: () => promoteClubStars(clubId),
    onSuccess: (history) => {
      qc.setQueryData(qk.clubStarHistory(clubId), history);
    },
  });

  if (!isAdmin || !q.data || q.data.current_is_global) {
    return <ErrorToastOnError error={mut.error} title="Could not make the rating global" />;
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <ErrorToastOnError error={mut.error} title="Could not make the rating global" />
      <Button
        variant="ghost"
        size="sm"
        type="button"
        onClick={() => mut.mutate()}
        disabled={mut.isPending}
        className="gap-1.5"
      >
        <Globe size={14} aria-hidden="true" />
        {mut.isPending ? "Making it global…" : "Make this rating global"}
      </Button>
      <span className="text-xs text-text-muted">Applies from today for every group.</span>
    </div>
  );
}
