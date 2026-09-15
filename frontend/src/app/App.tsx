import { lazy, Suspense } from "react";
import { MotionConfig } from "framer-motion";
import { Routes, Route, Navigate } from "react-router-dom";
import AppShell from "../ui/shell/AppShell";
import LoginPage from "../pages/LoginPage";
import TournamentsPage from "../pages/TournamentsPage";
import LiveTournamentPage from "../pages/live/LiveTournamentPage";
import DashboardPage from "../pages/dashboard/DashboardPage";
import FriendliesPage from "../pages/FriendliesPage";
import SettingsPage from "../pages/SettingsPage";
import MatchDetailPage from "../pages/live/MatchDetailPage";
import NotFoundPage from "../pages/NotFoundPage";
import PageLoadingScreen from "../ui/primitives/PageLoadingScreen";
import { RequireRole } from "../auth/RequireRole";

const StatsPage = lazy(() => import("../pages/StatsPage"));
const ProfilePage = lazy(() => import("../pages/ProfilePage"));
const ClubsPage = lazy(() => import("../pages/ClubsPage"));
const PlayersAdminPage = lazy(() => import("../pages/PlayersAdminPage"));
const IdeasPage = lazy(() => import("../pages/ideas/IdeasPage"));

const pageFallback = <div className="page"><PageLoadingScreen /></div>;

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/tournaments" element={<TournamentsPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/tournaments/new" element={<Navigate to="/tournaments?tab=new" replace />} />
        <Route path="/live/:id" element={<LiveTournamentPage />} />
        <Route path="/live/:id/match/:mid" element={<MatchDetailPage />} />

        <Route
          path="/stats"
          element={
            <RequireRole minRole="reader">
              <Suspense fallback={pageFallback}>
                <StatsPage />
              </Suspense>
            </RequireRole>
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
            <RequireRole minRole="reader">
              <Suspense fallback={pageFallback}>
                <PlayersAdminPage />
              </Suspense>
            </RequireRole>
          }
        />

        {/* reader: ProfilePage itself asks for a login when there is no player,
            so "My profile" from Settings must not bounce a viewer to /login. */}
        <Route
          path="/profile"
          element={
            <RequireRole minRole="reader">
              <Suspense fallback={pageFallback}>
                <ProfilePage />
              </Suspense>
            </RequireRole>
          }
        />

        <Route
          path="/profiles/:id"
          element={
            <RequireRole minRole="reader">
              <Suspense fallback={pageFallback}>
                <ProfilePage />
              </Suspense>
            </RequireRole>
          }
        />

        <Route
          path="/friendlies"
          element={
            <RequireRole minRole="reader">
              <FriendliesPage />
            </RequireRole>
          }
        />

        {/* Reading the board is public; posting and voting need a login (R5). */}
        <Route
          path="/ideas"
          element={
            <RequireRole minRole="reader">
              <Suspense fallback={pageFallback}>
                <IdeasPage />
              </Suspense>
            </RequireRole>
          }
        />

        <Route path="/tools" element={<Navigate to="/friendlies" replace />} />

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AppShell>
    </MotionConfig>
  );
}
