import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

const SYSTEM_PROMPT = `You are an elite AI search orchestrator with deep knowledge of how ChatGPT, Perplexity AI, Google Gemini, Bing Copilot, and Claude decompose queries for retrieval. Your role is to reverse-engineer the EXACT sub-queries these systems generate internally when searching for information.

UNDERSTANDING AI SEARCH ARCHITECTURE:

Modern AI search engines use a multi-step process:

1. USER QUERY → Query Understanding (intent, entities, context)
2. QUERY DECOMPOSITION → Break into 8–15 focused sub-queries (**YOUR JOB**)
3. PARALLEL RETRIEVAL → Search each sub-query across knowledge bases, web, vectors
4. INFORMATION SYNTHESIS → Combine results into a coherent answer
5. CITATION SELECTION → Credit sources that provided key information

You are replicating Step 2 (Query Decomposition) with surgical precision.

CRITICAL MISSION – ACHIEVE AI SEARCH VISIBILITY:

Content teams use your queries to identify content gaps. Here's the visibility equation:

📊 **VISIBILITY FORMULA:**

- Content covers ≥90% of fanout queries → **HIGH** citation probability
- Content covers 50–80% of fanout queries → **MEDIUM** citation probability
- Content covers <50% of fanout queries → **LOW** citation probability (invisible in AI answers)

Your queries determine what "complete coverage" means. Generate sub-queries that, when answered, would yield undeniably comprehensive, authoritative content.

CROSS-ENGINE QUERY PATTERNS (What **ALL** AI Engines Do):

1. **INTENT-BASED DECOMPOSITION:** Break down by information need:
   - *Definitional intent:* "What is X?"
   - *Comparative intent:* "X vs Y differences"
   - *Procedural intent:* "How to do X?"
   - *Evaluative intent:* "Is X effective/good?"
   - *Transactional/recommendation intent:* "Best X for Y"

2. **ENTITY & CONTEXT INCLUSION:** Always include key entities or context from the user's query in sub-queries.

3. **COMPLETENESS GAPS:** Identify what's *missing* or implicit in the user's ask, then query for it.

4. **SEMANTIC EXPANSION:** Include closely related concepts the user didn't explicitly mention.

5. **USER JOURNEY MAPPING:** Cover the full progression:
   - **Awareness:** "What is it?"
   - **Interest/Why:** "Why does it matter?"
   - **Evaluation:** "How does it compare to alternatives?"
   - **Action:** "How to implement/use?"
   - **Optimization/Future:** "Advanced tips, future trends"

QUERY QUALITY STANDARDS:

Each fanout query MUST:
1. Be answer-seeking & specific
2. Be retrieval-optimized
3. Be entity & context-rich
4. Use natural question format
5. Target unique facets (zero redundancy)
6. Be citation-worthy
7. Be information-dense

STRATEGIC CATEGORIES FOR SUB-QUERIES:

- 📘 **core_facts** – Foundational knowledge, definitions, key components
- 📚 **background** – Context, history, significance
- ⚖️ **comparisons** – Alternatives, pros/cons, tradeoffs
- ⚠️ **edge_cases** – Limitations, risks, pitfalls
- 🛠️ **implementation** – Practical how-to guidance, tools
- 📊 **evaluation** – Metrics, KPIs, success measurement
- 🚀 **follow_up** – Advanced topics, future trends, next steps

OUTPUT FORMAT (JSON Only):

\`\`\`json
{
  "fanouts": [
    {
      "id": "f1",
      "category": "core_facts",
      "purpose": "Establish foundational understanding",
      "query": "What is [topic] and how does it work?"
    }
  ]
}
\`\`\``;

function buildUserPrompt(mainQuery, domain, maxFanouts = 10) {
  let prompt = `MAIN QUERY FROM USER:\n"${mainQuery}"\n`;

  if (domain) {
    prompt += `\nDOMAIN/CONTEXT: ${domain}\n(This affects user intent and the type of information needed.)\n`;
  }

  prompt += `
TARGET AUDIENCE: 
Content creators who need to ensure their content gets cited by ChatGPT, Perplexity, Gemini, and Bing Copilot when users ask this question.

YOUR CRITICAL TASK:
You are reverse-engineering what ChatGPT, Perplexity, Gemini, and Bing would search for internally when answering this query.

Generate EXACTLY ${maxFanouts} fanout queries that:
1. Match what ALL major AI engines would actually search for
2. Cover every information angle needed for a complete answer
3. Leave ZERO gaps that would force AI to cite competitors instead

THINKING PROCESS:
Step 1: Analyze the main query - intent, entities, implicit needs
Step 2: Map information needs across categories
Step 3: Generate specific, entity-rich, natural-language queries
Step 4: Validate completeness - no gaps, no redundancy

REQUIREMENTS:
1. Include at least 1 core_facts query
2. Include at least 1 comparison query (if alternatives exist)
3. Include at least 2 implementation queries (if how-to relevant)
4. Include at least 1 edge_cases query
5. Each query must be standalone and searchable
6. No redundancy - every query explores different angle
7. Specific entities, years, contexts where relevant

OUTPUT FORMAT:
Return a JSON object with a "fanouts" array containing EXACTLY ${maxFanouts} query objects.
Each object must have: id (f1, f2, f3...), category, purpose (one sentence), and query (the search query).`;

  return prompt;
}

function parseJsonFromText(text) {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try { return JSON.parse(cleaned); } catch (_) {}

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
  throw new Error('Failed to parse AI response as JSON');
}

async function generateWithOpenAI(userPrompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');

  const openai = new OpenAI({ apiKey });
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.7,
    response_format: { type: 'json_object' },
    max_tokens: 4000,
    top_p: 0.9,
  });

  const content = response.choices[0].message.content;
  if (!content) throw new Error('No content received from OpenAI');
  return parseJsonFromText(content);
}

async function generateWithGemini(userPrompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const fullPrompt = `${SYSTEM_PROMPT}\n\n${userPrompt}\n\nIMPORTANT: Return ONLY valid JSON, no markdown fences or extra text.`;

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
  });

  const text = (await result.response).text();
  if (!text || !text.trim()) throw new Error('Gemini returned an empty response');
  return parseJsonFromText(text);
}

function normalizeText(str) {
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function wordSet(str) {
  return new Set(normalizeText(str).split(' ').filter(w => w.length > 2));
}

function jaccardSimilarity(a, b) {
  const setA = wordSet(a);
  const setB = wordSet(b);
  const intersection = [...setA].filter(w => setB.has(w)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

function mergeFanouts(openaiResults, geminiResults, maxFanouts) {
  const all = [];

  const oaiFanouts = openaiResults?.fanouts || [];
  const gemFanouts = geminiResults?.fanouts || [];

  oaiFanouts.forEach(f => all.push({ ...f, source: 'chatgpt', score: 2 }));
  gemFanouts.forEach(f => all.push({ ...f, source: 'gemini', score: 2 }));

  // Boost queries that appear in both models (high overlap = both agree it's important)
  for (const oai of all.filter(f => f.source === 'chatgpt')) {
    for (const gem of all.filter(f => f.source === 'gemini')) {
      if (jaccardSimilarity(oai.query, gem.query) > 0.55) {
        oai.score += 3;
        gem.score += 3;
      }
    }
  }

  // Sort by score descending, then deduplicate
  all.sort((a, b) => b.score - a.score);

  const selected = [];
  for (const candidate of all) {
    const isDuplicate = selected.some(s => jaccardSimilarity(s.query, candidate.query) > 0.5);
    if (!isDuplicate) {
      selected.push(candidate);
    }
    if (selected.length >= maxFanouts) break;
  }

  // Ensure good category diversity — if a category is missing, try to fill from remaining
  const usedCategories = new Set(selected.map(s => s.category));
  if (selected.length < maxFanouts) {
    for (const candidate of all) {
      if (selected.length >= maxFanouts) break;
      if (!usedCategories.has(candidate.category)) {
        const isDuplicate = selected.some(s => jaccardSimilarity(s.query, candidate.query) > 0.5);
        if (!isDuplicate) {
          selected.push(candidate);
          usedCategories.add(candidate.category);
        }
      }
    }
  }

  return selected.map((f, i) => ({
    id: `f${i + 1}`,
    category: f.category,
    purpose: f.purpose,
    query: f.query,
  }));
}

export async function generateFanoutQueries(mainQuery, domain, maxFanouts = 10, provider = 'openai') {
  console.log('\n=== Generating Fanout Queries ===');
  console.log('Main Query:', mainQuery);
  console.log('Domain:', domain || 'Not specified');
  console.log('Max Fanouts:', maxFanouts);
  console.log('Provider:', provider);

  const userPrompt = buildUserPrompt(mainQuery, domain, maxFanouts);

  let fanouts;

  if (provider === 'both') {
    console.log('Running BOTH ChatGPT and Gemini in parallel...');
    const [oaiResult, gemResult] = await Promise.allSettled([
      generateWithOpenAI(userPrompt),
      generateWithGemini(userPrompt),
    ]);

    const oaiData = oaiResult.status === 'fulfilled' ? oaiResult.value : null;
    const gemData = gemResult.status === 'fulfilled' ? gemResult.value : null;

    if (oaiResult.status === 'rejected') console.error('ChatGPT failed:', oaiResult.reason?.message);
    if (gemResult.status === 'rejected') console.error('Gemini failed:', gemResult.reason?.message);

    if (!oaiData && !gemData) throw new Error('Both ChatGPT and Gemini failed to generate queries');

    if (!oaiData) {
      fanouts = (gemData.fanouts || []).slice(0, maxFanouts);
    } else if (!gemData) {
      fanouts = (oaiData.fanouts || []).slice(0, maxFanouts);
    } else {
      console.log(`ChatGPT returned ${oaiData.fanouts?.length || 0}, Gemini returned ${gemData.fanouts?.length || 0} queries`);
      fanouts = mergeFanouts(oaiData, gemData, maxFanouts);
    }
  } else if (provider === 'gemini') {
    const parsed = await generateWithGemini(userPrompt);
    fanouts = parsed.fanouts || [];
  } else {
    const parsed = await generateWithOpenAI(userPrompt);
    fanouts = parsed.fanouts || [];
  }

  console.log(`Final ${fanouts.length} fanout queries:`);
  fanouts.forEach((f) => {
    console.log(`  [${f.id}] ${f.category}: ${f.query}`);
  });

  return {
    main_query: mainQuery,
    domain,
    fanouts,
  };
}
