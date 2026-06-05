import { Link } from "react-router-dom";
import { Check, Eye, LogIn, LogOut, UserCog } from "lucide-react";

import { useAuth } from "../../auth/AuthContext";
import PushNotificationsMenu from "../layout/PushNotificationsMenu";
import { THEMES } from "../../themes";
import type { ThemeName } from "../layout/useThemeManager";

const THEME_SWATCHES: Record<string, string[]> = {
  blue: ["#0f172a", "#334155", "#fe6100"],
  dark: ["#09090b", "#3f3f46", "#3b82f6"],
  red: ["#080507", "#2a1a1f", "#e1384a"],
  light: ["#f4f3f2", "#ffffff", "#3b82f6"],
  green: ["#0a100c", "#2a4032", "#22c55e"],
};

const FALLBACK_SWATCH = ["#334155", "#475569", "#fe6100"];

type PlayerLite = { id: number; display_name: string };

/**
 * The settings surface re-homing everything that used to clutter the top bar:
 * account/role, actor "view as", push notifications, and theme.
 * Rendered inside the desktop sidebar popover and the mobile drawer.
 */
export default function SettingsPanel({
  theme,
  setTheme,
  actorOptions,
  onNavigate,
}: {
  theme: ThemeName;
  setTheme: (t: ThemeName) => void;
  actorOptions: PlayerLite[];
  /** Called after a navigation/action so the host can close the drawer/popover. */
  onNavigate?: () => void;
}) {
  const {
    token,
    role,
    accountRole,
    playerId,
    playerName,
    actorPlayerId,
    actorPlayerName,
    setActorPlayer,
    logout,
    canCycleRole,
    cycleRole,
    canSwitchActor,
  } = useAuth();

  const actorDifferent =
    playerId != null && actorPlayerId != null && Number(playerId) !== Number(actorPlayerId);

  return (
    <div className="flex flex-col gap-4 text-sm">
      {/* Account */}
      <section className="space-y-2">
        <div className="eyebrow">Account</div>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate font-medium text-text-normal">{playerName || "Guest"}</div>
            <div className="text-xs text-text-muted">
              {role}
              {accountRole === "admin" && role !== "admin" ? " · ui override" : ""}
              {actorDifferent ? ` · as ${actorPlayerName || `#${actorPlayerId}`}` : ""}
            </div>
          </div>
          {canCycleRole ? (
            <button
              type="button"
              onClick={cycleRole}
              title={`Switch role (currently ${role})`}
              className="icon-button focus-ring inline-flex h-8 w-8 items-center justify-center"
            >
              <UserCog className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {token ? (
            <>
              <Link
                to="/profile"
                onClick={onNavigate}
                className="btn-base btn-ghost inline-flex h-9 flex-1 items-center justify-center"
              >
                My profile
              </Link>
              <button
                type="button"
                onClick={() => {
                  logout();
                  onNavigate?.();
                }}
                className="btn-base btn-ghost inline-flex h-9 items-center justify-center gap-2 px-3"
                title="Logout"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                <span>Logout</span>
              </button>
            </>
          ) : (
            <Link
              to="/login"
              onClick={onNavigate}
              className="btn-solid inline-flex h-9 flex-1 items-center justify-center gap-2"
            >
              <LogIn className="h-4 w-4" aria-hidden="true" />
              <span>Login</span>
            </Link>
          )}
        </div>
      </section>

      {/* View as (admin actor switch) */}
      {canSwitchActor ? (
        <section className="space-y-2">
          <div className="eyebrow inline-flex items-center gap-1.5">
            <Eye className="h-3 w-3" aria-hidden="true" /> View as
          </div>
          <div className="max-h-40 space-y-1 overflow-y-auto pr-0.5">
            <button
              type="button"
              onClick={() => setActorPlayer(null, null)}
              className={
                "w-full rounded-lg px-2.5 py-1.5 text-left transition " +
                (!actorDifferent ? "bg-bg-card-chip/50" : "hover:bg-hover-default/40")
              }
            >
              {playerName || "Me"} <span className="text-text-muted">(me)</span>
            </button>
            {actorOptions.map((p) => {
              const active = actorPlayerId != null && Number(actorPlayerId) === Number(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setActorPlayer(p.id, p.display_name)}
                  className={
                    "w-full rounded-lg px-2.5 py-1.5 text-left transition " +
                    (active ? "bg-bg-card-chip/50" : "hover:bg-hover-default/40")
                  }
                >
                  {p.display_name}
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* Notifications */}
      <section className="space-y-2">
        <div className="eyebrow">Notifications</div>
        <PushNotificationsMenu token={token} />
      </section>

      {/* Theme */}
      <section className="space-y-2">
        <div className="eyebrow">Theme</div>
        <div className="grid grid-cols-2 gap-1.5">
          {THEMES.map((opt) => {
            const swatches = THEME_SWATCHES[opt] ?? FALLBACK_SWATCH;
            const active = opt === theme;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => setTheme(opt)}
                title={opt}
                className={
                  "flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 capitalize transition hairline " +
                  (active ? "bg-bg-card-chip/55" : "hover:bg-hover-default/40")
                }
              >
                <span className="inline-flex items-center gap-1.5">
                  {swatches.map((c, i) => (
                    <span
                      key={`${opt}-${i}`}
                      className="h-3 w-3 rounded-full border border-border-card-chip/70"
                      style={{ backgroundColor: c }}
                      aria-hidden="true"
                    />
                  ))}
                </span>
                {active ? <Check className="h-3.5 w-3.5 text-accent" aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
