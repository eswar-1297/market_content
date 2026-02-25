import axios from 'axios';
import * as cheerio from 'cheerio';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { fetchAllRealQuestions } from './questionSources.js';

const AI_TIMEOUT_MS = 90000;
const openaiClients = new Map();
const geminiClients = new Map();

// ═══ LOGGING UTILITIES ═══
const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  white: '\x1b[37m',
  bgCyan: '\x1b[46m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgMagenta: '\x1b[45m',
  bgBlue: '\x1b[44m',
  bgRed: '\x1b[41m',
};
const C = COLORS;

function logHeader(text) {
  const line = '═'.repeat(60);
  console.log(`\n${C.cyan}${C.bright}${line}${C.reset}`);
  console.log(`${C.cyan}${C.bright}  ${text}${C.reset}`);
  console.log(`${C.cyan}${C.bright}${line}${C.reset}`);
}

function logStep(num, label) {
  console.log(`\n${C.bgCyan}${C.bright}${C.white} STEP ${num} ${C.reset} ${C.cyan}${C.bright}${label}${C.reset}`);
}

function logStepDone(num, label, ms) {
  console.log(`${C.bgGreen}${C.bright}${C.white} STEP ${num} DONE ${C.reset} ${C.green}${label}${C.reset} ${C.dim}(${ms}ms)${C.reset}`);
}

function logInfo(label, value) {
  console.log(`  ${C.dim}├─${C.reset} ${C.white}${label}:${C.reset} ${C.yellow}${value}${C.reset}`);
}

function logList(label, items, color = C.white) {
  console.log(`  ${C.dim}├─${C.reset} ${C.white}${label}:${C.reset}`);
  items.forEach((item, i) => {
    const prefix = i === items.length - 1 ? '└─' : '├─';
    console.log(`  ${C.dim}│  ${prefix}${C.reset} ${color}${item}${C.reset}`);
  });
}

function logTable(rows) {
  rows.forEach(([label, value]) => {
    console.log(`  ${C.dim}│${C.reset}  ${C.white}${label.padEnd(22)}${C.reset} ${C.yellow}${value}${C.reset}`);
  });
}

function getOpenAIClient(apiKey) {
  if (!openaiClients.has(apiKey)) {
    openaiClients.set(apiKey, new OpenAI({ apiKey, timeout: AI_TIMEOUT_MS }));
  }
  return openaiClients.get(apiKey);
}

function getGeminiClient(apiKey) {
  if (!geminiClients.has(apiKey)) {
    geminiClients.set(apiKey, new GoogleGenerativeAI(apiKey));
  }
  return geminiClients.get(apiKey);
}

function parseAIJson(text) {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try { return JSON.parse(cleaned); } catch (_) { /* try extraction */ }

  let depth = 0, start = -1;
  for (let i = 0; i < cleaned.length; i++) {
    if (cleaned[i] === '{') { if (depth === 0) start = i; depth++; }
    else if (cleaned[i] === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        try { return JSON.parse(cleaned.slice(start, i + 1)); } catch (_) { start = -1; }
      }
    }
  }

  const arrStart = cleaned.indexOf('[');
  const arrEnd = cleaned.lastIndexOf(']');
  if (arrStart !== -1 && arrEnd > arrStart) {
    try { return JSON.parse(cleaned.slice(arrStart, arrEnd + 1)); } catch (_) { /* ignore */ }
  }

  throw new Error('Failed to parse AI response as JSON: ' + text.substring(0, 300));
}

async function callLLM(prompt, systemPrompt, provider, apiKey, stepLabel = '') {
  const start = Date.now();
  const model = provider === 'openai' ? 'gpt-4o-mini' : 'gemini-2.0-flash';
  console.log(`  ${C.dim}├─${C.reset} ${C.magenta}Calling ${provider.toUpperCase()} (${model})...${C.reset}${stepLabel ? ` [${stepLabel}]` : ''}`);
  console.log(`  ${C.dim}│  ├─ Prompt length: ${prompt.length} chars${C.reset}`);

  if (provider === 'openai') {
    const client = getOpenAIClient(apiKey);
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 4000
    });
    const text = response.choices?.[0]?.message?.content || '';
    const tokens = response.usage;
    console.log(`  ${C.dim}│  ├─ Response: ${text.length} chars in ${Date.now() - start}ms${C.reset}`);
    if (tokens) console.log(`  ${C.dim}│  └─ Tokens: ${tokens.prompt_tokens} prompt + ${tokens.completion_tokens} completion = ${tokens.total_tokens} total${C.reset}`);
    return text;
  }

  const genAI = getGeminiClient(apiKey);
  const genModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    const result = await genModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${prompt}` }] }],
    }, { signal: controller.signal });
    const text = (await result.response).text();
    console.log(`  ${C.dim}│  └─ Response: ${text.length} chars in ${Date.now() - start}ms${C.reset}`);
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

// ═══ STEP 7: Generate Semantic Keywords (Hybrid: Google CSE + Autocomplete + LLM) ═══

const AUTOCOMPLETE_URL = 'https://suggestqueries.google.com/complete/search';

async function fetchGoogleAutocompleteSuggestions(topic) {
  const suggestions = new Set();
  const coreParts = topic.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2)
    .slice(0, 5)
    .join(' ');

  const queries = [
    coreParts,
    `${coreParts} vs`,
    `${coreParts} how`,
    `${coreParts} best`,
    `${coreParts} free`,
    `${coreParts} tools`,
    `how to ${coreParts}`,
    `best ${coreParts}`,
    `${coreParts} alternative`,
  ];

  const alphaExpansion = 'abcdefghijklmnoprstw'.split('');
  for (const ch of alphaExpansion) {
    queries.push(`${coreParts} ${ch}`);
  }

  const batchSize = 5;
  for (let i = 0; i < queries.length; i += batchSize) {
    const batch = queries.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(q =>
        axios.get(AUTOCOMPLETE_URL, {
          params: { client: 'firefox', q },
          timeout: 5000,
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/120.0' }
        })
      )
    );
    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      const items = r.value?.data?.[1] || [];
      for (const item of items) {
        const clean = item.trim().toLowerCase();
        if (clean.length > 3 && clean.length < 100) suggestions.add(clean);
      }
    }
    if (i + batchSize < queries.length) await new Promise(r => setTimeout(r, 200));
  }

  console.log(`  ${C.dim}├─${C.reset} ${C.cyan}Google Autocomplete: ${suggestions.size} suggestions${C.reset}`);
  return [...suggestions];
}

async function fetchCSEKeywords(topic, cseApiKey, cseCx) {
  if (!cseApiKey || !cseCx) return { phrases: [], entities: [] };

  const coreParts = topic.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2)
    .slice(0, 5)
    .join(' ');

  const queries = [
    coreParts,
    `${coreParts} guide`,
    `${coreParts} comparison`,
    `${coreParts} best practices`,
    `how to ${coreParts}`,
    `${coreParts} alternatives`,
  ];

  const allTitles = [];
  const allSnippets = [];
  const rawTitles = [];

  for (const q of queries.slice(0, 5)) {
    try {
      const { data } = await axios.get('https://www.googleapis.com/customsearch/v1', {
        params: { key: cseApiKey, cx: cseCx, q, num: 10 },
        timeout: 10000
      });
      for (const item of (data.items || [])) {
        if (item.title) {
          rawTitles.push(item.title);
          allTitles.push(item.title.toLowerCase());
        }
        if (item.snippet) allSnippets.push(item.snippet.toLowerCase());
      }
    } catch { /* skip failed queries */ }
  }

  const text = [...allTitles, ...allSnippets].join(' ');

  // Extract meaningful n-grams (2-4 words) that appear more than once
  const words = text.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2);
  const STOP = new Set(['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'has', 'have', 'from', 'with', 'they', 'been', 'that', 'this', 'will', 'each', 'make', 'like', 'than', 'them', 'then', 'its', 'over', 'such', 'into', 'also', 'more', 'other', 'which', 'their', 'about', 'would', 'these', 'your', 'what', 'when', 'how', 'who', 'why', 'where', 'just', 'here', 'best', 'most', 'some', 'learn']);
  const ngramCounts = new Map();

  for (let n = 2; n <= 4; n++) {
    for (let i = 0; i <= words.length - n; i++) {
      const gram = words.slice(i, i + n);
      if (gram.some(w => STOP.has(w) && gram.indexOf(w) === 0)) continue;
      if (gram.every(w => STOP.has(w))) continue;
      const phrase = gram.join(' ');
      ngramCounts.set(phrase, (ngramCounts.get(phrase) || 0) + 1);
    }
  }

  const phrases = [...ngramCounts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([phrase]) => phrase);

  // Extract capitalized entities from original-case titles (brands, products)
  const entityCounts = new Map();
  const SKIP_ENTITIES = new Set(['the', 'this', 'that', 'how', 'what', 'why', 'when', 'best', 'top', 'new', 'your', 'our', 'free', 'step', 'guide', 'ways', 'tips']);
  for (const rawTitle of rawTitles) {
    let match;
    const re = /\b[A-Z][a-zA-Z0-9]+(?:\s[A-Z][a-zA-Z0-9]+){0,2}/g;
    while ((match = re.exec(rawTitle)) !== null) {
      const ent = match[0].trim();
      if (ent.length > 2 && !SKIP_ENTITIES.has(ent.toLowerCase())) {
        entityCounts.set(ent, (entityCounts.get(ent) || 0) + 1);
      }
    }
  }
  const entities = [...entityCounts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([ent]) => ent);

  console.log(`  ${C.dim}├─${C.reset} ${C.cyan}Google CSE Mining: ${phrases.length} phrases, ${entities.length} entities from ${allTitles.length} results${C.reset}`);
  return { phrases, entities };
}

export async function generateSemanticKeywords(pageData, provider, apiKey) {
  const title = pageData.h1 || pageData.title || '';
  const headings = (pageData.headings || []).map(h => h.text).slice(0, 15).join(', ');
  const summary = pageData.summary || pageData.paragraphs?.slice(0, 3).join(' ') || '';

  const cseApiKey = process.env.GOOGLE_CSE_KEY || null;
  const cseCx = process.env.GOOGLE_CSE_CX || null;

  console.log(`  ${C.dim}├─${C.reset} ${C.yellow}Semantic Keywords: launching 3 parallel sources (CSE + Autocomplete + LLM)${C.reset}`);

  // Run all 3 sources in parallel
  const [autocompleteResult, cseResult, llmResult] = await Promise.allSettled([
    fetchGoogleAutocompleteSuggestions(title),
    fetchCSEKeywords(title, cseApiKey, cseCx),
    (async () => {
      const systemPrompt = `You are an expert SEO and AEO (Answer Engine Optimization) strategist. Generate semantic keywords that content writers MUST include in their article and FAQ content to maximize visibility in AI search engines (ChatGPT, Gemini, Perplexity) and traditional search (Google).

Return ONLY valid JSON with exactly this structure — no markdown, no explanation:
{
  "coreTopicKeywords": ["keyword1", "keyword2", ...],
  "lsiKeywords": ["keyword1", "keyword2", ...],
  "longTailPhrases": ["phrase1", "phrase2", ...],
  "entityKeywords": ["entity1", "entity2", ...]
}`;

      const prompt = `Article Title: "${title}"
${headings ? `Headings: ${headings}` : ''}
${summary ? `Content Summary: ${summary.substring(0, 800)}` : ''}

Generate semantic keywords for this article across 4 categories:

1. **Core Topic Keywords** (6-8): The primary terms and phrases this article MUST rank for. These are the exact search terms users type.

2. **LSI / Related Keywords** (12-15): Semantically related terms that Google and AI engines associate with this topic. Include synonyms, related concepts, industry jargon, and co-occurring terms that strengthen topical authority. These should be terms a comprehensive article on this topic would naturally mention.

3. **Long-Tail Phrases** (10-12): Specific multi-word search phrases that content writers can target in paragraphs and FAQ answers. These should be real queries people search for related to this topic.

4. **Entity Keywords** (6-8): Specific names — brands, products, tools, protocols, standards, competitors, platforms, and technical terms that are relevant. Include both the main brand/product and its competitors or alternatives.

Rules:
- Make keywords specific to the article topic, not generic SEO terms
- Include a mix of informational, comparison, and transactional keyword intents
- Long-tail phrases should be natural language queries people actually search
- Entity keywords should include real product/brand/tool names relevant to the topic
- Do NOT include generic terms like "SEO", "content marketing", "blog post"`;

      const response = await callLLM(prompt, systemPrompt, provider, apiKey, 'Semantic Keywords');
      return parseAIJson(response);
    })()
  ]);

  // Gather raw data from all sources
  const autoSuggestions = autocompleteResult.status === 'fulfilled' ? autocompleteResult.value : [];
  const cseData = cseResult.status === 'fulfilled' ? cseResult.value : { phrases: [], entities: [] };
  const llmData = llmResult.status === 'fulfilled' ? llmResult.value : {};

  const llmCore = llmData.coreTopicKeywords || [];
  const llmLSI = llmData.lsiKeywords || [];
  const llmLongTail = llmData.longTailPhrases || [];
  const llmEntities = llmData.entityKeywords || [];

  // ── MERGE: Combine all sources, deduplicate ──
  const normalize = (s) => s.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ');

  function dedup(arr) {
    const seen = new Set();
    return arr.filter(item => {
      const key = normalize(item);
      if (!key || key.length < 3 || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // Classify autocomplete suggestions into categories
  const topicLower = normalize(title);
  const topicWords = topicLower.split(' ').filter(w => w.length > 2);

  const autoCore = [];
  const autoLSI = [];
  const autoLongTail = [];
  const autoEntities = [];

  for (const sug of autoSuggestions) {
    const words = sug.split(/\s+/);
    const matchCount = topicWords.filter(tw => sug.includes(tw)).length;
    const matchRatio = topicWords.length > 0 ? matchCount / topicWords.length : 0;

    if (words.length >= 4) {
      autoLongTail.push(sug);
    } else if (matchRatio >= 0.6) {
      autoCore.push(sug);
    } else {
      autoLSI.push(sug);
    }
  }

  // CSE phrases → LSI and long-tail; CSE entities → entity keywords
  const cseLongTail = cseData.phrases.filter(p => p.split(/\s+/).length >= 3);
  const cseLSI = cseData.phrases.filter(p => p.split(/\s+/).length < 3);

  // Merge and deduplicate each category
  const mergedCore = dedup([...llmCore, ...autoCore]).slice(0, 10);
  const mergedLSI = dedup([...llmLSI, ...cseLSI, ...autoLSI]).slice(0, 20);
  const mergedLongTail = dedup([...llmLongTail, ...autoLongTail, ...cseLongTail]).slice(0, 20);
  const mergedEntities = dedup([...llmEntities, ...cseData.entities, ...autoEntities]).slice(0, 12);

  console.log(`  ${C.dim}├─${C.reset} ${C.green}Semantic Keywords merged: ${mergedCore.length} core + ${mergedLSI.length} LSI + ${mergedLongTail.length} long-tail + ${mergedEntities.length} entities${C.reset}`);
  console.log(`  ${C.dim}│  ├─ Sources: LLM=${llmCore.length + llmLSI.length + llmLongTail.length + llmEntities.length}, Autocomplete=${autoSuggestions.length}, CSE=${cseData.phrases.length + cseData.entities.length}${C.reset}`);

  return {
    coreTopicKeywords: mergedCore,
    lsiKeywords: mergedLSI,
    longTailPhrases: mergedLongTail,
    entityKeywords: mergedEntities,
  };
}

// ═══ STEP 1: Scrape page content ═══

export async function scrapePage(url) {
  const { data } = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    },
    timeout: 30000,
    maxRedirects: 5
  });

  const $ = cheerio.load(data);

  $('script, style, nav, footer, header, .sidebar, .menu, .nav, .advertisement, .ad').remove();

  const title = $('title').text().trim();
  const metaDescription = $('meta[name="description"]').attr('content') || '';
  const h1 = $('h1').first().text().trim();

  const headings = [];
  $('h1, h2, h3, h4').each((_, el) => {
    headings.push({
      level: parseInt(el.tagName.replace('h', '')),
      text: $(el).text().trim()
    });
  });

  const paragraphs = [];
  $('p').each((_, el) => {
    const text = $(el).text().trim();
    if (text.length > 20) paragraphs.push(text);
  });

  const existingFAQs = [];
  let inFAQSection = false;
  $('h2, h3, h4, p, li, dt, dd').each((_, el) => {
    const text = $(el).text().trim();
    if (/faq|frequently asked|common questions/i.test(text)) {
      inFAQSection = true;
      return;
    }
    if (inFAQSection && text.endsWith('?')) {
      existingFAQs.push(text);
    }
    if (inFAQSection && /^h2$/i.test(el.tagName) && !/faq/i.test(text)) {
      inFAQSection = false;
    }
  });

  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  const wordCount = bodyText.split(/\s+/).filter(Boolean).length;

  const existingSchema = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const schema = JSON.parse($(el).html());
      existingSchema.push(schema);
    } catch (_) { /* skip invalid */ }
  });

  const hasFAQSchema = existingSchema.some(s =>
    s['@type'] === 'FAQPage' || (Array.isArray(s['@graph']) && s['@graph'].some(g => g['@type'] === 'FAQPage'))
  );

  return {
    url,
    title,
    metaDescription,
    h1,
    headings,
    paragraphs: paragraphs.slice(0, 30),
    existingFAQs,
    wordCount,
    existingSchema: existingSchema.map(s => s['@type'] || 'unknown'),
    hasFAQSchema,
    summary: paragraphs.slice(0, 5).join(' ').substring(0, 1000)
  };
}

// ═══ STEP 2: Discover questions from REAL sources + AI supplement ═══

export async function discoverQuestions(pageData, provider, apiKey) {
  const cseApiKey = process.env.GOOGLE_CSE_KEY || null;
  const cseCx = process.env.GOOGLE_CSE_CX || null;
  const atpApiKey = process.env.ATP_API_KEY || null;
  const rapidApiKey = process.env.RAPIDAPI_KEY || null;

  const paidSources = [atpApiKey && 'AnswerThePublic', rapidApiKey && 'Ubersuggest', (cseApiKey && cseCx) && 'Google CSE'].filter(Boolean);
  console.log(`  ${C.dim}├─${C.reset} ${C.cyan}Fetching from real sources + AI in parallel (Google PAA, Reddit, Quora, QuestionDB${paidSources.length ? ', ' + paidSources.join(', ') : ''})...${C.reset}`);

  // AI supplement prompt — runs in parallel with real sources
  const aiPrompt = `You are an AEO (Answer Engine Optimization) specialist for CloudFuze, a cloud migration platform.

Generate 8-12 questions that people would ask about this page topic. Think about what users would search on Google, ask ChatGPT/Gemini/Perplexity, or discuss on Reddit/Quora.

PAGE INFO:
- URL: ${pageData.url}
- Title: ${pageData.title}
- H1: ${pageData.h1}
- Meta Description: ${pageData.metaDescription}
- Key Headings: ${pageData.headings.slice(0, 10).map(h => `H${h.level}: ${h.text}`).join('\n')}
- Existing FAQs: ${pageData.existingFAQs.length > 0 ? pageData.existingFAQs.join('\n') : 'None'}

Focus on:
- AI search engine queries (how people phrase questions to ChatGPT/Gemini)
- Migration-specific technical questions
- CloudFuze-relevant commercial questions
- Edge cases and troubleshooting questions

Return JSON:
{
  "topic": "<core topic in 3-5 words>",
  "primaryKeyword": "<primary keyword>",
  "questions": [
    { "question": "<question>", "source": "ai-generated", "intent": "<informational|transactional|comparison>", "searchVolumePotential": "<high|medium|low>" }
  ]
}`;

  const aiSystemPrompt = 'You are an AEO research expert. Return valid JSON only.';

  // Fire BOTH real sources and AI in parallel
  const [realResult, aiResult] = await Promise.allSettled([
    fetchAllRealQuestions(pageData, { cseApiKey, cseCx, atpApiKey, rapidApiKey }),
    callLLM(aiPrompt, aiSystemPrompt, provider, apiKey, 'AI Supplement')
  ]);

  const realQuestions = realResult.status === 'fulfilled' ? realResult.value.questions : [];
  const realKeyword = realResult.status === 'fulfilled' ? realResult.value.keyword : null;
  const realSourceCounts = realResult.status === 'fulfilled' ? realResult.value.sourceCounts : {};
  const fetchTimeMs = realResult.status === 'fulfilled' ? realResult.value.fetchTimeMs : 0;

  console.log(`  ${C.dim}├─${C.reset} ${C.green}Real sources returned ${realQuestions.length} questions in ${fetchTimeMs}ms${C.reset}`);
  logTable(Object.entries(realSourceCounts).map(([k, v]) => [k, `${v} questions`]));

  let aiQuestions = [];
  let topic = '';
  let primaryKeyword = '';

  try {
    if (aiResult.status === 'fulfilled') {
      const parsed = parseAIJson(aiResult.value);
      aiQuestions = (parsed.questions || []).map(q => ({ ...q, source: 'ai-generated' }));
      topic = parsed.topic || '';
      primaryKeyword = parsed.primaryKeyword || '';
      console.log(`  ${C.dim}├─${C.reset} ${C.magenta}AI generated ${aiQuestions.length} additional questions${C.reset}`);
    }
  } catch (err) {
    console.warn(`  ${C.dim}├─${C.reset} ${C.yellow}AI supplement failed: ${err.message}${C.reset}`);
  }

  const allQuestions = [...realQuestions, ...aiQuestions];

  if (!topic) topic = (pageData.h1 || pageData.title || '').replace(/\s*[|–—-].*$/, '').trim();
  if (!primaryKeyword) primaryKeyword = realKeyword?.short || topic;

  const bySrc = {};
  allQuestions.forEach(q => { bySrc[q.source] = (bySrc[q.source] || 0) + 1; });
  console.log(`  ${C.dim}├─${C.reset} ${C.bright}${C.green}TOTAL: ${allQuestions.length} questions from ${Object.keys(bySrc).length} sources${C.reset}`);
  Object.entries(bySrc).forEach(([src, count]) => {
    const isReal = src !== 'ai-generated';
    const color = isReal ? C.green : C.magenta;
    const label = isReal ? '(REAL)' : '(AI)';
    console.log(`  ${C.dim}│  ├─${C.reset} ${color}${src}${C.reset}: ${count} questions ${C.dim}${label}${C.reset}`);
  });
  console.log(`  ${C.dim}├─${C.reset} ${C.white}All discovered questions:${C.reset}`);
  allQuestions.forEach((q, i) => {
    const isReal = q.source !== 'ai-generated';
    const icon = isReal ? `${C.green}●${C.reset}` : `${C.magenta}◆${C.reset}`;
    console.log(`  ${C.dim}│  ${i === allQuestions.length - 1 ? '└─' : '├─'}${C.reset} ${icon} ${C.yellow}${i + 1}.${C.reset} ${q.question} ${C.dim}[${q.source}|${q.intent}]${C.reset}`);
  });

  return {
    topic,
    primaryKeyword,
    questions: allQuestions,
    sourceCounts: bySrc,
    keyword: realKeyword
  };
}

// ═══ STEP 4: Gap analysis ═══

export function analyzeGaps(discoveredQuestions, existingFAQs) {
  const normalize = (text) => text.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  const existingNormalized = existingFAQs.map(normalize);

  const isSimilar = (q1, q2) => {
    const words1 = new Set(q1.split(/\s+/));
    const words2 = new Set(q2.split(/\s+/));
    const intersection = [...words1].filter(w => words2.has(w) && w.length > 3);
    const union = new Set([...words1, ...words2]);
    const similarity = intersection.length / union.size;
    return similarity > 0.45;
  };

  const gaps = [];
  const covered = [];

  for (const q of discoveredQuestions) {
    const qNorm = normalize(q.question);
    const isExisting = existingNormalized.some(existing => isSimilar(qNorm, existing));
    if (isExisting) {
      covered.push(q);
    } else {
      gaps.push(q);
    }
  }

  console.log(`  ${C.dim}├─${C.reset} Comparing ${discoveredQuestions.length} discovered vs ${existingFAQs.length} existing FAQs`);
  console.log(`  ${C.dim}├─${C.reset} Similarity threshold: ${C.yellow}>45% word overlap${C.reset}`);
  if (covered.length > 0) {
    console.log(`  ${C.dim}├─${C.reset} ${C.green}COVERED (already on page): ${covered.length}${C.reset}`);
    covered.forEach((q, i) => console.log(`  ${C.dim}│  ├─${C.reset} ${C.green}✓${C.reset} ${q.question}`));
  }
  console.log(`  ${C.dim}├─${C.reset} ${C.red}GAPS (missing from page): ${gaps.length}${C.reset}`);
  gaps.forEach((q, i) => console.log(`  ${C.dim}│  ├─${C.reset} ${C.yellow}○${C.reset} ${q.question} ${C.dim}[${q.source}]${C.reset}`));

  return { gaps, covered, totalDiscovered: discoveredQuestions.length, existingCount: existingFAQs.length };
}

// ═══ STEP 5: Prioritize questions ═══

export async function prioritizeQuestions(questions, pageData, provider, apiKey) {
  const prompt = `You are an AEO (Answer Engine Optimization) expert for CloudFuze, a cloud migration platform.

Prioritize each question for FAQ inclusion on this page. Assign a priority level and explain your reasoning.

PAGE CONTEXT:
- Topic: ${pageData.title}
- URL: ${pageData.url}
- H1: ${pageData.h1}

QUESTIONS TO PRIORITIZE:
${questions.map((q, i) => `${i + 1}. ${q.question} [source: ${q.source}, intent: ${q.intent}]`).join('\n')}

PRIORITIZATION CRITERIA:
- **high** — Must include. The question is highly searched, fits this page perfectly, AI engines would cite the answer, and it's directly relevant to cloud migration. Pick 5-8 questions max as high.
- **medium** — Good to have. Relevant question but slightly off-topic for this specific page, or less likely to be searched. Include if space allows.
- **low** — Skip. Too generic, doesn't fit the page, or already well-covered elsewhere.

THINK ABOUT EACH QUESTION:
1. Would a real user search this when reading this page?
2. Would ChatGPT/Gemini/Perplexity cite our answer?
3. Does it directly relate to the page topic (not just the general domain)?
4. Does answering it help CloudFuze's business?

Be strict. Not every question deserves high priority. A good FAQ section has 5-8 focused questions, not 20 generic ones.

Return JSON:
{
  "prioritizedQuestions": [
    {
      "question": "<question text>",
      "source": "<original source>",
      "intent": "<original intent>",
      "priority": "<high|medium|low>",
      "reasoning": "<1-sentence explaining why this priority level>"
    }
  ]
}

List high priority questions first, then medium, then low.`;

  const systemPrompt = 'You are an AEO prioritization expert. Return only valid JSON. Be strict with priority assignment.';
  const result = await callLLM(prompt, systemPrompt, provider, apiKey, 'Question Prioritization');
  const parsed = parseAIJson(result);

  const pq = parsed.prioritizedQuestions || [];
  const high = pq.filter(q => q.priority === 'high');
  const med = pq.filter(q => q.priority === 'medium');
  const low = pq.filter(q => q.priority === 'low');

  console.log(`  ${C.dim}├─${C.reset} Prioritized ${pq.length} questions`);
  console.log(`  ${C.dim}├─${C.reset} Priority breakdown: ${C.red}${C.bright}${high.length} HIGH${C.reset} | ${C.yellow}${med.length} MEDIUM${C.reset} | ${C.dim}${low.length} LOW${C.reset}`);

  if (high.length > 0) {
    console.log(`  ${C.dim}├─${C.reset} ${C.red}${C.bright}HIGH PRIORITY (will generate answers):${C.reset}`);
    high.forEach((q, i) => {
      console.log(`  ${C.dim}│  ├─${C.reset} ${C.bright}${i + 1}. ${q.question}${C.reset}`);
      console.log(`  ${C.dim}│  │  └─${C.reset} ${C.dim}${q.reasoning}${C.reset}`);
    });
  }
  if (med.length > 0) {
    console.log(`  ${C.dim}├─${C.reset} ${C.yellow}MEDIUM PRIORITY (will generate if under 8 total):${C.reset}`);
    med.forEach((q, i) => {
      console.log(`  ${C.dim}│  ├─${C.reset} ${C.yellow}${i + 1}. ${q.question}${C.reset}`);
      console.log(`  ${C.dim}│  │  └─${C.reset} ${C.dim}${q.reasoning}${C.reset}`);
    });
  }
  if (low.length > 0) {
    console.log(`  ${C.dim}├─${C.reset} ${C.dim}LOW PRIORITY (skipped):${C.reset}`);
    low.forEach((q, i) => {
      console.log(`  ${C.dim}│  ├─${C.reset} ${C.dim}${i + 1}. ${q.question} — ${q.reasoning}${C.reset}`);
    });
  }

  return parsed;
}

// ═══ STEP 6: Generate answers ═══

export async function generateAnswers(prioritizedQuestions, pageData, provider, apiKey) {
  const highQuestions = prioritizedQuestions.filter(q => q.priority === 'high');
  const mediumQuestions = prioritizedQuestions.filter(q => q.priority === 'medium');

  // Take all high-priority, fill remaining slots (up to 8) with medium
  const remaining = 8 - highQuestions.length;
  const topQuestions = [
    ...highQuestions,
    ...(remaining > 0 ? mediumQuestions.slice(0, remaining) : [])
  ];

  console.log(`  ${C.dim}├─${C.reset} Selected: ${C.red}${C.bright}${highQuestions.length} high${C.reset} + ${C.yellow}${Math.max(0, Math.min(remaining, mediumQuestions.length))} medium${C.reset} = ${C.green}${C.bright}${topQuestions.length} total${C.reset} (max 8)`);
  topQuestions.forEach((q, i) => {
    const prioColor = q.priority === 'high' ? `${C.red}HIGH  ` : `${C.yellow}MEDIUM`;
    console.log(`  ${C.dim}│  ├─${C.reset} ${prioColor}${C.reset} ${C.bright}${i + 1}.${C.reset} ${q.question}`);
  });

  if (topQuestions.length === 0) {
    console.log(`  ${C.dim}├─${C.reset} ${C.red}No qualifying questions — skipping answer generation${C.reset}`);
    return { faqs: [], message: 'No high-priority questions found for this page.' };
  }

  const prompt = `You are a cloud migration expert writing FAQ answers for CloudFuze.

PAGE CONTEXT:
- Title: ${pageData.title}
- URL: ${pageData.url}
- Topic Summary: ${pageData.summary.substring(0, 500)}

Generate optimized FAQ answers for these questions:

${topQuestions.map((q, i) => `${i + 1}. ${q.question}`).join('\n')}

ANSWER RULES:
- Each answer: 80-120 words
- Mention CloudFuze naturally where relevant (don't force it)
- Be specific and technical but readable
- Start with a direct answer in the first sentence
- Include concrete details, not vague statements
- Avoid marketing fluff — be helpful and authoritative
- Write for AI engines to cite as direct answers
- Each answer should stand alone as a complete response

Return JSON:
{
  "faqs": [
    {
      "question": "<question>",
      "answer": "<optimized answer, 80-120 words>",
      "priority": "<high|medium>",
      "aiCitationScore": <0-100 how likely AI will cite this>,
      "targetIntent": "<informational|navigational|transactional>"
    }
  ]
}`;

  const systemPrompt = 'You are a cloud migration expert writing concise, factual FAQ content optimized for AI citation. Return only valid JSON.';
  const result = await callLLM(prompt, systemPrompt, provider, apiKey, 'Answer Generation');
  const parsed = parseAIJson(result);

  console.log(`  ${C.dim}├─${C.reset} ${C.green}Generated ${parsed.faqs?.length || 0} FAQ answers${C.reset}`);
  if (parsed.faqs?.length > 0) {
    parsed.faqs.forEach((faq, i) => {
      const wordCount = faq.answer.split(/\s+/).length;
      console.log(`  ${C.dim}│  ├─${C.reset} ${C.bright}Q${i + 1}:${C.reset} ${faq.question}`);
      console.log(`  ${C.dim}│  │  └─${C.reset} ${C.dim}Answer: ${wordCount} words | AI Citation: ${faq.aiCitationScore || 'N/A'}% | Intent: ${faq.targetIntent}${C.reset}`);
    });
  }

  return parsed;
}

// ═══ STEP 7: Generate FAQ schema (JSON-LD) ═══

export function buildFAQSchema(faqs) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(faq => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer
      }
    }))
  };
}

// ═══ STEP 8: Format output ═══

export function formatOutput(faqs, schema) {
  const htmlBlock = faqs.map(faq =>
    `<div class="faq-item">\n  <h3>${faq.question}</h3>\n  <p>${faq.answer}</p>\n</div>`
  ).join('\n\n');

  const fullHTML = `<section class="faq-section" itemscope itemtype="https://schema.org/FAQPage">
  <h2>Frequently Asked Questions</h2>
${faqs.map(faq => `  <div itemscope itemprop="mainEntity" itemtype="https://schema.org/Question">
    <h3 itemprop="name">${faq.question}</h3>
    <div itemscope itemprop="acceptedAnswer" itemtype="https://schema.org/Answer">
      <p itemprop="text">${faq.answer}</p>
    </div>
  </div>`).join('\n')}
</section>`;

  const schemaScript = `<script type="application/ld+json">\n${JSON.stringify(schema, null, 2)}\n</script>`;

  return {
    htmlBlock,
    fullHTML,
    schemaScript,
    schemaJSON: schema,
    markdownBlock: faqs.map(faq => `### ${faq.question}\n\n${faq.answer}`).join('\n\n---\n\n')
  };
}

// ═══ FULL PIPELINE ═══

export async function runFAQPipeline(url, provider, apiKey, onProgress) {
  const pipelineStart = Date.now();
  const progress = (step, status, data = null) => {
    if (onProgress) onProgress({ step, status, data, timestamp: Date.now() });
  };

  logHeader(`FAQ PIPELINE STARTED`);
  console.log(`  ${C.dim}├─${C.reset} ${C.white}URL:${C.reset}      ${C.cyan}${url}${C.reset}`);
  console.log(`  ${C.dim}├─${C.reset} ${C.white}Provider:${C.reset} ${C.magenta}${provider}${C.reset}`);
  console.log(`  ${C.dim}└─${C.reset} ${C.white}Time:${C.reset}     ${C.dim}${new Date().toLocaleTimeString()}${C.reset}`);

  // ── STEP 1: Scrape ──
  logStep(1, 'SCRAPING PAGE CONTENT');
  let t = Date.now();
  progress(1, 'running');
  const pageData = await scrapePage(url);
  const scrapeMs = Date.now() - t;
  progress(1, 'complete', {
    title: pageData.title,
    headings: pageData.headings.length,
    existingFAQs: pageData.existingFAQs.length,
    wordCount: pageData.wordCount,
    hasFAQSchema: pageData.hasFAQSchema
  });

  logInfo('Title', pageData.title);
  logInfo('H1', pageData.h1 || '(none)');
  logInfo('Word Count', pageData.wordCount.toLocaleString());
  logInfo('Headings Found', `${pageData.headings.length} (H1-H4)`);
  logInfo('Paragraphs Extracted', pageData.paragraphs.length);
  logInfo('Existing FAQs on Page', pageData.existingFAQs.length);
  logInfo('Has FAQ Schema', pageData.hasFAQSchema ? 'YES' : 'NO');
  logInfo('Schema Types Found', pageData.existingSchema.join(', ') || 'none');
  if (pageData.existingFAQs.length > 0) {
    logList('Existing FAQ Questions', pageData.existingFAQs, C.green);
  }
  if (pageData.headings.length > 0) {
    const headingSample = pageData.headings.slice(0, 10).map(h => `${'  '.repeat(h.level - 1)}H${h.level}: ${h.text}`);
    logList('Page Structure (first 10)', headingSample, C.dim);
  }
  logStepDone(1, 'Page scraped successfully', scrapeMs);

  // ── STEP 2: Discover Questions from REAL sources + AI ──
  logStep(2, 'DISCOVERING QUESTIONS (Google + Reddit + SerpAPI + AI)');
  t = Date.now();
  progress(2, 'running');
  const discovery = await discoverQuestions(pageData, provider, apiKey);
  const discoverMs = Date.now() - t;
  progress(2, 'complete', {
    topic: discovery.topic,
    primaryKeyword: discovery.primaryKeyword,
    questionsFound: discovery.questions.length,
    sourceCounts: discovery.sourceCounts
  });
  logStepDone(2, `${discovery.questions.length} questions discovered`, discoverMs);

  // ── STEP 3: Gap Analysis ──
  logStep(3, 'GAP ANALYSIS (comparing discovered vs existing)');
  t = Date.now();
  progress(3, 'running');
  const gapAnalysis = analyzeGaps(discovery.questions, pageData.existingFAQs);
  const gapMs = Date.now() - t;
  progress(3, 'complete', {
    gaps: gapAnalysis.gaps.length,
    covered: gapAnalysis.covered.length
  });
  logStepDone(3, `${gapAnalysis.gaps.length} gaps found, ${gapAnalysis.covered.length} covered`, gapMs);

  // ── STEP 4: Prioritize ──
  logStep(4, `PRIORITIZING ${gapAnalysis.gaps.length} GAP QUESTIONS`);
  t = Date.now();
  progress(4, 'running');
  const prioritized = await prioritizeQuestions(gapAnalysis.gaps, pageData, provider, apiKey);
  const scoreMs = Date.now() - t;
  progress(4, 'complete', {
    highPriority: prioritized.prioritizedQuestions.filter(q => q.priority === 'high').length,
    totalPrioritized: prioritized.prioritizedQuestions.length
  });
  logStepDone(4, `${prioritized.prioritizedQuestions.length} questions prioritized`, scoreMs);

  // ── STEP 5: Generate Answers ──
  logStep(5, 'GENERATING OPTIMIZED FAQ ANSWERS');
  t = Date.now();
  progress(5, 'running');
  const answers = await generateAnswers(prioritized.prioritizedQuestions, pageData, provider, apiKey);
  const answerMs = Date.now() - t;
  progress(5, 'complete', { faqCount: answers.faqs.length });
  logStepDone(5, `${answers.faqs.length} FAQ answers generated`, answerMs);

  // ── STEP 6: Schema ──
  logStep(6, 'BUILDING FAQ SCHEMA');
  t = Date.now();
  progress(6, 'running');

  const schema = buildFAQSchema(answers.faqs);
  const output = formatOutput(answers.faqs, schema);

  const schemaMs = Date.now() - t;
  progress(6, 'complete');

  logInfo('JSON-LD Schema', `FAQPage with ${answers.faqs.length} questions`);
  logInfo('HTML Block', `${output.htmlBlock.length} chars`);
  logStepDone(6, 'Schema complete', schemaMs);

  // ── FINAL SUMMARY ──
  const totalMs = Date.now() - pipelineStart;
  logHeader('FAQ PIPELINE COMPLETE');
  console.log(`  ${C.dim}├─${C.reset} ${C.white}URL:${C.reset}                ${C.cyan}${url}${C.reset}`);
  console.log(`  ${C.dim}├─${C.reset} ${C.white}Provider:${C.reset}           ${C.magenta}${provider}${C.reset}`);
  console.log(`  ${C.dim}├─${C.reset} ${C.white}Questions Discovered:${C.reset}${C.yellow} ${discovery.questions.length}${C.reset}`);
  console.log(`  ${C.dim}├─${C.reset} ${C.white}Gaps Found:${C.reset}         ${C.yellow} ${gapAnalysis.gaps.length}${C.reset}`);
  const pq = prioritized.prioritizedQuestions;
  console.log(`  ${C.dim}├─${C.reset} ${C.white}High Priority:${C.reset}      ${C.red} ${pq.filter(q => q.priority === 'high').length}${C.reset}`);
  console.log(`  ${C.dim}├─${C.reset} ${C.white}Medium Priority:${C.reset}    ${C.yellow} ${pq.filter(q => q.priority === 'medium').length}${C.reset}`);
  console.log(`  ${C.dim}├─${C.reset} ${C.white}Low Priority:${C.reset}       ${C.dim} ${pq.filter(q => q.priority === 'low').length}${C.reset}`);
  console.log(`  ${C.dim}├─${C.reset} ${C.white}FAQs Generated:${C.reset}     ${C.green} ${answers.faqs.length}${C.reset}`);
  console.log(`  ${C.dim}└─${C.reset} ${C.white}Total Time:${C.reset}         ${C.bright}${(totalMs / 1000).toFixed(1)}s${C.reset}`);
  console.log();

  return {
    pageData: {
      url: pageData.url,
      title: pageData.title,
      h1: pageData.h1,
      metaDescription: pageData.metaDescription,
      wordCount: pageData.wordCount,
      existingFAQs: pageData.existingFAQs,
      hasFAQSchema: pageData.hasFAQSchema,
      existingSchemaTypes: pageData.existingSchema,
      headingCount: pageData.headings.length
    },
    discovery: {
      topic: discovery.topic,
      primaryKeyword: discovery.primaryKeyword,
      totalQuestions: discovery.questions.length,
      allQuestions: discovery.questions,
      sourceCounts: discovery.sourceCounts || {}
    },
    gapAnalysis: {
      missingQuestions: gapAnalysis.gaps.length,
      coveredQuestions: gapAnalysis.covered.length,
      gaps: gapAnalysis.gaps,
      covered: gapAnalysis.covered
    },
    prioritization: {
      questions: pq,
      highPriority: pq.filter(q => q.priority === 'high').length,
      mediumPriority: pq.filter(q => q.priority === 'medium').length,
      lowPriority: pq.filter(q => q.priority === 'low').length
    },
    faqs: answers.faqs,
    output,
    provider
  };
}

// ═══ TITLE-BASED PIPELINE (for new articles — no URL scraping) ═══

export async function runTitlePipeline(title, provider, apiKey, onProgress) {
  const pipelineStart = Date.now();
  const progress = (step, status, data = null) => {
    if (onProgress) onProgress({ step, status, data, timestamp: Date.now() });
  };

  logHeader('TITLE-BASED FAQ PIPELINE STARTED');
  console.log(`  ${C.dim}├─${C.reset} ${C.white}Title:${C.reset}    ${C.cyan}${title}${C.reset}`);
  console.log(`  ${C.dim}├─${C.reset} ${C.white}Provider:${C.reset} ${C.magenta}${provider}${C.reset}`);
  console.log(`  ${C.dim}└─${C.reset} ${C.white}Time:${C.reset}     ${C.dim}${new Date().toLocaleTimeString()}${C.reset}`);

  const pageData = {
    url: null,
    title,
    metaDescription: '',
    h1: title,
    headings: [],
    paragraphs: [],
    existingFAQs: [],
    wordCount: 0,
    existingSchema: [],
    hasFAQSchema: false,
    summary: ''
  };

  // ── STEP 1: ALL discovery in parallel — real sources + AI questions + semantic keywords ──
  logStep(1, 'DISCOVERING QUESTIONS + KEYWORDS (all parallel)');
  let t = Date.now();
  progress(1, 'running');

  const cseApiKey = process.env.GOOGLE_CSE_KEY || null;
  const cseCx = process.env.GOOGLE_CSE_CX || null;
  const atpApiKey = process.env.ATP_API_KEY || null;
  const rapidApiKey = process.env.RAPIDAPI_KEY || null;

  // AI question generation prompt (runs independently, doesn't wait for real sources)
  const aiQuestionPrompt = `You are an AEO (Answer Engine Optimization) specialist for CloudFuze, a cloud migration platform.

Generate 8-12 questions that people would ask about this topic. Think about what users would search on Google, ask ChatGPT/Gemini/Perplexity, or discuss on Reddit/Quora.

ARTICLE TITLE: "${title}"

Focus on:
- Questions with search intent (how-to, what-is, comparison, troubleshooting)
- Migration-specific technical questions
- CloudFuze-relevant commercial questions
- Questions AI search engines would want to answer

Return JSON:
{
  "topic": "<core topic in 3-5 words>",
  "primaryKeyword": "<primary search keyword>",
  "questions": [
    { "question": "<question>", "source": "ai-generated", "intent": "<informational|transactional|comparison>", "searchVolumePotential": "<high|medium|low>" }
  ]
}`;
  const aiSystemPrompt = 'You are an AEO research expert. Return valid JSON only.';

  // Fire ALL three in parallel
  const [realResult, aiResult, semanticKeywords] = await Promise.allSettled([
    fetchAllRealQuestions(pageData, { cseApiKey, cseCx, atpApiKey, rapidApiKey }),
    callLLM(aiQuestionPrompt, aiSystemPrompt, provider, apiKey, 'AI Questions'),
    generateSemanticKeywords(pageData, provider, apiKey)
  ]);

  // Process real source results
  const realQuestions = realResult.status === 'fulfilled' ? realResult.value.questions : [];
  const realKeyword = realResult.status === 'fulfilled' ? realResult.value.keyword : null;
  const realSourceCounts = realResult.status === 'fulfilled' ? realResult.value.sourceCounts : {};

  // Process AI questions
  let aiQuestions = [];
  let topic = '';
  let primaryKeyword = '';
  try {
    if (aiResult.status === 'fulfilled') {
      const parsed = parseAIJson(aiResult.value);
      aiQuestions = (parsed.questions || []).map(q => ({ ...q, source: 'ai-generated' }));
      topic = parsed.topic || '';
      primaryKeyword = parsed.primaryKeyword || '';
    }
  } catch (err) {
    console.warn(`  ${C.dim}├─${C.reset} ${C.yellow}AI questions parse failed: ${err.message}${C.reset}`);
  }

  // Process semantic keywords
  const skResult = semanticKeywords.status === 'fulfilled'
    ? semanticKeywords.value
    : { coreTopicKeywords: [], lsiKeywords: [], longTailPhrases: [], entityKeywords: [] };

  // Merge and deduplicate
  const allQuestions = [...realQuestions, ...aiQuestions];
  if (!topic) topic = title.replace(/\s*[|–—-].*$/, '').trim();
  if (!primaryKeyword) primaryKeyword = realKeyword?.short || topic;

  // Build source counts
  const bySrc = { ...realSourceCounts };
  if (aiQuestions.length > 0) bySrc['ai-generated'] = aiQuestions.length;

  const discoverMs = Date.now() - t;
  console.log(`  ${C.dim}├─${C.reset} ${C.green}Real sources: ${realQuestions.length} questions${C.reset}`);
  console.log(`  ${C.dim}├─${C.reset} ${C.magenta}AI generated: ${aiQuestions.length} questions${C.reset}`);
  console.log(`  ${C.dim}├─${C.reset} ${C.cyan}Semantic keywords: ${skResult.coreTopicKeywords.length + skResult.lsiKeywords.length + skResult.longTailPhrases.length + skResult.entityKeywords.length} total${C.reset}`);

  const discovery = { topic, primaryKeyword, questions: allQuestions, sourceCounts: bySrc, keyword: realKeyword };

  progress(1, 'complete', {
    topic: discovery.topic,
    primaryKeyword: discovery.primaryKeyword,
    questionsFound: allQuestions.length,
    sourceCounts: bySrc
  });
  logStepDone(1, `${allQuestions.length} questions + ${skResult.coreTopicKeywords.length + skResult.lsiKeywords.length + skResult.longTailPhrases.length + skResult.entityKeywords.length} keywords (all parallel)`, discoverMs);

  // ── STEP 2: Prioritize (pick best 5-8 for FAQ answers) ──
  logStep(2, `PRIORITIZING ${discovery.questions.length} QUESTIONS`);
  t = Date.now();
  progress(2, 'running');
  const prioritized = await prioritizeQuestions(discovery.questions, pageData, provider, apiKey);
  const scoreMs = Date.now() - t;
  const pq = prioritized.prioritizedQuestions || [];
  progress(2, 'complete', {
    highPriority: pq.filter(q => q.priority === 'high').length,
    totalPrioritized: pq.length
  });
  logStepDone(2, `${pq.length} questions prioritized`, scoreMs);

  // ── STEP 3: Generate Answers ──
  logStep(3, 'GENERATING FAQ ANSWERS');
  t = Date.now();
  progress(3, 'running');
  const answers = await generateAnswers(pq, pageData, provider, apiKey);
  const answerMs = Date.now() - t;
  progress(3, 'complete', { faqCount: answers.faqs.length });
  logStepDone(3, `${answers.faqs.length} FAQ answers generated`, answerMs);

  // ── STEP 4: Schema (instant, no AI call) ──
  logStep(4, 'BUILDING SCHEMA');
  t = Date.now();
  progress(4, 'running');
  const schema = buildFAQSchema(answers.faqs);
  const output = formatOutput(answers.faqs, schema);
  const schemaMs = Date.now() - t;
  progress(4, 'complete');
  logStepDone(4, 'Schema built', schemaMs);

  const totalMs = Date.now() - pipelineStart;
  logHeader('TITLE-BASED PIPELINE COMPLETE');
  console.log(`  ${C.dim}├─${C.reset} ${C.white}Title:${C.reset}              ${C.cyan}${title}${C.reset}`);
  console.log(`  ${C.dim}├─${C.reset} ${C.white}Questions Discovered:${C.reset}${C.yellow} ${discovery.questions.length}${C.reset}`);
  console.log(`  ${C.dim}├─${C.reset} ${C.white}FAQs Generated:${C.reset}     ${C.green} ${answers.faqs.length}${C.reset}`);
  console.log(`  ${C.dim}├─${C.reset} ${C.white}Semantic Keywords:${C.reset}   ${C.green} ${skResult.coreTopicKeywords.length + skResult.lsiKeywords.length + skResult.longTailPhrases.length + skResult.entityKeywords.length} total${C.reset}`);
  console.log(`  ${C.dim}└─${C.reset} ${C.white}Total Time:${C.reset}         ${C.bright}${(totalMs / 1000).toFixed(1)}s${C.reset}`);
  console.log();

  return {
    pageData: {
      url: null,
      title,
      h1: title,
      metaDescription: '',
      wordCount: 0,
      existingFAQs: [],
      hasFAQSchema: false,
      existingSchemaTypes: [],
      headingCount: 0
    },
    discovery: {
      topic: discovery.topic,
      primaryKeyword: discovery.primaryKeyword,
      totalQuestions: discovery.questions.length,
      allQuestions: discovery.questions,
      sourceCounts: discovery.sourceCounts || {}
    },
    gapAnalysis: {
      missingQuestions: discovery.questions.length,
      coveredQuestions: 0,
      gaps: discovery.questions,
      covered: []
    },
    prioritization: {
      questions: pq,
      highPriority: pq.filter(q => q.priority === 'high').length,
      mediumPriority: pq.filter(q => q.priority === 'medium').length,
      lowPriority: pq.filter(q => q.priority === 'low').length
    },
    faqs: answers.faqs,
    output,
    semanticKeywords: skResult,
    provider
  };
}
