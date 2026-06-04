/**
 * Generic seen-item tracking factory.
 *
 * Creates two hooks — one that returns a Map<containerId, Set<itemId>> for a
 * list of containers, and one that returns a Set<itemId> for a single
 * container. Both are backed by TanStack Query.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthContext";

type ReadMapRow<ContainerKey extends string, IdsKey extends string> = {
  [K in ContainerKey]: number;
} & {
  [K in IdsKey]: number[];
};

interface SeenItemsConfig<ContainerKey extends string, IdsKey extends string> {
  readMapQueryKey: (token: string | null) => readonly unknown[];
  readMapFn: (token: string) => Promise<ReadMapRow<ContainerKey, IdsKey>[]>;
  containerKey: ContainerKey;
  idsKey: IdsKey;
  singleQueryKey: (containerId: number, token: string | null) => readonly unknown[];
  singleFn: (token: string, containerId: number) => Promise<{ [K in IdsKey]: number[] }>;
}

export function createSeenItemsHooks<ContainerKey extends string, IdsKey extends string>(
  config: SeenItemsConfig<ContainerKey, IdsKey>
) {
  function useSeenIdsByContainerId(containerIds: number[]) {
    const { token } = useAuth();
    const q = useQuery({
      queryKey: config.readMapQueryKey(token),
      queryFn: () => config.readMapFn(token as string),
      enabled: !!token,
    });
    return useMemo(() => {
      const source = new Map<number, Set<number>>();
      for (const row of q.data ?? []) {
        source.set(
          Number(row[config.containerKey]),
          new Set((row[config.idsKey] ?? []).map((x: number) => Number(x)))
        );
      }
      const out = new Map<number, Set<number>>();
      for (const id of containerIds) out.set(id, source.get(id) ?? new Set<number>());
      return out;
    }, [q.data, containerIds]);
  }

  function useSeenSet(containerId: number) {
    const { token } = useAuth();
    const q = useQuery({
      queryKey: config.singleQueryKey(containerId, token),
      queryFn: () => config.singleFn(token as string, containerId),
      enabled: !!token && Number.isFinite(containerId) && containerId > 0,
    });
    return useMemo(
      () => new Set((q.data?.[config.idsKey] ?? []).map((x: number) => Number(x))),
      [q.data]
    );
  }

  return { useSeenIdsByContainerId, useSeenSet };
}
