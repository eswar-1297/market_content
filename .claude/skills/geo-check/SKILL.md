---
name: geo-check
description: Runs a section-by-section GEO (Generative Engine Optimization) / AEO (Answer Engine Optimization) citability audit on CloudFuze blog content. Use this when someone asks to "check GEO score", "audit AI citability", "will AI engines quote this", "check for AI visibility", "GEO audit", "AEO check", "how citable is this content", or pastes an article and asks if it will rank in ChatGPT/Perplexity/Google AI Overviews. Scores each H2 section independently against the 7 GEO citability rules and gives specific per-section fixes.
---

# GEO Check Skill

GEO (Generative Engine Optimization) is distinct from CSABF structural scoring. An article can pass CSABF and still be invisible to AI engines if sections aren't independently quotable. This skill audits each H2 section against the 7 rules that determine whether AI engines extract and cite a block of text.

## Getting the content

Accept content in any of these forms:
1. **Pasted directly** in the message — use as-is
2. **A URL** — fetch it: `curl -s "<url>" 2>/dev/null | head -500` then extract body text
3. **"Check the editor"** — call the server: `curl -s http://localhost:3001/api/copilot/sessions | head -50` to find the active session, then read its `current_content`
4. **A file path** — read the file directly

If no content is provided, ask: "Paste the article text, or give me a URL to audit."

## The 7 GEO citability rules

Score each H2 section on ALL 7. Every rule is binary: pass (✅) or fail (❌) for that section.

### Rule 1 — Answer block length (50–200 words, sweet spot 134–167)
Count the words in the section body (excluding the heading). 
- < 50 words → ❌ Too short to be a standalone answer
- 50–133 words → ✅ but note "short" 
- 134–167 words → ✅ **Citation sweet spot**
- 168–200 words → ✅ but note "approaching limit"
- > 200 words → ❌ Too long — AI engines truncate at ~200 words

### Rule 2 — Definition pattern ("[Term] is...")
Check if the section opens with or contains a definition: "[X] is...", "What is [X]? [X] is...", "[X] refers to...", "[X] means..."
- Contains a clear definition pattern → ✅
- No definition, opens with context/story/question → ❌
- Note: definition patterns increase AI citations by 2.1×

### Rule 3 — Specific statistics or data
Check for: percentages, dollar amounts, file counts, user counts, time durations, named data sources.
Examples that pass: "99.9% data fidelity", "migrated 20M+ files", "70% faster than manual migration", "SOC 2 Type II certified"
Examples that fail: "significantly faster", "many users", "a large number of files"
- Contains ≥ 1 specific stat → ✅
- No stats, only vague claims → ❌
- Note: statistics boost AI citations by 40%

### Rule 4 — Inverted pyramid (answer first)
Check if the section answers the question in the FIRST 1–2 sentences, then explains.
- First sentence contains the core answer → ✅
- First 2–3 sentences are context/setup before the answer → ❌
- The question must be answerable by reading only the first sentence

### Rule 5 — No dangling pronouns
Scan the section for: "it offers", "it allows", "this tool", "they provide", "the platform", "it helps", "this solution", "the software"
- All subjects named explicitly (CloudFuze, SharePoint, Google Drive, etc.) → ✅
- Contains ≥ 1 dangling pronoun where the referent is unclear out of context → ❌
- This is critical: AI engines quote blocks out of context — "it" becomes meaningless when extracted

### Rule 6 — Question-format heading
Check the H2/H3 heading text.
- Heading is a question (starts with What, How, Why, When, Which, Can, Does, Is, Are, Should) → ✅
- Heading is a statement but matches how people ask AI engines ("SharePoint Migration Steps" → marginal, "How to Migrate to SharePoint" → ✅) → partial
- Generic/vague heading ("Overview", "More Details", "Introduction") → ❌
- Question-format headings increase the chance the section matches a user's exact query

### Rule 7 — Extractable list or table
Check if the section contains a `<ul>`, `<ol>`, or `<table>`, OR a markdown list (lines starting with `-`, `*`, `1.`)
- Section contains ≥ 1 list or table → ✅
- Section is entirely paragraph prose → ❌
- Lists and tables are extracted directly by Google AIO and Perplexity into their responses

## Scoring and output

### Per-section score
Each section scores out of 7. Citability tier:
- 7/7 → **Highly citable** — AI engines will likely extract this
- 5–6/7 → **Citable** — good chance of extraction
- 3–4/7 → **Marginal** — needs at least 2 fixes
- 0–2/7 → **Not citable** — AI engines will skip this section

### Output format

ALWAYS use this exact structure:

---

## GEO Citability Audit

**Overall citability:** X/7 avg across Y sections | **Sections highly citable:** N | **Sections not citable:** N

---

### Section-by-section scores

#### H2: "[Section heading]" — X/7 *(tier)*

| Rule | Status | Issue |
|---|---|---|
| Answer block length | ✅ 152 words (sweet spot) | — |
| Definition pattern | ❌ | Opens with "When migrating..." — no definition. Fix: Start with "SharePoint migration is the process of..." |
| Specific statistics | ✅ | "99.9% data fidelity" found |
| Inverted pyramid | ❌ | First 3 sentences are context. Move the answer ("CloudFuze Migrate handles this in 3 steps") to sentence 1 |
| No dangling pronouns | ❌ | "it allows users to" — replace with "CloudFuze Migrate allows users to" |
| Question-format heading | ✅ | "How Does SharePoint Migration Work?" |
| Extractable list | ✅ | Numbered list with 5 steps |

**Priority fix:** Add a definition pattern in sentence 1 and remove the dangling pronoun in paragraph 2.

*(repeat for each H2 section)*

---

### Top 3 fixes across the whole article

1. **[Most impactful fix]** — affects X sections
2. **[Second fix]** — affects X sections  
3. **[Third fix]** — affects X sections

---

### Platform-specific notes

| AI Platform | Status | What to fix |
|---|---|---|
| Google AI Overviews | ⚠️ Partial | Need FAQ schema (H3 questions + short answers) |
| ChatGPT | ✅ | Word count 2000+, entity-rich ✓ |
| Perplexity | ❌ | No statistics with sources, no recent date signals |
| Gemini | ⚠️ Partial | No YouTube embed suggestion found |
| Bing Copilot | ✅ | Good structure |

---

## Important constraints

- Parse the article by H2 headings — each H2 is one section
- The introduction (before first H2) counts as a section too — label it "Introduction"
- FAQs section: each H3 question is its own mini-section — score the H3 + its answer paragraph together
- If content is in HTML, strip tags before counting words but preserve structure for list/table detection
- Do NOT conflate this with CSABF scoring — this audit is purely about AI extractability, not structural compliance
