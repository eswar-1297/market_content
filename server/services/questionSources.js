import axios from 'axios';
import * as cheerio from 'cheerio';

const QUESTION_WORDS = ['how', 'what', 'why', 'when', 'where', 'which', 'who', 'can', 'does', 'is', 'are', 'will', 'should', 'do'];

const NOISE_SUFFIXES = /\s*[\|–—-]\s*(cloudfuze|complete guide|step.by.step|a guide|full guide|guide|tutorial).*$/i;

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'it', 'this', 'that', 'are', 'was',
  'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'can', 'shall', 'not', 'no', 'nor',
  'so', 'if', 'then', 'than', 'too', 'very', 'just', 'about', 'above',
  'after', 'again', 'all', 'also', 'am', 'any', 'as', 'because', 'been',
  'before', 'being', 'between', 'both', 'each', 'few', 'get', 'got',
  'here', 'how', 'into', 'its', 'like', 'more', 'most', 'much', 'must',
  'my', 'new', 'now', 'only', 'other', 'our', 'out', 'over', 'own',
  'same', 'she', 'some', 'such', 'them', 'there', 'these', 'they',
  'those', 'through', 'under', 'up', 'us', 'use', 'using', 'what',
  'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'you', 'your',
  'best', 'top', 'complete', 'guide', 'step', 'every', 'need', 'know',
  'way', 'ways', 'thing', 'things', 'make', 'made', 'good', 'great',
  'well', 'still', 'even', 'back', 'going', 'want', 'really', 'right',
  'look', 'think', 'take', 'come', 'one', 'two', 'first', 'last'
]);

// ═══ SHARED HELPERS ═══

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const SYNONYM_MAP = {
  'migrate': ['migration', 'transfer', 'move', 'switch', 'switching'],
  'migration': ['migrate', 'transfer', 'move', 'switch', 'switching'],
  'track': ['tracking', 'monitor', 'measure', 'measuring'],
  'tracking': ['track', 'monitor', 'measure', 'measuring'],
  'manage': ['management', 'managing', 'admin', 'administrate'],
  'management': ['manage', 'managing', 'admin'],
  'discover': ['discovery', 'find', 'detect', 'identifying'],
  'discovery': ['discover', 'find', 'detect', 'identifying'],
  'compare': ['comparison', 'vs', 'versus', 'difference'],
  'cost': ['pricing', 'price', 'expense', 'spend'],
  'security': ['secure', 'risk', 'compliance', 'vulnerability'],
};

function expandQueries(keyword) {
  const core = keyword.short;
  const words = keyword.topicWords || [];
  const variants = new Set();

  variants.add(core);

  // Shorter sub-phrases: first 2 words, first 3 words
  if (words.length >= 3) variants.add(words.slice(0, 3).join(' '));
  if (words.length >= 2) variants.add(words.slice(0, 2).join(' '));

  // Cross-join core words with synonyms for variant queries
  for (const word of words.slice(0, 3)) {
    const synonyms = SYNONYM_MAP[word];
    if (synonyms) {
      const otherWords = words.filter(w => w !== word).slice(0, 2);
      for (const syn of synonyms.slice(0, 1)) {
        variants.add([syn, ...otherWords].join(' '));
      }
    }
  }

  // Question-form variants
  variants.add(`what is ${words.slice(0, 3).join(' ')}`);
  variants.add(`how to ${core}`);

  // Broader phrase if available
  if (keyword.broad && keyword.broad !== core) variants.add(keyword.broad);

  return [...variants].slice(0, 6);
}

const GENERIC_QUESTIONS = new Set([
  'anyone else', 'what do you think', 'what do you guys think', 'thoughts',
  'am i the only one', 'is it just me', 'does anyone know', 'can someone help',
  'help me', 'any ideas', 'any suggestions', 'anyone know', 'what happened',
  'how does this work', 'is this normal', 'what should i do', 'is this right',
  'does this make sense', 'what am i missing', 'is anyone else',
]);

function extractQuestionsFromText(text) {
  if (!text || text.length < 20) return [];
  const sentences = text.split(/(?<=[.!?])\s+|\n+/);
  const questions = [];
  for (const raw of sentences) {
    const s = raw.trim();
    if (s.length < 25 || s.length > 300) continue;
    if (s.includes('http') || s.includes('[') || s.includes('|')) continue;
    const lower = s.toLowerCase();
    const isQ = s.endsWith('?') || QUESTION_WORDS.some(w => lower.startsWith(w + ' '));
    if (!isQ) continue;
    // Skip generic/vague questions that add no topical value
    const isGeneric = [...GENERIC_QUESTIONS].some(g => lower.startsWith(g));
    if (isGeneric) continue;
    // Must have at least 4 real words (not just "How is this?")
    const wordCount = s.split(/\s+/).filter(w => w.length > 1).length;
    if (wordCount < 5) continue;
    questions.push(s.endsWith('?') ? s : s + '?');
  }
  return questions;
}

function quoraUrlToQuestion(url, title) {
  // If the title is a clear question, prefer it
  if (title) {
    const cleaned = title
      .replace(/\s*[-–—|]\s*Quora$/i, '')
      .replace(/\s*\(\d+ answers?\)/i, '')
      .trim();
    if (cleaned.length >= 15) {
      return cleaned.endsWith('?') ? cleaned : cleaned + '?';
    }
  }
  // Fall back to parsing URL slug
  try {
    const pathname = new URL(url).pathname;
    const parts = pathname.split('/').filter(Boolean);
    // Skip non-question URLs (profiles, topics, spaces)
    if (parts[0] === 'profile' || parts[0] === 'topic' || parts[0] === 'spaces') return null;
    const slug = parts[parts.length - 1];
    if (!slug || slug.length < 5) return null;
    const text = slug
      .replace(/-/g, ' ')
      .replace(/\b\w/, c => c.toUpperCase())
      .trim();
    if (text.length < 10) return null;
    return text.endsWith('?') ? text : text + '?';
  } catch {
    return null;
  }
}

// ═══ KEYWORD EXTRACTION ═══

export function extractSearchKeyword(pageData) {
  let raw = pageData.h1 || pageData.title || '';

  raw = raw.replace(NOISE_SUFFIXES, '').trim();

  const cleaned = raw
    .replace(/[|–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Extract CORE topic words — strip all noise, numbers, stop words
  const topicWords = cleaned
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')       // remove numbers and punctuation
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));

  // The "short" keyword is the CORE TOPIC, not the first N words of the title
  // e.g., "Top 10 SaaS Discovery Metrics Every CIO Should Track" → "SaaS discovery metrics"
  // Take up to 4 significant words for a focused search query
  const coreKeyword = topicWords.slice(0, 4).join(' ');

  // Also build a slightly broader version with up to 6 words
  const broadKeyword = topicWords.slice(0, 6).join(' ');

  // Extract from headings for broader context (for relevance filtering)
  const headingWords = (pageData.headings || [])
    .slice(0, 10)
    .map(h => h.text)
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));

  const allSignificantWords = [...new Set([...topicWords, ...headingWords])];

  // Build key phrases — consecutive topic-word pairs from the cleaned title
  // e.g., "Dropbox to Google Drive Migration" → ["dropbox", "google drive", "drive migration"]
  // These are used by the relevance filter to require concept matches, not just individual words
  const keyPhrases = [];
  const titleLower = cleaned.toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
  // Extract 2-word and 3-word consecutive phrases that contain at least one topic word
  const titleWords = titleLower.split(' ');
  for (let i = 0; i < titleWords.length - 1; i++) {
    const pair = `${titleWords[i]} ${titleWords[i + 1]}`;
    const hasTopicWord = topicWords.some(tw => pair.includes(tw));
    if (hasTopicWord && !STOP_WORDS.has(titleWords[i]) && !STOP_WORDS.has(titleWords[i + 1])) {
      keyPhrases.push(pair);
    }
    if (i < titleWords.length - 2) {
      const w1 = titleWords[i], w2 = titleWords[i + 1], w3 = titleWords[i + 2];
      const topicCount = [w1, w2, w3].filter(w => topicWords.includes(w)).length;
      if (topicCount >= 2) keyPhrases.push(`${w1} ${w2} ${w3}`);
    }
  }
  // Also add the core keyword itself as a phrase
  if (coreKeyword.includes(' ')) keyPhrases.push(coreKeyword);
  // Add individual topic words that are specific enough (5+ chars, not generic)
  const GENERIC_WORDS = new Set(['cloud', 'drive', 'data', 'file', 'files', 'email', 'tool', 'tools', 'service', 'platform', 'system', 'storage', 'server', 'online', 'share', 'sync', 'backup']);
  for (const tw of topicWords) {
    if (tw.length >= 5 && !GENERIC_WORDS.has(tw)) keyPhrases.push(tw);
  }

  return {
    full: cleaned,
    short: coreKeyword,
    broad: broadKeyword,
    topic: pageData.h1 || pageData.title || '',
    topicWords: topicWords,
    significantWords: allSignificantWords,
    keyPhrases: [...new Set(keyPhrases)]
  };
}

// ═══ RELEVANCE FILTER ═══

function isRelevantToTopic(questionText, keyword) {
  const qLower = questionText.toLowerCase();
  const keyPhrases = keyword.keyPhrases || [];
  const topicWords = keyword.topicWords || [];

  if (topicWords.length === 0) return true;

  // PRIMARY CHECK: Does the question contain at least one key phrase from the title?
  // Key phrases are multi-word concepts like "google drive", "dropbox migration", "onedrive"
  // or specific single words 5+ chars that aren't generic (like "dropbox", "sharepoint", "cloudfuze")
  // This prevents "Google Drive" smart mirror posts, "hard drives sold out", etc. from passing
  let phraseMatched = false;
  for (const phrase of keyPhrases) {
    if (qLower.includes(phrase)) {
      phraseMatched = true;
      break;
    }
    // Also check synonyms of multi-word phrases
    const phraseWords = phrase.split(' ');
    if (phraseWords.length === 1) {
      const syns = SYNONYM_MAP[phrase];
      if (syns && syns.some(s => qLower.includes(s))) {
        phraseMatched = true;
        break;
      }
    }
  }

  if (!phraseMatched) return false;

  // SECONDARY CHECK: Topic word count must meet a dynamic minimum
  // For titles with 4+ topic words, require 3 matches (ensures action + entities, not just entity names)
  // For titles with 2-3 topic words, require 2 matches
  const minRequired = topicWords.length >= 4 ? 3 : Math.min(2, topicWords.length);

  let topicMatchCount = 0;
  const matched = new Set();
  for (const word of topicWords) {
    const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    if (re.test(qLower)) {
      topicMatchCount++;
      matched.add(word);
    }
  }

  // Check synonyms for unmatched words
  for (const word of topicWords) {
    if (matched.has(word)) continue;
    const syns = SYNONYM_MAP[word];
    if (syns) {
      for (const s of syns) {
        const re = new RegExp(`\\b${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
        if (re.test(qLower)) {
          topicMatchCount++;
          break;
        }
      }
    }
  }

  return topicMatchCount >= minRequired;
}

// ═══ SOURCE 1: Google Autocomplete — DISABLED (produced too many generic/irrelevant results) ═══
// Kept for reference; not called from fetchAllRealQuestions

// ═══ SOURCE 2: Reddit (optimized — parallel batches, fewer queries) ═══

export async function fetchRedditQuestions(keyword) {
  const BATCH_SIZE = 5;
  const BATCH_DELAY_MS = 400;
  const UA = 'ContentGuidelines/1.0 (CloudFuze AEO Research Tool)';
  const words = keyword.topicWords || [];

  const techSubreddits = identifyRelevantSubreddits(keyword);

  const querySet = new Set();
  querySet.add(keyword.short);
  if (words.length >= 2) querySet.add(words.slice(0, 2).join(' '));
  if (words.length >= 3) querySet.add(words.slice(0, 3).join(' '));

  const expanded = expandQueries(keyword);
  for (const eq of expanded) querySet.add(eq);

  const uniqueQueries = [...querySet].slice(0, 5);

  const searches = [];
  const SORTS = ['relevance', 'top'];

  for (const sub of techSubreddits.slice(0, 3)) {
    for (const query of uniqueQueries.slice(0, 2)) {
      for (const sort of SORTS) {
        searches.push({
          query, sort,
          url: `https://www.reddit.com/r/${sub}/search.json`,
          subreddit: sub
        });
      }
    }
  }

  for (const query of uniqueQueries.slice(0, 2)) {
    for (const sort of SORTS) {
      searches.push({ query, sort, url: 'https://www.reddit.com/search.json' });
    }
  }

  console.log(`    Reddit: ${searches.length} searches across ${techSubreddits.slice(0, 3).length} subreddits [${techSubreddits.slice(0, 3).join(', ')}]`);
  console.log(`    Reddit: queries: ${uniqueQueries.join(' | ')}`);

  const allPosts = new Map();

  for (let i = 0; i < searches.length; i += BATCH_SIZE) {
    const batch = searches.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.allSettled(batch.map(search => {
      const params = {
        q: search.query, sort: search.sort, limit: 100, type: 'link', t: 'all'
      };
      if (search.subreddit) params.restrict_sr = 'on';
      return axios.get(search.url, { params, timeout: 8000, headers: { 'User-Agent': UA } });
    }));

    for (const result of batchResults) {
      if (result.status !== 'fulfilled') continue;
      for (const post of (result.value.data?.data?.children || [])) {
        const id = post.data?.id;
        if (id && !allPosts.has(id)) allPosts.set(id, post.data);
      }
    }

    if (i + BATCH_SIZE < searches.length) await sleep(BATCH_DELAY_MS);
  }

  console.log(`    Reddit: ${allPosts.size} unique posts found across all searches`);

  // Skip posts from subreddits that are never relevant to B2B/migration/cloud topics
  const BLOCKED_SUBREDDITS = new Set([
    'freefolk', 'gameofthrones', 'asoiaf', 'wallstreetbets', 'stocks', 'investing',
    'memes', 'dankmemes', 'funny', 'pics', 'gaming', 'movies', 'television',
    'politics', 'worldnews', 'news', 'askreddit', 'showerthoughts', 'tifu',
    'relationship_advice', 'amitheasshole', 'unpopularopinion', 'todayilearned',
    'explainlikeimfive', 'dota2', 'leagueoflegends', 'minecraft', 'fortnitebr',
    'nba', 'nfl', 'soccer', 'sports', 'fitness', 'cooking', 'food', 'recipes',
    'diy', 'crafts', 'art', 'music', 'books', 'iama'
  ]);

  const titleQuestions = [];
  const selftextQuestions = [];
  const seen = new Set();

  for (const [, postData] of allPosts) {
    const sub = (postData.subreddit || '').toLowerCase();
    if (BLOCKED_SUBREDDITS.has(sub)) continue;

    const title = (postData.title || '').trim();
    if (title.length < 15) continue;

    const lower = title.toLowerCase();
    const engagement = (postData.score || 0) + (postData.num_comments || 0) * 2;
    const meta = {
      source: 'reddit',
      searchVolumePotential: 'medium',
      subreddit: postData.subreddit || null,
      redditUrl: postData.permalink ? `https://reddit.com${postData.permalink}` : null,
      engagement
    };

    const isTitleQuestion = title.endsWith('?') ||
      QUESTION_WORDS.some(w => lower.startsWith(w + ' '));

    if (isTitleQuestion && !seen.has(lower)) {
      seen.add(lower);
      titleQuestions.push({
        question: title.endsWith('?') ? title : title + '?',
        intent: classifyIntent(title),
        ...meta
      });
    }

    const selftext = postData.selftext || '';
    if (selftext.length > 50) {
      const bodyQuestions = extractQuestionsFromText(selftext);
      for (const bq of bodyQuestions) {
        const bqLower = bq.toLowerCase();
        if (seen.has(bqLower)) continue;
        seen.add(bqLower);
        selftextQuestions.push({
          question: bq,
          intent: classifyIntent(bq),
          ...meta
        });
      }
    }
  }

  titleQuestions.sort((a, b) => (b.engagement || 0) - (a.engagement || 0));
  selftextQuestions.sort((a, b) => (b.engagement || 0) - (a.engagement || 0));

  const combined = [
    ...titleQuestions.slice(0, 20),
    ...selftextQuestions.slice(0, 20)
  ];

  console.log(`    Reddit: ${titleQuestions.length} title questions + ${selftextQuestions.length} selftext questions`);
  return combined.slice(0, 40);
}

function identifyRelevantSubreddits(keyword) {
  const SUBREDDIT_MAP = {
    'saas': ['SaaS', 'sysadmin', 'ITManagers', 'msp', 'startups'],
    'cloud': ['cloudcomputing', 'aws', 'googlecloud', 'azure', 'sysadmin'],
    'migration': ['sysadmin', 'cloudcomputing', 'ITManagers', 'msp', 'techsupport'],
    'migrate': ['sysadmin', 'cloudcomputing', 'ITManagers', 'msp', 'techsupport'],
    'transfer': ['sysadmin', 'cloudcomputing', 'DataHoarder', 'techsupport'],
    'dropbox': ['dropbox', 'DataHoarder', 'cloudcomputing', 'techsupport'],
    'google': ['google', 'gsuite', 'GoogleWorkspace', 'techsupport'],
    'gmail': ['gmail', 'google', 'gsuite', 'GoogleWorkspace'],
    'drive': ['google', 'GoogleWorkspace', 'cloudcomputing', 'DataHoarder'],
    'workspace': ['GoogleWorkspace', 'gsuite', 'google'],
    'microsoft': ['Office365', 'microsoft365', 'sysadmin', 'techsupport'],
    'outlook': ['Office365', 'microsoft365', 'Outlook', 'sysadmin'],
    'onedrive': ['Office365', 'onedrive', 'microsoft365', 'sysadmin', 'techsupport'],
    'sharepoint': ['sharepoint', 'Office365', 'microsoft365', 'sysadmin'],
    'teams': ['MicrosoftTeams', 'Office365', 'sysadmin'],
    'slack': ['Slack', 'sysadmin', 'startups'],
    'box': ['Box', 'cloudcomputing', 'sysadmin'],
    'security': ['cybersecurity', 'netsec', 'sysadmin'],
    'compliance': ['cybersecurity', 'sysadmin', 'ITManagers'],
    'metrics': ['analytics', 'datascience', 'SaaS'],
    'cio': ['CIO', 'ITManagers', 'sysadmin'],
    'shadow': ['sysadmin', 'cybersecurity', 'ITManagers'],
    'backup': ['DataHoarder', 'sysadmin', 'techsupport', 'cloudcomputing'],
    'storage': ['DataHoarder', 'sysadmin', 'cloudcomputing', 'techsupport'],
    'email': ['sysadmin', 'Office365', 'gsuite', 'techsupport'],
    'data': ['DataHoarder', 'sysadmin', 'datascience', 'cloudcomputing'],
    'tenant': ['Office365', 'sysadmin', 'microsoft365'],
    'audit': ['sysadmin', 'ITManagers', 'cybersecurity'],
    'cost': ['sysadmin', 'ITManagers', 'SaaS', 'startups'],
    'ensure': ['sysadmin', 'ITManagers', 'techsupport'],
  };

  const subreddits = new Set();
  for (const word of keyword.topicWords) {
    const subs = SUBREDDIT_MAP[word];
    if (subs) {
      for (const sub of subs) subreddits.add(sub);
    }
  }
  if (subreddits.size === 0) {
    ['sysadmin', 'techsupport', 'cloudcomputing'].forEach(s => subreddits.add(s));
  }
  return [...subreddits].slice(0, 5);
}

// ═══ SOURCE 3: Google CSE (Custom Search Engine — returns search results, titles, snippets) ═══

export async function fetchGoogleCSE(keyword, cseApiKey, cseCx) {
  if (!cseApiKey || !cseCx) return [];

  const words = keyword.topicWords || [];
  const queries = [
    keyword.short,
    `what is ${keyword.short}`,
    `how to ${keyword.short}`,
  ];
  if (words.length >= 2) {
    queries.push(`${words[0]} ${words[1]} FAQ`);
  }

  const uniqueQueries = [...new Set(queries)].slice(0, 4);
  const questions = [];
  const seen = new Set();

  const results = await Promise.allSettled(uniqueQueries.map(query =>
    axios.get('https://www.googleapis.com/customsearch/v1', {
      params: { key: cseApiKey, cx: cseCx, q: query, num: 10, gl: 'us', hl: 'en' },
      timeout: 8000
    })
  ));

  for (let i = 0; i < results.length; i++) {
    if (results[i].status !== 'fulfilled') {
      const err = results[i].reason;
      const status = err?.response?.status;
      if (status === 429) console.warn(`  Google CSE rate limited (429) for "${uniqueQueries[i]}"`);
      else console.warn(`  Google CSE fetch failed for "${uniqueQueries[i]}":`, err?.message);
      continue;
    }
    const data = results[i].value.data;
    for (const item of (data?.items || [])) {
      const title = item.title || '';
      const snippet = item.snippet || '';

      for (const text of [title, snippet]) {
        const sentences = text.split(/(?<=[.!?])\s+|[\n\r]+/).map(s => s.trim()).filter(s => s.length > 10);
        for (const sentence of sentences) {
          const lower = sentence.toLowerCase();
          const isQ = sentence.endsWith('?') || QUESTION_WORDS.some(w => lower.startsWith(w + ' '));
          if (!isQ) continue;
          const norm = lower.replace(/[^a-z0-9\s]/g, '').trim();
          if (seen.has(norm)) continue;
          seen.add(norm);
          questions.push({
            question: sentence.endsWith('?') ? sentence : sentence + '?',
            source: 'google-paa',
            intent: classifyIntent(sentence),
            searchVolumePotential: 'high',
            snippet: item.snippet || null
          });
        }
      }

      const titleLower = title.toLowerCase();
      if (!seen.has(titleLower.replace(/[^a-z0-9\s]/g, '').trim())) {
        const hasTopicWord = words.some(w => titleLower.includes(w));
        if (hasTopicWord && (titleLower.includes('how') || titleLower.includes('what') || titleLower.includes('why') || title.endsWith('?'))) {
          const norm = titleLower.replace(/[^a-z0-9\s]/g, '').trim();
          if (!seen.has(norm)) {
            seen.add(norm);
            questions.push({
              question: title.endsWith('?') ? title : title + '?',
              source: 'google-paa',
              intent: classifyIntent(title),
              searchVolumePotential: 'high',
              snippet: item.snippet || null
            });
          }
        }
      }
    }
  }

  return questions;
}

// ═══ SOURCE 3b: Direct Google PAA scraper (no API key needed) ═══

export async function fetchGooglePAADirect(keyword) {
  const words = keyword.topicWords || [];
  const queries = [
    keyword.short,
    `what is ${keyword.short}`,
    `how to ${keyword.short}`,
  ];
  if (words.length >= 2) {
    queries.push(`${words[0]} ${words[1]}`);
  }

  const uniqueQueries = [...new Set(queries)].slice(0, 4);
  const questions = [];
  const seen = new Set();

  const paaSelectors = [
    '[data-q]',
    '.related-question-pair [role="heading"]',
    'div[jsname] [role="heading"]',
    '.wQiwMc [role="heading"]',
    'g-accordion-expander [role="heading"]',
    '[data-sgrd] [role="heading"]',
    '.xpc [role="heading"]',
  ];

  const scrapeOne = async (query) => {
    const { data: html } = await axios.get('https://www.google.com/search', {
      params: { q: query, hl: 'en', gl: 'us' },
      timeout: 6000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
      }
    });
    return html;
  };

  const processHtml = (html) => {
    const $ = cheerio.load(html);
    for (const selector of paaSelectors) {
      $(selector).each((_, el) => {
        const text = ($(el).attr('data-q') || $(el).text()).trim();
        if (!text || text.length < 10 || text.length > 300) return;
        const lower = text.toLowerCase();
        if (seen.has(lower)) return;
        seen.add(lower);
        questions.push({
          question: text.endsWith('?') ? text : text + '?',
          source: 'google-paa',
          intent: classifyIntent(text),
          searchVolumePotential: 'high'
        });
      });
    }
    $('a').each((_, el) => {
      const text = $(el).text().trim();
      if (text.length < 10 || text.length > 200) return;
      const lower = text.toLowerCase();
      if (seen.has(lower)) return;
      const isQ = text.endsWith('?') || QUESTION_WORDS.some(w => lower.startsWith(w + ' '));
      if (isQ) {
        seen.add(lower);
        questions.push({
          question: text.endsWith('?') ? text : text + '?',
          source: 'google-paa',
          intent: classifyIntent(text),
          searchVolumePotential: 'high'
        });
      }
    });
  };

  const allResults = await Promise.allSettled(uniqueQueries.map(q => scrapeOne(q)));
  for (const r of allResults) {
    if (r.status === 'fulfilled') processHtml(r.value);
  }

  return questions.slice(0, 20);
}

// ═══ SOURCE 4: AnswerThePublic (paid API — real search questions organized by type) ═══

export async function fetchAnswerThePublic(keyword, atpApiKey) {
  if (!atpApiKey) return [];

  try {
    const { data } = await axios.get('https://apiv2.answerthepublic.com/search', {
      params: {
        keyword: keyword.short,
        language: 'en',
        country: 'us'
      },
      headers: {
        'Authorization': `Bearer ${atpApiKey}`,
        'Accept': 'application/json'
      },
      timeout: 15000
    });

    const questions = [];
    const seen = new Set();

    // AnswerThePublic returns data in categories: questions, prepositions, comparisons, etc.
    const questionCategories = data?.questions || data?.data?.questions || [];
    const allItems = Array.isArray(questionCategories) ? questionCategories :
      (typeof data === 'object' ? extractATPQuestions(data) : []);

    for (const item of allItems) {
      const text = typeof item === 'string' ? item : (item?.question || item?.keyword || item?.text || item?.suggestion || '');
      if (!text || text.length < 10) continue;

      const lower = text.toLowerCase().trim();
      if (seen.has(lower)) continue;
      seen.add(lower);

      const isQuestion = text.endsWith('?') || QUESTION_WORDS.some(w => lower.startsWith(w + ' '));
      if (isQuestion) {
        questions.push({
          question: text.endsWith('?') ? text : text + '?',
          source: 'answerthepublic',
          intent: classifyIntent(text),
          searchVolumePotential: 'high'
        });
      }
    }

    return questions.slice(0, 20);
  } catch (err) {
    console.warn(`  AnswerThePublic fetch failed: ${err.response?.status || ''} ${err.message}`);
    return [];
  }
}

function extractATPQuestions(data) {
  const results = [];
  const walk = (obj) => {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
      for (const item of obj) {
        if (typeof item === 'string' && item.length > 10) results.push(item);
        else if (item?.keyword) results.push(item.keyword);
        else if (item?.question) results.push(item.question);
        else if (item?.text) results.push(item.text);
        else if (item?.suggestion) results.push(item.suggestion);
        else walk(item);
      }
      return;
    }
    for (const key of Object.keys(obj)) {
      if (['questions', 'question', 'prepositions', 'comparisons', 'alphabeticals', 'related'].includes(key.toLowerCase())) {
        walk(obj[key]);
      }
    }
  };
  walk(data);
  return results;
}

// ═══ SOURCE 5: Ubersuggest via RapidAPI (paid — keyword ideas with search volume) ═══

export async function fetchUbersuggest(keyword, rapidApiKey) {
  if (!rapidApiKey) return [];

  try {
    const { data } = await axios.get('https://ubersuggest-keyword-ideas.p.rapidapi.com/keyword-ideas', {
      params: {
        keyword: keyword.short,
        country: 'us'
      },
      headers: {
        'X-RapidAPI-Key': rapidApiKey,
        'X-RapidAPI-Host': 'ubersuggest-keyword-ideas.p.rapidapi.com'
      },
      timeout: 15000
    });

    const questions = [];
    const seen = new Set();

    const items = Array.isArray(data) ? data : (data?.results || data?.keywords || data?.data || []);

    for (const item of items) {
      const text = typeof item === 'string' ? item : (item?.keyword || item?.query || item?.suggestion || item?.text || '');
      if (!text || text.length < 10) continue;

      const lower = text.toLowerCase().trim();
      if (seen.has(lower)) continue;
      seen.add(lower);

      const isQuestion = text.endsWith('?') || QUESTION_WORDS.some(w => lower.startsWith(w + ' '));
      const hasVs = / vs\.? /i.test(lower);

      if (isQuestion || hasVs) {
        questions.push({
          question: text.endsWith('?') ? text : text + '?',
          source: 'ubersuggest',
          intent: classifyIntent(text),
          searchVolumePotential: item?.searchVolume > 1000 ? 'high' : item?.searchVolume > 100 ? 'medium' : 'low',
          searchVolume: item?.searchVolume || item?.search_volume || null,
          seoDifficulty: item?.seodifficulty || item?.seo_difficulty || null
        });
      }
    }

    return questions.slice(0, 15);
  } catch (err) {
    console.warn(`  Ubersuggest fetch failed: ${err.response?.status || ''} ${err.message}`);
    return [];
  }
}

// ═══ SOURCE 6: QuestionDB (free API — aggregates SERP, PAA, Reddit, Quora) ═══

export async function fetchQuestionDB(keyword) {
  // QuestionDB works best with 1-3 word topics
  const shortTopic = keyword.topicWords.slice(0, 2).join(' ');

  // Try both known API formats (QuestionDB has changed APIs over time)
  const urls = [
    { url: 'https://api.questiondb.io/questions', params: { topic: shortTopic } },
    { url: `https://questiondb.io/api/questions`, params: { query: shortTopic } },
  ];

  for (const { url, params } of urls) {
    try {
      const { data } = await axios.get(url, {
        params,
        timeout: 10000,
        headers: { 'Accept': 'application/json' }
      });

      const questions = [];
      const seen = new Set();

      const items = Array.isArray(data) ? data : (data?.questions || data?.data || data?.results || []);

      for (const item of items) {
        const text = typeof item === 'string' ? item : (item?.question || item?.text || item?.value || '');
        if (!text || text.length < 15) continue;

        const lower = text.toLowerCase().trim();
        if (seen.has(lower)) continue;
        seen.add(lower);

        questions.push({
          question: text.endsWith('?') ? text : text + '?',
          source: 'questiondb',
          intent: classifyIntent(text),
          searchVolumePotential: 'medium',
          questiondbSource: item?.source || null
        });
      }

      if (questions.length > 0) return questions.slice(0, 15);
    } catch {
      // Try next URL format
    }
  }

  console.warn(`  QuestionDB fetch failed: no working endpoint for "${shortTopic}"`);
  return [];
}

// ═══ SOURCE 7: Quora (search-engine-based — Quora blocks direct access) ═══

export async function fetchQuoraQuestions(keyword, options = {}) {
  const { cseApiKey, cseCx } = options;
  const queries = expandQueries(keyword);
  const words = keyword.topicWords || [];
  const allQuestions = [];
  const seen = new Set();

  const quoraQueries = [...queries];
  quoraQueries.push(`how to ${keyword.short}`);
  quoraQueries.push(`what is ${words.slice(0, 3).join(' ')}`);
  quoraQueries.push(`why ${words.slice(0, 3).join(' ')}`);
  if (words.length >= 2) {
    quoraQueries.push(`${words[0]} ${words[1]}`);
    quoraQueries.push(`best ${words.slice(0, 2).join(' ')}`);
  }
  const uniqueQuoraQueries = [...new Set(quoraQueries)].slice(0, 8);

  console.log(`    Quora: searching with ${uniqueQuoraQueries.length} queries: ${uniqueQuoraQueries.slice(0, 5).join(' | ')}...`);

  const addQuestion = (questionText, quoraUrl) => {
    if (!questionText || questionText.length < 10) return;
    const lower = questionText.toLowerCase();
    const norm = lower.replace(/[^a-z0-9\s]/g, '').trim();
    if (seen.has(norm)) return;
    seen.add(norm);
    allQuestions.push({
      question: questionText.endsWith('?') ? questionText : questionText + '?',
      source: 'quora',
      intent: classifyIntent(questionText),
      searchVolumePotential: 'medium',
      quoraUrl: quoraUrl || null
    });
  };

  // ── Run CSE, Google scrape, and Autocomplete ALL in parallel ──
  const csePromise = (async () => {
    if (!cseApiKey || !cseCx) return;
    const cseQueries = uniqueQuoraQueries.slice(0, 4);
    const cseResults = await Promise.allSettled(cseQueries.map(query =>
      axios.get('https://www.googleapis.com/customsearch/v1', {
        params: { key: cseApiKey, cx: cseCx, q: `site:quora.com ${query}`, num: 10, gl: 'us', hl: 'en' },
        timeout: 8000
      })
    ));
    for (let i = 0; i < cseResults.length; i++) {
      if (cseResults[i].status !== 'fulfilled') {
        const status = cseResults[i].reason?.response?.status;
        if (status === 429) console.warn(`    Quora/CSE rate limited for "${cseQueries[i]}"`);
        else console.warn(`    Quora/CSE failed for "${cseQueries[i]}":`, cseResults[i].reason?.message);
        continue;
      }
      for (const result of (cseResults[i].value.data?.items || [])) {
        const url = result.link || '';
        if (!url.includes('quora.com')) continue;
        addQuestion(quoraUrlToQuestion(url, result.title), url);
        const snippet = result.snippet || '';
        if (snippet.length > 20) {
          for (const s of snippet.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 15)) {
            const sLower = s.toLowerCase();
            if (s.endsWith('?') || QUESTION_WORDS.some(w => sLower.startsWith(w + ' '))) addQuestion(s, url);
          }
        }
      }
    }
  })();

  const scrapePromise = (async () => {
    const scrapeQueries = uniqueQuoraQueries.slice(0, 3);
    const batch = await Promise.allSettled(scrapeQueries.map(query =>
      axios.get('https://www.google.com/search', {
        params: { q: `site:quora.com ${query}`, hl: 'en', gl: 'us', num: 15 },
        timeout: 6000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Accept': 'text/html', 'Accept-Language': 'en-US,en;q=0.9',
        }
      })
    ));
    for (const result of batch) {
      if (result.status !== 'fulfilled') continue;
      const $ = cheerio.load(result.value.data);
      $('a').each((_, el) => {
        const href = $(el).attr('href') || '';
        if (!href.includes('quora.com/')) return;
        let quoraUrl = href;
        const urlMatch = href.match(/[?&]q=(https?:\/\/[^&]+quora\.com[^&]+)/);
        if (urlMatch) quoraUrl = decodeURIComponent(urlMatch[1]);
        if (/\/(profile|topic|spaces|settings|answer)\//i.test(quoraUrl)) return;
        addQuestion(quoraUrlToQuestion(quoraUrl, $(el).text().trim()), quoraUrl);
      });
      $('h3').each((_, el) => {
        const text = $(el).text().trim();
        if (text.length < 10 || !text.toLowerCase().includes('quora')) return;
        const cleaned = text.replace(/\s*[-–—|]\s*Quora$/i, '').trim();
        if (cleaned.length >= 15) addQuestion(cleaned);
      });
    }
  })();

  const acPromise = (async () => {
    const acQueries = [
      `site:quora.com ${keyword.short}`,
      `site:quora.com what is ${words.slice(0, 2).join(' ')}`,
      `site:quora.com how to ${words.slice(0, 2).join(' ')}`,
      `site:quora.com ${words.slice(0, 2).join(' ')}`,
    ];
    const acResults = await Promise.all([...new Set(acQueries)].slice(0, 4).map(async (query) => {
      try {
        const { data } = await axios.get('https://suggestqueries.google.com/complete/search', {
          params: { client: 'firefox', q: query },
          timeout: 4000,
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        if (Array.isArray(data) && Array.isArray(data[1])) return data[1].filter(s => typeof s === 'string' && s.length > 10);
        return [];
      } catch { return []; }
    }));
    for (const suggestion of acResults.flat()) {
      const cleaned = suggestion.replace(/site:quora\.com\s*/i, '').trim();
      if (cleaned.length >= 10) addQuestion(cleaned);
    }
  })();

  await Promise.allSettled([csePromise, scrapePromise, acPromise]);

  console.log(`    Quora: ${allQuestions.length} total questions extracted`);
  return allQuestions.slice(0, 30);
}

// ═══ SOURCE 6: YouTube Search (real video queries, uses existing API key) ═══

export async function fetchYouTubeQuestions(keyword, youtubeApiKey) {
  if (!youtubeApiKey || youtubeApiKey.startsWith('your-')) return [];

  const searchQueries = [
    keyword.short,                       // "saas discovery metrics"
    `${keyword.short} explained`,        // "saas discovery metrics explained"
    `how to ${keyword.short}`,           // "how to saas discovery metrics"
  ];

  const allResults = [];

  for (const query of searchQueries) {
    try {
      const { data } = await axios.get('https://www.googleapis.com/youtube/v3/search', {
        params: {
          part: 'snippet',
          q: query,
          type: 'video',
          maxResults: 15,
          relevanceLanguage: 'en',
          key: youtubeApiKey
        },
        timeout: 8000
      });

      const items = data?.items || [];
      for (const item of items) {
        const title = item.snippet?.title?.trim();
        if (!title || title.length < 10) continue;

        const lower = title.toLowerCase();
        const isQuestion = title.endsWith('?') ||
          QUESTION_WORDS.some(w => lower.startsWith(w + ' '));

        if (isQuestion) {
          allResults.push({
            question: title.endsWith('?') ? title : title + '?',
            source: 'youtube',
            intent: classifyIntent(title),
            searchVolumePotential: 'medium',
            videoId: item.id?.videoId,
            channel: item.snippet?.channelTitle
          });
        }
      }
    } catch (err) {
      console.warn('  YouTube question search failed:', err.message);
    }
  }

  const seen = new Set();
  return allResults.filter(q => {
    const norm = q.question.toLowerCase();
    if (seen.has(norm)) return false;
    seen.add(norm);
    return true;
  }).slice(0, 10);
}

// ═══ FETCH ALL REAL SOURCES IN PARALLEL ═══

export async function fetchAllRealQuestions(pageData, options = {}) {
  const MAX_FETCH_MS = 35000;
  const keyword = extractSearchKeyword(pageData);
  const cseApiKey = options.cseApiKey || null;
  const cseCx = options.cseCx || null;
  const atpApiKey = options.atpApiKey || null;
  const rapidApiKey = options.rapidApiKey || null;

  console.log(`  \x1b[36m├─ Full title: "${keyword.full}"\x1b[0m`);
  console.log(`  \x1b[36m├─ Core keyword: "${keyword.short}"\x1b[0m`);
  console.log(`  \x1b[36m├─ Broad keyword: "${keyword.broad}"\x1b[0m`);
  console.log(`  \x1b[36m├─ Topic words: [${keyword.topicWords.join(', ')}]\x1b[0m`);
  console.log(`  \x1b[36m├─ Key phrases for filtering: [${(keyword.keyPhrases || []).join(' | ')}]\x1b[0m`);

  const enabledSources = ['Google PAA (direct)', 'Reddit', 'Quora', 'QuestionDB'];
  if (cseApiKey && cseCx) enabledSources.push('Google CSE');
  if (atpApiKey) enabledSources.push('AnswerThePublic');
  if (rapidApiKey) enabledSources.push('Ubersuggest');
  console.log(`  \x1b[36m├─ Sources: ${enabledSources.join(', ')}\x1b[0m`);

  const startTime = Date.now();

  const sourcePromises = [
    fetchGooglePAADirect(keyword),
    fetchRedditQuestions(keyword),
    fetchGoogleCSE(keyword, cseApiKey, cseCx),
    fetchQuestionDB(keyword),
    fetchQuoraQuestions(keyword, { cseApiKey, cseCx }),
  ];
  const sourceKeys = ['googlePAADirect', 'reddit', 'googleCSE', 'questionDB', 'quora'];

  if (atpApiKey) {
    sourcePromises.push(fetchAnswerThePublic(keyword, atpApiKey));
    sourceKeys.push('atp');
  }
  if (rapidApiKey) {
    sourcePromises.push(fetchUbersuggest(keyword, rapidApiKey));
    sourceKeys.push('ubersuggest');
  }

  const timeoutPromise = new Promise(resolve => setTimeout(() => resolve('TIMEOUT'), MAX_FETCH_MS));
  const raceResult = await Promise.race([
    Promise.allSettled(sourcePromises),
    timeoutPromise
  ]);

  let results;
  if (raceResult === 'TIMEOUT') {
    console.warn(`  \x1b[33m├─ ⚠ Global timeout (${MAX_FETCH_MS / 1000}s) — returning partial results\x1b[0m`);
    results = sourcePromises.map(() => ({ status: 'rejected', reason: 'timeout' }));
    const settled = await Promise.allSettled(sourcePromises.map(p =>
      Promise.race([p, new Promise(resolve => setTimeout(() => resolve(null), 100))])
    ));
    settled.forEach((r, i) => {
      if (r.status === 'fulfilled' && r.value !== null) {
        results[i] = { status: 'fulfilled', value: r.value };
      }
    });
  } else {
    results = raceResult;
  }
  const elapsed = Date.now() - startTime;

  const r = {};
  sourceKeys.forEach((key, i) => { r[key] = results[i]; });

  // Merge Google CSE + direct scraper for PAA-style questions
  const allPAA = [
    ...(r.googleCSE?.status === 'fulfilled' ? r.googleCSE.value : []),
    ...(r.googlePAADirect?.status === 'fulfilled' ? r.googlePAADirect.value : [])
  ];

  const sources = {
    'reddit': r.reddit?.status === 'fulfilled' ? r.reddit.value : [],
    'google-paa': allPAA,
    'answerthepublic': r.atp?.status === 'fulfilled' ? r.atp.value : [],
    'ubersuggest': r.ubersuggest?.status === 'fulfilled' ? r.ubersuggest.value : [],
    'questiondb': r.questionDB?.status === 'fulfilled' ? r.questionDB.value : [],
    'quora': r.quora?.status === 'fulfilled' ? r.quora.value : [],
  };

  // Log results from each source
  for (const [source, questions] of Object.entries(sources)) {
    const status = questions.length > 0 ? `\x1b[32m${questions.length} questions\x1b[0m` : '\x1b[33m0 questions\x1b[0m';
    const isReal = true;
    console.log(`  \x1b[2m├─\x1b[0m ${isReal ? '●' : '◆'} ${source}: ${status}`);
  }

  // ── Relevance filter: remove questions that aren't about the blog topic ──
  console.log(`  \x1b[2m├─\x1b[0m Topic words for filtering: \x1b[33m[${keyword.topicWords.join(', ')}]\x1b[0m`);

  for (const [source, questions] of Object.entries(sources)) {
    const before = questions.length;
    const filtered = [];
    const removed = [];
    for (const q of questions) {
      if (isRelevantToTopic(q.question, keyword)) {
        filtered.push(q);
      } else {
        removed.push(q.question);
      }
    }
    sources[source] = filtered;
    const after = filtered.length;
    if (before !== after) {
      console.log(`  \x1b[2m├─\x1b[0m \x1b[33m⚠ ${source}: filtered ${before} → ${after} (removed ${before - after} irrelevant)\x1b[0m`);
      for (const rq of removed.slice(0, 5)) {
        console.log(`  \x1b[2m├─\x1b[0m   \x1b[90m✗ "${rq.slice(0, 100)}"\x1b[0m`);
      }
      if (removed.length > 5) console.log(`  \x1b[2m├─\x1b[0m   \x1b[90m... and ${removed.length - 5} more\x1b[0m`);
    }
  }

  // Remove sources with 0 results from the counts (after filtering)
  const activeSources = Object.fromEntries(
    Object.entries(sources).filter(([, v]) => v.length > 0)
  );

  // Merge and deduplicate
  const allQuestions = Object.values(sources).flat();
  const deduped = deduplicateQuestions(allQuestions);

  console.log(`  \x1b[2m├─\x1b[0m \x1b[1mTotal from ${Object.keys(activeSources).length} real sources: ${allQuestions.length} relevant → ${deduped.length} deduplicated\x1b[0m \x1b[2m(${elapsed}ms)\x1b[0m`);

  return {
    questions: deduped,
    keyword,
    sourceCounts: Object.fromEntries(
      Object.entries(activeSources).map(([k, v]) => [k, v.length])
    ),
    fetchTimeMs: elapsed
  };
}

// ═══ HELPERS ═══

function deduplicateQuestions(questions) {
  const seen = new Map();
  const sourcePriority = ['google-paa', 'reddit', 'quora', 'answerthepublic', 'ubersuggest', 'questiondb', 'google-related', 'ai-generated'];

  for (const q of questions) {
    const normalized = q.question
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (seen.has(normalized)) {
      const existing = seen.get(normalized);
      if (sourcePriority.indexOf(q.source) < sourcePriority.indexOf(existing.source)) {
        seen.set(normalized, q);
      }
      continue;
    }

    let isDupe = false;
    const words = new Set(normalized.split(/\s+/).filter(w => w.length > 3));
    for (const [existingNorm] of seen) {
      const existingWords = new Set(existingNorm.split(/\s+/).filter(w => w.length > 3));
      const intersection = [...words].filter(w => existingWords.has(w));
      const union = new Set([...words, ...existingWords]);
      if (union.size > 0 && intersection.length / union.size > 0.6) {
        isDupe = true;
        break;
      }
    }

    if (!isDupe) {
      seen.set(normalized, q);
    }
  }

  return [...seen.values()];
}

function decodeHtmlEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&nbsp;/g, ' ');
}

function classifyIntent(text) {
  const lower = text.toLowerCase();
  if (/\bvs\b|compare|comparison|alternative|better|difference|between/i.test(lower)) return 'comparison';
  if (/buy|price|cost|plan|pricing|subscribe|free trial|worth it/i.test(lower)) return 'transactional';
  if (/how to|step|guide|tutorial|setup|install|configure|migrate|set up/i.test(lower)) return 'informational';
  if (/what is|what are|what does|define|meaning|explain/i.test(lower)) return 'informational';
  if (/why|should|can i|is it/i.test(lower)) return 'informational';
  return 'informational';
}
