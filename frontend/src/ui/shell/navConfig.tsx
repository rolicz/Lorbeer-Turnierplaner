import { BarChart3, Handshake, LayoutDashboard, Lightbulb, ShieldHalf, Trophy, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type Role = "reader" | "editor" | "admin";

export type NavDest = {
  key: string;
  to: string;
  label: string;
  icon: LucideIcon;
  min: Role;
  /** Whether this destination owns the given pathname (for active state). */
  match: (pathname: string) => boolean;
};

export const NAV_DESTS: NavDest[] = [
  {
    key: "dashboard",
    to: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    min: "reader",
    match: (p) => p === "/dashboard" || p.startsWith("/dashboard/"),
  },
  {
    key: "tournaments",
    to: "/tournaments",
    label: "Tournaments",
    icon: Trophy,
    min: "reader",
    match: (p) => p === "/tournaments" || p.startsWith("/tournaments/") || p.startsWith("/live/"),
  },
  {
    key: "friendlies",
    to: "/friendlies",
    label: "Friendlies",
    icon: Handshake,
    min: "reader",
    match: (p) => p === "/friendlies" || p.startsWith("/friendlies/"),
  },
  {
    key: "stats",
    to: "/stats",
    label: "Stats",
    icon: BarChart3,
    min: "reader",
    match: (p) => p === "/stats" || p.startsWith("/stats/"),
  },
  {
    key: "players",
    to: "/players",
    label: "Players",
    icon: Users,
    min: "reader",
    match: (p) =>
      p === "/players" ||
      p.startsWith("/players/") ||
      p === "/profile" ||
      p.startsWith("/profiles/"),
  },
  {
    key: "clubs",
    to: "/clubs",
    label: "Clubs",
    icon: ShieldHalf,
    min: "editor",
    match: (p) => p === "/clubs" || p.startsWith("/clubs/"),
  },
  // Below Clubs in the sidebar and the drawer, and **not** in the bottom tab bar
  // (R5, Roli's call): five items are what fits a phone row, and asking for a
  // feature is not something you do on the way somewhere else. Everyone may read
  // the board, so unlike Clubs this one is visible to a reader too.
  {
    key: "ideas",
    to: "/ideas",
    label: "Ideas",
    icon: Lightbulb,
    min: "reader",
    match: (p) => p === "/ideas" || p.startsWith("/ideas/"),
  },
];

export const ROLE_RANK: Record<Role, number> = { reader: 1, editor: 2, admin: 3 };

export function visibleDests(role: Role): NavDest[] {
  return NAV_DESTS.filter((d) => ROLE_RANK[role] >= ROLE_RANK[d.min]);
}

export function activeDest(pathname: string): NavDest | null {
  return NAV_DESTS.find((d) => d.match(pathname)) ?? null;
}
