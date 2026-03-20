/**
 * Content Check Service
 *
 * AI Detection:    Copyleaks Writer Detector API (synchronous)
 * Plagiarism:      Google Custom Search — extracts unique sentences, searches for exact matches
 *                  Free (100 queries/day), synchronous, works on localhost
 */

let cachedToken = null;
let tokenExpiry = 0;

// ═══ COPYLEAKS AUTHENTICATION ═══

async function authenticate() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const email = process.env.COPYLEAKS_EMAIL;
  const apiKey = process.env.COPYLEAKS_API_KEY;
  if (!email || !apiKey) throw new Error('Copyleaks credentials not configured. Add COPYLEAKS_EMAIL and COPYLEAKS_API_KEY to .env');

  const res = await fetch('https://id.copyleaks.com/v3/account/login/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, key: apiKey })
  });

  if (!res.ok) {
    const text = await res.text();
    cachedToken = null;
    tokenExpiry = 0;
    if (res.status === 401 || res.status === 403) {
      throw new Error('Copyleaks authentication failed — check your COPYLEAKS_EMAIL and COPYLEAKS_API_KEY in .env.');
    }
    throw new Error(`Copyleaks auth failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (48 * 60 * 60 * 1000) - (5 * 60 * 1000);
  console.log('Copyleaks: authenticated successfully');
  return cachedToken;
}

// ═══ AI CONTENT DETECTION (Copyleaks — Synchronous) ═══

export async function checkAIDetection(text) {
  const trimmed = (text || '').trim();
  if (trimmed.length < 256) {
    throw new Error('Content must be at least 256 characters for AI detection. Write more content first.');
  }

  const token = await authenticate();
  const scanId = Date.now().toString();

  const res = await fetch(`https://api.copyleaks.com/v2/writer-detector/${scanId}/check`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'User-Agent': 'cloudfuze-content-tool/1.0'
    },
    body: JSON.stringify({
      text: trimmed.substring(0, 25000),
      sandbox: false
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 401 || res.status === 403) {
      cachedToken = null;
      tokenExpiry = 0;
      throw new Error('Copyleaks token expired. Please try again.');
    }
    if (res.status === 402) {
      throw new Error('No Copyleaks AI detection credits remaining. Check your account at dashboard.copyleaks.com.');
    }
    throw new Error(`AI detection failed (${res.status}): ${errText}`);
  }

  const data = await res.json();

  const summary = data.summary || {};
  const aiScore = Math.round((summary.ai || 0) * 100);
  const humanScore = Math.round((summary.human || 0) * 100);

  const sentences = (data.results || []).map(r => ({
    text: r.text || '',
    ai: Math.round((r.classification?.ai || 0) * 100),
    human: Math.round((r.classification?.human || 0) * 100)
  }));

  const aiSentences = sentences.filter(s => s.ai > 50).length;
  const humanSentences = sentences.filter(s => s.human > 50).length;

  return {
    aiScore,
    humanScore,
    totalSentences: sentences.length,
    aiSentences,
    humanSentences,
    verdict: aiScore >= 70 ? 'Likely AI-generated' : aiScore >= 40 ? 'Mixed content' : 'Likely human-written',
    sentences: sentences.slice(0, 30),
    raw: data
  };
}

// ═══ PLAGIARISM CHECK (Google Custom Search — Synchronous) ═══

/**
 * Extract candidate sentences from content for plagiarism checking.
 * Picks distinctive, medium-length sentences (10-30 words) that are likely to
 * produce exact-match results if plagiarized.
 */
function extractCheckSentences(text, count = 8) {
  // Strip markdown formatting
  const clean = text
    .replace(/^#{1,6}\s+.*$/gm, '')          // Remove headings
    .replace(/\*\*([^*]+)\*\*/g, '$1')        // Bold
    .replace(/\*([^*]+)\*/g, '$1')            // Italic
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // Links
    .replace(/^[-*]\s+/gm, '')                // List markers
    .replace(/^\d+\.\s+/gm, '')              // Numbered list markers
    .replace(/\n{2,}/g, '\n')                 // Collapse newlines
    .trim();

  // Split into sentences
  const sentences = clean
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => {
      const wordCount = s.split(/\s+/).length;
      // 10-30 words = sweet spot for unique, searchable phrases
      return wordCount >= 10 && wordCount <= 30;
    });

  if (sentences.length === 0) return [];

  // Score sentences by "uniqueness" — longer sentences with specific terms score higher
  const scored = sentences.map(s => {
    let score = 0;
    const words = s.split(/\s+/).length;
    score += words; // Prefer longer sentences
    // Boost sentences with specific data (numbers, proper nouns, technical terms)
    if (/\d+/.test(s)) score += 5;
    if (/[A-Z][a-z]+\s[A-Z]/.test(s)) score += 3; // Proper nouns
    // Penalize very generic sentences
    if (/^(this|it|the|these|those|however|therefore|additionally|moreover|furthermore)/i.test(s)) score -= 5;
    if (/cloud migration|data transfer|enterprise/i.test(s) && words < 15) score -= 3; // Too generic for CloudFuze content
    return { text: s, score };
  });

  // Sort by score descending and pick top N
  scored.sort((a, b) => b.score - a.score);

  // Spread picks across the article: take from beginning, middle, and end
  const selected = [];
  const third = Math.ceil(scored.length / 3);
  const sections = [
    scored.slice(0, third),
    scored.slice(third, third * 2),
    scored.slice(third * 2)
  ];

  const perSection = Math.ceil(count / 3);
  for (const section of sections) {
    selected.push(...section.slice(0, perSection));
  }

  return selected.slice(0, count).map(s => s.text);
}

/**
 * Search Google for an exact-match sentence.
 * Returns matching results (title, URL, snippet) or empty array.
 */
async function searchExactMatch(sentence) {
  const cseKey = process.env.GOOGLE_CSE_KEY;
  const cseCx = process.env.GOOGLE_CSE_CX;
  if (!cseKey || !cseCx) return [];

  // Take a distinctive 8-12 word phrase from the sentence for exact match
  const words = sentence.split(/\s+/);
  const phraseLength = Math.min(12, Math.max(8, words.length));
  // Pick from the middle of the sentence (more distinctive than start/end)
  const startIdx = Math.max(0, Math.floor((words.length - phraseLength) / 2));
  const phrase = words.slice(startIdx, startIdx + phraseLength).join(' ');

  const query = `"${phrase}"`;
  const url = `https://www.googleapis.com/customsearch/v1?key=${cseKey}&cx=${cseCx}&q=${encodeURIComponent(query)}&num=5`;

  try {
    const res = await fetch(url, { timeout: 10000 });
    if (!res.ok) {
      if (res.status === 429) {
        console.warn('Google CSE: Rate limit reached');
        return [];
      }
      return [];
    }

    const data = await res.json();
    const items = data.items || [];

    // Filter out CloudFuze's own domains (not plagiarism if it's our own content)
    return items
      .filter(item => {
        const link = (item.link || '').toLowerCase();
        return !link.includes('cloudfuze.com');
      })
      .map(item => ({
        title: item.title || '',
        url: item.link || '',
        snippet: (item.snippet || '').substring(0, 200)
      }));
  } catch (e) {
    console.warn(`Google CSE search failed for phrase: ${e.message}`);
    return [];
  }
}

/**
 * Run plagiarism check using Google Custom Search.
 * Extracts unique sentences from content, searches each for exact matches.
 * Returns a plagiarism report with matched sentences, sources, and an overall score.
 *
 * This is synchronous (returns results immediately) and free (100 queries/day).
 */
export async function checkPlagiarism(text) {
  const trimmed = (text || '').trim();
  if (trimmed.length < 300) {
    throw new Error('Content must be at least 300 characters for plagiarism checking. Write more content first.');
  }

  const cseKey = process.env.GOOGLE_CSE_KEY;
  const cseCx = process.env.GOOGLE_CSE_CX;
  if (!cseKey || !cseCx) {
    throw new Error('Google Custom Search not configured. Add GOOGLE_CSE_KEY and GOOGLE_CSE_CX to .env for plagiarism checking.');
  }

  // Extract 8 distinctive sentences to check
  const checkSentences = extractCheckSentences(trimmed, 8);
  if (checkSentences.length < 3) {
    throw new Error('Content doesn\'t have enough distinct sentences to check for plagiarism. Write more substantive content.');
  }

  console.log(`Plagiarism check: testing ${checkSentences.length} sentences...`);

  // Search each sentence in parallel (with small concurrency limit to avoid rate limits)
  const results = [];
  const batchSize = 3;

  for (let i = 0; i < checkSentences.length; i += batchSize) {
    const batch = checkSentences.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(
      batch.map(sentence => searchExactMatch(sentence).then(matches => ({ sentence, matches })))
    );

    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      }
    }

    // Small delay between batches to respect rate limits
    if (i + batchSize < checkSentences.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // Analyze results
  const matchedSentences = results.filter(r => r.matches.length > 0);
  const totalChecked = results.length;
  const totalMatched = matchedSentences.length;

  // Calculate plagiarism score (percentage of checked sentences that had matches)
  const plagiarismScore = totalChecked > 0 ? Math.round((totalMatched / totalChecked) * 100) : 0;

  // Collect all unique source URLs
  const sourceMap = new Map();
  for (const { sentence, matches } of matchedSentences) {
    for (const match of matches) {
      const existing = sourceMap.get(match.url);
      if (existing) {
        existing.matchCount++;
        existing.matchedSentences.push(sentence.substring(0, 80));
      } else {
        sourceMap.set(match.url, {
          url: match.url,
          title: match.title,
          snippet: match.snippet,
          matchCount: 1,
          matchedSentences: [sentence.substring(0, 80)]
        });
      }
    }
  }

  // Sort sources by match count
  const sources = [...sourceMap.values()]
    .sort((a, b) => b.matchCount - a.matchCount)
    .slice(0, 10);

  // Determine verdict
  let verdict;
  if (plagiarismScore >= 50) {
    verdict = 'High plagiarism risk — significant matches found across multiple sources';
  } else if (plagiarismScore >= 25) {
    verdict = 'Moderate plagiarism risk — some sentences match existing content';
  } else if (totalMatched > 0) {
    verdict = 'Low plagiarism risk — minor matches found (may be common phrases)';
  } else {
    verdict = 'No plagiarism detected — content appears original';
  }

  return {
    plagiarismScore,
    totalChecked,
    totalMatched,
    totalUniqueSources: sourceMap.size,
    verdict,
    matchedSentences: matchedSentences.map(({ sentence, matches }) => ({
      sentence: sentence.substring(0, 120),
      sourceCount: matches.length,
      topSource: matches[0] ? { url: matches[0].url, title: matches[0].title } : null
    })),
    sources
  };
}

// ═══ CONFIGURATION CHECKS ═══

export function isCopyleaksConfigured() {
  return !!(process.env.COPYLEAKS_EMAIL && process.env.COPYLEAKS_API_KEY);
}

export function isPlagiarismConfigured() {
  return !!(process.env.GOOGLE_CSE_KEY && process.env.GOOGLE_CSE_CX);
}
