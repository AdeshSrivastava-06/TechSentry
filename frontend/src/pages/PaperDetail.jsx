import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import {
  formatDate,
  cleanText,
  processWordCloudData,
} from "../utils/dataUtils";
import {
  ArrowLeft,
  ExternalLink,
  Bookmark,
  Share2,
  Download,
  FileText,
  Calendar,
  User,
  Quote,
  TrendingUp,
  BarChart3,
  Users,
  Globe,
} from "lucide-react";
import toast from "react-hot-toast";
import WordCloud from "../components/Charts/WordCloud";
import { isPaperSaved, toggleSavedPaper } from "../utils/savedPapers";

const PaperDetail = () => {
  const { paperId } = useParams();
  const navigate = useNavigate();
  const [paper, setPaper] = useState(null);
  const [loading, setLoading] = useState(true);
  const [wordCloudData, setWordCloudData] = useState([]);
  const [summary, setSummary] = useState("");
  const [relatedPapers, setRelatedPapers] = useState([]);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    if (paperId) {
      fetchPaperDetails();
    }
  }, [paperId]);

  useEffect(() => {
    if (!paper) return;
    setIsSaved(isPaperSaved(paper.id || paperId));
  }, [paper, paperId]);

  const fetchPaperDetails = async () => {
    try {
      setLoading(true);

      // Fetch paper details from backend
      const response = await axios.get(`/api/paper/${paperId}/`);
      setPaper(response.data);

      // Generate word cloud from abstract
      if (response.data.abstract) {
        generateWordCloud(response.data.abstract);
      }

      // Generate summary using HuggingFace
      generateSummary(response.data.abstract);

      // Fetch related papers
      fetchRelatedPapers(response.data.title);
    } catch (error) {
      console.error("Error fetching paper details:", error);
      toast.error("Failed to load paper details");
    } finally {
      setLoading(false);
    }
  };

  const generateWordCloud = async (abstract) => {
    try {
      const response = await axios.post("/api/generate-wordcloud/", {
        text: cleanText(abstract),
      });
      setWordCloudData(processWordCloudData(response.data.words || []));
    } catch (error) {
      console.error("Error generating word cloud:", error);
    }
  };

  const generateSummary = async (abstract) => {
    const fallbackSummary = cleanText(abstract || "").trim();
    try {
      const response = await axios.post("/api/generate-summary/", {
        text: cleanText(abstract),
      });
      const summaryText = cleanText(response?.data?.summary || "").trim();
      if (summaryText) {
        setSummary(summaryText);
      } else if (fallbackSummary) {
        setSummary(
          `${fallbackSummary}${fallbackSummary.endsWith(".") ? "" : "."}`,
        );
      }
    } catch (error) {
      console.error("Error generating summary:", error);
      if (fallbackSummary) {
        setSummary(
          `${fallbackSummary}${fallbackSummary.endsWith(".") ? "" : "."}`,
        );
      }
    }
  };

  const fetchRelatedPapers = async (title) => {
    try {
      const response = await axios.get(
        `/api/search/?q=${encodeURIComponent(title)}&type=papers&limit=5`,
      );
      setRelatedPapers(response.data.papers || []);
    } catch (error) {
      console.error("Error fetching related papers:", error);
    }
  };

  const handleSave = () => {
    if (!paper) return;

    const result = toggleSavedPaper({
      paperId: paper.id || paperId,
      title: paper.title || "Untitled Paper",
      authors: (paper.authorships || [])
        .map((a) => a?.author?.display_name)
        .filter(Boolean),
      publication_date:
        paper.publication_date || paper.publication_year || null,
      cited_by_count: paper.cited_by_count || 0,
      source_url: paper.primary_location?.landing_page_url || "",
      saved_at: new Date().toISOString(),
    });

    setIsSaved(result.saved);
    toast.success(
      result.saved ? "Paper saved successfully!" : "Removed from saved papers",
    );
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: paper?.title,
        text: `Check out this research paper: ${paper?.title}`,
        url: window.location.href,
      });
    } else {
      navigator.clipboard.writeText(window.location.href);
      toast.success("Link copied to clipboard!");
    }
  };

  const reconstructAbstract = (paper) => {
    if (paper.abstract) return paper.abstract;

    if (paper.abstract_inverted_index) {
      const invertedIndex = paper.abstract_inverted_index;
      const abstractWords = [];

      const sortedPositions = Object.keys(invertedIndex)
        .map((pos) => parseInt(pos))
        .sort((a, b) => a - b);

      sortedPositions.forEach((pos) => {
        const words = invertedIndex[pos.toString()];
        abstractWords.push(...words);
      });

      return abstractWords.join(" ");
    }

    return "No abstract available for this paper.";
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="text-gray-600 mt-4">Loading paper details...</p>
        </div>
      </div>
    );
  }

  if (!paper) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            Paper Not Found
          </h3>
          <p className="text-gray-600">
            The requested paper could not be found.
          </p>
          <button
            onClick={() => navigate("/search")}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors mt-4"
          >
            Back to Search
          </button>
        </div>
      </div>
    );
  }

  const abstract = reconstructAbstract(paper);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Results</span>
          </button>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Paper Title and Meta */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white/70 backdrop-blur-xl rounded-xl shadow-lg border border-white/20 p-6"
            >
              <h1 className="text-2xl font-bold text-gray-900 mb-4">
                {paper.title}
              </h1>

              <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 mb-6">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4" />
                  <span>
                    {paper.authorships?.[0]?.author?.display_name ||
                      "Unknown Author"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  <span>{paper.publication_year}</span>
                </div>
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  <span>{paper.cited_by_count || 0} citations</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleSave}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-200 ${
                    isSaved
                      ? "bg-yellow-100 text-yellow-700 hover:bg-yellow-200"
                      : "bg-indigo-100 text-indigo-700 hover:bg-indigo-200"
                  }`}
                >
                  <Bookmark className="w-4 h-4" />
                  {isSaved ? "Saved" : "Save Paper"}
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleShare}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors"
                >
                  <Share2 className="w-4 h-4" />
                  Share
                </motion.button>

                {paper.primary_location?.landing_page_url && (
                  <motion.a
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    href={paper.primary_location.landing_page_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-blue-700 text-white rounded-xl hover:from-indigo-700 hover:to-blue-800 transition-all duration-200"
                  >
                    <ExternalLink className="w-4 h-4" />
                    View Original
                  </motion.a>
                )}
              </div>
            </motion.div>

            {/* Abstract */}
            {abstract && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-white/70 backdrop-blur-xl rounded-xl shadow-lg border border-white/20 p-6"
              >
                <h2 className="text-xl font-semibold text-gray-900 mb-4">
                  Full Abstract
                </h2>
                <div className="prose prose-sm max-w-none">
                  <p className="text-gray-700 leading-relaxed text-base">
                    {cleanText(abstract)}
                  </p>
                </div>
              </motion.div>
            )}

            {/* AI Summary */}
            {summary && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="bg-white/70 backdrop-blur-xl rounded-xl shadow-lg border border-white/20 p-6"
              >
                <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Brain className="w-5 h-5 text-indigo-600" />
                  AI Summary
                </h2>
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-xl border-l-4 border-indigo-600">
                  <p className="text-gray-700 leading-relaxed text-base">
                    {cleanText(summary)}
                  </p>
                </div>
              </motion.div>
            )}

            {/* Word Cloud */}
            {wordCloudData.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="bg-white/70 backdrop-blur-xl rounded-xl shadow-lg border border-white/20 p-6"
              >
                <h2 className="text-xl font-semibold text-gray-900 mb-4">
                  Keywords Analysis
                </h2>
                <WordCloud words={wordCloudData} />
              </motion.div>
            )}

            {/* Related Papers */}
            {relatedPapers.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="bg-white/70 backdrop-blur-xl rounded-xl shadow-lg border border-white/20 p-6"
              >
                <h2 className="text-xl font-semibold text-gray-900 mb-4">
                  Related Papers
                </h2>
                <div className="space-y-4">
                  {relatedPapers.slice(0, 5).map((relatedPaper) => (
                    <div
                      key={relatedPaper.id}
                      className="border-l-4 border-indigo-600 pl-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() =>
                        window.open(`/paper/${relatedPaper.id}`, "_blank")
                      }
                    >
                      <h3 className="font-medium text-gray-900 mb-2">
                        {relatedPaper.title}
                      </h3>
                      <div className="text-sm text-gray-600">
                        {relatedPaper.publication_year} •{" "}
                        {relatedPaper.cited_by_count || 0} citations
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            {/* Authors */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-white/70 backdrop-blur-xl rounded-xl shadow-lg border border-white/20 p-6"
            >
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Authors
              </h3>
              <div className="space-y-2">
                {paper.authorships?.slice(0, 5).map((authorship, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center">
                      <User className="w-4 h-4 text-indigo-600" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-900">
                        {authorship.author?.display_name || "Unknown Author"}
                      </p>
                      {authorship.institutions &&
                        authorship.institutions.length > 0 && (
                          <p className="text-xs text-gray-600">
                            {authorship.institutions[0].display_name}
                          </p>
                        )}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Quick Actions */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-white/70 backdrop-blur-xl rounded-xl shadow-lg border border-white/20 p-6"
            >
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Quick Actions
              </h3>
              <div className="space-y-3">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-indigo-100 text-indigo-700 rounded-xl hover:bg-indigo-200 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Download PDF
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-green-100 text-green-700 rounded-xl hover:bg-green-200 transition-colors"
                >
                  <Quote className="w-4 h-4" />
                  Generate Citation
                </motion.button>
              </div>
            </motion.div>

            {/* Paper Metrics */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 }}
              className="bg-white/70 backdrop-blur-xl rounded-xl shadow-lg border border-white/20 p-6"
            >
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Metrics
              </h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Citations</span>
                  <span className="font-semibold text-gray-900">
                    {paper.cited_by_count || 0}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Publication Year</span>
                  <span className="font-semibold text-gray-900">
                    {paper.publication_year}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Authors</span>
                  <span className="font-semibold text-gray-900">
                    {paper.authorships?.length || 0}
                  </span>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaperDetail;
