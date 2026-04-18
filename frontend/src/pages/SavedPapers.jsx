import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Bookmark, ExternalLink, Trash2, Calendar, User } from "lucide-react";
import {
  getSavedPapers,
  subscribeToSavedPapersUpdates,
  toggleSavedPaper,
} from "../utils/savedPapers";
import toast from "react-hot-toast";

const SavedPapers = () => {
  const navigate = useNavigate();
  const [savedPapers, setSavedPapers] = useState([]);

  useEffect(() => {
    const refreshSavedPapers = () => {
      setSavedPapers(getSavedPapers());
    };

    refreshSavedPapers();
    const unsubscribe = subscribeToSavedPapersUpdates(refreshSavedPapers);
    return unsubscribe;
  }, []);

  const formatDate = (value) => {
    if (!value) return "N/A";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString();
  };

  const handleRemove = (paper) => {
    toggleSavedPaper({ paperId: paper.paperId });
    toast.success("Removed from saved papers");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Saved Papers
          </h1>
          <p className="text-gray-600">
            View and manage papers you bookmarked.
          </p>
        </div>

        {savedPapers.length === 0 ? (
          <div className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-lg border border-white/20 p-10 text-center">
            <Bookmark className="w-14 h-14 text-gray-300 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              No saved papers yet
            </h2>
            <p className="text-gray-600 mb-6">
              Save papers from the detailed view to see them listed here.
            </p>
            <button
              onClick={() => navigate("/search")}
              className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-blue-700 text-white rounded-xl hover:from-indigo-700 hover:to-blue-800 transition-all duration-200"
            >
              Go to Search
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {savedPapers.map((paper) => (
              <motion.div
                key={paper.paperId}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-lg border border-white/20 p-6"
              >
                <h3 className="text-lg font-semibold text-gray-900 mb-3 line-clamp-2">
                  {paper.title || "Untitled Paper"}
                </h3>

                <div className="space-y-2 text-sm text-gray-600 mb-5">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4" />
                    <span className="line-clamp-1">
                      {Array.isArray(paper.authors) && paper.authors.length > 0
                        ? paper.authors.join(", ")
                        : "Unknown Author"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    <span>{formatDate(paper.publication_date)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() =>
                      navigate(
                        `/full-paper/${encodeURIComponent(paper.paperId)}`,
                      )
                    }
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-100 text-indigo-700 rounded-xl hover:bg-indigo-200 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Open Paper
                  </button>

                  <button
                    onClick={() => handleRemove(paper)}
                    className="flex items-center gap-2 px-4 py-2 bg-red-100 text-red-700 rounded-xl hover:bg-red-200 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Remove
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SavedPapers;
