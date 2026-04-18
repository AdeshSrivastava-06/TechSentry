import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import Layout from "./components/Layout/Layout";
import Login from "./pages/LoginNew";
import Register from "./pages/RegisterNew";
import Dashboard from "./pages/DashboardNew";
import Search from "./pages/SearchFull";
import PaperDetail from "./pages/PaperDetail";
import FullPaperView from "./pages/FullPaperView";
import PatentInsights from "./pages/PatentInsights";
import TechnologyInsights from "./pages/TechnologyInsights";
import Reports from "./pages/Reports";
import Watchlist from "./pages/WatchlistNew";
import Profile from "./pages/Profile";
import SavedPapers from "./pages/SavedPapers";

function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-tech-bg flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-tech-primary"></div>
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={!user ? <Login /> : <Navigate to="/dashboard" />}
      />
      <Route
        path="/register"
        element={!user ? <Register /> : <Navigate to="/dashboard" />}
      />
      <Route path="/" element={user ? <Layout /> : <Navigate to="/login" />}>
        <Route index element={<Navigate to="/dashboard" />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="search" element={<Search />} />
        <Route path="paper/:paperId" element={<PaperDetail />} />
        <Route path="full-paper/:paperId" element={<FullPaperView />} />
        <Route path="patent-insights/:patentId" element={<PatentInsights />} />
        <Route path="insights" element={<TechnologyInsights />} />
        <Route path="reports" element={<Reports />} />
        <Route path="watchlist" element={<Watchlist />} />
        <Route path="profile" element={<Profile />} />
        <Route path="saved-papers" element={<SavedPapers />} />
      </Route>
    </Routes>
  );
}

export default App;
