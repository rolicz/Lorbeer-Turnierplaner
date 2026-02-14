import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "../ui/layout/Layout";
import LoginPage from "../pages/LoginPage";
import TournamentsPage from "../pages/TournamentsPage";
import LiveTournamentPage from "../pages/live/LiveTournamentPage";
import DashboardPage from "../pages/dashboard/DashboardPage";
import ClubsPage from "../pages/ClubsPage";
import PlayersAdminPage from "../pages/PlayersAdminPage";
import FriendliesPage from "../pages/FriendliesPage";
import StatsPage from "../pages/StatsPage";
import ProfilePage from "../pages/ProfilePage";
import { RequireRole } from "../auth/RequireRole";

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/tournaments" element={<TournamentsPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/live/:id" element={<LiveTournamentPage />} />

        <Route
          path="/stats"
          element={
            <RequireRole minRole="reader">
              <StatsPage />
            </RequireRole>
          }
        />

        <Route
          path="/clubs"
          element={
            <RequireRole minRole="editor">
              <ClubsPage />
            </RequireRole>
          }
        />

        <Route
          path="/players"
          element={
            <RequireRole minRole="reader">
              <PlayersAdminPage />
            </RequireRole>
          }
        />

        <Route
          path="/profile"
          element={
            <RequireRole minRole="editor">
              <ProfilePage />
            </RequireRole>
          }
        />

        <Route
          path="/profiles/:id"
          element={
            <RequireRole minRole="reader">
              <ProfilePage />
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

        <Route path="/tools" element={<Navigate to="/friendlies" replace />} />
      </Routes>
    </Layout>
  );
}
