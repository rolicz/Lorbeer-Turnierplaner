import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Check, Eye, LogIn, LogOut, UserCog } from "lucide-react";

import { useAuth } from "../auth/AuthContext";
import { useTheme } from "../ui/layout/ThemeContext";
import { usePageTitle } from "../ui/layout/PageTitleContext";
import { useStatsExperience, setStatsExperience } from "../ui/layout/useStatsMode";
import SegmentedSwitch from "../ui/primitives/SegmentedSwitch";
import { SectionTabs, type SectionTab } from "../ui/SectionTabs";
import { UserCircle2, Bell, Palette, FlaskConical } from "lucide-react";
import { qk } from "../api/queryKeys";
import { listPlayers } from "../api/players.api";
import PushNotificationsSettings from "../ui/layout/PushNotificationsSettings";
import { THEMES } from "../themes";
import { useRouteEntryLoading } from "../ui/layout/useRouteEntryLoading";
import PageLoadingScreen from "../ui/primitives/PageLoadingScreen";

const THEME_SWATCHES: Record<string, string[]> = {
  blue: ["#0f172a", "#334155", "#fe6100"],
  dark: ["#09090b", "#3f3f46", "#3b82f6"],
  red: ["#080507", "#2a1a1f", "#e1384a"],
  light: ["#f4f3f2", "#ffffff", "#3b82f6"],
  green: ["#0a100c", "#2a4032", "#22c55e"],
};
const FALLBACK_SWATCH = ["#334155", "#475569", "#fe6100"];

/** Card wrapper for a settings group. */
function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card-outer">
      <h2 className="mb-3 text-sm font-semibold text-text-normal">{title}</h2>
      {children}
    </section>
  );
}

export default function SettingsPage() {
  const pageEntered = useRouteEntryLoading();
  const { theme, setTheme } = useTheme();
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

  const playersQ = useQuery({
    queryKey: qk.players(),
    queryFn: listPlayers,
    enabled: !!token && accountRole === "admin",
    staleTime: 30_000,
  });

  const actorOptions = useMemo(() => {
    const rows = (playersQ.data ?? [])
      .filter((p) => playerId == null || Number(p.id) !== Number(playerId))
      .slice();
    rows.sort((a, b) => a.display_name.localeCompare(b.display_name));
    return rows;
  }, [playersQ.data, playerId]);

  const actorDifferent =
    playerId != null && actorPlayerId != null && Number(playerId) !== Number(actorPlayerId);

  usePageTitle("Settings");
  const statsExperience = useStatsExperience();

  type SettingsTab = "account" | "appearance" | "notifications" | "experiments";
  const [tab, setTab] = useState<SettingsTab>("account");
  const settingsTabs: SectionTab<SettingsTab>[] = [
    { key: "account", label: "Account", icon: <UserCircle2 size={14} /> },
    { key: "appearance", label: "Appearance", icon: <Palette size={14} /> },
    { key: "notifications", label: "Notifications", icon: <Bell size={14} /> },
    { key: "experiments", label: "Experiments", icon: <FlaskConical size={14} /> },
  ];

  if (!pageEntered) {
    return <div className="page"><PageLoadingScreen sectionCount={3} /></div>;
  }

  return (
    <div className="page">
      <div className="mb-4 hidden lg:block">
        <h1 className="text-xl font-bold tracking-tight text-text-normal">Settings</h1>
      </div>

      <SectionTabs tabs={settingsTabs} active={tab} onChange={setTab} className="mb-4" />

      <div className="mx-auto grid max-w-2xl gap-4">
        {tab === "account" ? (
        <>
        {/* Account */}
        <SettingsSection title="Account">
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
                className="icon-button focus-ring inline-flex h-9 items-center justify-center gap-2 px-3 text-sm"
              >
                <UserCog className="h-4 w-4" aria-hidden="true" />
                <span>Switch role</span>
              </button>
            ) : null}
          </div>
          <div className="mt-3 flex items-center gap-2">
            {token ? (
              <>
                <Link
                  to="/profile"
                  className="btn-base btn-ghost inline-flex h-9 flex-1 items-center justify-center"
                >
                  My profile
                </Link>
                <button
                  type="button"
                  onClick={() => logout()}
                  className="btn-base btn-ghost inline-flex h-9 items-center justify-center gap-2 px-3"
                  title="Logout"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  <span>Logout</span>
                </button>
              </>
            ) : (
              <Link to="/login" className="btn-solid inline-flex h-9 flex-1 items-center justify-center gap-2">
                <LogIn className="h-4 w-4" aria-hidden="true" />
                <span>Login</span>
              </Link>
            )}
          </div>
        </SettingsSection>

        {/* View as (admin actor switch) */}
        {canSwitchActor ? (
          <SettingsSection title="View as">
            <div className="mb-2 inline-flex items-center gap-1.5 text-xs text-text-muted">
              <Eye className="h-3 w-3" aria-hidden="true" /> See the app as another player
            </div>
            <div className="grid gap-1.5 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setActorPlayer(null, null)}
                className={
                  "rounded-lg px-2.5 py-2 text-left text-sm transition " +
                  (!actorDifferent ? "bg-bg-card-chip/50 text-text-normal" : "hover:bg-hover-default/40 text-text-muted")
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
                      "rounded-lg px-2.5 py-2 text-left text-sm transition " +
                      (active ? "bg-bg-card-chip/50 text-text-normal" : "hover:bg-hover-default/40 text-text-muted")
                    }
                  >
                    {p.display_name}
                  </button>
                );
              })}
            </div>
          </SettingsSection>
        ) : null}
        </>
        ) : null}

        {tab === "experiments" ? (
        /* Experiments */
        <SettingsSection title="Experiments">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-medium text-text-normal">Stats layout</div>
              <div className="text-xs text-text-muted">
                New dashboard (standings + graphs + player profiles, with a Simple/Detailed
                toggle) or the classic 7-section view.
              </div>
            </div>
            <SegmentedSwitch<"classic" | "insights">
              value={statsExperience}
              onChange={(v) => setStatsExperience(v)}
              options={[
                { key: "insights", label: "New" },
                { key: "classic", label: "Classic" },
              ]}
              ariaLabel="Stats layout"
            />
          </div>
        </SettingsSection>
        ) : null}

        {tab === "notifications" ? (
        /* Notifications */
        <SettingsSection title="Notifications">
          <PushNotificationsSettings token={token} />
        </SettingsSection>
        ) : null}

        {tab === "appearance" ? (
        /* Theme */
        <SettingsSection title="Theme">
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
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
                        className="h-3.5 w-3.5 rounded-full border border-border-card-chip/70"
                        style={{ backgroundColor: c }}
                        aria-hidden="true"
                      />
                    ))}
                    <span className="text-sm">{opt}</span>
                  </span>
                  {active ? <Check className="h-4 w-4 text-accent" aria-hidden="true" /> : null}
                </button>
              );
            })}
          </div>
        </SettingsSection>
        ) : null}
      </div>
    </div>
  );
}
