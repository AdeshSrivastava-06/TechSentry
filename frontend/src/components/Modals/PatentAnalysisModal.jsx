import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";
import {
  X,
  Calendar,
  Building,
  ExternalLink,
  FileText,
  Quote,
} from "lucide-react";
import WordCloud from "../Charts/WordCloud";
import {
  cleanText,
  getYear,
  processWordCloudData,
} from "../../utils/dataUtils";

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
  "method",
  "methods",
  "system",
  "apparatus",
  "device",
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
  "these",
  "those",
  "there",
  "very",
]);

const PatentAnalysisModal = ({ patent, onClose }) => {
  const [summary, setSummary] = useState("");
  const [wordCloudData, setWordCloudData] = useState([]);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [loadingWordCloud, setLoadingWordCloud] = useState(false);

  const abstractText = useMemo(
    () => cleanText(patent?.abstract || ""),
    [patent],
  );
  const analysisText = useMemo(() => {
    const title = cleanText(patent?.title || "");
    return cleanText(`${title} ${abstractText}`.trim());
  }, [patent, abstractText]);

  const createFallbackWordCloudData = (text) => {
    const source = cleanText(text || "").toLowerCase();
    if (!source) return [];

    const counts = {};
    source
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .forEach((token) => {
        if (token.length < 3 || stopWords.has(token)) return;
        counts[token] = (counts[token] || 0) + 1;
      });

    const words = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 60)
      .map(([word, count]) => ({ text: word, value: count, frequency: count }));

    return processWordCloudData(words);
  };

  useEffect(() => {
    if (!patent) return;

    const fallbackSummary =
      abstractText ||
      cleanText(patent.title || "") ||
      "No summary available for this patent.";
    const fallbackWithPeriod = fallbackSummary.endsWith(".")
      ? fallbackSummary
      : `${fallbackSummary}.`;

    const generateSummary = async () => {
      if (!analysisText) {
        setSummary(fallbackWithPeriod);
        return;
      }

      setLoadingSummary(true);
      try {
        const response = await axios.post("/api/generate-summary/", {
          text: analysisText,
        });
        const generated = cleanText(response?.data?.summary || "").trim();
        setSummary(generated || fallbackWithPeriod);
      } catch (error) {
        console.error("Error generating patent summary:", error);
        setSummary(fallbackWithPeriod);
      } finally {
        setLoadingSummary(false);
      }
    };

    const generateWordCloud = async () => {
      if (!analysisText) {
        setWordCloudData(createFallbackWordCloudData(fallbackSummary));
        return;
      }

      setLoadingWordCloud(true);
      try {
        const response = await axios.post("/api/generate-wordcloud/", {
          text: analysisText,
        });
        const processed = processWordCloudData(response?.data?.words || []);
        setWordCloudData(
          processed.length > 0
            ? processed
            : createFallbackWordCloudData(analysisText),
        );
      } catch (error) {
        console.error("Error generating patent word cloud:", error);
        setWordCloudData(createFallbackWordCloudData(analysisText));
      } finally {
        setLoadingWordCloud(false);
      }
    };

    setSummary("");
    setWordCloudData([]);
    generateSummary();
    generateWordCloud();
  }, [patent, analysisText, abstractText]);

  if (!patent) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-50 p-4 md:p-6"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 16 }}
          className="max-w-5xl mx-auto bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-4 p-6 border-b border-gray-200">
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-gray-900 mb-3">
                {cleanText(patent.title || "Untitled Patent")}
              </h2>
              <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
                {patent.publication_date && (
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="w-4 h-4" />
                    {getYear(patent.publication_date)}
                  </span>
                )}
                {patent.assignee && (
                  <span className="inline-flex items-center gap-1.5">
                    <Building className="w-4 h-4" />
                    {cleanText(patent.assignee)}
                  </span>
                )}
                {patent.patent_number && (
                  <span className="inline-flex items-center gap-1.5">
                    <Quote className="w-4 h-4" />
                    {cleanText(patent.patent_number)}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {patent.url && (
                <a
                  href={patent.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100"
                >
                  <ExternalLink className="w-4 h-4" />
                  View Patent
                </a>
              )}
              <button
                onClick={onClose}
                className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="p-6 overflow-y-auto space-y-6">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <h3 className="text-base font-semibold text-gray-900 mb-2 inline-flex items-center gap-2">
                <FileText className="w-4 h-4" />
                AI Summary
              </h3>
              {loadingSummary ? (
                <div className="text-sm text-gray-500">
                  Generating summary...
                </div>
              ) : (
                <p className="text-gray-700 leading-relaxed">
                  {summary || "No summary available for this patent."}
                </p>
              )}
            </div>

            <div>
              {loadingWordCloud && wordCloudData.length === 0 ? (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-gray-500">
                  Generating word cloud...
                </div>
              ) : (
                <WordCloud words={wordCloudData} title="Patent Keyword Cloud" />
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default PatentAnalysisModal;
