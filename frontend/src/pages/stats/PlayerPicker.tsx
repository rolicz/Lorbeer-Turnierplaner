import AvatarButton from "../../ui/primitives/AvatarButton";
import { usePlayerAvatarMap } from "../../hooks/usePlayerAvatarMap";

/**
 * Consistent, scrollable avatar player picker used across the stats views.
 * Spreads avatars over the width and scrolls horizontally when there are many
 * (and opts out of the global swipe-back gesture so scrolling it never navigates).
 */
export function PlayerPicker({
  players,
  selectedId,
  onSelect,
  size = "h-10 w-10",
}: {
  players: { id: number; name: string }[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  size?: string;
}) {
  const { avatarUpdatedAtById } = usePlayerAvatarMap();
  return (
    <div className="-mx-1 overflow-x-auto px-1 no-scrollbar" data-no-swipe-nav>
      <div className="flex items-center gap-2">
        {players.map((p) => (
          <AvatarButton
            key={p.id}
            playerId={p.id}
            name={p.name}
            updatedAt={avatarUpdatedAtById.get(p.id) ?? null}
            selected={p.id === selectedId}
            onClick={() => onSelect(p.id)}
            className={size}
            noOverflowAnchor
          />
        ))}
      </div>
    </div>
  );
}
