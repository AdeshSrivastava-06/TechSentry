import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import PaperModal from "../components/Modals/PaperModal";
import {
  Search,
  Calendar,
  Globe,
  TrendingUp,
  FileText,
  Building,
  Newspaper,
  ExternalLink,
  Bookmark,
  Quote,
  X,
  User,
} from "lucide-react";
import toast from "react-hot-toast";

const SearchPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [activeTab, setActiveTab] = useState("all");
  const [selectedPaper, setSelectedPaper] = useState(null);
  const [filters, setFilters] = useState({
    year_from: "2000",
    year_to: "2026",
    country: [],
    trl_level: [],
    sort_by: "relevance",
  });
  const [showFilters, setShowFilters] = useState(false);

  const {
    data: searchResults,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["search", query, activeTab, filters],
    queryFn: async () => {
      if (!query.trim()) return null;

      const params = new URLSearchParams({
        q: query,
        type: activeTab,
        year_from: filters.year_from,
        year_to: filters.year_to,
        page: 1,
      });

      const response = await axios.get(`/api/search/?${params.toString()}`);
      return response.data;
    },
    enabled: query.trim().length > 0,
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.trim()) {
        refetch();
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [query, activeTab, filters]);

  const handleSearch = () => {
    if (query.trim()) {
      setSearchParams({ q: query, type: activeTab });
      refetch();
    }
  };

  const PaperCard = ({ paper }) => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white/70 backdrop-blur-xl rounded-xl shadow-lg border border-white/20 p-6 mb-4 hover:shadow-xl transition-all duration-300 cursor-pointer"
      onClick={() => setSelectedPaper(paper)}
    >
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-lg font-semibold text-gray-900 flex-1 mr-4 line-clamp-2">
          {paper.title}
        </h3>
        <button
          onClick={(e) => {
            e.stopPropagation();
            // Handle bookmark
          }}
          className="text-gray-400 hover:text-indigo-600 transition-colors"
        >
          <Bookmark className="w-5 h-5" />
        </button>
      </div>

      <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
        {paper.publication_year && (
          <span className="flex items-center gap-1">
            <Calendar className="w-4 h-4" />
            {paper.publication_year}
          </span>
        )}
        {paper.cited_by_count !== undefined && (
          <span className="flex items-center gap-1">
            <TrendingUp className="w-4 h-4" />
            {paper.cited_by_count} citations
          </span>
        )}
      </div>

      {paper.abstract && (
        <p className="text-gray-700 text-sm line-clamp-3 mb-3">
          {paper.abstract}
        </p>
      )}

      {paper.authorships && paper.authorships.length > 0 && (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <User className="w-4 h-4" />
          <span>
            {paper.authorships
              .slice(0, 3)
              .map((author) => author.author?.display_name || author.name)
              .join(", ")}
            {paper.authorships.length > 3 &&
              ` +${paper.authorships.length - 3} more`}
          </span>
        </div>
      )}
    </motion.div>
  );

  const PatentCard = ({ patent }) => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white/70 backdrop-blur-xl rounded-xl shadow-lg border border-white/20 p-6 mb-4 hover:shadow-xl transition-all duration-300"
    >
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-lg font-semibold text-gray-900 flex-1 mr-4 line-clamp-2">
          {patent.title}
        </h3>
        <Quote className="w-5 h-5 text-indigo-600" />
      </div>

      <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
        {patent.publication_date && (
          <span className="flex items-center gap-1">
            <Calendar className="w-4 h-4" />
            {new Date(patent.publication_date).getFullYear()}
          </span>
        )}
        {patent.assignee && (
          <span className="flex items-center gap-1">
            <Building className="w-4 h-4" />
            {patent.assignee}
          </span>
        )}
      </div>

      {patent.abstract && (
        <p className="text-gray-700 text-sm line-clamp-3">{patent.abstract}</p>
      )}
    </motion.div>
  );

  const NewsCard = ({ news }) => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white/70 backdrop-blur-xl rounded-xl shadow-lg border border-white/20 p-6 mb-4 hover:shadow-xl transition-all duration-300"
    >
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-lg font-semibold text-gray-900 flex-1 mr-4 line-clamp-2">
          {news.title}
        </h3>
        <Newspaper className="w-5 h-5 text-indigo-600" />
      </div>

      <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
        {news.published_at && (
          <span className="flex items-center gap-1">
            <Calendar className="w-4 h-4" />
            {new Date(news.published_at).toLocaleDateString()}
          </span>
        )}
        {news.source && (
          <span className="flex items-center gap-1">
            <Globe className="w-4 h-4" />
            {news.source}
          </span>
        )}
      </div>

      {news.description && (
        <p className="text-gray-700 text-sm line-clamp-3 mb-3">
          {news.description}
        </p>
      )}

      {news.url && (
        <a
          href={news.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-700 text-sm font-medium transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="w-3 h-3" />
          Read more
        </a>
      )}
    </motion.div>
  );

  const CompanyCard = ({ company }) => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white/70 backdrop-blur-xl rounded-xl shadow-lg border border-white/20 p-6 mb-4 hover:shadow-xl transition-all duration-300"
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-gray-900 flex-1 mr-4">
          {company.companyLabel?.value || company.name || "Company Name"}
        </h3>
        <Building className="w-5 h-5 text-indigo-600" />
      </div>

      <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
        {company.countryLabel?.value && (
          <span className="flex items-center gap-1">
            <Globe className="w-4 h-4" />
            {company.countryLabel.value}
          </span>
        )}
        {company.incorporation_date && (
          <span className="flex items-center gap-1">
            <Calendar className="w-4 h-4" />
            Founded {company.incorporation_date}
          </span>
        )}
      </div>

      {company.description && (
        <p className="text-gray-700 text-sm line-clamp-3">
          {company.description}
        </p>
      )}
    </motion.div>
  );

  const tabs = [
    { id: "all", name: "All Results", icon: Search },
    { id: "papers", name: "Research Papers", icon: FileText },
    { id: "patents", name: "Patents", icon: Quote },
    { id: "news", name: "News & Reports", icon: Newspaper },
    { id: "companies", name: "Companies", icon: Building },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-xl border-b border-white/20 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Technology Research Search
            </h1>
            <p className="text-gray-600">
              Discover research papers, patents, companies, and news
            </p>
          </div>

          {/* Search Bar */}
          <div className="max-w-3xl mx-auto">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleSearch()}
                placeholder="Search for technologies, research papers, patents..."
                className="block w-full pl-12 pr-32 py-4 bg-white/70 backdrop-blur-sm border border-gray-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 text-gray-900 placeholder-gray-500 shadow-lg"
              />
              <div className="absolute inset-y-0 right-0 flex items-center pr-2">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleSearch}
                  className="px-6 py-2 bg-gradient-to-r from-indigo-600 to-blue-700 text-white rounded-xl hover:from-indigo-700 hover:to-blue-800 transition-all duration-200 font-medium shadow-lg"
                >
                  Search
                </motion.button>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex justify-center mt-6">
            <div className="bg-white/50 backdrop-blur-sm rounded-xl p-1 shadow-sm">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                      activeTab === tab.id
                        ? "bg-gradient-to-r from-indigo-600 to-blue-700 text-white shadow-md"
                        : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {tab.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {isLoading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          </div>
        ) : searchResults ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main Results */}
            <div className="lg:col-span-2">
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">
                  {activeTab === "all" && "All Results"}
                  {activeTab === "papers" && "Research Papers"}
                  {activeTab === "patents" && "Patents"}
                  {activeTab === "news" && "News & Reports"}
                  {activeTab === "companies" && "Companies"}
                </h2>

                {/* Results List */}
                <div>
                  {activeTab === "all" && (
                    <>
                      {searchResults.papers?.length > 0 && (
                        <div className="mb-8">
                          <h3 className="text-lg font-medium text-gray-800 mb-4">
                            Research Papers
                          </h3>
                          {searchResults.papers.map((paper) => (
                            <PaperCard key={paper.id} paper={paper} />
                          ))}
                        </div>
                      )}

                      {searchResults.patents?.length > 0 && (
                        <div className="mb-8">
                          <h3 className="text-lg font-medium text-gray-800 mb-4">
                            Patents
                          </h3>
                          {searchResults.patents.map((patent) => (
                            <PatentCard key={patent.id} patent={patent} />
                          ))}
                        </div>
                      )}

                      {searchResults.news?.length > 0 && (
                        <div className="mb-8">
                          <h3 className="text-lg font-medium text-gray-800 mb-4">
                            News & Reports
                          </h3>
                          {searchResults.news.map((news) => (
                            <NewsCard key={news.id} news={news} />
                          ))}
                        </div>
                      )}

                      {searchResults.companies?.length > 0 && (
                        <div className="mb-8">
                          <h3 className="text-lg font-medium text-gray-800 mb-4">
                            Companies
                          </h3>
                          {searchResults.companies.map((company) => (
                            <CompanyCard key={company.id} company={company} />
                          ))}
                        </div>
                      )}
                    </>
                  )}

                  {activeTab === "papers" &&
                    searchResults.papers?.map((paper) => (
                      <PaperCard key={paper.id} paper={paper} />
                    ))}

                  {activeTab === "patents" &&
                    searchResults.patents?.map((patent) => (
                      <PatentCard key={patent.id} patent={patent} />
                    ))}

                  {activeTab === "news" &&
                    searchResults.news?.map((news) => (
                      <NewsCard key={news.id} news={news} />
                    ))}

                  {activeTab === "companies" &&
                    searchResults.companies?.map((company) => (
                      <CompanyCard key={company.id} company={company} />
                    ))}
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <div className="lg:col-span-1">
              <div className="bg-white/70 backdrop-blur-xl rounded-xl shadow-lg border border-white/20 p-6 sticky top-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Filters
                </h3>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Year Range
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        value={filters.year_from}
                        onChange={(e) =>
                          setFilters((prev) => ({
                            ...prev,
                            year_from: e.target.value,
                          }))
                        }
                        placeholder="From"
                        className="px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                      />
                      <input
                        type="number"
                        value={filters.year_to}
                        onChange={(e) =>
                          setFilters((prev) => ({
                            ...prev,
                            year_to: e.target.value,
                          }))
                        }
                        placeholder="To"
                        className="px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Sort By
                    </label>
                    <select
                      value={filters.sort_by}
                      onChange={(e) =>
                        setFilters((prev) => ({
                          ...prev,
                          sort_by: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                    >
                      <option value="relevance">Relevance</option>
                      <option value="date_newest">Date: Newest</option>
                      <option value="date_oldest">Date: Oldest</option>
                      <option value="citations_most">Citations: Most</option>
                    </select>
                  </div>

                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleSearch}
                    className="w-full px-4 py-2 bg-gradient-to-r from-indigo-600 to-blue-700 text-white rounded-lg hover:from-indigo-700 hover:to-blue-800 transition-all duration-200 font-medium"
                  >
                    Apply Filters
                  </motion.button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-12">
            <Search className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Start Your Search
            </h3>
            <p className="text-gray-600">
              Enter a query above to discover research papers, patents,
              companies, and news.
            </p>
          </div>
        )}
      </div>

      {/* Paper Modal */}
      <AnimatePresence>
        {selectedPaper && (
          <PaperModal
            paper={selectedPaper}
            onClose={() => setSelectedPaper(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default SearchPage;
