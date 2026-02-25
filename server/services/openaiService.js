import OpenAI from 'openai';
import { ANALYSIS_SYSTEM_PROMPT, buildAnalysisPrompt } from '../utils/promptTemplates.js';

const AI_TIMEOUT_MS = 120000;
const clientCache = new Map();

function getClient(apiKey) {
  if (!clientCache.has(apiKey)) {
    clientCache.set(apiKey, new OpenAI({ apiKey, timeout: AI_TIMEOUT_MS }));
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
    'Failed to parse OpenAI response as JSON. Raw (first 500 chars): ' +
    text.substring(0, 500)
  );
}

/**
 * Analyze content using OpenAI GPT-4
 */
export async function analyzeWithOpenAI(content, apiKey) {
  const openai = getClient(apiKey);

  let response;
  try {
    response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: ANALYSIS_SYSTEM_PROMPT },
        { role: 'user', content: buildAnalysisPrompt(content) }
      ],
      temperature: 0.3,
      max_tokens: 8000
    });
  } catch (err) {
    if (err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') {
      throw new Error('OpenAI request timed out after 120 seconds. Try again.');
    }
    throw err;
  }

  const text = response.choices?.[0]?.message?.content || '';

  if (!text || text.trim().length === 0) {
    throw new Error('OpenAI returned an empty response.');
  }

  return parseAIJson(text);
}
