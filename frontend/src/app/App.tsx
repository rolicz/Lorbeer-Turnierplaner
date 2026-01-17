import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "../ui/layout/Layout";
import LoginPage from "../pages/LoginPage";
import TournamentsPage from "../pages/TournamentsPage";
import LiveTournamentPage from "../pages/live/LiveTournamentPage";
import DashboardPage from "../pages/dashboard/DashboardPage";
import ClubsPage from "../pages/ClubsPage";
import PlayersPage from "../pages/PlayersPage";
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
              <PlayersPage />
            </RequireRole>
          }
        />
      </Routes>
    </Layout>
  );
}
