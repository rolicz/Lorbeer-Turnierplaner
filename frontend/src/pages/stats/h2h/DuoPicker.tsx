/** Explicit 2v2 duo picker: an avatar row where tapping toggles a player into the
 *  duo (max 2, replace-oldest on a third), with a hint and a clear affordance.
 *  Compact avatars keep the leaderboard above the fold on a 375px viewport. */
import { X } from "lucide-react";

import AvatarButton from "../../../ui/primitives/AvatarButton";
import { usePlayerAvatarMap } from "../../../hooks/usePlayerAvatarMap";

export function DuoPicker({
  players,
  selectedIds,
  onToggle,
  onClear,
}: {
  players: { id: number; name: string }[];
  selectedIds: number[];
  onToggle: (id: number) => void;
  onClear: () => void;
}) {
  const { avatarUpdatedAtById } = usePlayerAvatarMap();
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <div className="-mx-1 min-w-0 flex-1 overflow-x-auto px-1 no-scrollbar" data-no-swipe-nav>
          <div className="flex items-center gap-2">
            {players.map((p) => (
              <AvatarButton
                key={p.id}
                playerId={p.id}
                name={p.name}
                updatedAt={avatarUpdatedAtById.get(p.id) ?? null}
                selected={selectedIds.includes(p.id)}
                onClick={() => onToggle(p.id)}
                className="h-9 w-9"
                noOverflowAnchor
              />
            ))}
          </div>
        </div>
        {selectedIds.length ? (
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear duo selection"
            className="shrink-0 rounded-full bg-bg-card-chip/50 p-2 text-text-muted transition hover:text-accent"
          >
            <X size={16} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {selectedIds.length < 2 ? (
        <p className="text-xs text-text-muted">Pick two players.</p>
      ) : null}
    </div>
  );
}
