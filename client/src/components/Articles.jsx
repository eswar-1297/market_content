import { useState, useEffect, useCallback } from 'react';
import {
  Newspaper, User, Calendar, ExternalLink, Loader2,
  RefreshCw, Search, ChevronDown, FileText
} from 'lucide-react';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const TIME_PERIODS = [
  { value: 'all', label: 'All Time' },
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
  { value: '3m', label: 'Last 3 Months' },
  { value: '6m', label: 'Last 6 Months' },
  { value: '1y', label: 'Last Year' },
  { value: '2y', label: 'Last 2 Years' },
];

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function daysAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export default function Articles() {
  const [authors, setAuthors] = useState([]);
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedAuthor, setSelectedAuthor] = useState('all');
  const [selectedPeriod, setSelectedPeriod] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const fetchAuthors = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/api/articles/authors`);
      setAuthors(data.authors || []);
    } catch (err) {
      console.error('Failed to load authors:', err.message);
    }
  }, []);

  const fetchArticles = useCallback(async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);
      setError(null);
      const params = {};
      if (selectedAuthor !== 'all') params.author = selectedAuthor;
      if (selectedPeriod !== 'all') params.period = selectedPeriod;
      const { data } = await axios.get(`${API}/api/articles`, { params });
      setArticles(data.articles || []);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedAuthor, selectedPeriod]);

  useEffect(() => {
    fetchAuthors();
  }, [fetchAuthors]);

  useEffect(() => {
    fetchArticles();
  }, [fetchArticles]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchArticles(false);
  };

  const filtered = searchQuery.trim()
    ? articles.filter(a =>
        a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.url.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : articles;

  const authorName = selectedAuthor === 'all'
    ? 'All Authors'
    : authors.find(a => a.slug === selectedAuthor)?.name || selectedAuthor;

  const periodLabel = TIME_PERIODS.find(p => p.value === selectedPeriod)?.label || 'All Time';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Newspaper className="w-7 h-7 text-indigo-600" />
            CloudFuze Articles
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Browse all published articles by author and time period
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing || loading}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg
            bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Author filter */}
        <div className="relative">
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
            <User className="w-3.5 h-3.5 inline mr-1" />
            Author
          </label>
          <div className="relative">
            <select
              value={selectedAuthor}
              onChange={e => setSelectedAuthor(e.target.value)}
              className="w-full appearance-none bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700
                rounded-lg px-4 py-2.5 pr-10 text-sm text-gray-900 dark:text-gray-100
                focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
            >
              <option value="all">All Authors</option>
              {authors.map(a => (
                <option key={a.slug} value={a.slug}>{a.name}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
        </div>

        {/* Period filter */}
        <div className="relative">
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
            <Calendar className="w-3.5 h-3.5 inline mr-1" />
            Time Period
          </label>
          <div className="relative">
            <select
              value={selectedPeriod}
              onChange={e => setSelectedPeriod(e.target.value)}
              className="w-full appearance-none bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700
                rounded-lg px-4 py-2.5 pr-10 text-sm text-gray-900 dark:text-gray-100
                focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
            >
              {TIME_PERIODS.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
            <Search className="w-3.5 h-3.5 inline mr-1" />
            Search Articles
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by title..."
              className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700
                rounded-lg pl-10 pr-4 py-2.5 text-sm text-gray-900 dark:text-gray-100
                placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Summary bar */}
      <div className="flex items-center justify-between bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 px-5 py-3">
        <div className="text-sm text-gray-600 dark:text-gray-400">
          Showing <span className="font-semibold text-gray-900 dark:text-white">{filtered.length}</span> articles
          {selectedAuthor !== 'all' && (
            <span> by <span className="font-semibold text-indigo-600 dark:text-indigo-400">{authorName}</span></span>
          )}
          {selectedPeriod !== 'all' && (
            <span> from <span className="font-medium">{periodLabel.toLowerCase()}</span></span>
          )}
        </div>
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            Clear search
          </button>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mb-3" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading articles from CloudFuze...</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">First load may take a moment</p>
        </div>
      ) : error ? (
        <div className="text-center py-16 bg-white dark:bg-gray-900 rounded-lg border border-red-200 dark:border-red-900">
          <p className="text-red-600 dark:text-red-400 font-medium">Failed to load articles</p>
          <p className="text-sm text-gray-500 mt-1">{error}</p>
          <button onClick={() => fetchArticles()} className="mt-4 text-sm text-indigo-600 hover:underline">
            Try again
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800">
          <FileText className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400 font-medium">No articles found</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Try adjusting your filters</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((article, idx) => (
            <div
              key={article.id || idx}
              className="group bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800
                hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-sm transition-all px-5 py-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <a
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-gray-900 dark:text-white hover:text-indigo-600
                      dark:hover:text-indigo-400 transition-colors line-clamp-2"
                  >
                    {article.title}
                  </a>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-gray-500 dark:text-gray-400">
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {article.author}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {formatDate(article.date)}
                    </span>
                    <span className="text-gray-400 dark:text-gray-500">
                      {daysAgo(article.date)}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500 truncate">
                    {article.url}
                  </p>
                </div>
                <a
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-shrink-0 p-2 rounded-lg text-gray-400 hover:text-indigo-600
                    hover:bg-indigo-50 dark:hover:bg-indigo-950 transition-colors opacity-0 group-hover:opacity-100"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
