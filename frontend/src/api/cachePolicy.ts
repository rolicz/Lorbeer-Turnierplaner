/**
 * Cache policy — the channel-coverage map, as code (Q9).
 *
 * Two different timers decide what a screen does when you come back to it, and only
 * one of them is visible:
 *
 * - **`gcTime`** — how long a key's data is *kept* after the last component using it
 *   unmounts. Once it expires there is genuinely nothing to render, so the return is a
 *   fresh load with a spinner. This is the one that shows.
 * - **`staleTime`** — how long that data may be *believed*. Inside the window a return
 *   renders from cache and asks nothing; outside it, the cache still renders instantly
 *   and a refetch lands behind it. Invisible; costs traffic.
 *
 * So `gcTime` is set long and uniformly — that is the whole of "I thought we already
 * have the data" — while `staleTime` is set per domain, by exactly one question:
 *
 *   **How does a change reach a client that is already looking at this data?**
 *
 * The answer is a websocket channel or nothing, and the rows below carry the answer
 * next to the number it justifies. They are the same rows as the channel-coverage map
 * in `AGENTS.md` §6; keeping the reason and the number in one place is what stops the
 * two from drifting apart. Add a `qk` namespace, add a row — the default then applies
 * to every query under that key prefix without a single call site opting in.
 *
 * Call sites may still override (`useLiveTournament` polls at `staleTime: 0`, the club
 * catalogue sits at 60 s inside the pickers); those exceptions are listed in the map.
 */
import { QueryClient } from "@tanstack/react-query";

/** No channel, or a channel that is only open while the screen itself is mounted. */
const SHORT = 5_000;
/** A channel announces most changes to this data, but not all of them. */
const MEDIUM = 30_000;
/** An always-mounted channel announces every change to this data. */
const LONG = 5 * 60_000;
/** Only a deploy changes it. */
const STATIC = 30 * 60_000;

/**
 * How long anything stays in the cache after its last observer goes away. Long enough
 * to cover a whole tournament night's worth of moving between screens; bounded so a
 * PWA left open for a day does not accumulate for ever.
 */
export const KEEP_CACHED = 30 * 60_000;

/** How a change to this data reaches a client that is already looking at it. */
export type Coverage =
  /** `/ws/tournaments` — mounted in `AppShell`, so it is open for the whole session. */
  | "global-channel"
  /** `/ws/tournaments/{id}` or `/ws/players/{id}` — open only while that page is mounted. */
  | "page-channel"
  /** A channel announces some of the changes; the rest arrive only on a refetch. */
  | "partial"
  /** Nothing announces a change. Only a refetch finds it. */
  | "none";

export type CachePolicyRow = {
  /** Key prefix, exactly as the matching `qk` factory builds it. */
  key: readonly unknown[];
  coverage: Coverage;
  staleTime: number;
  /** Why this coverage, and therefore this number. */
  why: string;
};

export const CACHE_POLICY: readonly CachePolicyRow[] = [
  {
    key: ["tournaments"],
    coverage: "global-channel",
    staleTime: LONG,
    why:
      "Created, edited, finished, deleted and (Q9) a corrected result all send " +
      "`tournaments.changed` on the always-open global channel, and a reconnect or a " +
      "return to the foreground resyncs it. Nothing can change the list quietly.",
  },
  {
    key: ["tournament"],
    coverage: "page-channel",
    staleTime: SHORT,
    why:
      "`/ws/tournaments/{id}` is torn down the moment the page unmounts (refCount 0 " +
      "closes the socket), and its first connect deliberately does not resync — the " +
      "mount GET is the resync. So coming back must revalidate.",
  },
  {
    key: ["comments"],
    coverage: "page-channel",
    staleTime: SHORT,
    why: "Same channel, same lifetime as the tournament it belongs to.",
  },
  {
    key: ["comments", "summary"],
    coverage: "global-channel",
    staleTime: LONG,
    why:
      "Every comment write sends `action=\"comment\"` on the global channel purely to " +
      "move this badge (A5), so the unread counts cannot go quietly stale.",
  },
  {
    key: ["cup"],
    coverage: "global-channel",
    staleTime: LONG,
    why:
      "Ownership can only move when a tournament finishes, is deleted, or a finished " +
      "result is corrected — all three now announce themselves globally (Q9).",
  },
  {
    key: ["cup", "defs"],
    coverage: "none",
    staleTime: STATIC,
    why: "`cups.json`, read once at backend startup. Only a deploy changes it.",
  },
  {
    key: ["stats"],
    coverage: "partial",
    staleTime: MEDIUM,
    why:
      "Tournament results announce themselves globally, but friendly results are not " +
      "broadcast at all and every /stats endpoint takes `scope=friendlies|both`.",
  },
  {
    key: ["match-h2h"],
    coverage: "partial",
    staleTime: MEDIUM,
    why:
      "The same numbers as /stats, but the key sits outside [\"stats\"], so no realtime " +
      "reducer ever invalidates it — only this window does.",
  },
  {
    key: ["me", "notifications"],
    coverage: "partial",
    staleTime: MEDIUM,
    why:
      "A reply to your comment invalidates it from the tournament channel; a poke, a " +
      "guestbook entry or a new idea does not. The bell's own 60 s poll covers the rest.",
  },
  {
    key: ["players"],
    coverage: "none",
    staleTime: SHORT,
    why:
      "The roster, profiles, avatars and header images have no channel: a rename or a " +
      "new avatar reaches another device only when it refetches.",
  },
  {
    key: ["players", "pokes"],
    coverage: "page-channel",
    staleTime: SHORT,
    why: "`/ws/players/{id}`, open only while that profile is on screen.",
  },
  {
    key: ["players", "guestbook"],
    coverage: "page-channel",
    staleTime: SHORT,
    why: "Same channel, same lifetime as the profile it belongs to.",
  },
  {
    key: ["clubs"],
    coverage: "none",
    staleTime: SHORT,
    why:
      "No channel. An added club or an edited star rating reaches the pickers on " +
      "another phone only by refetching, so the window is the only thing that finds it.",
  },
  {
    key: ["leagues"],
    coverage: "none",
    staleTime: SHORT,
    why: "No channel, same as the clubs it groups.",
  },
  {
    key: ["friendlies"],
    coverage: "none",
    staleTime: SHORT,
    why:
      "Friendlies broadcast nothing at all — a result typed into another phone during " +
      "the same session is invisible until this one asks again.",
  },
  {
    key: ["ideas"],
    coverage: "none",
    staleTime: SHORT,
    why: "R5 gave the board no channel on purpose; a new idea or vote is found only by refetching.",
  },
  {
    key: ["push"],
    coverage: "none",
    staleTime: MEDIUM,
    why: "This device's own subscriptions — nothing but this device changes them.",
  },
  {
    key: ["auth"],
    coverage: "none",
    staleTime: SHORT,
    why:
      "My sessions and my passkeys (L7/L9). Another device logging in, or being revoked " +
      "from the admin page, announces nothing; the list is right only when it is re-asked.",
  },
  {
    key: ["admin"],
    coverage: "none",
    staleTime: SHORT,
    why:
      "Accounts, their sessions and the live invite codes (L6). A login, a logout or a " +
      "redeemed code on any device is found only by refetching — nothing broadcasts them.",
  },
];

/**
 * Register the table on a QueryClient. Prefixes are applied shortest-first because
 * `getQueryDefaults` merges every matching prefix in registration order, so the most
 * specific row has to be registered last to win (`["comments","summary"]` over
 * `["comments"]`). Sorting here rather than trusting the table's order is what keeps
 * the rows free to be listed in whatever order reads best.
 */
export function applyCachePolicy(qc: QueryClient): void {
  for (const row of [...CACHE_POLICY].sort((a, b) => a.key.length - b.key.length)) {
    qc.setQueryDefaults(row.key, { staleTime: row.staleTime });
  }
}

/**
 * The app's QueryClient. Built here rather than in `main.tsx` so the numbers above and
 * the client that uses them cannot be tested apart — `src/test/cachePolicy.test.ts`
 * drives this exact client through a real mount/unmount/return.
 */
export function createAppQueryClient(): QueryClient {
  const qc = new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        // A PWA that has been in the background for hours has heard nothing: its sockets
        // were suspended and every channel-covered key is resynced on the way back in
        // (`useVisibilityResync`). This covers the other half — the keys no channel
        // watches. The two do not duplicate each other, because a focus refetch only
        // touches *stale active* queries, and the table above is what makes the
        // channel-covered ones not stale.
        refetchOnWindowFocus: true,
        // How long data is kept after the last component using it unmounts. This, not
        // `staleTime`, is the timer behind "why is this screen loading again?": five
        // minutes (TanStack's default) is shorter than Roli's trip to the kitchen, and
        // once it fires there is nothing left to render.
        gcTime: KEEP_CACHED,
        // Floor for anything the table does not name.
        staleTime: SHORT,
      },
    },
  });
  applyCachePolicy(qc);
  return qc;
}
