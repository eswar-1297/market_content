import { Router } from 'express';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { analyzeWithOpenAI } from '../services/openaiService.js';
import { analyzeWithGemini } from '../services/geminiService.js';
import { getCloudFuzeVideos, searchVideosByKeywords, extractKeywords, hasYouTubeKey, getCacheStats } from '../services/youtubeService.js';
import { stripHtml, countWords } from '../utils/contentParser.js';

const router = Router();

/**
 * GET /api/analyze-ai/status
 * Check which AI providers have keys configured
 */
router.get('/status', (req, res) => {
  res.json({
    openai: !!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your-openai-api-key-here',
    gemini: !!process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your-gemini-api-key-here',
    ollama: !!process.env.OLLAMA_BASE_URL,
    youtube: hasYouTubeKey(),
    youtubeCache: getCacheStats()
  });
});

/**
 * POST /api/analyze-ai
 * AI-powered content analysis using OpenAI or Gemini
 * Body: { content: string, provider: "openai" | "gemini" }
 * API keys are read from server .env — never sent from the frontend
 */
router.post('/', async (req, res) => {
  try {
    const { content, provider } = req.body;

    if (!content || typeof content !== 'string') {
      return res.status(400).json({
        error: 'Content is required and must be a string.'
      });
    }

    if (!provider || !['openai', 'gemini'].includes(provider)) {
      return res.status(400).json({
        error: 'Provider must be "openai" or "gemini".'
      });
    }

    const apiKey = provider === 'openai'
      ? process.env.OPENAI_API_KEY
      : process.env.GEMINI_API_KEY;

    if (!apiKey || apiKey === 'your-openai-api-key-here' || apiKey === 'your-gemini-api-key-here') {
      return res.status(400).json({
        error: `No API key configured for ${provider}. Add your key to the server .env file.`
      });
    }

    const plainContent = stripHtml(content);

    if (plainContent.trim().length < 20) {
      return res.status(400).json({
        error: 'Content is too short for AI analysis.'
      });
    }

    const wordCount = countWords(plainContent);
    const startTime = Date.now();

    // Extract topic keywords (instant, synchronous)
    const keywordData = extractKeywords(content);

    // Run AI analysis and YouTube search fully in parallel
    const ytKey = process.env.YOUTUBE_API_KEY;
    const hasYT = ytKey && ytKey !== 'your-youtube-api-key-here';

    const aiStart = Date.now();
    const ytStart = Date.now();

    const [aiResult, videoSearchResult] = await Promise.all([
      (provider === 'openai'
        ? analyzeWithOpenAI(plainContent, apiKey)
        : analyzeWithGemini(plainContent, apiKey)
      ).then(r => { console.log(`⏱️  AI analysis (${provider}): ${Date.now() - aiStart}ms`); return r; }),

      (hasYT
        ? getCloudFuzeVideos(ytKey)
            .then(() => { const r = searchVideosByKeywords(keywordData); console.log(`⏱️  YouTube search: ${Date.now() - ytStart}ms`); return r; })
            .catch(err => { console.warn('YouTube search skipped:', err.message); return { results: [], keywordBreakdown: [], totalVideosSearched: 0 }; })
        : Promise.resolve({ results: [], keywordBreakdown: [], totalVideosSearched: 0 })
      )
    ]);

    console.log(`⏱️  Total parallel time: ${Date.now() - startTime}ms`);
    const totalVideos = getCacheStats().videoCount;

    if (aiResult.categoryScores) {
      const c = aiResult.categoryScores;
      const scores = ['structure', 'extractability', 'readability', 'seo', 'faqSchema']
        .map(key => Number(c[key]?.score) || 0);
      aiResult.aiVisibilityScore = Math.round(
        scores.reduce((sum, s) => sum + s, 0) / scores.length
      );
    }

    if (aiResult.visualStrategy) {
      const actualCount = aiResult.visualStrategy.images?.length || 0;
      if (aiResult.visualStrategy.recommendedImageCount !== actualCount) {
        aiResult.visualStrategy.recommendedImageCount = actualCount;
      }
    }

    // Filter out SEO-related improvements the AI might still return
    if (Array.isArray(aiResult.improvements)) {
      aiResult.improvements = aiResult.improvements.filter(imp =>
        imp.type !== 'improve-seo' && !/\b(seo|keyword|meta\s?tag|meta\s?description)\b/i.test(imp.type)
      );
    }

    res.json({
      ...aiResult,
      videoSuggestions: videoSearchResult.results,
      videoKeywordBreakdown: videoSearchResult.keywordBreakdown || [],
      extractedKeywords: [...keywordData.primaryPlatforms, ...(keywordData.topicWords || [])],
      blogTitle: keywordData.title,
      contentStats: {
        wordCount,
        provider,
        youtubeVideosAvailable: totalVideos,
        youtubeMatched: videoSearchResult.results.length
      }
    });
  } catch (error) {
    console.error('AI Analysis error:', error);

    if (error.message?.includes('API key') || error.status === 401) {
      return res.status(401).json({
        error: `Invalid ${req.body.provider} API key. Please check the key in server .env file.`
      });
    }

    if (error.status === 429) {
      return res.status(429).json({
        error: 'Rate limit exceeded. Please wait a moment and try again.'
      });
    }

    res.status(500).json({
      error: 'AI analysis failed.',
      details: error.message
    });
  }
});

/**
 * POST /api/analyze-ai/scrape
 * Scrape a URL and return the extracted page content for analysis
 * Body: { url: string }
 */
router.post('/scrape', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'URL is required.' });
    }

    try { new URL(url); } catch (_) {
      return res.status(400).json({ error: 'Invalid URL format.' });
    }

    console.log(`Scraping URL for content analysis: ${url}`);
    const startTime = Date.now();

    const { data } = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      timeout: 15000,
      maxRedirects: 5
    });

    const $ = cheerio.load(data);
    $('script, style, nav, footer, header, .sidebar, .menu, .nav, .advertisement, .ad, .cookie-banner, .popup').remove();

    const title = $('title').text().trim();
    const h1 = $('h1').first().text().trim();

    const contentParts = [];
    if (h1) contentParts.push(`# ${h1}\n`);

    $('h2, h3, h4, h5, h6, p, li, blockquote, td, th, figcaption, dt, dd').each((_, el) => {
      const tag = el.tagName.toLowerCase();
      const text = $(el).text().trim();
      if (!text || text.length < 5) return;

      if (tag === 'h2') contentParts.push(`\n## ${text}\n`);
      else if (tag === 'h3') contentParts.push(`\n### ${text}\n`);
      else if (tag === 'h4' || tag === 'h5' || tag === 'h6') contentParts.push(`\n#### ${text}\n`);
      else if (tag === 'li') contentParts.push(`- ${text}`);
      else contentParts.push(text);
    });

    const extractedContent = contentParts.join('\n');
    const wordCount = extractedContent.split(/\s+/).filter(Boolean).length;

    console.log(`Scraped ${url} in ${Date.now() - startTime}ms — ${wordCount} words, title: "${title}"`);

    res.json({
      success: true,
      title: title || h1 || 'Untitled',
      url,
      content: extractedContent,
      wordCount
    });
  } catch (error) {
    console.error('Scrape error:', error.message);
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return res.status(400).json({ error: 'Could not connect to the URL. Please check the address.' });
    }
    if (error.response?.status === 403) {
      return res.status(400).json({ error: 'Access denied by the website (403). Try a different URL.' });
    }
    if (error.response?.status === 404) {
      return res.status(400).json({ error: 'Page not found (404). Check the URL.' });
    }
    res.status(500).json({ error: 'Failed to scrape page.', details: error.message });
  }
});

export default router;
