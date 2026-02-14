import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { listPlayerAvatarMeta } from "../api/playerAvatars.api";

export function usePlayerAvatarMap({
  staleTime = 30_000,
  enabled = true,
  refetchOnReconnect = false,
  refetchOnWindowFocus = false,
}: {
  staleTime?: number;
  enabled?: boolean;
  refetchOnReconnect?: boolean;
  refetchOnWindowFocus?: boolean;
} = {}) {
  const avatarMetaQ = useQuery({
    queryKey: ["players", "avatars"],
    queryFn: listPlayerAvatarMeta,
    enabled,
    staleTime,
    refetchOnReconnect,
    refetchOnWindowFocus,
  });

  const avatarUpdatedAtById = useMemo(() => {
    const m = new Map<number, string>();
    for (const row of avatarMetaQ.data ?? []) m.set(row.player_id, row.updated_at);
    return m;
  }, [avatarMetaQ.data]);

  return { avatarMetaQ, avatarUpdatedAtById };
}
