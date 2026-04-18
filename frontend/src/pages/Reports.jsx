import React, { useState } from "react";
import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import {
  FileText,
  Plus,
  Download,
  Trash2,
  Pencil,
  Eye,
  Calendar,
  Hash,
  BookOpen,
} from "lucide-react";
import toast from "react-hot-toast";
import { logActivity } from "../utils/activityLog";

const Reports = () => {
  const LOCAL_REPORTS_KEY = "techsentry_local_reports";

  const getLocalReports = () => {
    try {
      const raw = localStorage.getItem(LOCAL_REPORTS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  };

  const saveLocalReports = (items) => {
    localStorage.setItem(LOCAL_REPORTS_KEY, JSON.stringify(items));
  };

  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);
  const [isEditingReport, setIsEditingReport] = useState(false);
  const [editContentDraft, setEditContentDraft] = useState("");
  const [newReport, setNewReport] = useState({
    technology: "",
    customParagraph: "",
    sections: {
      executive_summary: true,
      maturity_assessment: true,
      growth_drivers: true,
      strategic_implications: true,
      focus_areas: true,
    },
  });

  const queryClient = useQueryClient();

  const { data: reports, isLoading } = useQuery({
    queryKey: ["reports"],
    queryFn: async () => {
      try {
        const response = await axios.get("/api/reports/");
        return response.data || [];
      } catch {
        return getLocalReports();
      }
    },
  });

  const formatDate = (value) => {
    if (!value) return "N/A";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "N/A";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}/${month}/${day}`;
  };

  const countWords = (content) => {
    const text = (content || "").trim();
    if (!text) return 0;
    return text.split(/\s+/).length;
  };

  const getFallbackContent = (report) => {
    const tech = report?.technology || "Unknown Technology";
    const date = formatDate(report?.created_at || new Date().toISOString());
    return [
      `Technology Intelligence Report: ${tech}`,
      `Generated on: ${date}`,
      "",
      "Executive Summary",
      `No generated content was available for this report at save time. You can use Edit to add your own analysis for ${tech}.`,
      "",
      "Analyst Notes",
      "This report has been auto-recovered in the viewer so it is no longer empty.",
    ].join("\n");
  };

  const getEffectiveContent = (report) => {
    const raw = (report?.content || "").trim();
    return raw || getFallbackContent(report);
  };

  const getEffectiveWordCount = (report) => {
    const stored = Number(report?.word_count || 0);
    if (stored > 0) return stored;
    return countWords(getEffectiveContent(report));
  };

  const generateLocalContent = (technology, sections, customParagraph) => {
    const date = formatDate(new Date().toISOString());
    const sectionLabel = {
      executive_summary: "Executive Summary",
      maturity_assessment: "Technology Maturity Assessment",
      growth_drivers: "Key Growth Drivers",
      strategic_implications: "Strategic Implications",
      focus_areas: "Recommended Focus Areas",
    };

    const lines = [
      `Technology Intelligence Report: ${technology}`,
      `Generated on: ${date}`,
      "",
      "Snapshot",
      "- Research and innovation activity is being monitored for recent momentum.",
      "- Strategic relevance and maturity signals are synthesized for planning use.",
      "",
    ];

    sections.forEach((section) => {
      lines.push(sectionLabel[section] || section);

      if (section === "executive_summary") {
        lines.push(
          `${technology} shows active strategic relevance. This report summarizes available technical, market, and policy signals to support decision-making.`,
        );
      } else if (section === "maturity_assessment") {
        lines.push(
          "The technology appears to be in an active development phase with clear potential for near-term pilot programs and medium-term scale-up.",
        );
      } else if (section === "growth_drivers") {
        lines.push("- Government and industry R&D investments");
        lines.push("- Cross-domain integration requirements");
        lines.push("- Competitive pressure and capability race");
      } else if (section === "strategic_implications") {
        lines.push(
          "Adoption may influence operational advantage, procurement priorities, and partner ecosystem alignment in the next planning cycle.",
        );
      } else if (section === "focus_areas") {
        lines.push("- Define measurable readiness milestones");
        lines.push("- Track top institutions and patent assignees");
        lines.push("- Run phased evaluations with operational users");
      }

      lines.push("");
    });

    if ((customParagraph || "").trim()) {
      lines.push("Analyst Notes");
      lines.push(customParagraph.trim());
      lines.push("");
    }

    lines.push(
      "Note: This report was generated in local fallback mode while backend generation was unavailable.",
    );
    return lines.join("\n").trim();
  };

  const generateReportMutation = useMutation({
    mutationFn: async (reportData) => {
      try {
        const response = await axios.post("/api/reports/generate/", reportData);
        return { data: response.data, source: "api" };
      } catch {
        const now = new Date().toISOString();
        const content = generateLocalContent(
          reportData.technology,
          reportData.sections,
          reportData.custom_paragraph,
        );
        const localReport = {
          id: `local-${Date.now()}`,
          title: `Technology Intelligence Report: ${reportData.technology}`,
          technology: reportData.technology,
          content,
          word_count: countWords(content),
          created_at: now,
          updated_at: now,
          sections: reportData.sections,
        };

        const current = getLocalReports();
        saveLocalReports([localReport, ...current]);
        return { data: localReport, source: "local" };
      }
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries(["reports"]);
      const technologyName = String(result?.data?.technology || "").trim();
      if (technologyName) {
        logActivity({
          type: "report",
          description: `Generated report for "${technologyName}"`,
        });
      }
      setShowGenerateModal(false);
      setNewReport({
        technology: "",
        customParagraph: "",
        sections: {
          executive_summary: true,
          maturity_assessment: true,
          growth_drivers: true,
          strategic_implications: true,
          focus_areas: true,
        },
      });

      if (result?.source === "api") {
        toast.success("Report generated successfully!");
      } else {
        toast.success("Report generated in local fallback mode!");
      }
    },
    onError: (error) => {
      toast.error(error.message || "Failed to generate report");
    },
  });

  const handleGenerateReport = () => {
    if (!newReport.technology.trim()) {
      toast.error("Please enter a technology name");
      return;
    }

    const selectedSections = Object.entries(newReport.sections)
      .filter(([_, selected]) => selected)
      .map(([section]) => section);

    generateReportMutation.mutate({
      technology: newReport.technology,
      sections: selectedSections,
      custom_paragraph: newReport.customParagraph,
    });
  };

  const handleDownloadReport = (report) => {
    // Create a downloadable text file
    const content = getEffectiveContent(report);
    const blob = new Blob([content], { type: "text/plain" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${report.title.replace(/\s+/g, "_")}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    toast.success("Report downloaded!");
  };

  const deleteReportMutation = useMutation({
    mutationFn: async (report) => {
      try {
        await axios.delete(`/api/reports/${report.id}/`);
        return { source: "api" };
      } catch {
        const current = getLocalReports();
        const next = current.filter(
          (item) => String(item.id) !== String(report.id),
        );
        saveLocalReports(next);
        return { source: "local" };
      }
    },
    onSuccess: (_, report) => {
      if (selectedReport && String(selectedReport.id) === String(report.id)) {
        setSelectedReport(null);
        setIsEditingReport(false);
        setEditContentDraft("");
      }

      if (_?.source === "api") {
        queryClient.invalidateQueries(["reports"]);
      } else {
        queryClient.setQueryData(["reports"], (prev = []) =>
          prev.filter((item) => String(item.id) !== String(report.id)),
        );
      }

      toast.success("Report deleted successfully");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete report");
    },
  });

  const handleDeleteReport = (report) => {
    const shouldDelete = window.confirm(
      `Delete report \"${report.title}\"? This action cannot be undone.`,
    );
    if (!shouldDelete) return;
    deleteReportMutation.mutate(report);
  };

  const updateReportMutation = useMutation({
    mutationFn: async ({ report, content }) => {
      const normalizedContent = (content || "").trim();
      const updatedPayload = {
        ...report,
        content: normalizedContent,
        word_count: countWords(normalizedContent),
        updated_at: new Date().toISOString(),
      };

      try {
        const response = await axios.patch(`/api/reports/${report.id}/`, {
          content: normalizedContent,
        });
        return { source: "api", data: response.data };
      } catch {
        const current = getLocalReports();
        const index = current.findIndex(
          (item) => String(item.id) === String(report.id),
        );
        if (index >= 0) {
          const next = [...current];
          next[index] = { ...next[index], ...updatedPayload };
          saveLocalReports(next);
        }
        return { source: "local", data: updatedPayload };
      }
    },
    onSuccess: (result) => {
      queryClient.setQueryData(["reports"], (prev = []) =>
        prev.map((item) =>
          String(item.id) === String(result.data.id) ? result.data : item,
        ),
      );

      setSelectedReport(result.data);
      setIsEditingReport(false);
      setEditContentDraft(result.data.content || "");

      if (result.source === "api") {
        toast.success("Report updated successfully");
      } else {
        toast.success("Report updated locally");
      }
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update report");
    },
  });

  const openReport = (report) => {
    setSelectedReport(report);
    setIsEditingReport(false);
    setEditContentDraft(getEffectiveContent(report));
  };

  const handleSaveEditedReport = () => {
    if (!selectedReport) return;
    const trimmed = (editContentDraft || "").trim();
    if (!trimmed) {
      toast.error("Report content cannot be empty");
      return;
    }
    updateReportMutation.mutate({ report: selectedReport, content: trimmed });
  };

  const renderReportContent = (content) => {
    if (!content || !content.trim()) {
      return <p className="text-tech-muted">Report content unavailable.</p>;
    }

    const lines = content.split("\n");

    const cleanInlineMarkdown = (text) => {
      return text
        .replace(/\*\*(.*?)\*\*/g, "$1")
        .replace(/__(.*?)__/g, "$1")
        .replace(/`([^`]+)`/g, "$1")
        .trim();
    };

    const isTableRow = (line) => {
      const trimmed = line.trim();
      return (
        trimmed.startsWith("|") &&
        trimmed.endsWith("|") &&
        trimmed.includes("|")
      );
    };

    const isTableSeparator = (line) =>
      /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line.trim());

    const rows = [];

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const trimmed = line.trim();

      if (!trimmed) {
        rows.push({ type: "spacer" });
        continue;
      }

      // Markdown headings (#, ##, ###).
      if (/^#{1,6}\s+/.test(trimmed)) {
        const text = cleanInlineMarkdown(trimmed.replace(/^#{1,6}\s+/, ""));
        rows.push({ type: "heading", text });
        continue;
      }

      // Numbered section headings like "1. Executive Summary".
      if (/^\d+\.\s+/.test(trimmed)) {
        rows.push({ type: "heading", text: cleanInlineMarkdown(trimmed) });
        continue;
      }

      // Parse markdown table blocks.
      if (isTableRow(trimmed)) {
        const tableRows = [];
        while (i < lines.length && isTableRow(lines[i].trim())) {
          const current = lines[i].trim();
          if (!isTableSeparator(current)) {
            const cells = current
              .slice(1, -1)
              .split("|")
              .map((cell) => cleanInlineMarkdown(cell));
            tableRows.push(cells);
          }
          i += 1;
        }
        i -= 1;

        if (tableRows.length > 0) {
          const [header, ...body] = tableRows;
          rows.push({ type: "table", header, body });
        }
        continue;
      }

      if (/^[-*]\s+/.test(trimmed)) {
        rows.push({
          type: "bullet",
          text: cleanInlineMarkdown(trimmed.replace(/^[-*]\s+/, "")),
        });
        continue;
      }

      rows.push({ type: "paragraph", text: cleanInlineMarkdown(trimmed) });
    }

    return (
      <div className="space-y-2">
        {rows.map((row, index) => {
          if (row.type === "spacer") {
            return <div key={`row-${index}`} className="h-2" />;
          }

          if (row.type === "heading") {
            return (
              <h4
                key={`row-${index}`}
                className="text-sky-200 font-semibold text-base pt-2"
              >
                {row.text}
              </h4>
            );
          }

          if (row.type === "bullet") {
            return (
              <p
                key={`row-${index}`}
                className="text-slate-200 pl-4 leading-relaxed"
              >
                • {row.text}
              </p>
            );
          }

          if (row.type === "table") {
            return (
              <div
                key={`row-${index}`}
                className="overflow-x-auto rounded-md border border-tech-border/70"
              >
                <table className="min-w-full text-sm border-collapse mb-0">
                  <thead className="bg-slate-900/70">
                    <tr>
                      {row.header.map((cell, cellIndex) => (
                        <th
                          key={`head-${cellIndex}`}
                          className="px-3 py-2 text-left text-sky-100 font-semibold border-b border-sky-900/60"
                        >
                          {cell}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {row.body.map((cells, bodyIndex) => (
                      <tr
                        key={`body-${bodyIndex}`}
                        className="odd:bg-slate-950/35 even:bg-slate-900/45"
                      >
                        {cells.map((cell, cellIndex) => (
                          <td
                            key={`cell-${bodyIndex}-${cellIndex}`}
                            className="px-3 py-2 text-slate-200 border-b border-slate-800/70 align-top"
                          >
                            {cell || "-"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }

          return (
            <p key={`row-${index}`} className="text-slate-200 leading-relaxed">
              {row.text}
            </p>
          );
        })}
      </div>
    );
  };

  const ReportCard = ({ report }) => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="tech-card-hover"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-2 mb-2">
            <FileText className="w-5 h-5 text-tech-primary" />
            <h3 className="text-lg font-semibold text-tech-text">
              {report.title}
            </h3>
          </div>

          <div className="flex items-center space-x-4 text-sm text-tech-muted mb-3">
            <div className="flex items-center">
              <BookOpen className="w-4 h-4 mr-1" />
              {report.technology}
            </div>
            <div className="flex items-center">
              <Hash className="w-4 h-4 mr-1" />
              {getEffectiveWordCount(report)} words
            </div>
            <div className="flex items-center">
              <Calendar className="w-4 h-4 mr-1" />
              {formatDate(report.created_at)}
            </div>
          </div>

          <p className="text-tech-muted text-sm mb-4 line-clamp-3">
            {getEffectiveContent(report).length > 200
              ? `${getEffectiveContent(report).substring(0, 200)}...`
              : getEffectiveContent(report)}
          </p>

          <div className="flex items-center space-x-2">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => openReport(report)}
              className="tech-button-secondary text-sm flex items-center space-x-1"
            >
              <Eye className="w-3 h-3" />
              <span>View</span>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => openReport(report)}
              className="tech-button-secondary text-sm flex items-center space-x-1"
            >
              <Pencil className="w-3 h-3" />
              <span>Edit</span>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => handleDownloadReport(report)}
              className="tech-button-secondary text-sm flex items-center space-x-1"
            >
              <Download className="w-3 h-3" />
              <span>Download</span>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => handleDeleteReport(report)}
              disabled={deleteReportMutation.isLoading}
              className="tech-button-secondary text-sm flex items-center space-x-1 disabled:opacity-50"
            >
              <Trash2 className="w-3 h-3" />
              <span>Delete</span>
            </motion.button>
          </div>
        </div>
      </div>
    </motion.div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-orbitron font-bold text-slate-900 mb-2">
            Intelligence Reports
          </h1>
          <p className="text-slate-600">
            Generated technology analysis reports and briefings
          </p>
        </div>

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setShowGenerateModal(true)}
          className="tech-button-primary flex items-center space-x-2"
        >
          <Plus className="w-4 h-4" />
          <span>Generate Report</span>
        </motion.button>
      </div>

      {/* Reports List */}
      {isLoading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-tech-primary mx-auto"></div>
          <p className="text-tech-muted mt-4">Loading reports...</p>
        </div>
      ) : reports && reports.length > 0 ? (
        <div className="space-y-4">
          {reports.map((report, index) => (
            <ReportCard key={report.id} report={report} />
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <FileText className="w-16 h-16 text-tech-muted mx-auto mb-4" />
          <h3 className="text-xl font-orbitron font-semibold text-tech-text mb-2">
            No Reports Yet
          </h3>
          <p className="text-tech-muted mb-6">
            Generate your first technology intelligence report to get started
          </p>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setShowGenerateModal(true)}
            className="tech-button-primary"
          >
            Generate First Report
          </motion.button>
        </div>
      )}

      {/* View Report Modal */}
      {selectedReport && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedReport(null)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-3xl w-full max-h-[85vh] overflow-auto bg-slate-950/95 border border-sky-900/50 rounded-xl p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="text-2xl font-orbitron font-bold text-slate-100">
                  {selectedReport.title}
                </h2>
                <div className="text-sm text-slate-300 mt-1">
                  {selectedReport.technology} |{" "}
                  {formatDate(selectedReport.created_at)} |{" "}
                  {getEffectiveWordCount(selectedReport)} words
                </div>
              </div>
              <button
                onClick={() => setSelectedReport(null)}
                className="tech-button-secondary text-sm"
              >
                Close
              </button>
            </div>

            {isEditingReport ? (
              <div className="border border-slate-700 rounded-lg p-4 bg-slate-900/70">
                <label className="block text-sm font-medium text-slate-100 mb-2">
                  Edit Report Content
                </label>
                <textarea
                  value={editContentDraft}
                  onChange={(e) => setEditContentDraft(e.target.value)}
                  className="w-full min-h-[300px] resize-y rounded-lg border border-slate-700 bg-slate-950/80 px-3 py-2 text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-600"
                />
              </div>
            ) : (
              <div className="border border-slate-700 rounded-lg p-4 bg-slate-900/70">
                {renderReportContent(getEffectiveContent(selectedReport))}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 mt-4">
              {isEditingReport ? (
                <>
                  <button
                    onClick={() => {
                      setIsEditingReport(false);
                      setEditContentDraft(getEffectiveContent(selectedReport));
                    }}
                    className="tech-button-secondary text-sm"
                  >
                    Cancel Edit
                  </button>
                  <button
                    onClick={handleSaveEditedReport}
                    disabled={updateReportMutation.isLoading}
                    className="tech-button-primary text-sm disabled:opacity-50"
                  >
                    {updateReportMutation.isLoading ? "Saving..." : "Save"}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    setIsEditingReport(true);
                    setEditContentDraft(getEffectiveContent(selectedReport));
                  }}
                  className="tech-button-secondary text-sm flex items-center space-x-1"
                >
                  <Pencil className="w-3 h-3" />
                  <span>Edit</span>
                </button>
              )}

              <button
                onClick={() => handleDownloadReport(selectedReport)}
                className="tech-button-secondary text-sm flex items-center space-x-1"
              >
                <Download className="w-3 h-3" />
                <span>Download</span>
              </button>
              <button
                onClick={() => handleDeleteReport(selectedReport)}
                className="tech-button-secondary text-sm flex items-center space-x-1"
              >
                <Trash2 className="w-3 h-3" />
                <span>Delete</span>
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Generate Report Modal */}
      {showGenerateModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowGenerateModal(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="tech-card max-w-lg w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-orbitron font-bold text-tech-text mb-6">
              Generate Intelligence Report
            </h2>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-tech-text mb-2">
                  Technology Name
                </label>
                <input
                  type="text"
                  value={newReport.technology}
                  onChange={(e) =>
                    setNewReport((prev) => ({
                      ...prev,
                      technology: e.target.value,
                    }))
                  }
                  className="tech-input"
                  placeholder="e.g., Quantum Radar, Hypersonic Missiles"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-tech-text mb-3">
                  Report Sections
                </label>
                <div className="space-y-2">
                  {Object.entries({
                    executive_summary: "Executive Summary",
                    maturity_assessment: "Technology Maturity Assessment",
                    growth_drivers: "Key Growth Drivers",
                    strategic_implications:
                      "Strategic Implications for Defence",
                    focus_areas: "Recommended Focus Areas",
                  }).map(([key, label]) => (
                    <label
                      key={key}
                      className="flex items-center space-x-3 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={newReport.sections[key]}
                        onChange={(e) =>
                          setNewReport((prev) => ({
                            ...prev,
                            sections: {
                              ...prev.sections,
                              [key]: e.target.checked,
                            },
                          }))
                        }
                        className="w-4 h-4 text-tech-primary bg-tech-surface border-tech-border rounded focus:ring-tech-primary"
                      />
                      <span className="text-tech-text">{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-tech-text mb-2">
                  Add Your Paragraph (optional)
                </label>
                <textarea
                  value={newReport.customParagraph}
                  onChange={(e) =>
                    setNewReport((prev) => ({
                      ...prev,
                      customParagraph: e.target.value,
                    }))
                  }
                  className="tech-input min-h-[220px] resize-y"
                  rows={8}
                  placeholder="Write your own analysis paragraph to include in the report..."
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setShowGenerateModal(false)}
                  className="tech-button-secondary"
                >
                  Cancel
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleGenerateReport}
                  disabled={generateReportMutation.isLoading}
                  className="tech-button-primary flex items-center space-x-2 disabled:opacity-50"
                >
                  {generateReportMutation.isLoading ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-black"></div>
                  ) : (
                    <>
                      <FileText className="w-4 h-4" />
                      <span>Generate</span>
                    </>
                  )}
                </motion.button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
};

export default Reports;
