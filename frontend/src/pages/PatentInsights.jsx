import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { jsPDF } from "jspdf";
import {
  ArrowLeft,
  Calendar,
  Building,
  ExternalLink,
  FileText,
  Quote,
  Download,
  Sparkles,
} from "lucide-react";
import toast from "react-hot-toast";
import WordCloud from "../components/Charts/WordCloud";
import { cleanText, getYear, processWordCloudData } from "../utils/dataUtils";

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

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizePunctuation = (text) =>
  cleanText(text || "")
    .replace(/\s{2,}/g, " ")
    .replace(/\.\s*\.\s*\.+/g, ".")
    .trim();

const splitIntoSummaryUnits = (text) => {
  const normalized = normalizePunctuation(text || "");
  if (!normalized) return [];

  let units = normalized
    .split(/(?<=[.!?;])\s+|\s+-\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 20);

  // Some patent content arrives as long clauses without periods.
  if (units.length < 6) {
    units = units
      .flatMap((part) =>
        part
          .split(/,\s+|\s+which\s+|\s+including\s+|\s+wherein\s+/i)
          .map((piece) => piece.trim())
          .filter((piece) => piece.length > 20),
      )
      .filter(Boolean);
  }

  const seen = new Set();
  return units.filter((unit) => {
    const normalizedKey = unit
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .trim();
    if (!normalizedKey || seen.has(normalizedKey)) return false;
    seen.add(normalizedKey);
    return true;
  });
};

const toWordSet = (text) =>
  new Set(
    normalizePunctuation(text || "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 2 && !stopWords.has(token)),
  );

const jaccardSimilarity = (a, b) => {
  const setA = toWordSet(a);
  const setB = toWordSet(b);
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection += 1;
  }

  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
};

const pickTopKeywords = (text, limit = 6) => {
  const freq = {};
  normalizePunctuation(text || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .forEach((token) => {
      if (token.length < 4 || stopWords.has(token)) return;
      freq[token] = (freq[token] || 0) + 1;
    });

  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([token]) => token);
};

const compactSentence = (text) =>
  stripTrailingEllipsis(text || "")
    .replace(/^\W+/, "")
    .replace(/\s+/g, " ")
    .trim();

const isRepetitiveSummary = (text) => {
  const normalized = normalizePunctuation(text || "").toLowerCase();
  if (!normalized) return true;

  const units = splitIntoSummaryUnits(normalized);
  if (units.length < 4) return true;

  let nearDuplicatePairs = 0;
  for (let i = 0; i < units.length; i += 1) {
    for (let j = i + 1; j < units.length; j += 1) {
      if (jaccardSimilarity(units[i], units[j]) > 0.72) {
        nearDuplicatePairs += 1;
      }
    }
  }

  return nearDuplicatePairs >= 2;
};

const stripTrailingEllipsis = (text) => {
  const value = normalizePunctuation(text || "");
  return value.replace(/(\s*\.\.\.|\s*…)+\s*$/g, "").trim();
};

const PatentInsights = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { patentId } = useParams();

  const [patent, setPatent] = useState(null);
  const [summary, setSummary] = useState("");
  const [wordCloudData, setWordCloudData] = useState([]);
  const [enrichedPatentText, setEnrichedPatentText] = useState("");
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [loadingWordCloud, setLoadingWordCloud] = useState(false);

  useEffect(() => {
    const fromState = location.state?.patent;
    if (fromState) {
      setPatent(fromState);
      try {
        sessionStorage.setItem(
          `patent-insights:${patentId}`,
          JSON.stringify(fromState),
        );
      } catch (error) {
        console.error("Failed to cache patent for insights page:", error);
      }
      return;
    }

    try {
      const raw = sessionStorage.getItem(`patent-insights:${patentId}`);
      if (raw) {
        setPatent(JSON.parse(raw));
      }
    } catch (error) {
      console.error("Failed to load cached patent for insights page:", error);
    }
  }, [location.state, patentId]);

  const abstractText = useMemo(
    () => cleanText(patent?.abstract || ""),
    [patent],
  );

  const sourceText = useMemo(() => {
    const candidates = [
      patent?.title,
      patent?.abstract,
      patent?.summary,
      patent?.snippet,
      patent?.description,
      patent?.claims,
      patent?.claim_text,
      patent?.full_text,
      patent?.pdf_text,
    ];

    return normalizePunctuation(
      candidates
        .map((value) => cleanText(String(value || "")).trim())
        .filter(Boolean)
        .join(" "),
    );
  }, [patent]);

  const analysisText = useMemo(() => {
    const title = cleanText(patent?.title || "");
    return normalizePunctuation(
      `${title} ${enrichedPatentText || sourceText || abstractText}`.trim(),
    );
  }, [patent, abstractText, sourceText, enrichedPatentText]);

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

  const createReadableSummary = (text) => {
    const normalized = stripTrailingEllipsis(text || "");
    if (!normalized) return "No summary available for this patent.";

    const sentences = splitIntoSummaryUnits(normalized);

    if (sentences.length === 0) {
      return `${normalized}${normalized.endsWith(".") ? "" : "."}`;
    }

    const minSentences = normalized.length > 1200 ? 8 : 6;
    const targetSentences = normalized.length > 1800 ? 10 : 8;
    const maxSentences = normalized.length > 3200 ? 12 : 10;
    const minCharacters = normalized.length > 1500 ? 950 : 720;
    const maxCharacters = normalized.length > 2800 ? 3200 : 2400;

    const selected = [];
    let totalLength = 0;

    for (const sentence of sentences) {
      selected.push(sentence);
      totalLength += sentence.length;
      const reachedTarget =
        selected.length >= targetSentences && totalLength >= minCharacters;

      if (
        reachedTarget ||
        selected.length >= maxSentences ||
        totalLength >= maxCharacters
      ) {
        break;
      }
    }

    if (selected.length < minSentences && sentences.length > selected.length) {
      for (const sentence of sentences.slice(selected.length)) {
        if (selected.length >= minSentences) break;
        selected.push(sentence);
      }
    }

    const textSummary = selected.join(" ").trim();
    if (!textSummary) {
      return `${normalized}${normalized.endsWith(".") ? "" : "."}`;
    }

    const cleanedSummary = stripTrailingEllipsis(textSummary);
    return `${cleanedSummary}${cleanedSummary.endsWith(".") ? "" : "."}`;
  };

  const createStructuredPatentSummary = (source, patentData) => {
    const normalized = normalizePunctuation(source || "");
    if (!normalized) {
      return "No summary available for this patent.";
    }

    const title = cleanText(patentData?.title || "this patent");
    const assignee = cleanText(patentData?.assignee || "");
    const year = getYear(patentData?.publication_date || "") || "";

    const units = splitIntoSummaryUnits(normalized);
    const uniqueUnits = [];
    for (const unit of units) {
      if (
        uniqueUnits.some((existing) => jaccardSimilarity(existing, unit) > 0.65)
      ) {
        continue;
      }
      uniqueUnits.push(unit);
      if (uniqueUnits.length >= 12) break;
    }

    const keywords = pickTopKeywords(normalized, 7);
    const contextLine = [
      `${title} describes a technical solution`,
      assignee ? `by ${assignee}` : "",
      year && year !== "N/A" && year !== "Invalid Date"
        ? `published in ${year}`
        : "",
      "for improving communication reliability and machine-learning-enabled network behavior.",
    ]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    const problemLine =
      compactSentence(uniqueUnits[0]) ||
      "The filing addresses limitations in current network signaling, throughput stability, and deployment robustness.";
    const methodLine1 =
      compactSentence(uniqueUnits[1]) ||
      "It proposes an architecture that combines adaptive control logic with coordinated connectivity management.";
    const methodLine2 =
      compactSentence(uniqueUnits[2]) ||
      "The method organizes how communication events are configured, interpreted, and reported across the system.";
    const implementationLine =
      compactSentence(uniqueUnits[3]) ||
      "Implementation details indicate a practical pathway from conceptual design to deployable operation.";
    const operationLine =
      compactSentence(uniqueUnits[4]) ||
      "Operationally, the design supports consistent behavior under variable traffic and multi-link conditions.";
    const impactLine =
      keywords.length > 0
        ? `Key technical themes include ${keywords.slice(0, 5).join(", ")}, which indicate emphasis on scalable and resilient performance outcomes.`
        : "Overall, the patent points to scalable and resilient performance improvements in real-world deployments.";

    const composed = [
      contextLine,
      problemLine,
      methodLine1,
      methodLine2,
      implementationLine,
      operationLine,
      compactSentence(uniqueUnits[5] || ""),
      compactSentence(uniqueUnits[6] || ""),
      impactLine,
    ].filter((line) => line && line.length > 20);

    const summaryText = composed.join(" ").trim();
    return `${stripTrailingEllipsis(summaryText)}${summaryText.endsWith(".") ? "" : "."}`;
  };

  const ensureVisibleFullSummary = (candidateSummary, source) => {
    const candidate = stripTrailingEllipsis(candidateSummary || "");
    const sourceSummary = createStructuredPatentSummary(source || "", patent);
    const sourceUnits = splitIntoSummaryUnits(source || "");

    const candidateUnits = splitIntoSummaryUnits(candidate);
    const looksTruncated =
      !candidate ||
      candidate.length < 700 ||
      candidateUnits.length < 7 ||
      isRepetitiveSummary(candidate) ||
      /(\s*\.\.\.|\s*…)+\s*$/.test(String(candidateSummary || ""));

    if (!looksTruncated) {
      return `${candidate}${candidate.endsWith(".") ? "" : "."}`;
    }

    // Build a guaranteed long paragraph from source units when candidate is short.
    const merged = [];
    const seen = new Set();
    for (const unit of sourceUnits) {
      const key = unit
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(unit);
      if (merged.length >= 10 && merged.join(" ").length >= 900) {
        break;
      }
      if (merged.length >= 12) {
        break;
      }
    }

    const longSourceSummary = merged.join(" ").trim();
    if (longSourceSummary.length >= 700) {
      const cleanLong = stripTrailingEllipsis(longSourceSummary);
      const repaired = createStructuredPatentSummary(cleanLong, patent);
      return `${repaired}${repaired.endsWith(".") ? "" : "."}`;
    }

    return sourceSummary;
  };

  const normalizeSummary = (generated, sourceText) => {
    const cleanGenerated = stripTrailingEllipsis(generated || "");
    const preparedGenerated = createReadableSummary(cleanGenerated);
    return ensureVisibleFullSummary(preparedGenerated, sourceText);
  };

  useEffect(() => {
    if (!patent) return;
    let cancelled = false;

    const maybeFetchPatentText = async () => {
      const localSourceLength = normalizePunctuation(
        `${patent?.title || ""} ${patent?.abstract || ""}`,
      ).length;

      if (localSourceLength >= 1100 || !patent?.url) {
        setEnrichedPatentText("");
        return;
      }

      try {
        const response = await axios.post("/api/patent-text/", {
          url: patent.url,
        });
        const fetched = normalizePunctuation(response?.data?.text || "");
        if (!cancelled) {
          setEnrichedPatentText(fetched.length > 300 ? fetched : "");
        }
      } catch (error) {
        console.error("Error fetching enriched patent text:", error);
        if (!cancelled) {
          setEnrichedPatentText("");
        }
      }
    };

    maybeFetchPatentText();

    return () => {
      cancelled = true;
    };
  }, [patent]);

  useEffect(() => {
    if (!patent) return;

    const fallbackSource = analysisText || sourceText || patent.title || "";

    const generateSummary = async () => {
      if (!fallbackSource) {
        setSummary("No summary available for this patent.");
        return;
      }

      setLoadingSummary(true);
      try {
        const response = await axios.post("/api/generate-summary/", {
          text: fallbackSource,
        });
        const finalSummary = normalizeSummary(
          response?.data?.summary,
          fallbackSource,
        );
        setSummary(ensureVisibleFullSummary(finalSummary, fallbackSource));
      } catch (error) {
        console.error("Error generating patent summary:", error);
        setSummary(ensureVisibleFullSummary("", fallbackSource));
      } finally {
        setLoadingSummary(false);
      }
    };

    const generateWordCloud = async () => {
      if (!fallbackSource) {
        setWordCloudData([]);
        return;
      }

      setLoadingWordCloud(true);
      try {
        const response = await axios.post("/api/generate-wordcloud/", {
          text: fallbackSource,
        });
        const processed = processWordCloudData(response?.data?.words || []);
        setWordCloudData(
          processed.length > 0
            ? processed
            : createFallbackWordCloudData(fallbackSource),
        );
      } catch (error) {
        console.error("Error generating patent word cloud:", error);
        setWordCloudData(createFallbackWordCloudData(fallbackSource));
      } finally {
        setLoadingWordCloud(false);
      }
    };

    setSummary("");
    setWordCloudData([]);
    generateSummary();
    generateWordCloud();
  }, [patent, analysisText, sourceText, enrichedPatentText]);

  const highlightedKeywords = useMemo(
    () =>
      wordCloudData
        .slice(0, 8)
        .map((item) => cleanText(item.text || ""))
        .filter(Boolean),
    [wordCloudData],
  );

  const renderHighlightedSummary = (text) => {
    if (!text) return null;
    if (highlightedKeywords.length === 0) {
      return (
        <p className="text-[1.02rem] leading-8 text-slate-700 whitespace-pre-wrap">
          {text}
        </p>
      );
    }

    const pattern = highlightedKeywords
      .sort((a, b) => b.length - a.length)
      .map((word) => escapeRegExp(word))
      .join("|");

    if (!pattern) {
      return (
        <p className="text-[1.02rem] leading-8 text-slate-700 whitespace-pre-wrap">
          {text}
        </p>
      );
    }

    const regex = new RegExp(`(${pattern})`, "gi");
    const parts = text.split(regex);

    return (
      <p className="text-[1.02rem] leading-8 text-slate-700 whitespace-pre-wrap">
        {parts.map((part, index) => {
          const isHighlight = highlightedKeywords.some(
            (word) => word.toLowerCase() === part.toLowerCase(),
          );

          if (isHighlight) {
            return (
              <span
                key={`${part}-${index}`}
                className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-900 font-semibold"
              >
                {part}
              </span>
            );
          }

          return <span key={`${part}-${index}`}>{part}</span>;
        })}
      </p>
    );
  };

  const handleDownloadInsights = () => {
    if (!patent) return;

    try {
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 40;
      const contentWidth = pageWidth - margin * 2;
      let y = margin;

      const writeLines = (lines, lineHeight = 16) => {
        lines.forEach((line) => {
          if (y > pageHeight - margin) {
            doc.addPage();
            y = margin;
          }
          doc.text(line, margin, y);
          y += lineHeight;
        });
      };

      const addSection = (heading, content) => {
        if (y > pageHeight - 100) {
          doc.addPage();
          y = margin;
        }

        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        doc.text(heading, margin, y);
        y += 18;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        const lines = doc.splitTextToSize(content || "N/A", contentWidth);
        writeLines(lines);
        y += 8;
      };

      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      const titleLines = doc.splitTextToSize(
        cleanText(patent.title || "Untitled Patent"),
        contentWidth,
      );
      writeLines(titleLines, 24);
      y += 4;

      addSection("Publication Year", getYear(patent.publication_date || ""));
      addSection("Assignee", cleanText(patent.assignee || "N/A"));
      addSection("Patent Number", cleanText(patent.patent_number || "N/A"));
      addSection("Detailed Summary", summary || "No summary available.");
      addSection("Top Keywords", highlightedKeywords.join(", ") || "N/A");

      if (patent.url) {
        addSection("Patent URL", patent.url);
      }

      const fileBase =
        cleanText(patent.title || "patent-insights")
          .replace(/[^a-z0-9\s_-]/gi, "")
          .trim()
          .replace(/\s+/g, "_")
          .slice(0, 80) || "patent-insights";

      doc.save(`${fileBase}_insights.pdf`);
      toast.success("Patent insights PDF downloaded.");
    } catch (error) {
      console.error("Error downloading patent insights PDF:", error);
      toast.error("Could not download patent insights right now.");
    }
  };

  if (!patent) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center px-6">
        <div className="max-w-xl text-center bg-white/80 backdrop-blur-xl rounded-2xl shadow-lg border border-white/30 p-8">
          <h2 className="text-2xl font-bold text-slate-900 mb-3">
            Patent Details Not Found
          </h2>
          <p className="text-slate-600 mb-6">
            Open this page from search results so we can load the selected
            patent details.
          </p>
          <button
            onClick={() => navigate("/search")}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Search
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_12%_18%,rgba(59,130,246,0.2),transparent_34%),radial-gradient(circle_at_86%_8%,rgba(16,185,129,0.2),transparent_30%),linear-gradient(180deg,#f8fafc_0%,#edf4ff_50%,#eef2ff_100%)]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap items-center justify-between gap-3 mb-5"
        >
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-slate-700 bg-white/80 border border-slate-200 hover:bg-white"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadInsights}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-emerald-600 to-teal-600 rounded-lg hover:from-emerald-700 hover:to-teal-700"
            >
              <Download className="w-4 h-4" />
              Download Insights
            </button>
            {patent.url && (
              <a
                href={patent.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100"
              >
                <ExternalLink className="w-4 h-4" />
                View Original Patent
              </a>
            )}
          </div>
        </motion.div>

        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-lg border border-white/40 overflow-hidden"
        >
          <div className="p-6 sm:p-8 border-b border-slate-200/80">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold tracking-wide text-blue-700 bg-blue-50 border border-blue-100 mb-4">
              <Sparkles className="w-3.5 h-3.5" />
              PATENT INSIGHTS
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 leading-tight mb-4">
              {cleanText(patent.title || "Untitled Patent")}
            </h1>
            <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
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

          <div className="p-6 sm:p-8 space-y-8">
            <section className="rounded-2xl bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 border border-blue-100 p-5 sm:p-6">
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mb-4 inline-flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Detailed Summary
              </h2>

              {loadingSummary ? (
                <p className="text-base text-slate-500">
                  Generating detailed summary...
                </p>
              ) : (
                renderHighlightedSummary(summary)
              )}

              {highlightedKeywords.length > 0 && (
                <div className="mt-5 flex flex-wrap gap-2">
                  {highlightedKeywords.map((word) => (
                    <span
                      key={word}
                      className="px-3 py-1 rounded-full text-sm font-medium bg-white text-blue-700 border border-blue-200"
                    >
                      {word}
                    </span>
                  ))}
                </div>
              )}
            </section>

            <section>
              {loadingWordCloud && wordCloudData.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-slate-500">
                  Generating keyword cloud...
                </div>
              ) : (
                <WordCloud
                  words={wordCloudData}
                  title="Patent Keyword Landscape"
                />
              )}
            </section>
          </div>
        </motion.section>
      </div>
    </div>
  );
};

export default PatentInsights;
