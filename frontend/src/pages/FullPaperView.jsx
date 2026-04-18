import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { jsPDF } from "jspdf";
import {
  cleanText,
  processWordCloudData,
  formatYearMonthDay,
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
  Brain,
  Target,
  Lightbulb,
  AlertCircle,
  CheckCircle,
  Clock,
  Users,
} from "lucide-react";
import toast from "react-hot-toast";
import WordCloud from "../components/Charts/WordCloud";
import { isPaperSaved, toggleSavedPaper } from "../utils/savedPapers";

const FullPaperView = () => {
  const { paperId } = useParams();
  const navigate = useNavigate();
  const [paper, setPaper] = useState(null);
  const [loading, setLoading] = useState(true);
  const [wordCloudData, setWordCloudData] = useState([]);
  const [summary, setSummary] = useState("");
  const [highLevelAnalysis, setHighLevelAnalysis] = useState("");
  const [keyInsights, setKeyInsights] = useState([]);
  const [trlAssessment, setTrlAssessment] = useState("");
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

  const createFallbackWordCloudData = (text) => {
    const source = cleanText(text || "").toLowerCase();
    if (!source) return [];

    const stopWords = new Set([
      "the",
      "and",
      "for",
      "with",
      "that",
      "this",
      "from",
      "into",
      "were",
      "been",
      "have",
      "has",
      "had",
      "its",
      "their",
      "they",
      "also",
      "using",
      "use",
      "used",
      "study",
      "paper",
      "results",
      "method",
      "methods",
      "analysis",
      "approach",
      "based",
      "between",
      "than",
      "over",
      "under",
      "through",
      "about",
      "which",
      "when",
      "where",
      "what",
      "such",
      "can",
      "may",
      "more",
      "most",
      "into",
      "our",
      "your",
      "these",
      "those",
      "there",
      "very",
    ]);

    const wordFreq = {};
    source
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .forEach((token) => {
        if (token.length < 3 || stopWords.has(token)) return;
        wordFreq[token] = (wordFreq[token] || 0) + 1;
      });

    const fallbackWords = Object.entries(wordFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 60)
      .map(([word, count]) => ({ text: word, value: count, frequency: count }));

    return processWordCloudData(fallbackWords);
  };

  const fetchPaperDetails = async () => {
    try {
      setLoading(true);

      // Fetch paper details from backend
      const response = await axios.get(`/api/paper/${paperId}/`);
      setPaper(response.data);

      const abstractText = reconstructAbstract(response.data);
      const analysisText = cleanText(
        `${response.data.title || ""} ${abstractText || ""}`,
      );
      const hasAbstractText =
        cleanText(abstractText || "") !==
        "No abstract available for this paper.";

      // Generate analysis components
      if (analysisText && hasAbstractText) {
        generateWordCloud(analysisText);
        generateSummary(analysisText);
        generateHighLevelAnalysis(analysisText);
        generateKeyInsights(analysisText);
        generateTRLAssessment(analysisText);
      }
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

      const processed = processWordCloudData(response.data.words || []);
      if (processed.length > 0) {
        setWordCloudData(processed);
      } else {
        setWordCloudData(createFallbackWordCloudData(abstract));
      }
    } catch (error) {
      console.error("Error generating word cloud:", error);
      setWordCloudData(createFallbackWordCloudData(abstract));
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

  const generateHighLevelAnalysis = async (abstract) => {
    try {
      const response = await axios.post("/api/generate-analysis/", {
        text: abstract,
        type: "high_level_analysis",
      });
      setHighLevelAnalysis(response.data.analysis || "");
    } catch (error) {
      console.error("Error generating high-level analysis:", error);
    }
  };

  const generateKeyInsights = async (abstract) => {
    try {
      const response = await axios.post("/api/generate-insights/", {
        text: abstract,
      });
      setKeyInsights(response.data.insights || []);
    } catch (error) {
      console.error("Error generating key insights:", error);
    }
  };

  const generateTRLAssessment = async (abstract) => {
    try {
      const response = await axios.post("/api/generate-trl/", {
        text: abstract,
      });
      setTrlAssessment(response.data.trl || "");
    } catch (error) {
      console.error("Error generating TRL assessment:", error);
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

  const handleDownloadPdf = () => {
    if (!paper) {
      toast.error("Paper details are not available yet.");
      return;
    }

    try {
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 40;
      const maxTextWidth = pageWidth - margin * 2;
      let y = margin;

      const addSection = (heading, content) => {
        if (y > pageHeight - 120) {
          doc.addPage();
          y = margin;
        }

        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        doc.text(heading, margin, y);
        y += 18;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        const lines = doc.splitTextToSize(content || "N/A", maxTextWidth);
        lines.forEach((line) => {
          if (y > pageHeight - 80) {
            doc.addPage();
            y = margin;
          }
          doc.text(line, margin, y);
          y += 16;
        });

        y += 10;
      };

      const authors = (paper.authorships || [])
        .map((a) => a?.author?.display_name)
        .filter(Boolean)
        .join(", ");

      const abstractText = cleanText(reconstructAbstract(paper) || "");
      const summaryText = cleanText(summary || "");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      const titleLines = doc.splitTextToSize(
        cleanText(paper.title || "Untitled Paper"),
        maxTextWidth,
      );
      titleLines.forEach((line) => {
        if (y > pageHeight - 80) {
          doc.addPage();
          y = margin;
        }
        doc.text(line, margin, y);
        y += 24;
      });
      y += 6;

      addSection("Authors", authors || "Unknown Author");
      addSection("Publication Date", publicationDate || "N/A");
      addSection("Citations", String(paper.cited_by_count || 0));
      addSection("Abstract", abstractText || "No abstract available.");

      if (summaryText) {
        addSection("AI Summary", summaryText);
      }

      if (paper.primary_location?.landing_page_url) {
        addSection("Original Source", paper.primary_location.landing_page_url);
      }

      const fileBase =
        cleanText(paper.title || "paper")
          .replace(/[^a-z0-9\s_-]/gi, "")
          .trim()
          .replace(/\s+/g, "_")
          .slice(0, 80) || "paper";

      doc.save(`${fileBase}.pdf`);
      toast.success("PDF downloaded successfully.");
    } catch (error) {
      console.error("PDF generation error:", error);
      toast.error("Failed to generate PDF.");
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

  const renderFormattedText = (
    text,
    className = "text-gray-700 leading-relaxed text-base text-justify",
  ) => {
    const normalized = cleanText(text || "")
      .replace(/\r\n/g, "\n")
      .trim();
    if (!normalized) return null;

    const segments = normalized.split(/\n+/).filter(Boolean);

    const renderBoldInline = (line) => {
      const parts = [];
      const matcher = /\*\*(.*?)\*\*/g;
      let lastIndex = 0;
      let match;

      while ((match = matcher.exec(line)) !== null) {
        if (match.index > lastIndex) {
          parts.push(line.slice(lastIndex, match.index));
        }

        parts.push(
          <strong
            key={`bold-${match.index}`}
            className="font-semibold text-gray-900"
          >
            {match[1]}
          </strong>,
        );

        lastIndex = matcher.lastIndex;
      }

      if (lastIndex < line.length) {
        parts.push(line.slice(lastIndex));
      }

      return parts.length > 0 ? parts : line;
    };

    return (
      <div className="space-y-3">
        {segments.map((line, index) => (
          <p key={index} className={className}>
            {renderBoldInline(line)}
          </p>
        ))}
      </div>
    );
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
            className="mt-4 px-6 py-2 bg-gradient-to-r from-indigo-600 to-blue-700 text-white rounded-xl hover:from-indigo-700 hover:to-blue-800 transition-all duration-200"
          >
            Back to Search
          </button>
        </div>
      </div>
    );
  }

  const abstract = reconstructAbstract(paper);
  const publicationDate = formatYearMonthDay(
    paper.publication_date || paper.publication_year,
  );

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

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-3 space-y-6">
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
                  <span>{publicationDate}</span>
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

            {/* Full Abstract */}
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
                {renderFormattedText(abstract)}
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
                  {renderFormattedText(summary)}
                </div>
              </motion.div>
            )}

            {/* High-Level Analysis */}
            {highLevelAnalysis && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="bg-white/70 backdrop-blur-xl rounded-xl shadow-lg border border-white/20 p-6"
              >
                <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-indigo-600" />
                  High-Level Analysis
                </h2>
                <div className="bg-gradient-to-r from-purple-50 to-pink-50 p-4 rounded-xl border-l-4 border-purple-600">
                  {renderFormattedText(highLevelAnalysis)}
                </div>
              </motion.div>
            )}

            {/* Key Insights */}
            {keyInsights.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="bg-white/70 backdrop-blur-xl rounded-xl shadow-lg border border-white/20 p-6"
              >
                <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Lightbulb className="w-5 h-5 text-indigo-600" />
                  Key Insights
                </h2>
                <div className="space-y-3">
                  {keyInsights.map((insight, index) => (
                    <div
                      key={index}
                      className="flex items-start gap-3 p-3 bg-green-50 rounded-lg border-l-4 border-green-600"
                    >
                      <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                      <div className="text-sm leading-relaxed text-gray-700 text-justify flex-1">
                        {renderFormattedText(
                          insight,
                          "text-gray-700 text-sm leading-relaxed text-justify",
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Word Cloud */}
            {wordCloudData.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="bg-white/70 backdrop-blur-xl rounded-xl shadow-lg border border-white/20 p-6"
              >
                <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Target className="w-5 h-5 text-indigo-600" />
                  Keywords Analysis
                </h2>
                <div className="bg-gradient-to-r from-yellow-50 to-orange-50 p-4 rounded-xl">
                  <WordCloud words={wordCloudData} />
                </div>
              </motion.div>
            )}

            {/* TRL Assessment */}
            {trlAssessment && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className="bg-white/70 backdrop-blur-xl rounded-xl shadow-lg border border-white/20 p-6"
              >
                <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-indigo-600" />
                  Technology Readiness Level (TRL) Assessment
                </h2>
                <div className="bg-gradient-to-r from-red-50 to-orange-50 p-4 rounded-xl border-l-4 border-red-600">
                  {renderFormattedText(trlAssessment)}
                </div>
              </motion.div>
            )}
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            {/* Quick Actions */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-white/70 backdrop-blur-xl rounded-xl shadow-lg border border-white/20 p-6"
            >
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Quick Actions
              </h3>
              <div className="space-y-3">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleDownloadPdf}
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
                  Cite Paper
                </motion.button>
              </div>
            </motion.div>

            {/* Paper Metrics */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-white/70 backdrop-blur-xl rounded-xl shadow-lg border border-white/20 p-6"
            >
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Metrics
              </h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" />
                    Citations
                  </span>
                  <span className="font-semibold text-gray-900">
                    {paper.cited_by_count || 0}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600 flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Publication Year
                  </span>
                  <span className="font-semibold text-gray-900">
                    {publicationDate}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600 flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Authors
                  </span>
                  <span className="font-semibold text-gray-900">
                    {paper.authorships?.length || 0}
                  </span>
                </div>
              </div>
            </motion.div>

            {/* Processing Status */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-white/70 backdrop-blur-xl rounded-xl shadow-lg border border-white/20 p-6"
            >
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Analysis Status
              </h3>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-3 h-3 rounded-full ${summary ? "bg-green-500" : "bg-yellow-500"}`}
                  ></div>
                  <span className="text-sm text-gray-700">AI Summary</span>
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className={`w-3 h-3 rounded-full ${highLevelAnalysis ? "bg-green-500" : "bg-yellow-500"}`}
                  ></div>
                  <span className="text-sm text-gray-700">
                    High-Level Analysis
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className={`w-3 h-3 rounded-full ${keyInsights.length > 0 ? "bg-green-500" : "bg-yellow-500"}`}
                  ></div>
                  <span className="text-sm text-gray-700">Key Insights</span>
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className={`w-3 h-3 rounded-full ${wordCloudData.length > 0 ? "bg-green-500" : "bg-yellow-500"}`}
                  ></div>
                  <span className="text-sm text-gray-700">Word Cloud</span>
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className={`w-3 h-3 rounded-full ${trlAssessment ? "bg-green-500" : "bg-yellow-500"}`}
                  ></div>
                  <span className="text-sm text-gray-700">TRL Assessment</span>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FullPaperView;
