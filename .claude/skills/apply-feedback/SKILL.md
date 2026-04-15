---
name: apply-feedback
description: Implements negative writer feedback as permanent code changes in the CloudFuze Content Agent codebase. Use this skill whenever a writer gives a thumbs-down with a comment, when learned rules are added to learned-rules.json, when someone says "implement this feedback", "apply the feedback", "a writer complained about X", "fix the agent based on feedback", or when you need to translate a behavioral complaint into a code-level fix. This is NOT just a prompt-layer fix — it patches the actual service files so the behavior is permanent.
---

# Apply Feedback Skill

Writers give thumbs-down feedback via the Copilot chat UI. That feedback gets converted into a `learned rule` and saved to `server/data/learned-rules.json`. This skill takes those rules and implements them as **permanent code-level changes** so the fix is baked in — not just a prompt hint.

## The codebase map

Before editing, understand which file owns which behavior:

| Behavior area | File to edit |
|---|---|
| Agent response tone, length, style, pronoun usage | `server/utils/copilotPrompts.js` — system prompts |
| Article generation logic, structure, CloudFuze mentions | `server/services/agentEngine.js` — `handleGenerateArticle()` |
| Framework generation, visual suggestions, FAQ injection | `server/services/agentEngine.js` — `handleGenerateFramework()` |
| Structural scoring (H2 count, word count, bullet rules) | `server/services/ruleEngine.js` — rule constants |
| FAQ discovery, question quality | `server/services/faqService.js` |
| Fanout query generation | `server/services/fanoutService.js` |
| Tool descriptions (affects when tools trigger) | `server/services/agentEngine.js` — `AGENT_TOOLS_OPENAI` array |
| Review output format (7 sections) | `server/services/agentEngine.js` — `handleAnalyzeContent()` |
| Content calendar, writer profiles | `server/config/writerBios.js`, `server/config/blogPatterns.js` |

## Step-by-step process

### 1. Read the feedback source

Read `server/data/learned-rules.json`. The format is:
```json
[
  {
    "rule": "Always include at least 3 specific CloudFuze features...",
    "source": "Original feedback comment (truncated)",
    "topic": "email migration",
    "createdAt": "2026-04-15T..."
  }
]
```

If the user supplied the feedback text directly in their message, use that instead of reading the file.

### 2. Classify the feedback

Determine the category:

- **Tone/language issue** → edit system prompts in `server/utils/copilotPrompts.js`
- **Article structure** → edit generation logic in `server/services/agentEngine.js`
- **Scoring rule** → edit constants in `server/services/ruleEngine.js`
- **Agent behavior / tool use** → edit agent loop or tool definitions in `server/services/agentEngine.js`
- **Review output** → edit `handleAnalyzeContent()` in `server/services/agentEngine.js`
- **FAQ/Fanout quality** → edit `server/services/faqService.js` or `server/services/fanoutService.js`
- **Writer profile / persona** → edit `server/config/writerBios.js` or `server/config/blogPatterns.js`

A single feedback can touch multiple categories — apply all relevant changes.

### 3. Read the target file(s) before editing

Always read the full relevant section before making any edit. Never guess at line numbers or surrounding context.

### 4. Apply targeted edits

Make the smallest change that fixes the behavior. Examples:

**Feedback: "Stop using vague phrases like 'CloudFuze makes migration easy'"**
→ In `server/utils/copilotPrompts.js`, add to the "NEVER say" list and add to "ALWAYS say" with specific feature examples.

**Feedback: "The framework never includes stats in section guides"**
→ In `handleGenerateFramework()` in `agentEngine.js`, add explicit instruction to include a concrete stat or data point in each section's guidance text.

**Feedback: "The agent writes too many paragraphs without bullet lists"**
→ In `server/utils/copilotPrompts.js`, add a rule: maximum 3 consecutive paragraphs before a bullet list.

**Feedback: "Review sections are way too long — just give me the key issues"**
→ In `handleAnalyzeContent()`, reduce verbosity targets and add a "top 3 critical issues" summary at the start of each section.

### 5. Verify no syntax errors were introduced

After editing a `.js` file, run:
```bash
node --input-type=module --eval "import './server/services/agentEngine.js'" 2>&1 | head -20
```
or for the file you edited directly:
```bash
node -e "import('./server/services/agentEngine.js').catch(e => { console.error(e.message); process.exit(1); })" 2>&1
```

### 6. Report what changed

Tell the user:
- Which file(s) were edited and on what line(s)
- What the old behavior was
- What the new behavior is
- Then suggest running `/test-feedback` to verify the change works end-to-end

## Important constraints

- Do NOT modify `server/data/learned-rules.json` — that is the feedback log, not code
- Do NOT add entire new functions for a one-line fix — edit existing code
- Do NOT add fallback shims or backwards compatibility — just change the behavior directly
- If the feedback is vague (e.g., "be more helpful"), ask the user to clarify before editing
- If the feedback is already covered by an existing prompt rule or code constant, tell the user instead of duplicating it
