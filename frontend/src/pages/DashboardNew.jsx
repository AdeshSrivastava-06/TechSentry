import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Search,
  BarChart3,
  FileText,
  Bookmark,
  TrendingUp,
  Users,
  Globe,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Eye,
  Clock,
  Target,
  Brain,
  Zap,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import axios from "axios";
import {
  getRecentActivity,
  subscribeToActivityUpdates,
} from "../utils/activityLog";
import {
  getSavedPapersCount,
  subscribeToSavedPapersUpdates,
} from "../utils/savedPapers";
import Logo from "../components/Layout/Logo";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";

const Dashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalSearches: 0,
    papersFound: 0,
    patentsFound: 0,
    companiesFound: 0,
    newsArticles: 0,
    activeWatchlist: 0,
    savedReports: 0,
    recentActivity: [],
  });

  const activityIconByType = {
    search: Search,
    paper: FileText,
    watchlist: Bookmark,
    report: BarChart3,
    activity: Activity,
  };

  const [chartData] = useState([
    { name: "Mon", searches: 45, papers: 28 },
    { name: "Tue", searches: 52, papers: 35 },
    { name: "Wed", searches: 38, papers: 42 },
    { name: "Thu", searches: 65, papers: 38 },
    { name: "Fri", searches: 48, papers: 45 },
    { name: "Sat", searches: 72, papers: 52 },
    { name: "Sun", searches: 58, papers: 41 },
  ]);

  const getActiveWatchlistCount = async () => {
    const defaultTechnologies = [
      "quantum computing",
      "artificial intelligence",
      "blockchain technology",
    ];

    try {
      const response = await axios.get("/api/watchlist/");
      const watchlistItems = Array.isArray(response.data) ? response.data : [];

      const existingTech = new Set(
        watchlistItems.map((item) =>
          String(item?.technology || "")
            .trim()
            .toLowerCase(),
        ),
      );

      const remainingDefaults = defaultTechnologies.filter(
        (tech) => !existingTech.has(tech),
      ).length;

      return watchlistItems.length + remainingDefaults;
    } catch {
      // Match Watchlist page baseline behavior when API data is unavailable.
      return defaultTechnologies.length;
    }
  };

  useEffect(() => {
    let isMounted = true;

    const applyStats = async () => {
      const activeWatchlistCount = await getActiveWatchlistCount();
      if (!isMounted) return;

      setStats({
        totalSearches: 1247,
        papersFound: 892,
        patentsFound: 456,
        companiesFound: 234,
        newsArticles: 189,
        activeWatchlist: activeWatchlistCount,
        savedReports: getSavedPapersCount(),
        recentActivity: getRecentActivity(8),
      });
      setLoading(false);
    };

    applyStats();
    const unsubscribeActivity = subscribeToActivityUpdates(applyStats);
    const unsubscribeSavedPapers = subscribeToSavedPapersUpdates(applyStats);

    return () => {
      isMounted = false;
      unsubscribeActivity();
      unsubscribeSavedPapers();
    };
  }, []);

  const StatCard = ({
    title,
    value,
    change,
    changeType,
    icon: Icon,
    color,
    gradient,
  }) => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      whileHover={{ scale: 1.02, y: -2 }}
      className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-lg border border-white/20 p-6 cursor-pointer hover:shadow-xl transition-all duration-300"
    >
      <div className="flex items-center justify-between mb-4">
        <div className={`p-3 rounded-xl ${gradient}`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
        {change && (
          <div
            className={`flex items-center gap-1 text-sm font-medium ${
              changeType === "increase" ? "text-green-600" : "text-red-600"
            }`}
          >
            {changeType === "increase" ? (
              <ArrowUpRight className="w-4 h-4" />
            ) : (
              <ArrowDownRight className="w-4 h-4" />
            )}
            {change}
          </div>
        )}
      </div>
      <div>
        <h3 className="text-2xl font-bold text-gray-900">
          {value.toLocaleString()}
        </h3>
        <p className="text-sm text-gray-600 mt-1">{title}</p>
      </div>
    </motion.div>
  );

  const ActivityItem = ({ activity }) => {
    const Icon = activityIconByType[activity.type] || Activity;
    return (
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex items-center gap-4 p-3 rounded-xl hover:bg-gray-50/50 transition-colors cursor-pointer"
      >
        <div className="p-2 rounded-lg bg-indigo-100">
          <Icon className="w-4 h-4 text-indigo-600" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-900">
            {activity.description}
          </p>
          <p className="text-xs text-gray-500 mt-1">{activity.time}</p>
        </div>
      </motion.div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full mx-auto mb-4"
          />
          <p className="text-gray-600">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-xl border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-6 min-w-0">
              <Logo size="small" showTagline={false} />
              <span className="text-sm text-gray-500 leading-none whitespace-nowrap">
                Defense Research Intelligence
              </span>
            </div>

            <div className="flex items-center gap-4">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => navigate("/search")}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors shadow-lg"
              >
                <Search className="w-4 h-4" />
                New Search
              </motion.button>

              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center">
                  <span className="text-white text-sm font-medium">U</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Section */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h2 className="text-3xl font-bold text-gray-900 mb-2">
            Welcome back, User
          </h2>
          <p className="text-gray-600">
            Here's what's happening with your research intelligence today
          </p>
        </motion.div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard
            title="Total Searches"
            value={stats.totalSearches}
            change="+12.5%"
            changeType="increase"
            icon={Search}
            gradient="bg-gradient-to-br from-blue-500 to-blue-600"
          />
          <StatCard
            title="Papers Found"
            value={stats.papersFound}
            change="+8.2%"
            changeType="increase"
            icon={FileText}
            gradient="bg-gradient-to-br from-green-500 to-green-600"
          />
          <StatCard
            title="Patents Found"
            value={stats.patentsFound}
            change="-2.4%"
            changeType="decrease"
            icon={Target}
            gradient="bg-gradient-to-br from-yellow-500 to-orange-600"
          />
          <StatCard
            title="Companies Found"
            value={stats.companiesFound}
            change="+15.3%"
            changeType="increase"
            icon={Globe}
            gradient="bg-gradient-to-br from-purple-500 to-purple-600"
          />
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Activity Chart */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-lg border border-white/20 p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">
                Weekly Activity
              </h3>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Activity className="w-4 h-4" />
                Last 7 days
              </div>
            </div>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient
                    id="colorSearches"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="5%" stopColor="#6366F1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorPapers" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="name" stroke="#6B7280" />
                <YAxis stroke="#6B7280" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "rgba(255, 255, 255, 0.95)",
                    border: "1px solid #E5E7EB",
                    borderRadius: "8px",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="searches"
                  stroke="#6366F1"
                  fillOpacity={1}
                  fill="url(#colorSearches)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="papers"
                  stroke="#10B981"
                  fillOpacity={1}
                  fill="url(#colorPapers)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </motion.div>

          {/* Quick Actions */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-lg border border-white/20 p-6"
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-6">
              Quick Actions
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => navigate("/search")}
                className="flex flex-col items-center gap-3 p-4 rounded-xl bg-gradient-to-br from-indigo-50 to-blue-50 hover:from-indigo-100 hover:to-blue-100 transition-colors border border-indigo-100"
              >
                <Search className="w-6 h-6 text-indigo-600" />
                <span className="text-sm font-medium text-gray-700">
                  New Search
                </span>
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => navigate("/insights")}
                className="flex flex-col items-center gap-3 p-4 rounded-xl bg-gradient-to-br from-green-50 to-emerald-50 hover:from-green-100 hover:to-emerald-100 transition-colors border border-green-100"
              >
                <Brain className="w-6 h-6 text-green-600" />
                <span className="text-sm font-medium text-gray-700">
                  Insights
                </span>
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => navigate("/watchlist")}
                className="flex flex-col items-center gap-3 p-4 rounded-xl bg-gradient-to-br from-yellow-50 to-orange-50 hover:from-yellow-100 hover:to-orange-100 transition-colors border border-yellow-100"
              >
                <Bookmark className="w-6 h-6 text-yellow-600" />
                <span className="text-sm font-medium text-gray-700">
                  Watchlist
                </span>
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => navigate("/reports")}
                className="flex flex-col items-center gap-3 p-4 rounded-xl bg-gradient-to-br from-purple-50 to-pink-50 hover:from-purple-100 hover:to-pink-100 transition-colors border border-purple-100"
              >
                <BarChart3 className="w-6 h-6 text-purple-600" />
                <span className="text-sm font-medium text-gray-700">
                  Reports
                </span>
              </motion.button>
            </div>
          </motion.div>
        </div>

        {/* Recent Activity & Additional Stats */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent Activity */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="lg:col-span-2 bg-white/70 backdrop-blur-xl rounded-2xl shadow-lg border border-white/20 p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">
                Recent Activity
              </h3>
              <Clock className="w-5 h-5 text-gray-400" />
            </div>
            <div className="space-y-3">
              {stats.recentActivity.length > 0 ? (
                stats.recentActivity.map((activity) => (
                  <ActivityItem key={activity.id} activity={activity} />
                ))
              ) : (
                <p className="text-sm text-gray-500">
                  No recent activity yet. Start by running a search.
                </p>
              )}
            </div>
          </motion.div>

          {/* Additional Stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="space-y-6"
          >
            <div className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-lg border border-white/20 p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-orange-100">
                  <Zap className="w-5 h-5 text-orange-600" />
                </div>
                <h4 className="font-semibold text-gray-900">
                  Active Watchlist
                </h4>
              </div>
              <div className="text-3xl font-bold text-gray-900">
                {stats.activeWatchlist}
              </div>
              <p className="text-sm text-gray-600 mt-2">
                Technologies tracking
              </p>
            </div>

            <button
              onClick={() => navigate("/saved-papers")}
              className="w-full text-left bg-white/70 backdrop-blur-xl rounded-2xl shadow-lg border border-white/20 p-6 hover:shadow-xl transition-shadow"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-blue-100">
                  <Eye className="w-5 h-5 text-blue-600" />
                </div>
                <h4 className="font-semibold text-gray-900">Saved Papers</h4>
              </div>
              <div className="text-3xl font-bold text-gray-900">
                {stats.savedReports}
              </div>
              <p className="text-sm text-gray-600 mt-2">Research papers</p>
            </button>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
