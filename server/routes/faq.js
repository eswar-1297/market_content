import { Router } from 'express';
import { runFAQPipeline, runTitlePipeline, scrapePage } from '../services/faqService.js';

const router = Router();

/**
 * POST /api/faq/generate
 * Run the full FAQ generation pipeline for a given URL
 * Body: { url: string, provider: "openai" | "gemini" }
 */
router.post('/generate', async (req, res) => {
  try {
    const { url, provider } = req.body;

    console.log(`\n\x1b[44m\x1b[1m\x1b[37m POST /api/faq/generate \x1b[0m \x1b[36m${url}\x1b[0m \x1b[35m[${provider}]\x1b[0m`);

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'URL is required.' });
    }

    try {
      new URL(url);
    } catch (_) {
      return res.status(400).json({ error: 'Invalid URL format.' });
    }

    if (!provider || !['openai', 'gemini'].includes(provider)) {
      return res.status(400).json({ error: 'Provider must be "openai" or "gemini".' });
    }

    const apiKey = provider === 'openai'
      ? process.env.OPENAI_API_KEY
      : process.env.GEMINI_API_KEY;

    if (!apiKey || apiKey.startsWith('your-')) {
      return res.status(400).json({
        error: `No API key configured for ${provider}. Add your key to the server .env file.`
      });
    }

    const steps = [];
    const result = await runFAQPipeline(url, provider, apiKey, (progress) => {
      steps.push(progress);
    });

    console.log(`\x1b[42m\x1b[1m\x1b[37m 200 OK \x1b[0m \x1b[32mFAQ pipeline complete — ${result.faqs?.length || 0} FAQs sent to client\x1b[0m\n`);

    res.json({
      success: true,
      ...result,
      pipelineSteps: steps
    });
  } catch (error) {
    console.error('\x1b[41m\x1b[1m\x1b[37m FAQ PIPELINE ERROR \x1b[0m', error.message);

    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return res.status(400).json({ error: 'Could not reach the provided URL. Check the URL and try again.' });
    }
    if (error.response?.status === 403) {
      return res.status(400).json({ error: 'The page blocked our request (403 Forbidden). Try a different URL.' });
    }
    if (error.response?.status === 404) {
      return res.status(400).json({ error: 'Page not found (404). Check the URL.' });
    }
    if (error.message?.includes('API key') || error.status === 401) {
      return res.status(401).json({ error: `Invalid ${req.body.provider} API key.` });
    }
    if (error.status === 429) {
      return res.status(429).json({ error: 'Rate limit exceeded. Wait a moment and try again.' });
    }

    res.status(500).json({
      error: 'FAQ generation failed.',
      details: error.message
    });
  }
});

/**
 * POST /api/faq/generate-from-title
 * Run FAQ + semantic keywords pipeline from a title (for new articles)
 * Body: { title: string, provider: "openai" | "gemini" }
 */
router.post('/generate-from-title', async (req, res) => {
  try {
    const { title, provider } = req.body;

    console.log(`\n\x1b[44m\x1b[1m\x1b[37m POST /api/faq/generate-from-title \x1b[0m \x1b[36m"${title}"\x1b[0m \x1b[35m[${provider}]\x1b[0m`);

    if (!title || typeof title !== 'string' || title.trim().length < 3) {
      return res.status(400).json({ error: 'Title is required (at least 3 characters).' });
    }

    if (!provider || !['openai', 'gemini'].includes(provider)) {
      return res.status(400).json({ error: 'Provider must be "openai" or "gemini".' });
    }

    const apiKey = provider === 'openai'
      ? process.env.OPENAI_API_KEY
      : process.env.GEMINI_API_KEY;

    if (!apiKey || apiKey.startsWith('your-')) {
      return res.status(400).json({
        error: `No API key configured for ${provider}. Add your key to the server .env file.`
      });
    }

    const steps = [];
    const result = await runTitlePipeline(title.trim(), provider, apiKey, (progress) => {
      steps.push(progress);
    });

    console.log(`\x1b[42m\x1b[1m\x1b[37m 200 OK \x1b[0m \x1b[32mTitle pipeline complete — ${result.faqs?.length || 0} FAQs + ${(result.semanticKeywords?.coreTopicKeywords?.length || 0) + (result.semanticKeywords?.lsiKeywords?.length || 0) + (result.semanticKeywords?.longTailPhrases?.length || 0) + (result.semanticKeywords?.entityKeywords?.length || 0)} keywords\x1b[0m\n`);

    res.json({
      success: true,
      ...result,
      pipelineSteps: steps
    });
  } catch (error) {
    console.error('\x1b[41m\x1b[1m\x1b[37m TITLE PIPELINE ERROR \x1b[0m', error.message);

    if (error.message?.includes('API key') || error.status === 401) {
      return res.status(401).json({ error: `Invalid ${req.body.provider} API key.` });
    }
    if (error.status === 429) {
      return res.status(429).json({ error: 'Rate limit exceeded. Wait a moment and try again.' });
    }

    res.status(500).json({
      error: 'Title-based FAQ generation failed.',
      details: error.message
    });
  }
});

/**
 * POST /api/faq/scrape
 * Quick scrape to preview page data before running full pipeline
 * Body: { url: string }
 */
router.post('/scrape', async (req, res) => {
  try {
    const { url } = req.body;

    console.log(`\n\x1b[44m\x1b[1m\x1b[37m POST /api/faq/scrape \x1b[0m \x1b[36m${url}\x1b[0m`);

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'URL is required.' });
    }

    try {
      new URL(url);
    } catch (_) {
      return res.status(400).json({ error: 'Invalid URL format.' });
    }

    const t = Date.now();
    const pageData = await scrapePage(url);
    console.log(`\x1b[42m\x1b[1m\x1b[37m 200 OK \x1b[0m \x1b[32mScrape complete in ${Date.now() - t}ms — ${pageData.title}\x1b[0m\n`);
    res.json({ success: true, pageData });
  } catch (error) {
    console.error('\x1b[41m\x1b[1m\x1b[37m SCRAPE ERROR \x1b[0m', error.message);

    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return res.status(400).json({ error: 'Could not reach the URL.' });
    }

    res.status(500).json({ error: 'Failed to scrape page.', details: error.message });
  }
});

export default router;
