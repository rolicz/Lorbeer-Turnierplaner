import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Check, Eye, LogOut, UserCog } from "lucide-react";

import { useAuth } from "../auth/AuthContext";
import { useTheme } from "../ui/layout/ThemeContext";
import { usePageTitle } from "../ui/layout/PageTitleContext";
import { SectionTabs, type SectionTab } from "../ui/SectionTabs";
import { UserCircle2, Bell, Palette, Bug } from "lucide-react";
import { qk } from "../api/queryKeys";
import { listPlayers } from "../api/players.api";
import PushNotificationsSettings from "../ui/layout/PushNotificationsSettings";
import DiagnosticsSettings from "../ui/layout/DiagnosticsSettings";
import ViewportReadout from "../ui/layout/ViewportReadout";
import { THEMES } from "../themes";
import { useRouteEntryLoading } from "../ui/layout/useRouteEntryLoading";
import { useTabParam } from "../ui/shell/useTabParam";
import PageLayout from "../ui/layout/PageLayout";
import Button, { buttonClass } from "../ui/primitives/Button";
import ConfirmDialog from "../ui/primitives/ConfirmDialog";
import { showErrorToast } from "../ui/primitives/ErrorToast";
import PageLoadingScreen from "../ui/primitives/PageLoadingScreen";
import SettingsSection from "./settings/SettingsSection";
import SecuritySection from "./settings/SecuritySection";

const THEME_SWATCHES: Record<string, string[]> = {
  blue: ["#0f172a", "#334155", "#fe6100"],
  dark: ["#09090b", "#3f3f46", "#3b82f6"],
  red: ["#080507", "#2a1a1f", "#e1384a"],
  light: ["#f4f3f2", "#ffffff", "#3b82f6"],
  green: ["#0a100c", "#2a4032", "#22c55e"],
};
const FALLBACK_SWATCH = ["#334155", "#475569", "#fe6100"];

type SettingsTab = "account" | "appearance" | "notifications" | "diagnostics";
const SETTINGS_TAB_KEYS = ["account", "appearance", "notifications", "diagnostics"] as const satisfies readonly SettingsTab[];

export default function SettingsPage() {
  const pageEntered = useRouteEntryLoading();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const {
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
    enabled: accountRole === "admin",
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

  const [pendingLogout, setPendingLogout] = useState<true | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  const [tab, setTab] = useTabParam<SettingsTab>(SETTINGS_TAB_KEYS, "account");
  const settingsTabs: SectionTab<SettingsTab>[] = [
    { key: "account", label: "Account", icon: <UserCircle2 size={14} /> },
    { key: "appearance", label: "Appearance", icon: <Palette size={14} /> },
    { key: "notifications", label: "Notifications", icon: <Bell size={14} /> },
    { key: "diagnostics", label: "Diagnostics", icon: <Bug size={14} /> },
  ];

  // Logging out needs the server (the cookie is its to end, L4): the row is deleted and
  // this device's push subscription disabled in one request, then the app forgets the
  // session and lands on the login screen. A request that never arrived changes nothing
  // — say so, and leave the reader logged in rather than half out.
  async function confirmLogout() {
    setPendingLogout(null);
    setLoggingOut(true);
    try {
      await logout();
      navigate("/login", { replace: true });
    } catch {
      showErrorToast("Could not reach the server — you are still logged in.", "Log out failed");
    } finally {
      setLoggingOut(false);
    }
  }

  if (!pageEntered) {
    return <PageLayout><PageLoadingScreen sectionCount={3} /></PageLayout>;
  }

  return (
    <PageLayout title="Settings">
      <SectionTabs tabs={settingsTabs} active={tab} onChange={setTab} />

      <div className="mx-auto grid max-w-2xl gap-4">
        {tab === "account" ? (
        <>
        {/* Account */}
        <SettingsSection title="Account">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate font-medium text-text-normal">{playerName || "—"}</div>
              <div className="text-xs text-text-muted">
                {role}
                {accountRole === "admin" && role !== "admin" ? " · ui override" : ""}
                {actorDifferent ? ` · as ${actorPlayerName || `#${actorPlayerId}`}` : ""}
              </div>
            </div>
            {canCycleRole ? (
              <Button
                type="button"
                variant="ghost"
                size="md"
                onClick={cycleRole}
                title={`Switch role (currently ${role})`}
                className="justify-center gap-2"
              >
                <UserCog className="h-4 w-4" aria-hidden="true" />
                <span>Switch role</span>
              </Button>
            ) : null}
          </div>
          {/* Logged in is the only state this page has (L4): the shell mounts behind the
              login, so there is no "Login" branch to render any more. */}
          <div className="mt-3 flex items-center gap-2">
            <Link
              to="/profile"
              className={buttonClass({ variant: "ghost", size: "md", className: "flex-1 justify-center" })}
            >
              My profile
            </Link>
            <Button
              type="button"
              onClick={() => setPendingLogout(true)}
              variant="ghost"
              size="md"
              className="justify-center gap-2"
              title="Log out"
              disabled={loggingOut}
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              <span>{loggingOut ? "Logging out…" : "Log out"}</span>
            </Button>
          </div>
        </SettingsSection>

        {/* Devices · Password · Groups (L7) */}
        <SecuritySection />

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
                  "rounded-xl px-2.5 py-2 text-left text-sm transition " +
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
                      "rounded-xl px-2.5 py-2 text-left text-sm transition " +
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

        {tab === "notifications" ? (
        /* Notifications */
        <SettingsSection title="Notifications">
          <PushNotificationsSettings />
        </SettingsSection>
        ) : null}

        {tab === "diagnostics" ? (
        <>
        {/* First in the tab on purpose: its whole job is to stay visible while the
            keyboard covers the bottom half of the screen (Q2's measurement). */}
        <SettingsSection title="Keyboard and viewport">
          <ViewportReadout />
        </SettingsSection>
        {/* Crash log (see `diagnostics/`): the only way a crash on Roli's phone
           gets off the device -- there is no console there. */}
        <SettingsSection title="Crash log">
          <DiagnosticsSettings />
        </SettingsSection>
        </>
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
                    "flex items-center justify-between gap-2 rounded-xl border border-border-card-chip/40 px-2.5 py-2 capitalize transition " +
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

      <ConfirmDialog
        open={!!pendingLogout}
        title="Log out?"
        subtitle="This device is signed out; log in again with your name and password."
        confirmLabel="Log out"
        busy={loggingOut}
        busyLabel="Logging out…"
        onCancel={() => setPendingLogout(null)}
        onConfirm={() => {
          void confirmLogout();
        }}
      />
    </PageLayout>
  );
}
