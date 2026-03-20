import { buildKeywordSuggestionsPrompt } from '../utils/copilotPrompts.js';

/**
 * Track keyword usage in real-time content (no AI call needed).
 * This runs client-side OR server-side for fast feedback.
 */
export function trackKeywords(content, targetKeywords) {
  if (!content || !targetKeywords) return null;

  const contentLower = content.toLowerCase();
  const words = content.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  const result = {
    wordCount,
    primary: null,
    secondary: [],
    lsi: [],
    questions: [],
    entities: []
  };

  if (targetKeywords.primary) {
    const kw = targetKeywords.primary.toLowerCase();
    const count = countOccurrences(contentLower, kw);
    const kwWords = kw.split(/\s+/).length;
    const density = wordCount > 0 ? ((count * kwWords) / wordCount * 100) : 0;

    let status = 'good';
    if (density < 0.8) status = 'low';
    else if (density > 2.0) status = 'high';

    result.primary = {
      keyword: targetKeywords.primary,
      count,
      density: density.toFixed(1),
      status
    };
  }

  if (targetKeywords.secondary) {
    result.secondary = targetKeywords.secondary.map(kw => ({
      keyword: kw,
      used: contentLower.includes(kw.toLowerCase()),
      count: countOccurrences(contentLower, kw.toLowerCase())
    }));
  }

  if (targetKeywords.lsi) {
    result.lsi = targetKeywords.lsi.map(kw => ({
      keyword: kw,
      used: contentLower.includes(kw.toLowerCase()),
      count: countOccurrences(contentLower, kw.toLowerCase())
    }));
  }

  if (targetKeywords.questions) {
    result.questions = targetKeywords.questions.map(q => ({
      question: q,
      addressed: isQuestionAddressed(contentLower, q)
    }));
  }

  if (targetKeywords.entities) {
    result.entities = targetKeywords.entities.map(e => ({
      entity: e,
      mentioned: contentLower.includes(e.toLowerCase()),
      count: countOccurrences(contentLower, e.toLowerCase())
    }));
  }

  const usedLsi = result.lsi.filter(k => k.used).length;
  const totalLsi = result.lsi.length;
  result.lsiCoverage = totalLsi > 0 ? Math.round((usedLsi / totalLsi) * 100) : 0;

  const usedSecondary = result.secondary.filter(k => k.used).length;
  const totalSecondary = result.secondary.length;
  result.secondaryCoverage = totalSecondary > 0 ? Math.round((usedSecondary / totalSecondary) * 100) : 0;

  return result;
}

function countOccurrences(text, keyword) {
  if (!keyword) return 0;
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escaped, 'gi');
  return (text.match(regex) || []).length;
}

function isQuestionAddressed(content, question) {
  const keyWords = question.toLowerCase()
    .replace(/[?.,!]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 3 && !['what', 'when', 'where', 'which', 'does', 'have', 'that', 'this', 'with', 'from', 'they', 'been', 'will', 'your'].includes(w));

  const matchCount = keyWords.filter(w => content.includes(w)).length;
  return keyWords.length > 0 && matchCount >= Math.ceil(keyWords.length * 0.6);
}

/**
 * Generate AI-powered keyword suggestions using OpenAI or Gemini.
 */
export async function generateKeywordSuggestions(topic, currentContent, existingKeywords, aiProvider) {
  const prompt = buildKeywordSuggestionsPrompt(topic, currentContent, existingKeywords);

  try {
    const result = await callAI(prompt, aiProvider);
    return result;
  } catch (err) {
    console.error('Keyword suggestion failed:', err.message);
    return null;
  }
}

async function callAI(prompt, provider) {
  if (provider.type === 'openai' && provider.apiKey) {
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey: provider.apiKey, timeout: 60000 });
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 4000
    });
    return parseAIJson(response.choices?.[0]?.message?.content || '');
  }

  if (provider.type === 'gemini' && provider.apiKey) {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(provider.apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });
    const text = (await result.response).text();
    return parseAIJson(text);
  }

  throw new Error('No AI provider configured');
}

function parseAIJson(text) {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try { return JSON.parse(cleaned); } catch (_) { /* try extraction */ }

  let depth = 0, start = -1;
  for (let i = 0; i < cleaned.length; i++) {
    if (cleaned[i] === '{') { if (depth === 0) start = i; depth++; }
    else if (cleaned[i] === '}') { depth--; if (depth === 0 && start !== -1) { try { return JSON.parse(cleaned.slice(start, i + 1)); } catch (_) { start = -1; } } }
  }
  throw new Error('Failed to parse AI response as JSON');
}
