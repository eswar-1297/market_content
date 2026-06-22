import axios from 'axios';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { DATA_DIR, dataPath } from '../config/paths.js';

// CloudFuze customer case studies are published as WordPress *pages* (not blog
// posts), so they never appear in articlesService.js (which only fetches /posts).
// This service fetches the real case study pages so the agent can return actual
// customer success stories instead of blog articles that merely mention the
// phrase "case study".

const CACHE_DIR = DATA_DIR;
const CACHE_FILE = dataPath('case-studies-cache.json');

const WP_API = 'https://www.cloudfuze.com/wp-json/wp/v2';
const REFRESH_MS = 24 * 60 * 60 * 1000; // re-fetch every 24 hours

// Pages returned by the "case study" search that are NOT customer case studies.
const EXCLUDE_SLUGS = new Set(['case-studies', 'customer-stories', 'enterprise', 'products']);

// Platforms we tag case studies with so the agent can filter by source/destination.
const PLATFORMS = [
  'Google Workspace', 'Microsoft 365', 'Microsoft Teams', 'Google Chat',
  'SharePoint', 'OneDrive', 'Dropbox', 'Box', 'Slack', 'Gmail', 'Outlook',
  'Egnyte', 'Google Drive',
];

let cache = null;
let lastFetchTime = 0;
let fetchInProgress = null;
let timerStarted = false;

function decodeHtml(html) {
  return (html || '')
    .replace(/&#8217;/g, '’')
    .replace(/&#8216;/g, '‘')
    .replace(/&#8220;/g, '“')
    .replace(/&#8221;/g, '”')
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/&#038;/g, '&')
    .replace(/&amp;/g, '&')
    .replace(/&#8230;/g, '…')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripTags(html) {
  return decodeHtml((html || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

// Keep a page only if it's a real customer case study, not an ad/landing/listing page.
function isCaseStudy(slug, title) {
  if (EXCLUDE_SLUGS.has(slug)) return false;
  if (/-ads$/.test(slug)) return false;          // dropbox-to-google-workspace-ads, etc.
  if (slug.includes('case-study')) return true;  // *-case-study slugs
  return /cloudfuze/i.test(title);               // e.g. opendoor/litera/front/stryker stories
}

function detectPlatforms(text) {
  const lower = (text || '').toLowerCase();
  return PLATFORMS.filter(p => lower.includes(p.toLowerCase()));
}

// Best-effort company name: text before "Case Study" / "Migrates" / "Adopts" / apostrophe-s.
function detectCompany(title) {
  const t = (title || '').trim();
  const m = t.match(/^(.*?)(?:\s+case study|\s+migrat\w*|\s+adopts?|\s+embraces?|\s+consolidat\w*|\s+becomes?|\s+moves?|\s+relied|’s|'s)\b/i);
  return (m ? m[1] : t.split(/\s+/).slice(0, 3).join(' ')).trim();
}

function loadFromDisk() {
  try {
    if (!existsSync(CACHE_FILE)) return false;
    const data = JSON.parse(readFileSync(CACHE_FILE, 'utf-8'));
    if (!data.caseStudies || !data.timestamp) return false;
    if (Date.now() - data.timestamp > REFRESH_MS) return false;
    cache = data.caseStudies;
    lastFetchTime = data.timestamp;
    console.log(`  Case studies: loaded ${cache.length} from disk cache`);
    return true;
  } catch (err) {
    console.warn('  Case studies: failed to load disk cache:', err.message);
    return false;
  }
}

function saveToDisk() {
  try {
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(CACHE_FILE, JSON.stringify({ caseStudies: cache, timestamp: lastFetchTime }), 'utf-8');
    console.log(`  Case studies: saved ${cache.length} to disk cache`);
  } catch (err) {
    console.warn('  Case studies: failed to save disk cache:', err.message);
  }
}

async function refresh() {
  if (fetchInProgress) return fetchInProgress;

  fetchInProgress = (async () => {
    try {
      console.log('  Case studies: fetching from WP REST API...');
      const res = await axios.get(`${WP_API}/pages`, {
        params: { search: 'case study', per_page: 100, _fields: 'id,title,link,slug,date,excerpt,yoast_head_json' },
        timeout: 30000,
      });

      const studies = (res.data || [])
        .map(p => {
          const title = decodeHtml(p.title?.rendered || '');
          return { slug: p.slug || '', title, raw: p };
        })
        .filter(p => isCaseStudy(p.slug, p.title))
        .map(({ slug, title, raw }) => {
          // The Yoast meta description is a clean, human-written one-liner that names
          // the source → destination platforms (e.g. "migrated from Box to Microsoft
          // 365"). Far more reliable than scanning page HTML, which is full of
          // nav/footer platform mentions. Fall back to the WP excerpt.
          const yoast = raw.yoast_head_json || {};
          const summary = decodeHtml(yoast.og_description || yoast.description || stripTags(raw.excerpt?.rendered || ''));
          return {
            title,
            url: raw.link,
            slug,
            date: raw.date || null,
            summary,
            company: detectCompany(title),
            // Detect platforms from the title + clean summary only — avoids the
            // false positives that come from scanning full page content.
            platforms: detectPlatforms(`${title} ${summary}`),
          };
        })
        .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

      cache = studies;
      lastFetchTime = Date.now();
      console.log(`  Case studies: cached ${cache.length} customer case studies`);
      saveToDisk();
    } finally {
      fetchInProgress = null;
    }
  })();

  return fetchInProgress;
}

/**
 * Get CloudFuze customer case studies, optionally filtered by a query that can
 * match company name, platform (e.g. "Google Workspace", "Box"), or industry.
 * Returns an array of { title, url, slug, date, summary, company, platforms, relevance? }.
 */
export async function getCaseStudies({ query } = {}) {
  if (!cache) await refresh();
  let results = [...(cache || [])];

  const q = (query || '').toString().trim().toLowerCase();
  if (q) {
    const stop = new Set(['the', 'and', 'for', 'case', 'study', 'studies', 'with', 'from', 'customer', 'show', 'me', 'any', 'about', 'migration']);
    const words = q.split(/\s+/).filter(w => w.length > 2 && !stop.has(w));

    results = results
      .map(cs => {
        const hay = `${cs.title} ${cs.company} ${cs.summary} ${cs.platforms.join(' ')}`.toLowerCase();
        const exact = hay.includes(q) ? 10 : 0;
        const wordHits = words.filter(w => hay.includes(w)).length;
        return { ...cs, relevance: exact + wordHits };
      })
      // If the query had meaningful words, require a match; otherwise keep all.
      .filter(cs => words.length === 0 || cs.relevance > 0)
      .sort((a, b) => b.relevance - a.relevance);
  }

  return results;
}

export async function preloadCaseStudies() {
  if (!loadFromDisk()) {
    await refresh().catch(err => console.warn('Case studies preload failed:', err.message));
  }
  if (!timerStarted) {
    timerStarted = true;
    setInterval(() => {
      refresh().catch(err => console.warn('Case studies refresh failed:', err.message));
    }, REFRESH_MS);
  }
}
