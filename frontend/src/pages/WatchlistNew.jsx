import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { formatDate, cleanText, formatReadableDate } from "../utils/dataUtils";
import {
  Bookmark,
  Plus,
  Trash2,
  ExternalLink,
  Activity,
  TrendingUp,
  FileText,
  RefreshCw,
  Bell,
  Search,
  Building,
  Globe,
  Calendar,
} from "lucide-react";
import toast from "react-hot-toast";
import { logActivity } from "../utils/activityLog";

const Watchlist = () => {
  const navigate = useNavigate();
  const [showAddModal, setShowAddModal] = useState(false);
  const [newItem, setNewItem] = useState({
    technology: "",
    query: "",
  });

  const queryClient = useQueryClient();

  const {
    data: watchlist,
    isLoading,
    isFetching,
    refetch,
    isError,
    error: watchlistError,
  } = useQuery({
    queryKey: ["watchlist"],
    queryFn: async () => {
      const response = await axios.get("/api/watchlist/");
      return response.data;
    },
  });

  const addToWatchlistMutation = useMutation({
    mutationFn: async (item) => {
      const response = await axios.post("/api/watchlist/add/", item);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["watchlist"] });
      const technologyName = String(newItem.technology || "").trim();
      if (technologyName) {
        logActivity({
          type: "watchlist",
          description: `Added "${technologyName}" to watchlist`,
        });
      }
      setShowAddModal(false);
      setNewItem({ technology: "", query: "" });
      toast.success(data?.message || "Technology added to watchlist!");
    },
    onError: (error) => {
      const message =
        error?.response?.data?.detail ||
        error?.response?.data?.error ||
        "Failed to add technology to watchlist";
      toast.error(message);
    },
  });

  const removeFromWatchlistMutation = useMutation({
    mutationFn: async (item) => {
      const response = await axios.delete(`/api/watchlist/${item.id}/`);
      return response.data;
    },
    onSuccess: (_, item) => {
      queryClient.invalidateQueries({ queryKey: ["watchlist"] });
      const technologyName = String(item?.technology || "").trim();
      if (technologyName) {
        logActivity({
          type: "watchlist",
          description: `Removed "${technologyName}" from watchlist`,
        });
      }
      toast.success("Removed from watchlist");
    },
    onError: (error) => {
      const message =
        error?.response?.data?.detail ||
        error?.response?.data?.error ||
        "Failed to remove from watchlist";
      toast.error(message);
    },
  });

  const handleAddToWatchlist = () => {
    const technology = newItem.technology.trim();
    const query = (newItem.query || newItem.technology).trim();

    if (!technology) {
      toast.error("Please enter a technology name");
      return;
    }

    addToWatchlistMutation.mutate({
      technology,
      query,
    });
  };

  const handleRemove = (item) => {
    removeFromWatchlistMutation.mutate(item);
  };

  const handleRefresh = async () => {
    if (isFetching) return;

    try {
      const result = await refetch();
      if (result.error) {
        throw result.error;
      }
      toast.success("Watchlist refreshed");
    } catch (error) {
      const message =
        error?.response?.data?.detail ||
        error?.message ||
        "Failed to refresh watchlist";
      toast.error(message);
    }
  };

  const defaultWatchlist = [
    {
      id: "seed-quantum-computing",
      technology: "Quantum Computing",
      query: "quantum computing",
      added_date: "2026-01-15",
      last_updated: "2026-03-20",
      papers_count: 245,
      patents_count: 89,
      companies_count: 34,
      trending: true,
      isSeed: true,
    },
    {
      id: "seed-artificial-intelligence",
      technology: "Artificial Intelligence",
      query: "artificial intelligence",
      added_date: "2026-01-10",
      last_updated: "2026-03-22",
      papers_count: 1823,
      patents_count: 456,
      companies_count: 234,
      trending: true,
      isSeed: true,
    },
    {
      id: "seed-blockchain-technology",
      technology: "Blockchain Technology",
      query: "blockchain",
      added_date: "2026-01-08",
      last_updated: "2026-03-19",
      papers_count: 567,
      patents_count: 123,
      companies_count: 89,
      trending: false,
      isSeed: true,
    },
  ];

  const normalizedWatchlist = (watchlist || []).map((item) => ({
    id: item.id,
    technology: item.technology,
    query: item.query || item.technology,
    added_date: item.added_date || item.last_updated,
    last_updated: item.last_updated,
    papers_count: Number(item.papers_count ?? item.new_papers_count ?? 0),
    patents_count: Number(item.patents_count ?? item.new_patents_count ?? 0),
    companies_count: Number(item.companies_count ?? 0),
    trending: Boolean(
      item.trending ??
      (Number(item.new_papers_count || 0) > 0 ||
        Number(item.new_patents_count || 0) > 0),
    ),
    isSeed: false,
  }));

  const existingTech = new Set(
    normalizedWatchlist.map((item) =>
      String(item.technology || "").toLowerCase(),
    ),
  );
  const mergedWatchlist = [
    ...defaultWatchlist.filter(
      (item) => !existingTech.has(String(item.technology || "").toLowerCase()),
    ),
    ...normalizedWatchlist,
  ];

  const WatchlistCard = ({ item }) => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white/70 backdrop-blur-xl rounded-xl shadow-lg border border-white/20 p-6 hover:shadow-xl transition-all duration-300"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {item.technology}
          </h3>
          <div className="flex items-center gap-4 text-sm text-gray-600">
            <span className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              Added {formatReadableDate(item.added_date)}
            </span>
            {item.trending && (
              <span className="flex items-center gap-1 text-green-600">
                <TrendingUp className="w-4 h-4" />
                Trending
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() =>
              window.open(
                `/search?q=${encodeURIComponent(item.query)}`,
                "_blank",
              )
            }
            className="p-2 rounded-lg bg-indigo-100 text-indigo-600 hover:bg-indigo-200 transition-colors"
          >
            <Search className="w-4 h-4" />
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => {
              if (item.isSeed) {
                toast.info(
                  "Default cards are examples. Add your own technology to manage it.",
                );
                return;
              }
              handleRemove(item);
            }}
            className={`p-2 rounded-lg transition-colors ${item.isSeed ? "bg-gray-100 text-gray-400 cursor-not-allowed" : "bg-red-100 text-red-600 hover:bg-red-200"}`}
          >
            <Trash2 className="w-4 h-4" />
          </motion.button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="text-center p-3 bg-blue-50 rounded-lg">
          <FileText className="w-5 h-5 text-blue-600 mx-auto mb-1" />
          <div className="text-2xl font-bold text-blue-900">
            {Number(item.papers_count || 0).toLocaleString()}
          </div>
          <div className="text-xs text-blue-700">Papers</div>
        </div>
        <div className="text-center p-3 bg-green-50 rounded-lg">
          <Bookmark className="w-5 h-5 text-green-600 mx-auto mb-1" />
          <div className="text-2xl font-bold text-green-900">
            {Number(item.patents_count || 0).toLocaleString()}
          </div>
          <div className="text-xs text-green-700">Patents</div>
        </div>
        <div className="text-center p-3 bg-purple-50 rounded-lg">
          <Building className="w-5 h-5 text-purple-600 mx-auto mb-1" />
          <div className="text-2xl font-bold text-purple-900">
            {Number(item.companies_count || 0).toLocaleString()}
          </div>
          <div className="text-xs text-purple-700">Companies</div>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Last updated 5 days ago</span>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() =>
              navigate(`/insights?tech=${encodeURIComponent(item.technology)}`)
            }
            className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition-colors text-sm font-medium"
          >
            View Insights
          </motion.button>
        </div>
      </div>
    </motion.div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-xl border-b border-white/20 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                Technology Watchlist
              </h1>
              <p className="text-gray-600">
                Monitor technologies and track research trends
              </p>
            </div>

            <div className="flex items-center gap-3">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleRefresh}
                disabled={isFetching}
                className="flex items-center gap-2 px-4 py-2 bg-white/70 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <RefreshCw
                  className={`w-4 h-4 text-gray-600 ${isFetching ? "animate-spin" : ""}`}
                />
                {isFetching ? "Refreshing..." : "Refresh"}
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-blue-700 text-white rounded-xl hover:from-indigo-700 hover:to-blue-800 transition-all duration-200 shadow-lg"
              >
                <Plus className="w-4 h-4" />
                Add Technology
              </motion.button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {isError && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-700 text-sm">
            Could not load your saved watchlist from server. Showing default
            examples only. {watchlistError?.response?.data?.detail || ""}
          </div>
        )}
        {isLoading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          </div>
        ) : mergedWatchlist.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {mergedWatchlist.map((item) => (
              <WatchlistCard
                key={`${item.isSeed ? "seed" : "db"}-${item.id}`}
                item={item}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <Bookmark className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Your Watchlist is Empty
            </h3>
            <p className="text-gray-600 mb-6">
              Start adding technologies to monitor their research progress.
            </p>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-600 to-blue-700 text-white rounded-xl hover:from-indigo-700 hover:to-blue-800 transition-all duration-200 shadow-lg mx-auto"
            >
              <Plus className="w-5 h-5" />
              Add Your First Technology
            </motion.button>
          </div>
        )}
      </div>

      {/* Add Modal */}
      <AnimatePresence>
        {showAddModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/50 z-50"
              onClick={() => setShowAddModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[60] flex items-center justify-center p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/20 p-6 w-full max-w-md">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-gray-900">
                    Add Technology
                  </h2>
                  <button
                    onClick={() => setShowAddModal(false)}
                    className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <Trash2 className="w-5 h-5 text-gray-600" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Technology Name
                    </label>
                    <input
                      type="text"
                      value={newItem.technology}
                      onChange={(e) =>
                        setNewItem((prev) => ({
                          ...prev,
                          technology: e.target.value,
                        }))
                      }
                      placeholder="e.g., Quantum Computing"
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white/50 backdrop-blur-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Search Query (Optional)
                    </label>
                    <input
                      type="text"
                      value={newItem.query}
                      onChange={(e) =>
                        setNewItem((prev) => ({
                          ...prev,
                          query: e.target.value,
                        }))
                      }
                      placeholder="Custom search terms..."
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white/50 backdrop-blur-sm"
                    />
                  </div>
                </div>

                <div className="flex gap-3 mt-6">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setShowAddModal(false)}
                    className="flex-1 px-4 py-3 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors text-gray-700"
                  >
                    Cancel
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleAddToWatchlist}
                    disabled={addToWatchlistMutation.isPending}
                    className="flex-1 px-4 py-3 bg-gradient-to-r from-indigo-600 to-blue-700 text-white rounded-xl hover:from-indigo-700 hover:to-blue-800 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {addToWatchlistMutation.isPending
                      ? "Adding..."
                      : "Add to Watchlist"}
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Watchlist;
