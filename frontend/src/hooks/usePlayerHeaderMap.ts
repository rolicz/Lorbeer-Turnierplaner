import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { listPlayerHeaderMeta } from "../api/playerHeaders.api";

export function usePlayerHeaderMap({
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
  const headerMetaQ = useQuery({
    queryKey: ["players", "headers"],
    queryFn: listPlayerHeaderMeta,
    enabled,
    staleTime,
    refetchOnReconnect,
    refetchOnWindowFocus,
  });

  const headerUpdatedAtById = useMemo(() => {
    const m = new Map<number, string>();
    for (const row of headerMetaQ.data ?? []) m.set(row.player_id, row.updated_at);
    return m;
  }, [headerMetaQ.data]);

  return { headerMetaQ, headerUpdatedAtById };
}
