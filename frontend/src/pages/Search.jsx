import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { 
  Search, 
  Filter, 
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
  User
} from 'lucide-react'
import toast from 'react-hot-toast'

const SearchPage = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const [query, setQuery] = useState(searchParams.get('q') || '')
  const [activeTab, setActiveTab] = useState('all')
  const [selectedPaper, setSelectedPaper] = useState(null)
  const [filters, setFilters] = useState({
    year_from: '2000',
    year_to: '2026',
    country: [],
    trl_level: [],
    sort_by: 'relevance'
  })
  const [showFilters, setShowFilters] = useState(false)

  const { data: searchResults, isLoading, refetch } = useQuery({
    queryKey: ['search', query, activeTab, filters],
    queryFn: async () => {
      if (!query.trim()) return null
      
      const params = new URLSearchParams({
        q: query,
        type: activeTab,
        year_from: filters.year_from,
        year_to: filters.year_to,
        page: 1
      })
      
      const response = await axios.get(`/api/search/?${params.toString()}`)
      return response.data
    },
    enabled: query.trim().length > 0
  })

  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.trim()) {
        refetch()
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [query, activeTab, filters])

  const handleSearch = () => {
    if (query.trim()) {
      setSearchParams({ q: query, type: activeTab })
      refetch()
    }
  }

  const PaperCard = ({ paper }) => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white/70 backdrop-blur-xl rounded-xl shadow-lg border border-white/20 p-6 mb-4 hover:shadow-xl transition-all duration-300 cursor-pointer"
      onClick={() => navigate(`/full-paper/${paper.id}`)}
    >
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-lg font-semibold text-gray-900 flex-1 mr-4 line-clamp-2">
          {paper.title}
        </h3>
        <button
          onClick={(e) => {
            e.stopPropagation()
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
            {paper.authorships.slice(0, 3).map(author => 
              author.author?.display_name || author.name
            ).join(', ')}
            {paper.authorships.length > 3 && ` +${paper.authorships.length - 3} more`}
          </span>
        </div>
      )}
    </motion.div>
  )

  const PatentCard = ({ patent }) => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white/70 backdrop-blur-xl rounded-xl shadow-lg border border-white/20 p-6 mb-4 hover:shadow-xl transition-all duration-300 cursor-pointer"
      onClick={() => {
        if (patent.url) {
          window.open(patent.url, '_blank')
        }
      }}
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
      
      {patent.patent_number && (
        <p className="text-gray-600 text-sm mb-2 font-mono">
          Patent: {patent.patent_number}
        </p>
      )}
      
      {patent.abstract && (
        <p className="text-gray-700 text-sm line-clamp-3 mb-3">
          {patent.abstract}
        </p>
      )}
      
      {patent.url && (
        <a
          href={patent.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-700 text-sm font-medium transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="w-3 h-3" />
          View Patent
        </a>
      )}
    </motion.div>
  )

  const NewsCard = ({ news }) => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white/70 backdrop-blur-xl rounded-xl shadow-lg border border-white/20 p-6 mb-4 hover:shadow-xl transition-all duration-300"
      onClick={() => window.open(news.url, '_blank')}
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
  )

  const CompanyCard = ({ company }) => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white/70 backdrop-blur-xl rounded-xl shadow-lg border border-white/20 p-6 mb-4 hover:shadow-xl transition-all duration-300"
      onClick={() => navigate(`/company/${company.id}`)}
    >
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-lg font-semibold text-gray-900 flex-1 mr-4">
          {company.companyLabel?.value || company.name || 'Company Name'}
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
  )

  const tabs = [
    { id: 'all', name: 'All Results', icon: Search },
    { id: 'papers', name: 'Research Papers', icon: FileText },
    { id: 'patents', name: 'Patents', icon: Quote },
    { id: 'news', name: 'News & Reports', icon: Newspaper },
    { id: 'companies', name: 'Companies', icon: Building }
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-xl border-b border-white/20 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Technology Research Search</h1>
            <p className="text-gray-600">Discover research papers, patents, companies, and news</p>
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
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Search for technologies, research papers, patents..."
                className="block w-full pl-12 pr-32 py-4 bg-white/70 backdrop-blur-sm border border-gray-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 text-gray-900 placeholder-gray-500 shadow-lg"
              />
              <div className="absolute inset-y-0 right-0 flex items-center pr-2">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setShowFilters(!showFilters)}
                  className="p-2 rounded-xl hover:bg-gray-100 transition-colors mr-2"
                >
                  <Filter className="h-5 w-5 text-gray-600" />
                </motion.button>
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
              {tabs.map(tab => {
                const Icon = tab.icon
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                      activeTab === tab.id
                        ? 'bg-gradient-to-r from-indigo-600 to-blue-700 text-white shadow-md'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {tab.name}
                  </button>
                )
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
                  {activeTab === 'all' && 'All Results'}
                  {activeTab === 'papers' && 'Research Papers'}
                  {activeTab === 'patents' && 'Patents'}
                  {activeTab === 'news' && 'News & Reports'}
                  {activeTab === 'companies' && 'Companies'}
                </h2>
                
                {/* Results List */}
                <div>
                  {activeTab === 'all' && (
                    <>
                      {searchResults.papers?.length > 0 && (
                        <div className="mb-8">
                          <h3 className="text-lg font-medium text-gray-800 mb-4">Research Papers</h3>
                          {searchResults.papers.map(paper => (
                            <PaperCard key={paper.id} paper={paper} />
                          ))}
                        </div>
                      )}
                      
                      {searchResults.patents?.length > 0 && (
                        <div className="mb-8">
                          <h3 className="text-lg font-medium text-gray-800 mb-4">Patents</h3>
                          {searchResults.patents.map(patent => (
                            <PatentCard key={patent.id} patent={patent} />
                          ))}
                        </div>
                      )}
                      
                      {searchResults.news?.length > 0 && (
                        <div className="mb-8">
                          <h3 className="text-lg font-medium text-gray-800 mb-4">News & Reports</h3>
                          {searchResults.news.map(news => (
                            <NewsCard key={news.id} news={news} />
                          ))}
                        </div>
                      )}
                      
                      {searchResults.companies?.length > 0 && (
                        <div className="mb-8">
                          <h3 className="text-lg font-medium text-gray-800 mb-4">Companies</h3>
                          {searchResults.companies.map(company => (
                            <CompanyCard key={company.id} company={company} />
                          ))}
                        </div>
                      )}
                    </>
                  )}
                  
                  {activeTab === 'papers' && searchResults.papers?.map(paper => (
                    <PaperCard key={paper.id} paper={paper} />
                  ))}
                  
                  {activeTab === 'patents' && searchResults.patents?.map(patent => (
                    <PatentCard key={patent.id} patent={patent} />
                  ))}
                  
                  {activeTab === 'news' && searchResults.news?.map(news => (
                    <NewsCard key={news.id} news={news} />
                  ))}
                  
                  {activeTab === 'companies' && searchResults.companies?.map(company => (
                    <CompanyCard key={company.id} company={company} />
                  ))}
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <div className="lg:col-span-1">
              <div className="bg-white/70 backdrop-blur-xl rounded-xl shadow-lg border border-white/20 p-6 sticky top-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Filters</h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Year Range
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        value={filters.year_from}
                        onChange={(e) => setFilters(prev => ({ ...prev, year_from: e.target.value }))}
                        placeholder="From"
                        className="px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                      />
                      <input
                        type="number"
                        value={filters.year_to}
                        onChange={(e) => setFilters(prev => ({ ...prev, year_to: e.target.value }))}
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
                      onChange={(e) => setFilters(prev => ({ ...prev, sort_by: e.target.value }))}
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
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Start Your Search</h3>
            <p className="text-gray-600">Enter a query above to discover research papers, patents, companies, and news.</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default SearchPage
          <h3 className="text-lg font-semibold text-tech-text mb-2 hover:text-tech-primary cursor-pointer">
            {patent.title}
          </h3>
          <div className="flex items-center space-x-4 text-sm text-tech-muted mb-2">
            <span className="font-mono">{patent.patent_number || 'Patent ID'}</span>
            <span>•</span>
            <span>{patent.assignee || 'Unknown Assignee'}</span>
            <span>•</span>
            <span>{patent.filing_date || 'Unknown Date'}</span>
          </div>
          <p className="text-tech-muted text-sm mb-3 line-clamp-2">
            {patent.abstract || 'No abstract available'}
          </p>
          <div className="flex items-center space-x-2">
            <button className="text-tech-primary hover:text-tech-primary/80 text-sm">
              View Patent
            </button>
            <button className="text-tech-muted hover:text-tech-text text-sm">
              Save
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  )

  const NewsCard = ({ article }) => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="tech-card-hover mb-4"
    >
      <div className="flex items-start space-x-4">
        {article.urlToImage && (
          <img 
            src={article.urlToImage} 
            alt={article.title}
            className="w-20 h-20 rounded-lg object-cover flex-shrink-0"
          />
        )}
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-tech-text mb-2 hover:text-tech-primary cursor-pointer">
            {article.title}
          </h3>
          <div className="flex items-center space-x-4 text-sm text-tech-muted mb-2">
            <span>{article.source?.name || 'Unknown Source'}</span>
            <span>•</span>
            <span>{new Date(article.publishedAt).toLocaleDateString()}</span>
            <span className={`px-2 py-1 text-xs rounded ${
              Math.random() > 0.5 ? 'bg-tech-success/20 text-tech-success' : 
              Math.random() > 0.5 ? 'bg-tech-secondary/20 text-tech-secondary' :
              'bg-tech-muted/20 text-tech-muted'
            }`}>
              {Math.random() > 0.5 ? 'Positive' : Math.random() > 0.5 ? 'Alert' : 'Neutral'}
            </span>
          </div>
          <p className="text-tech-muted text-sm mb-3 line-clamp-2">
            {article.description || 'No description available'}
          </p>
          <div className="flex items-center space-x-2">
            <button className="text-tech-primary hover:text-tech-primary/80 text-sm">
              Read Article
            </button>
            <a 
              href={article.url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-tech-muted hover:text-tech-text text-sm flex items-center"
            >
              <ExternalLink className="w-3 h-3 mr-1" />
              Source
            </a>
          </div>
        </div>
      </div>
    </motion.div>
  )

  const CompanyCard = ({ company }) => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="tech-card-hover mb-4"
    >
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-tech-text mb-2">
            {company.companyLabel?.value || 'Company Name'}
          </h3>
          <div className="flex items-center space-x-4 text-sm text-tech-muted">
            <span>{company.countryLabel?.value || 'Unknown Country'}</span>
            <span>•</span>
            <span>{company.industryLabel?.value || 'Unknown Industry'}</span>
            <span>•</span>
            <span>Founded {company.founded?.value || 'Unknown'}</span>
          </div>
        </div>
        <button className="text-tech-primary hover:text-tech-primary/80 text-sm">
          View Profile
        </button>
      </div>
    </motion.div>
  )

  const tabs = [
    { id: 'all', name: 'All Results', icon: Search },
    { id: 'papers', name: 'Research Papers', icon: FileText },
    { id: 'patents', name: 'Patents', icon: Quote },
    { id: 'news', name: 'News & Reports', icon: Newspaper },
    { id: 'companies', name: 'Companies', icon: Building }
  ]

  return (
    <div className="flex gap-6">
      {/* Left Sidebar - Filters */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="w-80 flex-shrink-0"
      >
        <div className="tech-card sticky top-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-orbitron font-semibold text-tech-text flex items-center">
              <Filter className="w-5 h-5 mr-2" />
              Filters
            </h3>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="text-tech-muted hover:text-tech-text"
            >
              {showFilters ? <X className="w-4 h-4" /> : <Filter className="w-4 h-4" />}
            </button>
          </div>

          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-6"
              >
                {/* Source Type Tabs */}
                <div>
                  <h4 className="text-sm font-medium text-tech-text mb-3">Source Type</h4>
                  <div className="space-y-2">
                    {tabs.map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${
                          activeTab === tab.id
                            ? 'bg-tech-primary/10 text-tech-primary border border-tech-primary/30'
                            : 'text-tech-muted hover:text-tech-text hover:bg-tech-border/50'
                        }`}
                      >
                        <tab.icon className="w-4 h-4 inline mr-2" />
                        {tab.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Year Range */}
                <div>
                  <h4 className="text-sm font-medium text-tech-text mb-3 flex items-center">
                    <Calendar className="w-4 h-4 mr-1" />
                    Year Range
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      placeholder="From"
                      value={filters.year_from}
                      onChange={(e) => setFilters(prev => ({ ...prev, year_from: e.target.value }))}
                      className="tech-input text-sm"
                      min="1900"
                      max="2024"
                    />
                    <input
                      type="number"
                      placeholder="To"
                      value={filters.year_to}
                      onChange={(e) => setFilters(prev => ({ ...prev, year_to: e.target.value }))}
                      className="tech-input text-sm"
                      min="1900"
                      max="2024"
                    />
                  </div>
                </div>

                {/* Country Filter */}
                <div>
                  <h4 className="text-sm font-medium text-tech-text mb-3 flex items-center">
                    <Globe className="w-4 h-4 mr-1" />
                    Country
                  </h4>
                  <select className="tech-input text-sm">
                    <option>All Countries</option>
                    <option>United States</option>
                    <option>China</option>
                    <option>India</option>
                    <option>United Kingdom</option>
                    <option>Germany</option>
                    <option>France</option>
                    <option>Japan</option>
                    <option>South Korea</option>
                  </select>
                </div>

                {/* TRL Level */}
                <div>
                  <h4 className="text-sm font-medium text-tech-text mb-3">TRL Level</h4>
                  <div className="grid grid-cols-3 gap-2">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(trl => (
                      <label key={trl} className="flex items-center">
                        <input
                          type="checkbox"
                          checked={filters.trl_level.includes(trl.toString())}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setFilters(prev => ({ 
                                ...prev, 
                                trl_level: [...prev.trl_level, trl.toString()] 
                              }))
                            } else {
                              setFilters(prev => ({ 
                                ...prev, 
                                trl_level: prev.trl_level.filter(t => t !== trl.toString()) 
                              }))
                            }
                          }}
                          className="w-3 h-3 text-tech-primary bg-tech-surface border-tech-border rounded"
                        />
                        <span className="ml-1 text-xs text-tech-text">TRL {trl}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Sort By */}
                <div>
                  <h4 className="text-sm font-medium text-tech-text mb-3 flex items-center">
                    <TrendingUp className="w-4 h-4 mr-1" />
                    Sort By
                  </h4>
                  <select 
                    value={filters.sort_by}
                    onChange={(e) => setFilters(prev => ({ ...prev, sort_by: e.target.value }))}
                    className="tech-input text-sm"
                  >
                    <option value="relevance">Relevance</option>
                    <option value="date_newest">Date: Newest</option>
                    <option value="date_oldest">Date: Oldest</option>
                    <option value="citations_most">Citations: Most</option>
                  type="submit"
                  className="tech-button-primary px-4 py-2 text-sm font-medium"
                >
                  Search
                </motion.button>
              </div>
            </div>
          </form>
        </motion.div>

        {/* Results */}
        <div className="space-y-6">
          {isLoading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-tech-primary mx-auto"></div>
              <p className="text-tech-muted mt-4">Searching...</p>
            </div>
          ) : searchResults ? (
            <>
              {/* Results Count */}
              <div className="text-tech-muted mb-6">
                Found {Object.values(searchResults).flat().length} results for "{query}"
              </div>

              {/* Search Statistics */}
              {searchResults && (
                <div className="space-y-6">
                  <div className="tech-card p-6 mb-6">
                    <h3 className="text-lg font-orbitron font-semibold text-tech-text mb-4">
                      Search Analytics
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-tech-primary">{searchResults.papers?.length || 0}</div>
                        <div className="text-sm text-tech-muted">Research Papers</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-accent-gold">{searchResults.patents?.length || 0}</div>
                        <div className="text-sm text-tech-muted">Patents</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-accent-secondary">{searchResults.news?.length || 0}</div>
                        <div className="text-sm text-tech-muted">News Articles</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-tech-primary/80">{searchResults.companies?.length || 0}</div>
                        <div className="text-sm text-tech-muted">Companies</div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Simple Bar Chart */}
                  <div className="tech-card p-6">
                    <h3 className="text-lg font-orbitron font-semibold text-tech-text mb-4">
                      Results Distribution
                    </h3>
                    <div className="space-y-3">
                      {[
                        { label: 'Papers', value: searchResults.papers?.length || 0, color: 'bg-tech-primary' },
                        { label: 'Patents', value: searchResults.patents?.length || 0, color: 'bg-accent-gold' },
                        { label: 'News', value: searchResults.news?.length || 0, color: 'bg-accent-secondary' },
                        { label: 'Companies', value: searchResults.companies?.length || 0, color: 'bg-tech-primary/60' }
                      ].map((item, index) => (
                        <div key={item.label} className="flex items-center space-x-3">
                          <div className="w-24 text-sm text-tech-muted font-medium">
                            {item.label}
                          </div>
                          <div className="flex-1 bg-tech-secondary rounded-full h-4 relative overflow-hidden">
                            <div 
                              className={`h-full ${item.color} transition-all duration-500`}
                              style={{ width: `${Math.max((item.value / Math.max(...[
                                searchResults.papers?.length || 0,
                                searchResults.patents?.length || 0,
                                searchResults.news?.length || 0,
                                searchResults.companies?.length || 0
                              ], 1)) * 100, 2)}%` }}
                            />
                          </div>
                          <div className="w-12 text-sm font-bold text-tech-text text-right">
                            {item.value}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Results by Type */}
              {activeTab === 'all' || activeTab === 'papers' ? (
                <div>
                  <h3 className="text-xl font-orbitron font-semibold text-tech-text mb-4">
                    Research Papers ({searchResults.papers?.length || 0})
                  </h3>
                  {searchResults.papers?.map((paper, index) => (
                    <PaperCard key={index} paper={paper} />
                  ))}
                </div>
              ) : null}

              {activeTab === 'all' || activeTab === 'patents' ? (
                <div>
                  <h3 className="text-xl font-orbitron font-semibold text-tech-text mb-4">
                    Patents ({searchResults.patents?.length || 0})
                  </h3>
                  {searchResults.patents?.map((patent, index) => (
                    <PatentCard key={index} patent={patent} />
                  ))}
                </div>
              ) : null}

              {activeTab === 'all' || activeTab === 'news' ? (
                <div>
                  <h3 className="text-xl font-orbitron font-semibold text-tech-text mb-4">
                    News & Reports ({searchResults.news?.length || 0})
                  </h3>
                  {searchResults.news?.map((article, index) => (
                    <NewsCard key={index} article={article} />
                  ))}
                </div>
              ) : null}

              {activeTab === 'all' || activeTab === 'companies' ? (
                <div>
                  <h3 className="text-xl font-orbitron font-semibold text-tech-text mb-4">
                    Companies ({searchResults.companies?.length || 0})
                  </h3>
                  {searchResults.companies?.map((company, index) => (
                    <CompanyCard key={index} company={company} />
                  ))}
                </div>
              ) : null}
            </>
          ) : query ? (
            <div className="text-center py-12">
              <p className="text-tech-muted">No results found for "{query}"</p>
              <p className="text-tech-muted text-sm mt-2">Try adjusting your search terms or filters</p>
            </div>
          ) : (
            <div className="text-center py-12">
              <Search className="w-16 h-16 text-tech-muted mx-auto mb-4" />
              <h3 className="text-xl font-orbitron font-semibold text-tech-text mb-2">
                Start Your Search
              </h3>
              <p className="text-tech-muted">
                Enter a technology name or keyword to begin your intelligence analysis
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Right Sidebar - AI Insights */}
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className="w-80 flex-shrink-0"
      >
        <div className="tech-card sticky top-6">
          <h3 className="text-lg font-orbitron font-semibold text-tech-text mb-4">
            AI Insights
          </h3>
          
          {searchResults && Object.values(searchResults).flat().length > 0 ? (
            <div className="space-y-4">
              {/* AI Summary */}
              <div>
                <h4 className="text-sm font-medium text-tech-text mb-2">Strategic Overview</h4>
                <p className="text-tech-muted text-sm">
                  Based on {Object.values(searchResults).flat().length} sources, this technology shows significant research activity with growing defence applications.
                </p>
              </div>

              {/* TRL Level */}
              <div>
                <h4 className="text-sm font-medium text-tech-text mb-2">TRL Assessment</h4>
                <div className="flex items-center space-x-3">
                  <div className="flex-1 bg-tech-border rounded-full h-2">
                    <div className="bg-tech-primary h-2 rounded-full" style={{ width: '65%' }}></div>
                  </div>
                  <span className="text-tech-primary font-mono text-sm">TRL 6</span>
                </div>
                <p className="text-tech-muted text-xs mt-1">65% confidence</p>
              </div>

              {/* Growth Signal */}
              <div>
                <h4 className="text-sm font-medium text-tech-text mb-2">Growth Signal</h4>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-tech-success rounded-full"></div>
                  <span className="text-tech-success text-sm font-medium">+23%</span>
                  <span className="text-tech-muted text-sm">vs last year</span>
                </div>
              </div>

              {/* Key Drivers */}
              <div>
                <h4 className="text-sm font-medium text-tech-text mb-2">Key Drivers</h4>
                <ul className="text-tech-muted text-sm space-y-1">
                  <li>• Increased defence funding</li>
                  <li>• Strategic importance</li>
                  <li>• Commercial applications</li>
                </ul>
              </div>

              {/* Technology Convergence */}
              <div>
                <h4 className="text-sm font-medium text-tech-text mb-2">Related Technologies</h4>
                <div className="flex flex-wrap gap-1">
                  {['AI/ML', 'Quantum', 'Robotics'].map(tech => (
                    <span key={tech} className="px-2 py-1 text-xs bg-tech-primary/10 text-tech-primary rounded-full">
                      {tech}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="w-12 h-12 bg-tech-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                <Search className="w-6 h-6 text-tech-primary" />
              </div>
              <p className="text-tech-muted text-sm">
                AI insights will appear here after you search
              </p>
            </div>
          )}
        </div>
      </motion.div>

      {/* Paper Modal */}
      <PaperModal 
        isOpen={!!selectedPaper}
        onClose={() => setSelectedPaper(null)}
        paper={selectedPaper}
      />
    </div>
  )
}

export default SearchPage
