import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = join(__dirname, '..', 'cache', 'youtube-videos.json');

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';
const CLOUDFUZE_CHANNEL_HANDLE = '@CloudFuze';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

let videoCache = { data: null, fetchedAt: 0 };

// Keyword dictionary — longer names first so "google workspace" matches before "google"
// Names that are substrings of others MUST come after the longer form
const KNOWN_KEYWORDS = [
  // CloudFuze products
  'cloudfuze manage', 'cloudfuze migrate', 'cloudfuze',
  // Cloud platforms
  'google workspace', 'google drive', 'google vault', 'google cloud',
  'microsoft 365', 'office 365', 'microsoft azure',
  'onedrive for business', 'onedrive',
  'sharepoint online', 'sharepoint',
  'outlook', 'exchange online', 'exchange',
  'microsoft teams', 'teams', 'slack',
  'dropbox business', 'dropbox',
  'box enterprise', 'box',
  'egnyte', 'citrix sharefile', 'sharefile',
  'amazon s3', 'aws',
  'azure', 'salesforce', 'icloud',
  'zoho', 'hubspot', 'jira', 'confluence', 'notion',
  'gmail', 'wasabi',
  // Product/feature categories
  'saas management', 'saas discovery', 'saas',
  'cross-tenant', 'tenant-to-tenant',
];

// Keywords that are common English words — need word-boundary matching
const AMBIGUOUS_KEYWORDS = new Set(['box', 'teams', 'exchange', 'outlook', 'slack', 'notion', 'saas']);

// Words to ignore when building fallback search phrases from titles
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'into', 'your', 'how', 'what', 'why',
  'this', 'that', 'which', 'when', 'where', 'who', 'its', 'are', 'was', 'were',
  'been', 'being', 'have', 'has', 'had', 'does', 'did', 'will', 'would', 'can',
  'could', 'should', 'may', 'might', 'must', 'shall', 'not', 'but', 'nor',
  'yet', 'both', 'either', 'neither', 'each', 'every', 'all', 'any', 'few',
  'more', 'most', 'other', 'some', 'such', 'only', 'own', 'same', 'than',
  'too', 'very', 'just', 'about', 'above', 'after', 'before', 'between',
  'through', 'during', 'below', 'over', 'under', 'again', 'then', 'once',
  'here', 'there', 'also', 'best', 'top', 'guide', 'complete', 'ultimate',
  'time', 'cost', 'savings', 'manual', 'overview',
]);

// ─── Disk Cache ──────────────────────────────────────────────────────────────

function loadDiskCache() {
  try {
    if (!existsSync(CACHE_FILE)) return null;
    const parsed = JSON.parse(readFileSync(CACHE_FILE, 'utf-8'));
    if (parsed && parsed.data && parsed.fetchedAt) return parsed;
  } catch (_) {}
  return null;
}

function saveDiskCache(cache) {
  try {
    mkdirSync(dirname(CACHE_FILE), { recursive: true });
    writeFileSync(CACHE_FILE, JSON.stringify(cache), 'utf-8');
  } catch (err) {
    console.warn('YouTube: failed to save disk cache:', err.message);
  }
}

// ─── YouTube Data API ────────────────────────────────────────────────────────

async function resolveChannelId(apiKey) {
  const url = `${YOUTUBE_API_BASE}/channels?part=contentDetails&forHandle=${CLOUDFUZE_CHANNEL_HANDLE}&key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`YouTube API error (channels): ${err.error?.message || res.statusText}`);
  }
  const data = await res.json();
  if (!data.items || data.items.length === 0) {
    throw new Error('CloudFuze YouTube channel not found.');
  }
  return {
    channelId: data.items[0].id,
    uploadsPlaylistId: data.items[0].contentDetails.relatedPlaylists.uploads
  };
}

async function fetchPlaylistVideos(playlistId, apiKey, maxResults = 500) {
  const videos = [];
  let pageToken = '';

  while (true) {
    const batchSize = Math.min(maxResults - videos.length, 50);
    const url = `${YOUTUBE_API_BASE}/playlistItems?part=snippet&playlistId=${playlistId}&maxResults=${batchSize}&key=${apiKey}${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`YouTube API error (playlistItems): ${err.error?.message || res.statusText}`);
    }
    const data = await res.json();

    for (const item of (data.items || [])) {
      const s = item.snippet;
      if (!s || s.title === 'Private video' || s.title === 'Deleted video') continue;
      videos.push({
        title: s.title,
        videoId: s.resourceId.videoId,
        url: `https://www.youtube.com/watch?v=${s.resourceId.videoId}`,
        description: (s.description || '').substring(0, 500),
        publishedAt: s.publishedAt,
        thumbnail: s.thumbnails?.medium?.url || s.thumbnails?.default?.url || null,
        searchText: `${s.title} ${(s.description || '').substring(0, 500)}`.toLowerCase()
      });
    }

    if (!data.nextPageToken || videos.length >= maxResults) break;
    pageToken = data.nextPageToken;
  }

  return videos;
}

// ─── Keyword Extraction ─────────────────────────────────────────────────────

function keywordRegex(keyword) {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (AMBIGUOUS_KEYWORDS.has(keyword)) {
    return new RegExp(`\\b${escaped}\\b`, 'gi');
  }
  return new RegExp(escaped, 'gi');
}

function extractKnownKeywords(text) {
  const lower = text.toLowerCase();
  const found = [];
  let remaining = lower;

  for (const kw of KNOWN_KEYWORDS) {
    const regex = keywordRegex(kw);
    if (regex.test(remaining)) {
      found.push(kw);
      remaining = remaining.replace(keywordRegex(kw), ' ');
    }
  }
  return found;
}

/**
 * Remove keywords that are substrings of another keyword already in the list.
 * e.g. if ["cloudfuze manage", "cloudfuze"] → remove "cloudfuze" (it's inside "cloudfuze manage")
 */
function deduplicateKeywords(keywords) {
  return keywords.filter((kw, i) => {
    return !keywords.some((other, j) => i !== j && other.length > kw.length && other.includes(kw));
  });
}

/**
 * Build the H1 subject phrase for tier-1 search.
 * "CloudFuze Manage vs. Manual Audits: Time & Cost Savings"
 * → "cloudfuze manage manual audits" (stop words + punctuation stripped)
 */
function buildTitlePhrase(titleText) {
  if (!titleText) return '';
  return titleText.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w))
    .join(' ')
    .trim();
}

/**
 * Extract the primary topic from the blog content.
 * 
 * Returns tiered search data:
 * - titlePhrase: the cleaned H1 subject (most specific, tier 1)
 * - primaryKeywords: known keywords found in title (tier 2)
 * - searchQueries: compound queries from keywords (tier 3)
 */
export function extractKeywords(content) {
  // 1. Get the title — try HTML tags first, then fall back to first line of plain text
  const h1Match = content.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const titleMatch = content.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  let titleText = (h1Match?.[1] || titleMatch?.[1] || '').replace(/<[^>]+>/g, '').trim();

  // If no HTML title found, use the first non-empty line as the title (plain text content)
  if (!titleText) {
    const lines = content.replace(/<[^>]+>/g, '').split(/\n/).map(l => l.trim()).filter(l => l.length > 5);
    if (lines.length > 0) {
      titleText = lines[0];
      console.log(`  (No H1/title tag found — using first line as title)`);
    }
  }

  // 2. Build the full title phrase for tier-1 search
  const titlePhrase = buildTitlePhrase(titleText);

  // 3. Get known keywords from title
  let primaryKeywords = extractKnownKeywords(titleText);

  // 4. Get secondary keywords from H2 headings (HTML or bold/uppercase lines in plain text)
  const h2Matches = content.match(/<h2[^>]*>([\s\S]*?)<\/h2>/gi) || [];
  const h2Texts = h2Matches.map(h => h.replace(/<[^>]+>/g, '').trim());

  // For plain text: treat lines that look like headings (short, possibly bold/caps) as H2s
  if (h2Texts.length === 0) {
    const plainLines = content.replace(/<[^>]+>/g, '').split(/\n/).map(l => l.trim());
    for (const line of plainLines) {
      if (line.length > 5 && line.length < 100 && line !== titleText) {
        const hasKnownKeyword = KNOWN_KEYWORDS.some(kw => line.toLowerCase().includes(kw));
        if (hasKnownKeyword) h2Texts.push(line);
      }
    }
  }
  const secondaryKeywords = new Set();
  for (const h2 of h2Texts) {
    for (const p of extractKnownKeywords(h2)) {
      if (!primaryKeywords.includes(p)) secondaryKeywords.add(p);
    }
  }

  // 5. If no keywords found in title, fall back to scanning the full content
  if (primaryKeywords.length === 0) {
    let plainText = content.replace(/<[^>]+>/g, ' ').toLowerCase();
    const counts = {};
    for (const kw of KNOWN_KEYWORDS) {
      const regex = keywordRegex(kw);
      const matches = plainText.match(regex);
      if (matches) {
        counts[kw] = matches.length;
        plainText = plainText.replace(regex, ' ');
      }
    }
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    for (const [p] of sorted.slice(0, 3)) {
      primaryKeywords.push(p);
    }
  }

  // 6. Remove redundant keywords (e.g., "cloudfuze" if "cloudfuze manage" exists)
  primaryKeywords = deduplicateKeywords(primaryKeywords);
  const dedupedSecondary = deduplicateKeywords(
    [...secondaryKeywords].filter(s => !primaryKeywords.some(p => p.includes(s)))
  );

  // 7. Build compound search queries for tier-3
  const searchQueries = [];
  for (let i = 0; i < primaryKeywords.length; i++) {
    for (let j = 0; j < primaryKeywords.length; j++) {
      if (i !== j) {
        searchQueries.push(`${primaryKeywords[i]} to ${primaryKeywords[j]}`);
      }
    }
    for (let j = i + 1; j < primaryKeywords.length; j++) {
      searchQueries.push(`${primaryKeywords[i]} ${primaryKeywords[j]}`);
    }
  }
  for (const sp of dedupedSecondary) {
    for (const pp of primaryKeywords) {
      searchQueries.push(`${sp} to ${pp}`);
      searchQueries.push(`${pp} to ${sp}`);
    }
  }

  // 8. Extract important non-platform topic words from the title
  //    These help filter videos when platform keywords alone are too broad
  const EXTRA_STOP = new Set([
    ...STOP_WORDS, 'migrate', 'migration', 'transfer', 'move', 'switch', 'convert',
    'cloud', 'data', 'file', 'files', 'storage', 'platform', 'service', 'tool',
    'step', 'steps', 'easy', 'simple', 'quick', 'fast', 'new', 'free'
  ]);
  const topicWords = titleText
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !EXTRA_STOP.has(w) && !primaryKeywords.some(pk => pk.includes(w)));

  // Deduplicate topic words and remove any that are part of known keywords
  const uniqueTopicWords = [...new Set(topicWords)].filter(w =>
    !KNOWN_KEYWORDS.some(kw => kw === w)
  );

  console.log(`\n🔍 Topic Analysis:`);
  console.log(`  Title: "${titleText}"`);
  console.log(`  Title phrase (tier 1): "${titlePhrase}"`);
  console.log(`  Primary keywords (tier 2): [${primaryKeywords.join(', ')}]`);
  if (dedupedSecondary.length > 0) console.log(`  Secondary keywords: [${dedupedSecondary.join(', ')}]`);
  if (uniqueTopicWords.length > 0) console.log(`  Topic words from title: [${uniqueTopicWords.join(', ')}]`);
  if (searchQueries.length > 0) console.log(`  Compound queries (tier 3): [${searchQueries.join(' | ')}]`);

  return {
    primaryPlatforms: primaryKeywords,
    secondaryPlatforms: dedupedSecondary,
    topicWords: uniqueTopicWords,
    searchQueries,
    titlePhrase,
    title: titleText
  };
}

// ─── Tiered Video Search ────────────────────────────────────────────────────

function videoContainsKeyword(videoText, keyword) {
  return keywordRegex(keyword).test(videoText);
}

/**
 * Check if a video's searchable text contains ALL the significant words
 * from a phrase (order-independent).
 */
function videoMatchesPhrase(videoText, phrase) {
  if (!phrase || phrase.length < 3) return false;
  const words = phrase.split(/\s+/).filter(w => w.length > 2);
  if (words.length === 0) return false;
  return words.every(w => videoText.includes(w));
}

/**
 * Tiered video search with title cross-check:
 * 
 * Matching checks both title AND description, but if a keyword ONLY
 * appears in the description (not the title), the video must pass a
 * title relevance check — at least one primary keyword must also be
 * in the title. This filters out videos where the description has
 * boilerplate promo text but the video itself is about a different topic.
 * 
 * Tier 1 (Best match):  H1 phrase matches in title
 * Tier 2 (Good match):  ALL primary keywords found in title
 * Tier 3 (Related):     At least one keyword in title, rest confirmed in description
 * 
 * Videos that ONLY match in description with zero title relevance are dropped.
 */
export function searchVideosByKeywords(keywordData) {
  if (!videoCache.data || videoCache.data.length === 0) {
    return { results: [], keywordBreakdown: [], totalVideosSearched: 0 };
  }

  const { primaryPlatforms, searchQueries, titlePhrase, topicWords = [] } = keywordData;

  if (primaryPlatforms.length === 0 && !titlePhrase) {
    console.log('YouTube search: no keywords or title phrase detected, skipping');
    return { results: [], keywordBreakdown: [], totalVideosSearched: videoCache.data.length };
  }

  const tier1 = [];
  const tier2 = [];
  const tier3 = [];

  for (const video of videoCache.data) {
    const titleLower = video.title.toLowerCase();
    const descLower = (video.description || '').toLowerCase();
    const fullText = titleLower + ' ' + descLower;

    const titleKeywordHits = primaryPlatforms.filter(p => videoContainsKeyword(titleLower, p));
    const descKeywordHits = primaryPlatforms.filter(p => videoContainsKeyword(descLower, p));
    const allKeywordHits = [...new Set([...titleKeywordHits, ...descKeywordHits])];

    const matchesTitlePhrase = titlePhrase && videoMatchesPhrase(titleLower, titlePhrase);

    const hasAnyTitleRelevance = titleKeywordHits.length > 0 || matchesTitlePhrase;

    if (allKeywordHits.length === 0 && !matchesTitlePhrase) continue;
    if (!hasAnyTitleRelevance) continue;

    // Topic word relevance: how many of the title's topic words appear in the video?
    const titleTopicHits = topicWords.filter(tw => titleLower.includes(tw));
    const fullTopicHits = topicWords.filter(tw => fullText.includes(tw));

    const matchedKeywords = [...new Set(titleKeywordHits)];
    if (matchesTitlePhrase && titlePhrase) matchedKeywords.unshift(titlePhrase);

    for (const dk of descKeywordHits) {
      if (!matchedKeywords.includes(dk)) matchedKeywords.push(dk);
    }

    const compoundHits = searchQueries.filter(q => titleLower.includes(q) || descLower.includes(q));
    for (const c of compoundHits) {
      if (c.includes(' ') && !matchedKeywords.includes(c)) matchedKeywords.push(c);
    }

    let score = 0;
    let tier = 3;

    if (matchesTitlePhrase) {
      score += 100;
      tier = 1;
    }

    if (titleKeywordHits.length === primaryPlatforms.length && primaryPlatforms.length > 0) {
      score += 50;
      if (tier > 2) tier = 2;
    }

    score += titleKeywordHits.length * 20;
    score += descKeywordHits.length * 3;
    score += compoundHits.length;

    // Boost for topic word matches (sharefile, timestamps, etc.)
    score += titleTopicHits.length * 15;
    score += (fullTopicHits.length - titleTopicHits.length) * 5;

    const entry = {
      title: video.title,
      videoId: video.videoId,
      url: video.url,
      description: video.description,
      thumbnail: video.thumbnail,
      publishedAt: video.publishedAt,
      matchedKeywords,
      matchCount: allKeywordHits.length,
      topicWordHits: fullTopicHits.length,
      relevanceScore: score,
      tier
    };

    if (tier === 1) tier1.push(entry);
    else if (tier === 2) tier2.push(entry);
    else tier3.push(entry);
  }

  const sortByScore = (a, b) => {
    if (b.relevanceScore !== a.relevanceScore) return b.relevanceScore - a.relevanceScore;
    return new Date(b.publishedAt) - new Date(a.publishedAt);
  };

  tier1.sort(sortByScore);
  tier2.sort(sortByScore);
  tier3.sort(sortByScore);

  let allMatches;
  let matchMode;

  if (tier1.length > 0 || tier2.length > 0) {
    allMatches = [...tier1, ...tier2, ...tier3];
    matchMode = tier1.length > 0
      ? `${tier1.length} exact topic + ${tier2.length} keyword match`
      : `${tier2.length} all-keyword match`;
  } else {
    allMatches = tier3;
    matchMode = `${tier3.length} partial keyword match (fallback)`;
  }

  // When there are multiple keywords (e.g. sharefile + onedrive), prioritize
  // videos that match MORE keywords over single-keyword matches.
  // Also boost videos with topic word hits.
  if (primaryPlatforms.length >= 2) {
    allMatches.sort((a, b) => {
      const aMulti = a.matchCount >= 2 ? 1 : 0;
      const bMulti = b.matchCount >= 2 ? 1 : 0;
      if (bMulti !== aMulti) return bMulti - aMulti;
      if (b.topicWordHits !== a.topicWordHits) return b.topicWordHits - a.topicWordHits;
      return b.relevanceScore - a.relevanceScore;
    });
  }

  const results = allMatches;

  const keywordBreakdown = primaryPlatforms.map(p => ({
    keyword: p,
    count: results.filter(v => videoContainsKeyword(v.title.toLowerCase(), p)).length
  })).filter(k => k.count > 0);

  console.log(`\n🎬 YouTube search (title + description with cross-check):`);
  console.log(`  Tier 1 (H1 phrase "${titlePhrase || 'N/A'}" in title): ${tier1.length} videos`);
  console.log(`  Tier 2 (all ${primaryPlatforms.length} keywords in title): ${tier2.length} videos`);
  console.log(`  Tier 3 (partial title match + description): ${tier3.length} videos`);
  if (topicWords.length > 0) console.log(`  Topic words used for boosting: [${topicWords.join(', ')}]`);
  console.log(`  → Showing: ${results.length} videos (${matchMode})`);
  results.slice(0, 10).forEach((v, i) => {
    console.log(`  ${i + 1}. [tier=${v.tier}, score=${v.relevanceScore}, topics=${v.topicWordHits}] ${v.title}`);
  });

  return {
    results,
    keywordBreakdown,
    totalVideosSearched: videoCache.data.length,
    matchMode
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Fetch and cache all CloudFuze YouTube videos.
 * No embeddings needed — just metadata for keyword search.
 */
export async function getCloudFuzeVideos(ytApiKey) {
  if (!ytApiKey) return [];

  const now = Date.now();

  // 1. In-memory hit
  if (videoCache.data && (now - videoCache.fetchedAt) < CACHE_TTL_MS) {
    return videoCache.data;
  }

  // 2. Disk hit
  const diskCache = loadDiskCache();
  if (diskCache && (now - diskCache.fetchedAt) < CACHE_TTL_MS) {
    // Ensure searchText exists on cached videos
    diskCache.data.forEach(v => {
      if (!v.searchText) v.searchText = `${v.title} ${v.description || ''}`.toLowerCase();
    });
    videoCache = diskCache;
    console.log(`YouTube: loaded ${videoCache.data.length} videos from disk cache`);
    return videoCache.data;
  }

  // 3. Fresh fetch
  try {
    const { uploadsPlaylistId } = await resolveChannelId(ytApiKey);
    const freshVideos = await fetchPlaylistVideos(uploadsPlaylistId, ytApiKey);

    console.log(`YouTube: fetched ${freshVideos.length} videos from YouTube API`);

    videoCache = { data: freshVideos, fetchedAt: Date.now() };
    saveDiskCache(videoCache);

    console.log(`YouTube: cache saved — ${videoCache.data.length} videos`);
    return videoCache.data;
  } catch (err) {
    console.error('YouTube fetch error:', err.message);
    if (videoCache.data) return videoCache.data;
    if (diskCache) {
      videoCache = diskCache;
      return videoCache.data;
    }
    return [];
  }
}

export function hasYouTubeKey() {
  const key = process.env.YOUTUBE_API_KEY;
  return !!key && key !== 'your-youtube-api-key-here';
}

export function getCacheStats() {
  return {
    videoCount: videoCache.data?.length || 0,
    cachedAt: videoCache.fetchedAt ? new Date(videoCache.fetchedAt).toISOString() : null
  };
}
