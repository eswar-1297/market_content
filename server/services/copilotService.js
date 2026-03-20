import { v4 as uuidv4 } from 'uuid';
import { COPILOT_SYSTEM_PROMPT, buildPlanPrompt, buildCorrectionsPrompt, buildProfileAnalysisPrompt } from '../utils/copilotPrompts.js';
import { ingestArticle, findRelatedArticles, listArticles, getWriterProfile, rebuildWriterProfile } from './memoryService.js';
import { trackKeywords } from './keywordEngine.js';
import { createSession, updateSession, getSession } from '../db/copilotDb.js';
import { analyzeContent } from './ruleEngine.js';

/**
 * Generate a complete writing plan for a topic.
 * Combines AI generation with past article memory.
 */
export async function generateWritingPlan(topic, writerId, aiProvider) {
  const pastArticles = findRelatedArticles(writerId, topic);
  const allArticles = listArticles(writerId, 50);
  const writerProfile = getWriterProfile(writerId);

  const prompt = buildPlanPrompt(topic, pastArticles.length > 0 ? pastArticles : allArticles.slice(0, 10), writerProfile);
  const plan = await callAI(prompt, COPILOT_SYSTEM_PROMPT, aiProvider);

  const sessionId = uuidv4();
  const session = createSession({
    id: sessionId,
    writer_id: writerId,
    topic,
    content_type: plan.contentType || 'general',
    framework: plan.framework || [],
    semantic_keywords: plan.semanticKeywords || {}
  });

  return {
    sessionId,
    plan,
    relatedPastArticles: pastArticles,
    writerProfile
  };
}

/**
 * Analyze content in real-time using the rule engine (no AI call — fast).
 * Returns structure checks, keyword tracking, and framework progress.
 */
export function analyzeLive(content, targetKeywords, frameworkSections) {
  const ruleResult = analyzeContent(content, 'text');

  const keywordAnalysis = targetKeywords ? trackKeywords(content, targetKeywords) : null;

  const frameworkProgress = checkFrameworkProgress(content, frameworkSections);

  return {
    score: ruleResult.overallScore,
    categories: ruleResult.categories,
    suggestions: ruleResult.suggestions?.slice(0, 15) || [],
    keywordAnalysis,
    frameworkProgress,
    contentContext: ruleResult.contentContext
  };
}

/**
 * Get AI-powered corrections for the current content.
 */
export async function getCorrections(content, topic, sectionContext, aiProvider) {
  const prompt = buildCorrectionsPrompt(content, topic, sectionContext);
  return await callAI(prompt, COPILOT_SYSTEM_PROMPT, aiProvider);
}

/**
 * Analyze writer profile using AI based on all their articles.
 */
export async function analyzeWriterProfile(writerId, aiProvider) {
  const articles = listArticles(writerId, 100);
  if (articles.length === 0) return null;

  const prompt = buildProfileAnalysisPrompt(articles);
  const analysis = await callAI(prompt, COPILOT_SYSTEM_PROMPT, aiProvider);

  const existingProfile = getWriterProfile(writerId) || {};
  const { saveWriterProfile } = await import('../db/copilotDb.js');

  saveWriterProfile({
    writer_id: writerId,
    avg_word_count: existingProfile.avg_word_count || 0,
    preferred_frameworks: existingProfile.preferred_frameworks || {},
    common_topics: analysis.commonTopics || existingProfile.common_topics || [],
    writing_style: analysis.writingStyle || '',
    tone_analysis: typeof analysis.toneAnalysis === 'string' ? analysis.toneAnalysis : JSON.stringify(analysis.toneAnalysis || ''),
    total_articles: articles.length
  });

  return { ...analysis, totalArticles: articles.length };
}

function checkFrameworkProgress(content, frameworkSections) {
  if (!frameworkSections || frameworkSections.length === 0) return null;

  const contentLower = content.toLowerCase();
  const lines = content.split('\n');

  const headings = [];
  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+)/);
    if (match) headings.push({ level: match[1].length, text: match[2].trim().toLowerCase() });
  }

  return frameworkSections.map(section => {
    const sectionHeading = section.heading.toLowerCase();
    const found = headings.some(h => {
      const hLower = h.text.toLowerCase();
      return hLower.includes(sectionHeading) || sectionHeading.includes(hLower) ||
        similarEnough(hLower, sectionHeading);
    });

    const hasContent = found || contentLower.includes(sectionHeading);

    return {
      id: section.id,
      heading: section.heading,
      level: section.level,
      required: section.required,
      completed: found,
      hasRelatedContent: hasContent && !found
    };
  });
}

function similarEnough(a, b) {
  const aWords = new Set(a.split(/\s+/).filter(w => w.length > 3));
  const bWords = new Set(b.split(/\s+/).filter(w => w.length > 3));
  if (aWords.size === 0 || bWords.size === 0) return false;
  let matches = 0;
  for (const w of aWords) { if (bWords.has(w)) matches++; }
  return matches >= Math.min(2, Math.min(aWords.size, bWords.size));
}

async function callAI(prompt, systemPrompt, provider) {
  const modelMap = { openai: 'gpt-4o-mini', gemini: 'gemini-2.0-flash', claude: 'claude-sonnet-4-20250514', ollama: provider.model || 'llama3.2' };
  const modelName = modelMap[provider.type] || 'unknown';
  console.log(`\n🤖 [AI Service] Provider: ${provider.type.toUpperCase()} | Model: ${modelName}`);
  const startTime = Date.now();

  try {
    if (provider.type === 'openai' && provider.apiKey) {
      const { default: OpenAI } = await import('openai');
      const client = new OpenAI({ apiKey: provider.apiKey, timeout: 90000 });
      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 6000
      });
      return parseAIJson(response.choices?.[0]?.message?.content || '');
    }

    if (provider.type === 'gemini' && provider.apiKey) {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(provider.apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
      const fullPrompt = `${systemPrompt}\n\n${prompt}`;
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: fullPrompt }] }]
      });
      const text = (await result.response).text();
      return parseAIJson(text);
    }

    if (provider.type === 'claude' && provider.apiKey) {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey: provider.apiKey, timeout: 90000 });
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 6000,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3
      });
      const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n') || '';
      return parseAIJson(text);
    }

    if (provider.type === 'ollama' && provider.baseUrl) {
      const { default: OpenAI } = await import('openai');
      const client = new OpenAI({
        baseURL: `${provider.baseUrl}/v1`,
        apiKey: 'ollama',
        timeout: 180000
      });
      const response = await client.chat.completions.create({
        model: provider.model || 'llama3.2',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3
      });
      return parseAIJson(response.choices?.[0]?.message?.content || '');
    }

    throw new Error('No AI provider configured. Add OpenAI, Gemini, Claude API key or Ollama URL in Settings.');
  } finally {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ [AI Service Done] ${provider.type.toUpperCase()} | ${modelName} | ${elapsed}s`);
  }
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
  throw new Error('Failed to parse AI response as JSON: ' + text.substring(0, 300));
}
