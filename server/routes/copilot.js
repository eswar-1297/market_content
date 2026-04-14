import { Router } from 'express';
import { generateWritingPlan, analyzeLive, getCorrections, analyzeWriterProfile } from '../services/copilotService.js';
import { ingestArticle, findRelatedArticles, listArticles, deleteArticle, getWriterProfile, createWriter, listWriters } from '../services/memoryService.js';
import { trackKeywords, generateKeywordSuggestions } from '../services/keywordEngine.js';
import { getSession, updateSession, listSessions, createSession, saveChatMessage, getSessionMessages, deleteSession, saveContentSnapshot, getContentSnapshots, getSnapshotContent, deleteContentSnapshot, saveFeedback } from '../db/copilotDb.js';
import { randomUUID } from 'crypto';
import { CHAT_SYSTEM_PROMPT, buildChatPrompt } from '../utils/copilotPrompts.js';
import { runAgent } from '../services/agentEngine.js';
import { refreshG2Reviews, getG2CacheStatus, bulkUpdateReviewUrls, getG2Reviews } from '../services/g2ScraperService.js';
import { getTodayTopicForWriter } from '../services/contentCalendarService.js';
import { checkAIDetection, checkPlagiarism, isCopyleaksConfigured, isPlagiarismConfigured } from '../services/contentCheckService.js';
import { getLangfuse, flushLangfuse, recordScore } from '../services/langfuseService.js';
import { addLearnedRule, getLearnedRules, removeLearnedRule } from '../services/feedbackLearningService.js';

const router = Router();

const TOOL_LABELS = {
  search_past_articles: 'Searching past articles...',
  analyze_content_structure: 'Running full content review...',
  track_keyword_usage: 'Tracking keyword usage...',
  get_writer_profile: 'Looking up writer profile...',
  search_article_chunks: 'Searching article sections...',
  list_all_articles: 'Listing all articles...',
  get_todays_topic_for_writer: 'Checking content calendar...',
  suggest_youtube_videos: 'Searching CloudFuze YouTube...',
  search_g2_testimonials: 'Finding customer reviews...',
  suggest_tables_and_infographics: 'Suggesting visual elements...',
  generate_faqs: 'Generating FAQs + Fanout queries...',
  audit_published_article: 'Auditing published article...',
  search_community_threads: 'Searching Reddit & Quora...',
  browse_published_articles: 'Fetching published articles...',
  generate_fanout_queries: 'Generating fanout queries...',
  generate_framework: 'Generating article framework...',
  generate_article: 'Generating full article...',
  edit_article: 'Editing article...',
  check_ai_detection: 'Running AI content detection...',
  check_plagiarism: 'Running plagiarism check...',
  search_sharepoint_docs: 'Searching SharePoint docs...',
  update_article_requirements: 'Saving article requirements...'
};

function getAIProvider(req) {
  const provider = req.headers['x-ai-provider'] || req.body?.provider || 'openai';
  const openaiKey = process.env.OPENAI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const ollamaUrl = process.env.OLLAMA_BASE_URL;

  // No fallback — only use the exact provider the user selected
  if (provider === 'openai') return openaiKey ? { type: 'openai', apiKey: openaiKey } : null;
  if (provider === 'gemini') return geminiKey ? { type: 'gemini', apiKey: geminiKey } : null;
  if (provider === 'claude') return anthropicKey ? { type: 'claude', apiKey: anthropicKey } : null;
  if (provider === 'ollama') return ollamaUrl ? { type: 'ollama', baseUrl: ollamaUrl, model: process.env.OLLAMA_MODEL || 'llama3.2' } : null;
  return null;
}

// --- Content Calendar ---

router.get('/calendar/:writer', (req, res) => {
  try {
    const writerName = req.params.writer;
    const result = getTodayTopicForWriter(writerName);
    if (!result) return res.status(404).json({ error: `Writer "${writerName}" not found in calendar.` });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Chat (Agent with Tool Calling) ---

router.post('/chat', async (req, res) => {
  try {
    const { message, currentContent, currentHTML, conversationHistory = [], writerContext = {}, articleRequirements = {}, sessionId } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'Message is required' });

    const aiProvider = getAIProvider(req);
    if (!aiProvider) return res.status(400).json({ error: 'No AI provider configured. Add OpenAI or Gemini API key in Settings.' });

    let activeSessionId = sessionId || null;
    if (activeSessionId) {
      const sessionExists = !!getSession(activeSessionId);
      if (!sessionExists) activeSessionId = null;
    }
    if (activeSessionId) {
      saveChatMessage(activeSessionId, 'user', message.trim());
      if (currentContent) {
        updateSession(activeSessionId, { current_content: currentContent });
      }
    }

    const prompt = buildChatPrompt(message.trim(), currentContent || '', conversationHistory, writerContext, articleRequirements);
    const writerId = req.user?.email || req.body.writerId || 'default';
    const agentReqs = { ...articleRequirements, _currentContent: currentContent || '', _currentHTML: currentHTML || '', _writerName: writerContext?.writerName || '', _writerId: writerId, _sessionId: activeSessionId || undefined, _aiProvider: aiProvider, _rawUserMessage: message.trim() };

    const agentResult = await runAgent(CHAT_SYSTEM_PROMPT, prompt, aiProvider, agentReqs);

    let content = (agentResult.content || '')
      .replace(/\|\|\|JSON\|\|\|[\s\S]*?\|\|\|JSON\|\|\|/g, '')
      .replace(/```json[\s\S]*?```/g, '')
      .trim();

    const toolSteps = (agentResult.toolsUsed || []).map(t => ({
      tool: t.tool,
      label: TOOL_LABELS[t.tool] || t.tool,
      summary: summarizeToolResult(t.tool, t.result)
    }));

    // Debug: log all tools and their result keys
    for (const t of (agentResult.toolsUsed || [])) {
      console.log(`[CHAT] Tool: ${t.tool} | Result keys: ${Object.keys(t.result || {}).join(', ')} | Has article: ${!!t.result?.article} | Article length: ${t.result?.article?.length || 0}`);
    }

    const articleStep = (agentResult.toolsUsed || []).find(t => (t.tool === 'generate_article' || t.tool === 'edit_article' || t.tool === 'generate_framework') && t.result?.article);
    const generatedArticle = articleStep?.result?.article || null;
    const metaTitle = articleStep?.result?.metaTitle || null;
    const metaDescription = articleStep?.result?.metaDescription || null;

    console.log(`[CHAT] articleStep found: ${!!articleStep} | generatedArticle length: ${generatedArticle?.length || 0}`);

    const reqSteps = (agentResult.toolsUsed || []).filter(t => t.tool === 'update_article_requirements' && t.result?.requirements);
    let requirementsUpdate = null;
    if (reqSteps.length > 0) {
      requirementsUpdate = {};
      for (const step of reqSteps) {
        Object.assign(requirementsUpdate, step.result.requirements);
      }
    }

    if (activeSessionId) {
      saveChatMessage(activeSessionId, 'assistant', content, toolSteps, true);
      if (generatedArticle) {
        const toolName = articleStep?.tool || 'generate_article';
        const labelMap = { generate_article: 'Generated article', edit_article: 'Edited article', generate_framework: 'Generated framework' };
        saveContentSnapshot(activeSessionId, generatedArticle, labelMap[toolName] || 'Article update', 'agent');
        updateSession(activeSessionId, { current_content: generatedArticle });
      }
    }

    res.json({ role: 'assistant', content, toolSteps, isAgent: true, generatedArticle, metaTitle, metaDescription, requirementsUpdate, sessionId: activeSessionId, traceId: agentResult.traceId || null });
  } catch (err) {
    console.error('Agent error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ═══ FEEDBACK — thumbs up/down + comment → Langfuse score + SQLite for learning ═══
router.post('/feedback', async (req, res) => {
  try {
    const { traceId, score, comment, userMessage, assistantResponse, toolsUsed } = req.body;

    if (!traceId) {
      return res.status(400).json({ error: 'traceId is required' });
    }
    if (score !== 1 && score !== 0) {
      return res.status(400).json({ error: 'score must be 1 (thumbs up) or 0 (thumbs down)' });
    }

    // 1. Record in Langfuse
    recordScore(traceId, score, comment || '');
    await flushLangfuse();

    // 2. Save to SQLite for record-keeping
    const writerId = req.user?.email || req.body.writerId || '';
    const sessionId = req.body.sessionId || '';
    const topic = req.body.topic || '';
    saveFeedback({
      traceId,
      sessionId,
      writerId,
      score,
      comment: comment || '',
      userMessage: userMessage || '',
      assistantResponse: assistantResponse || '',
      topic,
      toolsUsed: toolsUsed || ''
    });

    console.log(`[Feedback] ${score === 1 ? '👍' : '👎'} traceId=${traceId} | comment=${comment ? 'yes' : 'none'} | writer=${writerId || 'anonymous'}`);

    // 3. If negative feedback WITH a comment → generate a permanent learned rule
    //    This is processed ONCE and permanently improves all future responses.
    let newRule = null;
    if (score === 0 && comment && comment.trim().length > 2) {
      // Fire and forget — don't block the response
      addLearnedRule({
        comment: comment || '',
        userMessage: userMessage || '',
        assistantResponse: assistantResponse || '',
        toolsUsed: toolsUsed || '',
        topic: topic || ''
      }).then(rule => {
        if (rule) console.log(`📘 [Feedback] Permanent rule created from feedback`);
      }).catch(e => {
        console.warn('[Feedback] Rule generation failed:', e.message);
      });
      newRule = 'processing';
    }

    res.json({ success: true, traceId, score, comment: comment || '', ruleGenerated: newRule === 'processing' });
  } catch (err) {
    console.error('Feedback error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ═══ LEARNED RULES — view/manage permanent rules from feedback ═══
router.get('/learned-rules', (req, res) => {
  const rules = getLearnedRules();
  res.json({ count: rules.length, rules });
});

router.delete('/learned-rules/:index', (req, res) => {
  const index = parseInt(req.params.index);
  const removed = removeLearnedRule(index);
  if (removed) {
    res.json({ success: true, removed });
  } else {
    res.status(404).json({ error: 'Rule not found at that index' });
  }
});

function summarizeToolResult(tool, result) {
  if (!result) return '';
  switch (tool) {
    case 'search_past_articles':
      return result.found > 0 ? `Found ${result.found} related article(s)` : 'No related articles found';
    case 'analyze_content_structure': {
      if (result.error) return result.error;
      const score = result.overallScore ?? result.csabfScore;
      const icpScore = result.icpAlignment?.totalScore;
      const missing = result.missingQuestions?.length || 0;
      const both = result.missingQuestions?.filter(q => q.appearsInBoth)?.length || 0;
      let s = score != null ? `CSABF: ${score}/100` : 'Analysis complete';
      if (icpScore != null) s += ` · ICP: ${icpScore}/100 (${result.icpAlignment.tier})`;
      if (missing > 0) s += ` · ${missing} FAQ gaps`;
      if (both > 0) s += ` (${both} high-priority)`;
      return s;
    }
    case 'track_keyword_usage':
      return `Secondary coverage: ${result.secondaryCoverage || '0%'}, LSI: ${result.lsiCoverage || '0%'}`;
    case 'get_writer_profile':
      return result.totalArticles != null ? `${result.totalArticles} articles on profile` : result.message || '';
    case 'search_article_chunks':
      return result.found > 0 ? `Found ${result.found} relevant section(s)` : 'No matching sections';
    case 'list_all_articles':
      return result.count > 0 ? `${result.count} article(s) in memory` : 'No articles saved yet';
    case 'get_todays_topic_for_writer':
      return result.topic ? `Today: ${result.topic.substring(0, 40)}${result.topic.length > 40 ? '…' : ''}` : (result.error || 'No topic found');
    case 'suggest_youtube_videos':
      return result.found > 0 ? `Found ${result.found} video(s)` : (result.message || 'No videos found');
    case 'search_g2_testimonials':
      return result.found > 0 ? `Found ${result.found} testimonial(s)` : (result.message || 'No testimonials found');
    case 'suggest_tables_and_infographics':
      return result.suggestions?.length > 0 ? `${result.suggestions.length} visual element(s) suggested` : 'No suggestions';
    case 'generate_faqs': {
      const qCount = result.rankedQuestions?.length || 0;
      const bothCount = result.rankedQuestions?.filter(f => f.appearsInBoth)?.length || 0;
      if (qCount === 0) return result.error || 'No questions found';
      let s = `Top ${qCount} questions from ${result.totalQuestionsDiscovered || 0} discovered + ${result.totalFanoutQueries || 0} fanout`;
      if (bothCount > 0) s += ` (${bothCount} high-priority)`;
      return s;
    }
    case 'audit_published_article': {
      if (result.error) return result.error;
      const score = result.csabfScore != null ? `CSABF: ${result.csabfScore}/100` : 'CSABF: N/A';
      const issues = result.structuralIssues?.length || 0;
      const covered = result.coveredQuestions?.length || 0;
      const missing = result.missingQuestions?.length || 0;
      const both = result.missingQuestions?.filter(q => q.appearsInBoth)?.length || 0;
      let s = `${score} · ${issues} issues · ${covered} FAQs covered · ${missing} missing`;
      if (both > 0) s += ` (${both} high-priority)`;
      return s;
    }
    case 'search_community_threads':
      return result.found > 0 ? `Found ${result.found} thread(s) — ${(result.sources || []).join(', ')}` : (result.message || 'No threads found');
    case 'browse_published_articles':
      return result.found > 0 ? `${result.found} article(s) found, showing ${result.showing || result.found}` : (result.message || 'No articles found');
    case 'generate_fanout_queries':
      return result.total > 0 ? `${result.total} fanout queries generated` : (result.error || 'No queries generated');
    case 'generate_framework':
      if (!result.success) return result.error || 'Framework generation failed';
      return `Framework generated (${result.sectionCount || '?'} sections)`;
    case 'generate_article':
      if (!result.success) return result.error || 'Generation failed';
      return `Article generated (~${result.wordCountEstimate || '?'} words)${result.metaTitle ? ' + meta tags' : ''}`;
    case 'edit_article':
      if (!result.success) return result.error || 'Edit failed';
      return `Article updated (${result.editType}${result.sectionHeading ? ': ' + result.sectionHeading : ''})`;
    case 'check_ai_detection':
      if (result.error) return result.error;
      return `AI: ${result.aiScore}% · Human: ${result.humanScore}% · ${result.verdict}`;
    case 'check_plagiarism':
      if (result.error) return result.error;
      return `Plagiarism: ${result.plagiarismScore}% · ${result.totalMatched}/${result.totalChecked} sentences matched · ${result.verdict}`;
    case 'search_sharepoint_docs':
      if (result.error) return result.error;
      if (result.mode === 'direct') return `Fetched: "${result.page?.title}"`;
      if (result.topResult) {
        const hasContent = result.topResult.content && result.topResult.content.length > 50;
        return `Found ${result.totalResults} docs${hasContent ? ' · reading content' : ''} · top: "${result.topResult.name}"`;
      }
      return `${result.totalResults || 0} results found`;
    case 'update_article_requirements':
      return result.updated?.length > 0 ? `Updated: ${result.updated.join(', ')}` : 'Requirements saved';
    default:
      return '';
  }
}

// --- Writing Plan ---

router.post('/plan', async (req, res) => {
  try {
    const { topic, writerId = 'default' } = req.body;
    if (!topic?.trim()) return res.status(400).json({ error: 'Topic is required' });

    const aiProvider = getAIProvider(req);
    if (!aiProvider) return res.status(400).json({ error: 'No AI provider configured. Add OpenAI or Gemini API key.' });

    const result = await generateWritingPlan(topic.trim(), writerId, aiProvider);
    res.json(result);
  } catch (err) {
    console.error('Plan generation error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// --- Live Analysis (rule engine, no AI) ---

router.post('/analyze-live', (req, res) => {
  try {
    const { content, targetKeywords, frameworkSections } = req.body;
    if (!content?.trim()) return res.json({ score: 0, categories: {}, suggestions: [] });

    const result = analyzeLive(content, targetKeywords, frameworkSections);
    res.json(result);
  } catch (err) {
    console.error('Live analysis error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// --- AI Corrections ---

router.post('/corrections', async (req, res) => {
  try {
    const { content, topic, sectionContext } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'Content is required' });

    const aiProvider = getAIProvider(req);
    if (!aiProvider) return res.status(400).json({ error: 'No AI provider configured.' });

    const result = await getCorrections(content, topic || '', sectionContext || '', aiProvider);
    res.json(result);
  } catch (err) {
    console.error('Corrections error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// --- Keyword Analysis ---

router.post('/keywords/track', (req, res) => {
  try {
    const { content, targetKeywords } = req.body;
    const result = trackKeywords(content || '', targetKeywords);
    res.json(result || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/keywords/suggest', async (req, res) => {
  try {
    const { topic, currentContent, existingKeywords } = req.body;
    const aiProvider = getAIProvider(req);
    if (!aiProvider) return res.status(400).json({ error: 'No AI provider configured.' });

    const result = await generateKeywordSuggestions(topic, currentContent || '', existingKeywords || {}, aiProvider);
    res.json(result || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Articles (Memory) ---

router.get('/articles', (req, res) => {
  try {
    const { writerId = 'default', limit = 50 } = req.query;
    const articles = listArticles(writerId, parseInt(limit));
    res.json(articles);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/articles', (req, res) => {
  try {
    const { title, content, url, topic, primaryKeyword, secondaryKeywords, writerId = 'default' } = req.body;
    if (!title?.trim() || !content?.trim()) return res.status(400).json({ error: 'Title and content are required' });

    const result = ingestArticle({ writerId, title: title.trim(), content: content.trim(), url, topic, primaryKeyword, secondaryKeywords });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/articles/:id', (req, res) => {
  try {
    const deleted = deleteArticle(req.params.id);
    res.json({ deleted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/articles/related', (req, res) => {
  try {
    const { topic, writerId = 'default' } = req.query;
    if (!topic) return res.json([]);
    const results = findRelatedArticles(writerId, topic);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Sessions ---

router.get('/sessions', (req, res) => {
  try {
    const authEmail = req.user?.email;
    const clientWriterId = req.query.writerId || 'default';

    // If auth email and client writerId differ, merge sessions from both to handle
    // sessions created before auth was configured or under a different identifier.
    if (authEmail && clientWriterId !== authEmail && clientWriterId !== 'default') {
      const authSessions = listSessions(authEmail);
      const clientSessions = listSessions(clientWriterId);
      const seen = new Set(authSessions.map(s => s.id));
      const merged = [...authSessions, ...clientSessions.filter(s => !seen.has(s.id))];
      merged.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
      return res.json(merged);
    }

    res.json(listSessions(authEmail || clientWriterId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/sessions', (req, res) => {
  try {
    const writerId = req.user?.email || req.body.writerId || 'default';
    const writerName = req.user?.name || req.body.writerName || '';
    const { topic } = req.body;
    if (!topic?.trim()) return res.status(400).json({ error: 'Topic is required' });
    if (writerId !== 'default') {
      createWriter(writerId, writerName || writerId.split('@')[0] || writerId, writerId);
    }
    const id = randomUUID();
    const session = createSession({ id, writer_id: writerId, topic: topic.trim(), content_type: '', framework: [], semantic_keywords: {}, current_content: '' });
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/sessions/:id', (req, res) => {
  try {
    const session = getSession(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/sessions/:id/messages', (req, res) => {
  try {
    const messages = getSessionMessages(req.params.id);
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/sessions/:id', (req, res) => {
  try {
    const updated = updateSession(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Session not found' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/sessions/:id', (req, res) => {
  try {
    const deleted = deleteSession(req.params.id);
    res.json({ deleted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Content Snapshots ---

router.get('/sessions/:id/snapshots', (req, res) => {
  try {
    const snapshots = getContentSnapshots(req.params.id);
    res.json(snapshots);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/snapshots/:snapshotId', (req, res) => {
  try {
    const snapshot = getSnapshotContent(parseInt(req.params.snapshotId));
    if (!snapshot) return res.status(404).json({ error: 'Snapshot not found' });
    res.json(snapshot);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/sessions/:id/snapshots', (req, res) => {
  try {
    const { content, label } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'Content is required' });
    saveContentSnapshot(req.params.id, content, label || 'Manual save', 'manual');
    const snapshots = getContentSnapshots(req.params.id);
    res.json(snapshots);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/snapshots/:snapshotId', (req, res) => {
  try {
    const deleted = deleteContentSnapshot(parseInt(req.params.snapshotId));
    res.json({ deleted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Writer Profile ---

router.get('/profile', (req, res) => {
  try {
    const { writerId = 'default' } = req.query;
    const profile = getWriterProfile(writerId);
    res.json(profile || { writer_id: writerId, total_articles: 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/profile/analyze', async (req, res) => {
  try {
    const { writerId = 'default' } = req.body;
    const aiProvider = getAIProvider(req);
    if (!aiProvider) return res.status(400).json({ error: 'No AI provider configured.' });

    const result = await analyzeWriterProfile(writerId, aiProvider);
    if (!result) return res.status(404).json({ error: 'No articles found for this writer.' });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Writers ---

router.get('/writers', (req, res) => {
  try {
    res.json(listWriters());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/writers', (req, res) => {
  try {
    const { id, name, email } = req.body;
    if (!id || !name) return res.status(400).json({ error: 'ID and name are required' });
    const writer = createWriter(id, name, email || '');
    res.json(writer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- G2 Reviews (Scraper) ---

router.post('/g2-reviews/refresh', async (req, res) => {
  try {
    const reviews = await refreshG2Reviews();
    res.json({
      success: true,
      reviewCount: reviews.length,
      message: reviews.length > 0
        ? `Scraped ${reviews.length} fresh G2 reviews and updated cache.`
        : 'Scrape returned 0 reviews (G2 may have blocked the request). Serving cached data.',
      reviews: reviews.slice(0, 3).map(r => ({ author: r.author, title: r.title, rating: r.rating }))
    });
  } catch (err) {
    console.error('G2 refresh error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/g2-reviews/status', (req, res) => {
  try {
    const status = getG2CacheStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/g2-reviews', async (req, res) => {
  try {
    const reviews = await getG2Reviews();
    res.json({
      count: reviews.length,
      reviews: reviews.map((r, i) => ({
        index: i,
        author: r.author,
        title: r.title,
        rating: r.rating,
        reviewUrl: r.reviewUrl || null,
        hasUrl: !!r.reviewUrl
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/g2-reviews/urls', (req, res) => {
  try {
    const { updates } = req.body;
    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ error: 'Provide an array of { match, reviewUrl } objects' });
    }
    const result = bulkUpdateReviewUrls(updates);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Content Checks (Copyleaks AI Detection + Plagiarism) ---

router.post('/check-ai', async (req, res) => {
  try {
    if (!isCopyleaksConfigured()) {
      return res.status(400).json({ error: 'Copyleaks not configured. Add COPYLEAKS_EMAIL and COPYLEAKS_API_KEY to .env' });
    }
    const { content } = req.body;
    if (!content?.trim() || content.trim().length < 50) {
      return res.status(400).json({ error: 'Content must be at least 50 characters.' });
    }
    const result = await checkAIDetection(content);
    res.json(result);
  } catch (err) {
    console.error('AI detection error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/check-plagiarism', async (req, res) => {
  try {
    if (!isPlagiarismConfigured()) {
      return res.status(400).json({ error: 'Plagiarism check not configured. Add GOOGLE_CSE_KEY and GOOGLE_CSE_CX to .env' });
    }
    const { content } = req.body;
    if (!content?.trim() || content.trim().length < 300) {
      return res.status(400).json({ error: 'Content must be at least 300 characters.' });
    }
    const result = await checkPlagiarism(content);
    res.json(result);
  } catch (err) {
    console.error('Plagiarism check error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// --- AI Status ---

router.get('/status', (req, res) => {
  const openaiKey = process.env.OPENAI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  res.json({
    openai: !!(openaiKey && openaiKey !== 'your-openai-api-key-here'),
    gemini: !!(geminiKey && geminiKey !== 'your-gemini-api-key-here'),
    claude: !!(anthropicKey && anthropicKey !== 'your-anthropic-api-key-here'),
    hasProvider: !!(openaiKey || geminiKey || anthropicKey),
    copyleaks: isCopyleaksConfigured(),
    plagiarism: isPlagiarismConfigured()
  });
});

// --- Langfuse connectivity test ---
router.get('/test-langfuse', async (req, res) => {
  const lf = getLangfuse();
  if (!lf) {
    return res.status(500).json({ ok: false, error: 'Langfuse not configured — check LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY in .env' });
  }
  try {
    const trace = lf.trace({
      name: 'connectivity-test',
      userId: req.user?.email || 'test-user',
      input: { message: 'Langfuse connectivity test from Content Agent' }
    });
    trace.update({ output: 'Connection successful' });
    await flushLangfuse();
    res.json({ ok: true, traceId: trace.id, message: 'Trace sent — check your Langfuse dashboard' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
