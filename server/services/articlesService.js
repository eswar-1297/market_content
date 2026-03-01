import axios from 'axios';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, '..', 'data');
const CACHE_FILE = join(CACHE_DIR, 'articles-cache.json');

const WP_API = 'https://www.cloudfuze.com/wp-json/wp/v2';
const PER_PAGE = 100;
const FULL_REFRESH_MS = 24 * 60 * 60 * 1000;    // full re-fetch every 24 hours
const INCREMENTAL_MS  = 4 * 60 * 60 * 1000;     // check for new articles every 4 hours

let articlesCache = null;
let authorsCache = null;
let lastFetchTime = 0;
let lastIncrementalTime = 0;
let fetchInProgress = null;
let timersStarted = false;

function loadFromDisk() {
  try {
    if (!existsSync(CACHE_FILE)) return false;
    const raw = readFileSync(CACHE_FILE, 'utf-8');
    const data = JSON.parse(raw);
    if (!data.articles || !data.authors || !data.timestamp) return false;

    const age = Date.now() - data.timestamp;
    if (age > FULL_REFRESH_MS) {
      console.log(`  Articles: disk cache expired (${Math.round(age / 3600000)}h old)`);
      return false;
    }

    articlesCache = data.articles;
    authorsCache = data.authors;
    lastFetchTime = data.timestamp;
    lastIncrementalTime = data.lastIncremental || data.timestamp;
    console.log(`  Articles: loaded ${articlesCache.length} articles from disk cache (${Math.round(age / 3600000)}h old)`);
    return true;
  } catch (err) {
    console.warn('  Articles: failed to load disk cache:', err.message);
    return false;
  }
}

function saveToDisk() {
  try {
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
    const data = JSON.stringify({
      articles: articlesCache,
      authors: authorsCache,
      timestamp: lastFetchTime,
      lastIncremental: lastIncrementalTime,
    });
    writeFileSync(CACHE_FILE, data, 'utf-8');
    console.log(`  Articles: saved ${articlesCache.length} articles to disk cache`);
  } catch (err) {
    console.warn('  Articles: failed to save disk cache:', err.message);
  }
}

function decodeHtml(html) {
  return html
    .replace(/&#8217;/g, '\u2019')
    .replace(/&#8216;/g, '\u2018')
    .replace(/&#8220;/g, '\u201C')
    .replace(/&#8221;/g, '\u201D')
    .replace(/&#8211;/g, '\u2013')
    .replace(/&#8212;/g, '\u2014')
    .replace(/&#038;/g, '&')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parsePost(post) {
  const authorData = post._embedded?.author?.[0];
  return {
    id: post.id,
    title: decodeHtml(post.title?.rendered || ''),
    url: post.link,
    date: post.date,
    author: authorData?.name || 'Unknown',
    authorSlug: authorData?.slug || 'unknown',
  };
}

function rebuildAuthors() {
  const authorMap = new Map();
  for (const a of articlesCache) {
    if (a.author !== 'Unknown') authorMap.set(a.authorSlug, a.author);
  }
  authorsCache = [...authorMap.entries()]
    .map(([slug, name]) => ({ slug, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function fetchAllPosts() {
  const allPosts = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const res = await axios.get(`${WP_API}/posts`, {
      params: { per_page: PER_PAGE, page, _embed: 'author' },
      timeout: 30000,
    });

    if (page === 1) {
      totalPages = parseInt(res.headers['x-wp-totalpages'] || '1', 10);
      console.log(`  Articles: fetching ${res.headers['x-wp-total'] || '?'} posts across ${totalPages} pages`);
    }

    for (const post of res.data) {
      allPosts.push(parsePost(post));
    }
    page++;
  }

  allPosts.sort((a, b) => new Date(b.date) - new Date(a.date));
  return allPosts;
}

async function fetchNewPostsSince(afterDate) {
  const newPosts = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const res = await axios.get(`${WP_API}/posts`, {
      params: {
        per_page: PER_PAGE,
        page,
        _embed: 'author',
        after: new Date(afterDate).toISOString(),
        orderby: 'date',
        order: 'desc',
      },
      timeout: 30000,
    });

    if (page === 1) {
      totalPages = parseInt(res.headers['x-wp-totalpages'] || '1', 10);
    }

    for (const post of res.data) {
      newPosts.push(parsePost(post));
    }
    page++;
  }

  return newPosts;
}

async function fullRefresh() {
  if (fetchInProgress) return fetchInProgress;

  fetchInProgress = (async () => {
    try {
      console.log('  Articles: full refresh from WP REST API...');
      const allPosts = await fetchAllPosts();
      articlesCache = allPosts;
      lastFetchTime = Date.now();
      lastIncrementalTime = Date.now();
      rebuildAuthors();
      console.log(`  Articles: cached ${articlesCache.length} articles, ${authorsCache.length} authors`);
      saveToDisk();
    } finally {
      fetchInProgress = null;
    }
  })();

  return fetchInProgress;
}

async function incrementalRefresh() {
  if (!articlesCache || articlesCache.length === 0) {
    return fullRefresh();
  }
  if (fetchInProgress) return fetchInProgress;

  fetchInProgress = (async () => {
    try {
      const latestDate = articlesCache[0]?.date;
      console.log(`  Articles: incremental check for posts after ${latestDate}...`);

      const newPosts = await fetchNewPostsSince(latestDate);
      if (newPosts.length === 0) {
        console.log('  Articles: no new articles found');
        lastIncrementalTime = Date.now();
        return;
      }

      const existingIds = new Set(articlesCache.map(a => a.id));
      const uniqueNew = newPosts.filter(p => !existingIds.has(p.id));

      if (uniqueNew.length > 0) {
        articlesCache = [...uniqueNew, ...articlesCache];
        rebuildAuthors();
        console.log(`  Articles: added ${uniqueNew.length} new articles (total: ${articlesCache.length})`);
        saveToDisk();
      } else {
        console.log('  Articles: all fetched articles already in cache');
      }
      lastIncrementalTime = Date.now();
    } finally {
      fetchInProgress = null;
    }
  })();

  return fetchInProgress;
}

function startBackgroundTimers() {
  if (timersStarted) return;
  timersStarted = true;

  // Incremental check every 4 hours
  setInterval(() => {
    console.log('  Articles: scheduled incremental refresh...');
    incrementalRefresh().catch(err => console.warn('Incremental refresh failed:', err.message));
  }, INCREMENTAL_MS);

  // Full refresh every 24 hours
  setInterval(() => {
    console.log('  Articles: scheduled full refresh (24h)...');
    fullRefresh().catch(err => console.warn('Full refresh failed:', err.message));
  }, FULL_REFRESH_MS);

  console.log('  Articles: background timers started (incremental: 4h, full: 24h)');
}

function isCacheEmpty() {
  return !articlesCache;
}

export async function getArticles({ author, period } = {}) {
  if (isCacheEmpty()) await fullRefresh();

  let filtered = [...articlesCache];

  if (author && author !== 'all') {
    filtered = filtered.filter(a => a.authorSlug === author);
  }

  if (period && period !== 'all') {
    const now = new Date();
    let cutoff;
    switch (period) {
      case '7d':  cutoff = new Date(now - 7 * 24 * 60 * 60 * 1000); break;
      case '30d': cutoff = new Date(now - 30 * 24 * 60 * 60 * 1000); break;
      case '3m':  cutoff = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()); break;
      case '6m':  cutoff = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate()); break;
      case '1y':  cutoff = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()); break;
      case '2y':  cutoff = new Date(now.getFullYear() - 2, now.getMonth(), now.getDate()); break;
      default:    cutoff = null;
    }
    if (cutoff) {
      filtered = filtered.filter(a => new Date(a.date) >= cutoff);
    }
  }

  return filtered;
}

export async function getAuthors() {
  if (isCacheEmpty()) await fullRefresh();
  return authorsCache;
}

export async function preloadArticles() {
  const loaded = loadFromDisk();
  if (!loaded) {
    await fullRefresh().catch(err => console.warn('Articles preload failed:', err.message));
  }
  startBackgroundTimers();
}
