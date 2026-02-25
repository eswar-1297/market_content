import { GoogleGenerativeAI } from '@google/generative-ai';
import { ANALYSIS_SYSTEM_PROMPT, buildAnalysisPrompt } from '../utils/promptTemplates.js';

const AI_TIMEOUT_MS = 120000;
const clientCache = new Map();

function getClient(apiKey) {
  if (!clientCache.has(apiKey)) {
    clientCache.set(apiKey, new GoogleGenerativeAI(apiKey));
  }
  return clientCache.get(apiKey);
}

function parseAIJson(text) {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch (_) { /* not raw JSON, try extraction */ }

  let depth = 0;
  let start = -1;
  for (let i = 0; i < cleaned.length; i++) {
    if (cleaned[i] === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (cleaned[i] === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        try {
          return JSON.parse(cleaned.slice(start, i + 1));
        } catch (_) {
          start = -1;
        }
      }
    }
  }

  throw new Error(
    'Failed to parse Gemini response as JSON. Raw (first 500 chars): ' +
    text.substring(0, 500)
  );
}

/**
 * Analyze content using Google Gemini
 */
export async function analyzeWithGemini(content, apiKey) {
  const genAI = getClient(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const prompt = `${ANALYSIS_SYSTEM_PROMPT}\n\n${buildAnalysisPrompt(content)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    }, { signal: controller.signal });

    const response = await result.response;
    const text = response.text();

    if (!text || text.trim().length === 0) {
      throw new Error('Gemini returned an empty response.');
    }

    return parseAIJson(text);
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Gemini request timed out after 120 seconds. Try again.');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
