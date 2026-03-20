# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
```bash
# Run both client and server concurrently (from root)
npm run dev

# Run server only
npm run server        # or: node server/index.js

# Run client only (from root)
npm run client        # or: cd client && npm run dev
```

### Build & Production
```bash
# Build client and install all deps
npm run build

# Start server (serves built client from client/dist)
npm start
```

### Client-only commands (run from `client/`)
```bash
npm run lint          # ESLint
npm run preview       # Preview production build
```

No test suite is configured in this project.

## Architecture

This is a monorepo with a React + Vite frontend (`client/`) and an Express backend (`server/`). Both use ES modules (`"type": "module"`). The server runs on port 3001 and serves the built client statically in production.

### Server structure

- **`server/index.js`** — Express entry point. Registers all routes, initializes SQLite databases, preloads YouTube cache, and bootstraps SendGrid.
- **`server/routes/`** — One file per feature area: `analyze.js`, `analyzeAI.js`, `faq.js`, `threadFinder.js`, `fanout.js`, `articles.js`, `email.js`, `copilot.js`
- **`server/services/`** — Business logic layer:
  - `ruleEngine.js` — The core CSABF (CloudFuze Structured AEO Blog Framework) scoring engine. Applies rule-based checks to content without AI calls.
  - `copilotService.js` — Orchestrates the AI Copilot: generates writing plans, runs live analysis, and gets AI corrections. Supports OpenAI (`gpt-4o-mini`) and Gemini (`gemini-2.0-flash`) providers; the API key and provider are passed per-request from the client's settings.
  - `agentEngine.js` — Tool-use agent loop for the Copilot chat. Defines tool schemas for both OpenAI and Gemini function-calling formats; tools include content analysis, article search, FAQ discovery, fanout generation, and YouTube suggestions.
  - `memoryService.js` — Chunks articles by heading sections and stores them in SQLite for retrieval during Copilot sessions.
  - `keywordEngine.js` — Tracks semantic keyword usage in content.
  - `faqService.js` — FAQ discovery via scraping and Google CSE.
  - `fanoutService.js` — Generates question-tree fanout from a topic.
  - `articlesService.js` — Reads the Excel content calendar (`server/Article Content Calendar 2026 (3).xlsx`) and caches results.
  - `emailService.js` — SendGrid integration.
  - `g2ScraperService.js` — Puppeteer-based scraper for G2 reviews (results cached in `server/cache/g2-reviews.json`).
  - `youtubeService.js` — YouTube Data API calls; results cached in `server/cache/youtube-videos.json`.
- **`server/db/`** — SQLite databases via `better-sqlite3`:
  - `database.js` — Thread Finder bookmarks DB (`server/data/bookmarks.db`)
  - `emailDb.js` — Email campaign DB (`server/data/email.db`)
  - `copilotDb.js` — Copilot DB (`server/data/copilot.db`): writers, articles, article_chunks, writer_profiles, copilot_sessions
- **`server/utils/`** — `copilotPrompts.js` (prompt templates), `contentParser.js` (HTML/Markdown parsing utilities used by the rule engine)

### Client structure

- **`client/src/App.jsx`** — React Router v7 routes: `/`, `/copilot`, `/framework`, `/analyzer`, `/faq-generator`, `/thread-finder`, `/fanout`, `/articles`, `/email`, `/settings`
- **`client/src/components/`** — One component per route page, plus shared components (`ScoreGauge`, `SuggestionCard`, etc.)
- **`client/src/components/copilot/`** — Sub-components for the Copilot page: `Editor` (TipTap rich text), `ChatPanel`, `ArticleManager`, `KeywordTracker`, `FrameworkProgress`, `ScoreMeter`, `SuggestionPanel`, `CorrectionCard`, `TopicSetup`
- **`client/src/threadFinder/`** — Self-contained Thread Finder mini-app with its own `pages/`, `components/`, and `services/` subdirectories
- **`client/src/services/liveAnalyzer.js`** — Client-side live analysis calls to `/api/copilot/analyze-live`

### Key data flows

1. **Content analysis (rule-based):** Client sends content → `POST /api/analyze` → `ruleEngine.js` → scored result with CSABF categories.
2. **Content analysis (AI-powered):** Client sends content + AI provider config → `POST /api/analyze-ai` → `openaiService.js` or `geminiService.js`.
3. **Copilot chat:** Client sends message + conversation history → `POST /api/copilot/chat` → `agentEngine.js` runs tool-use loop → response streamed back. AI provider key is passed in request body from client Settings.
4. **Copilot live analysis:** On editor keystroke debounce → `POST /api/copilot/analyze-live` → `copilotService.analyzeLive()` (synchronous, no AI call) → score + keyword + framework data.
5. **Writer memory:** Articles uploaded via `POST /api/copilot/articles` → chunked by section headings → stored in SQLite for retrieval in future Copilot sessions.

### Environment variables

Copy `server/.env.example` to `server/.env`. The server loads `.env` from its own directory at startup. AI keys (`OPENAI_API_KEY`, `GEMINI_API_KEY`) can alternatively be supplied per-request by the user via the Settings page — the server checks `req.body.aiProvider` before falling back to environment variables.

Required for full functionality:
- `OPENAI_API_KEY` or `GEMINI_API_KEY` — at least one for AI features
- `YOUTUBE_API_KEY` — YouTube video suggestions in Copilot
- `GOOGLE_CSE_KEY` + `GOOGLE_CSE_CX` — FAQ question discovery
- `SENDGRID_API_KEY` — Email marketing feature

### CSABF scoring framework

The rule engine (`server/services/ruleEngine.js`) implements CloudFuze's content scoring standard. Key constants: max 2500 words, 1 H1, 4–10 H2s (ideal 6–8), min 2 bullet lists, min 1 numbered list, max 5 lines per paragraph, keyword density 1.0–1.5%, 8–12 platform mentions. Core required H2s: FAQs section, Conclusion. "How CloudFuze Helps" can be standalone or embedded in the Conclusion.

### History & Snapshots

- `copilot_sessions` table tracks writer sessions with topic, framework, keywords, current_content
- `chat_messages` table auto-saves every user/assistant message per session
- `content_snapshots` table auto-saves when agent generates/edits articles or frameworks — enables version history
- Sessions auto-created when topic is set or first message sent
- Editor content auto-saved to session every 2s (debounced)
- HistoryPanel shows sessions → click to see versions → click version to restore specific content

### Preview & Code Export

- `CodePreview.jsx` exports `openCodePreview(html, topic)` — opens a popup window (not in-page modal)
- `processHTML()` wraps lists in `.cf-list-box` (blue gradient), Key Takeaways in `.cf-highlight-box`, numbered H3 subsections in `.cf-subsection-box`
- `stripSourceBlocks()` removes all source metadata, emoji badges, semantic keywords sections from preview
- Uses CloudFuze brand: Poppins font, `#0129ac` blue, `#092933` dark navy, `#424242` body text

---

## GEO Content Optimization Rules

These rules MUST be followed when generating, reviewing, or editing any content. The primary goal of this tool is to maximize CloudFuze's visibility in AI search engines (ChatGPT, Google AI Overviews, Perplexity, Gemini, Bing Copilot).

### AI Citability — How to Get Quoted by AI Engines

1. **Answer blocks must be 50-200 words, self-contained** — AI engines extract blocks out of context. Each H2 section must be independently quotable. The citation sweet spot is 134-167 words.
2. **Use definition patterns** — "[Term] is..." increases AI citations by 2.1x. Start sections with clear definitions.
3. **Include specific statistics** — Data boosts AI citations by 40%. Use exact numbers: "99.9% data fidelity", "migrated 20M+ files", "70% faster than manual".
4. **Inverted pyramid** — Answer the question FIRST in each section, then explain. Never bury the answer.
5. **Name subjects explicitly** — NEVER use "it", "this tool", "they", "the platform". AI engines quote blocks out of context — dangling pronouns make citations useless. Always write "CloudFuze", "SharePoint", "the migration process".
6. **Question-format H2/H3 headings** — Must match how people ask AI engines. "What Is the Fastest Way to Migrate Google Drive to SharePoint?" not "Migration Methods Overview".
7. **Lists and tables are directly extracted** — Google AIO and Perplexity extract `<ul>`, `<ol>`, and `<table>` elements directly into responses. Every article needs at least 2 bullet lists, 1 numbered list, and ideally 1 comparison table.

### Platform-Specific Optimization

| Platform | What It Needs |
|----------|---------------|
| **Google AI Overviews** | Top-10 organic ranking, clean HTML structure, question-format headings, FAQ schema, HTML tables, lists |
| **ChatGPT** | Bing index, entity-rich content, 2000+ words, Wikipedia-style authority, clear definitions |
| **Perplexity** | Original research/data, community validation (Reddit/Quora threads), recent dates, direct answers first |
| **Gemini** | Knowledge Graph alignment, YouTube embeds, Schema.org markup, clear entity relationships |
| **Bing Copilot** | Fast page load (<2s), LinkedIn/GitHub signals, IndexNow, structured data |

### Content Anti-Patterns — NEVER Do These

- Generic AI filler: "In today's rapidly evolving landscape...", "In the ever-changing world of..."
- Hedging language: "might", "could potentially", "it seems like", "arguably"
- Marketing fluff: "revolutionary", "game-changing", "cutting-edge", "seamless"
- Buried answers (answer must come FIRST, not after 3 paragraphs of context)
- Dense paragraphs >5 lines without breaking into lists
- Dangling pronouns ("it offers...", "this helps...") — always name the subject
- Repeating the same point in different words (padding)

---

## CloudFuze Brand & ICP Rules

### Products

- **CloudFuze Migrate**: Enterprise cloud-to-cloud migration (30+ platforms, bulk transfer, permission/metadata preservation, delta migration, 99.9% data fidelity)
- **CloudFuze Manage**: SaaS & AI app management platform (user lifecycle, shadow IT discovery, license optimization, compliance monitoring)

### ICP Scoring (0-100) — Content Must Target These Buyers

| Attribute | Core ICP 80-100 | Strong ICP 65-79 |
|-----------|----------------|------------------|
| Company Size (0-35) | 500+ employees | 250-500 employees |
| Geography (0-35) | United States | Canada, Australia, UK |
| Industry (0-10) | IT Services, Software, Consulting | Financial, Healthcare, Education |
| Technology (0-10) | Microsoft 365, Google Workspace | Dropbox, Box, Egnyte |
| Buyer Persona (0-10) | CIO, IT Director, CTO | IT Manager, IT Admin |

Every article should target Core ICP (80-100) in the H1 and at least 2-3 body sections. Include enterprise scale language, compliance terms (SOC 2, HIPAA, GDPR), and buyer persona signals.

### Competitor Policy — CRITICAL

**NEVER mention** by name: MultCloud, Mover.io, Zapier, Insync, Movebot, CloudHQ, odrive, or any competitor migration/SaaS tool. Mentioning cloud platforms (Google Drive, Dropbox, OneDrive, SharePoint, Box) is fine — these are source/destination platforms, not competitors.

### CloudFuze Mention Rules

- 8-12 mentions naturally across the article
- ONE dedicated H2 section: "How CloudFuze Helps" or "How CloudFuze Simplifies [Topic]"
- Use specific features, not vague claims: "CloudFuze Migrate supports bulk migration for 10,000+ users with full permission and metadata preservation" not "CloudFuze makes migration easy"
- For migration articles → CloudFuze Migrate. For SaaS/governance articles → CloudFuze Manage.

### Blog Structure Standard (from 40 published CloudFuze articles)

1. **H1** — Question-based or action-oriented, primary keyword front-loaded, enterprise-targeted
2. **Introduction** — 2-3 short paragraphs, hook with a question or stat, NO generic definitions
3. **Key Takeaways** — 3-5 bullets summarizing the article (present in 95% of articles)
4. **Body H2s** — 4-8 sections, derived from real FAQ + fanout questions, mix of question (43%) and statement headings
5. **How CloudFuze Helps** — Dedicated H2 in second half with specific product features
6. **FAQs** — H3 question headings with concise 50-80 word answers (present in 97.5%)
7. **Soft CTA** — NOT a separate "Conclusion" H2. Article ends with CloudFuze section + FAQs + a closing CTA paragraph

Average: ~970 words (range 500-1600), 7.2 H2s, 6.3 H3s per article.

### Writer Profiles

| Writer | Focus | Style |
|--------|-------|-------|
| Pankaj | Migrate + Manage | C-suite strategic, insight-driven, concise (~800 words) |
| Aayushi | Migrate, Email, Tenant | Detailed, structured, education-first (~1200 words) |
| Rashmi | Manage, SaaS, AI governance | Second-person POV, earliest CloudFuze mention (~1090 words) |
| Bhavani | Migrate | Action-oriented, challenge→solution (~785 words) |

Full profiles: `server/config/writerBios.js` and `server/config/blogPatterns.js`

---

## Agent Tool Reference

### Tool Inventory (agentEngine.js)

| Tool | Purpose |
|------|---------|
| `analyze_content_structure` | Full CSABF + ICP + FAQ + fanout + readability + formatting + grammar audit |
| `generate_article` | Complete article generation with all context |
| `edit_article` | Targeted section edits on existing content |
| `generate_framework` | Article outline with inline visual suggestions |
| `generate_faqs` | FAQ + fanout pipeline, ranked questions |
| `track_keyword_usage` | Keyword density and gap analysis |
| `search_community_threads` | Reddit + Quora thread discovery |
| `suggest_youtube_videos` | YouTube video search |
| `browse_published_articles` | Content calendar lookup |
| `search_past_articles` | SQLite article memory search |
| `search_g2_testimonials` | G2 review search |
| `check_ai_detection` | Copyleaks AI score |
| `check_plagiarism` | Plagiarism check |
| `search_sharepoint_docs` | Internal SharePoint/DOC360 search |
| `update_article_requirements` | Save keywords/FAQs/framework state |

### Review Sections (analyze_content_structure)

When reviewing content, the agent presents 7 separate sections:
1. **CSABF Score + Structural Issues** — Score, categories, failing checks
2. **GEO Citability & AI Visibility** — Section-by-section AI citation readiness
3. **E-E-A-T Signals** — Experience, Expertise, Authority, Trust gaps
4. **Readability** — Sentence length, passive voice, complexity, transitions (with metrics)
5. **Grammar & Tone** — Passive sentences rewritten, marketing language flagged
6. **Formatting** — Paragraph lengths, heading structure, list counts, subheading gaps
7. **FAQ Gap Analysis** — Covered vs missing questions from real search data

### Framework Visual Suggestions

Frameworks include inline visual suggestions (3-6 per article) directly under sections:
- `📊 Table` with specific column headers
- `🖼 Image` with description of what to show
- `🎨 Infographic` with concept and data
- `🔀 Diagram` with flow description
- `📈 Stats Highlight` with specific metrics
- `📸 Screenshot` with UI description

FAQs in frameworks come from real research (Google PAA, Reddit, Quora, AI fanout) — NOT AI-generated. Injected as H3 headings into the FAQ section.
