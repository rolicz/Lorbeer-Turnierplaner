import { lazy, Suspense } from "react";
import { MotionConfig } from "framer-motion";
import { Routes, Route, Navigate } from "react-router-dom";
import AppShell from "../ui/shell/AppShell";
import LoginPage from "../pages/auth/LoginPage";
import RegisterPage from "../pages/auth/RegisterPage";
import ResetPage from "../pages/auth/ResetPage";
import TournamentsPage from "../pages/TournamentsPage";
import LiveTournamentPage from "../pages/live/LiveTournamentPage";
import DashboardPage from "../pages/dashboard/DashboardPage";
import FriendliesPage from "../pages/FriendliesPage";
import SettingsPage from "../pages/SettingsPage";
import MatchDetailPage from "../pages/live/MatchDetailPage";
import NotFoundPage from "../pages/NotFoundPage";
import PageLayout from "../ui/layout/PageLayout";
import PageLoadingScreen from "../ui/primitives/PageLoadingScreen";
import { RequireAuth } from "../auth/RequireAuth";
import { RequireRole } from "../auth/RequireRole";

const StatsPage = lazy(() => import("../pages/StatsPage"));
const ProfilePage = lazy(() => import("../pages/ProfilePage"));
const ClubsPage = lazy(() => import("../pages/ClubsPage"));
const PlayersAdminPage = lazy(() => import("../pages/PlayersAdminPage"));
const IdeasPage = lazy(() => import("../pages/ideas/IdeasPage"));

// `PageLayout`, so a lazy route still carries its back chevron while it loads (Q6).
const pageFallback = <PageLayout><PageLoadingScreen /></PageLayout>;

/**
 * Everything behind the login (L4). Every route here is reached only through
 * `RequireAuth`, so being logged in is not something a page checks; `RequireRole` is left
 * where a page needs *more* than membership.
 */
function ShellRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/tournaments" element={<TournamentsPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/tournaments/new" element={<Navigate to="/tournaments?tab=new" replace />} />
      <Route path="/live/:id" element={<LiveTournamentPage />} />
      <Route path="/live/:id/match/:mid" element={<MatchDetailPage />} />

      <Route
        path="/stats"
        element={
          <Suspense fallback={pageFallback}>
            <StatsPage />
          </Suspense>
        }
      />

      <Route
        path="/clubs"
        element={
          <RequireRole minRole="editor">
            <Suspense fallback={pageFallback}>
              <ClubsPage />
            </Suspense>
          </RequireRole>
        }
      />

      <Route
        path="/players"
        element={
          <Suspense fallback={pageFallback}>
            <PlayersAdminPage />
          </Suspense>
        }
      />

      <Route
        path="/profile"
        element={
          <Suspense fallback={pageFallback}>
            <ProfilePage />
          </Suspense>
        }
      />

      <Route
        path="/profiles/:id"
        element={
          <Suspense fallback={pageFallback}>
            <ProfilePage />
          </Suspense>
        }
      />

      <Route path="/friendlies" element={<FriendliesPage />} />

      <Route
        path="/ideas"
        element={
          <Suspense fallback={pageFallback}>
            <IdeasPage />
          </Suspense>
        }
      />

      {/* L6: the admin page mounts here as
          <Route path="/admin" element={<RequireRole minRole="owner">…</RequireRole>} /> */}

      <Route path="/tools" element={<Navigate to="/friendlies" replace />} />

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <Routes>
        {/* Bare, outside the shell: nobody is logged in here, so there is no top bar,
            no tab bar, no global websocket and no prefetch — `AuthScreen` is the layout. */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/reset" element={<ResetPage />} />
        <Route
          path="/*"
          element={
            <RequireAuth>
              <AppShell>
                <ShellRoutes />
              </AppShell>
            </RequireAuth>
          }
        />
      </Routes>
    </MotionConfig>
  );
}
