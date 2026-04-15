---
name: publish-checklist
description: Runs a pre-publish final gate on CloudFuze blog content before it goes live. Use this when someone asks for a "publish checklist", "pre-publish check", "is this ready to publish", "final review before publishing", "publish gate", "can I publish this", or any variation of checking an article is production-ready. Runs 20+ hard rules across structure, brand compliance, GEO citability, ICP alignment, and content quality. Returns a pass/fail table — article should not publish until all CRITICAL items pass.
---

# Publish Checklist Skill

This is the final gate before any CloudFuze article goes live. It catches structural failures, brand violations, GEO gaps, and content quality issues that would hurt search performance or damage the brand.

## Getting the content

Accept content in any of these forms:
1. **Pasted directly** — use as-is
2. **A URL** — scrape it: `curl -s "<url>" 2>/dev/null`
3. **"Check the editor"** — call `curl -s http://localhost:3001/api/copilot/sessions 2>/dev/null` to find the current session's `current_content`
4. **A file path** — read the file

Then optionally run the CSABF analysis for a machine score:
```bash
curl -s -X POST http://localhost:3001/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"content": "<article_text_here>"}' 2>/dev/null
```
Use the score data if it comes back — fall back to manual checks if server is not running.

## The 20 checklist items

Run every item. Mark each: ✅ PASS, ❌ FAIL, or ⚠️ WARN (borderline).

### CRITICAL — article must NOT publish if any of these fail

**C1 — One H1 only**
Count H1 tags (`<h1>`) or markdown `# ` headings. Exactly 1 required.
- 0 H1s → ❌ FAIL: No title found
- 1 H1 → ✅ PASS
- 2+ H1s → ❌ FAIL: Multiple H1s break SEO

**C2 — H1 is question-based or action-oriented with keyword front-loaded**
Check if H1 starts with the primary keyword or a question word (How, What, Why, Best, Top, Complete).
- "How to Migrate Google Drive to SharePoint" → ✅
- "CloudFuze Migration Guide" → ⚠️ WARN (brand first, keyword buried)
- "About Migration" → ❌ FAIL (vague)

**C3 — Word count 500–2500**
Count total words. 
- < 500 → ❌ FAIL: Too thin for AI indexing
- 500–2499 → ✅ PASS
- 2500–3000 → ⚠️ WARN: Approaching limit, check for padding
- > 3000 → ❌ FAIL: Exceeds CSABF max, likely has padding

**C4 — H2 count is 4–10 (ideal 6–8)**
Count all H2 headings.
- < 4 → ❌ FAIL: Under-structured
- 4–5 → ⚠️ WARN: Acceptable but below ideal
- 6–8 → ✅ PASS (ideal range)
- 9–10 → ✅ PASS
- > 10 → ❌ FAIL: Over-structured, likely fragmented

**C5 — FAQs section present with H3 question headings**
Check for: H2 containing "FAQ" or "Frequently Asked", followed by H3 headings that are questions.
- FAQs H2 + ≥ 3 H3 question headings → ✅ PASS
- FAQs H2 but answers inline (no H3s) → ⚠️ WARN
- No FAQs section → ❌ FAIL (present in 97.5% of CloudFuze articles)

**C6 — "How CloudFuze Helps" section present**
Check for H2 matching: "How CloudFuze Helps", "How CloudFuze Simplifies", "How CloudFuze Migrate", "How CloudFuze Manages", or CloudFuze-heavy content merged into the Conclusion section.
- Dedicated CloudFuze H2 → ✅ PASS
- CloudFuze content in Conclusion section → ✅ PASS (acceptable merge)
- No dedicated CloudFuze positioning anywhere → ❌ FAIL

**C7 — CloudFuze mention count 8–12**
Count exact mentions of "CloudFuze" (case-insensitive) in the full text.
- < 8 → ❌ FAIL: Under-mentioned for brand visibility
- 8–12 → ✅ PASS
- > 12 → ⚠️ WARN: Over-mentioned, may read as spammy

**C8 — No competitor names**
Scan for any of these exact names (case-insensitive): MultCloud, Mover.io, Zapier, Insync, Movebot, CloudHQ, odrive
- None found → ✅ PASS
- Any found → ❌ FAIL: Competitor mention is a hard brand violation. Remove immediately.
- Note: Google Drive, Dropbox, OneDrive, SharePoint, Box are SOURCE/DESTINATION platforms — they are FINE to mention

**C9 — At least 2 bullet lists**
Count `<ul>` tags or markdown bullet blocks (3+ consecutive lines starting with `-` or `*`).
- ≥ 2 → ✅ PASS
- 1 → ⚠️ WARN
- 0 → ❌ FAIL

**C10 — At least 1 numbered list**
Count `<ol>` tags or markdown numbered lists (3+ consecutive lines starting with `1.`, `2.`, etc.)
- ≥ 1 → ✅ PASS
- 0 → ❌ FAIL

### IMPORTANT — should fix before publishing

**I1 — No hedging language**
Scan for: "might", "could potentially", "it seems like", "arguably", "may or may not", "in some cases", "sometimes might"
- None found → ✅ PASS
- 1–2 instances → ⚠️ WARN: Replace with confident assertions
- 3+ instances → ❌ FAIL: Pervasive hedging undermines authority

**I2 — No marketing fluff words**
Scan for: "revolutionary", "game-changing", "cutting-edge", "seamless", "robust", "innovative", "next-generation", "best-in-class", "state-of-the-art", "world-class"
- None found → ✅ PASS
- 1–2 instances → ⚠️ WARN
- 3+ instances → ❌ FAIL

**I3 — No generic AI filler openers**
Check the introduction for: "In today's rapidly evolving", "In the ever-changing world", "In an increasingly", "As technology continues to advance", "In today's fast-paced"
- Not present → ✅ PASS
- Present → ❌ FAIL: Rewrite the opening sentence

**I4 — No dangling pronouns in first paragraph and CloudFuze section**
Check specifically these two sections for "it offers", "it allows", "this tool", "they provide", "the platform does", "it helps migrate"
- None in these key sections → ✅ PASS
- Found → ⚠️ WARN: Replace with explicit subject names

**I5 — Key Takeaways section present**
Check for H2 or bold section matching "Key Takeaways", "Takeaways", "At a Glance" with 3–5 bullet points.
- Present with 3–5 bullets → ✅ PASS
- Missing → ⚠️ WARN (present in 95% of CloudFuze articles — strongly recommended)

**I6 — No paragraph exceeds 5 lines / 120 words**
Sample the 3 longest paragraphs and check their line/word count.
- All paragraphs ≤ 5 lines and ≤ 120 words → ✅ PASS
- 1–2 long paragraphs → ⚠️ WARN: Break them up
- Multiple long paragraphs → ❌ FAIL

**I7 — Introduction is 2–3 short paragraphs with no generic definition**
Check the intro (content before first H2).
- 2–3 paragraphs, opens with a hook (question or stat) → ✅ PASS
- 1 paragraph only → ⚠️ WARN: Too thin
- 4+ paragraphs → ⚠️ WARN: Too long
- Opens with "X is a process of..." as the very first sentence → ❌ FAIL (generic definition opener)

### RECOMMENDED — good to have

**R1 — ICP alignment: enterprise language present**
Scan for enterprise signals: "enterprise", "500+ users", "10,000+ files", "compliance", "SOC 2", "HIPAA", "GDPR", "IT Director", "CIO", "bulk migration", "large-scale", "multi-tenant"
- ≥ 3 enterprise signals → ✅ PASS
- 1–2 signals → ⚠️ WARN: Add more enterprise context
- 0 signals → ❌ FAIL: Content is not targeting Core ICP buyers

**R2 — At least one specific CloudFuze feature with a technical detail**
Check CloudFuze section for specific features: "CloudFuze Migrate supports...", "delta migration", "permission preservation", "metadata preservation", "99.9% data fidelity", "bulk migration for X+ users"
- ≥ 1 specific feature with detail → ✅ PASS
- Only vague claims ("CloudFuze makes migration easy") → ❌ FAIL

**R3 — Soft CTA present (no hard "Buy Now" / "Sign Up")**
Check the end of the article for a closing call-to-action paragraph that invites action without being pushy.
- Soft CTA present ("Contact CloudFuze", "Schedule a demo", "Learn more") → ✅ PASS
- No CTA at all → ⚠️ WARN
- Hard sales CTA ("Buy now", "Start your free trial today!") → ⚠️ WARN: Soften the language

## Output format

ALWAYS use this exact structure. Do not skip any item.

---

## Pre-Publish Checklist

**Article:** [H1 title or first 60 chars]  
**Word count:** X words | **H2 count:** X | **CloudFuze mentions:** X

---

### CRITICAL checks

| # | Check | Status | Notes |
|---|---|---|---|
| C1 | One H1 only | ✅ PASS | — |
| C2 | H1 keyword front-loaded | ⚠️ WARN | Keyword appears at position 4 — move to position 1 |
| C3 | Word count 500–2500 | ✅ PASS | 1,240 words |
| C4 | H2 count 4–10 | ✅ PASS | 7 H2s |
| C5 | FAQs with H3 questions | ❌ FAIL | FAQs section exists but answers are inline — add H3 question headings |
| C6 | CloudFuze section | ✅ PASS | "How CloudFuze Helps" H2 found |
| C7 | CloudFuze mentions 8–12 | ⚠️ WARN | 6 mentions — add 2 more in body sections |
| C8 | No competitor names | ✅ PASS | — |
| C9 | ≥2 bullet lists | ✅ PASS | 3 bullet lists |
| C10 | ≥1 numbered list | ❌ FAIL | No numbered list — add one to the step-by-step section |

**CRITICAL: 2 failures — do not publish until C5 and C10 are fixed.**

---

### IMPORTANT checks

| # | Check | Status | Notes |
|---|---|---|---|
| I1 | No hedging language | ⚠️ WARN | "might be possible" in para 3 — rewrite as definitive |
| I2 | No marketing fluff | ✅ PASS | — |
| I3 | No generic AI opener | ✅ PASS | — |
| I4 | No dangling pronouns (intro + CloudFuze section) | ❌ FAIL | "it allows users to" in CloudFuze section — replace with "CloudFuze Migrate allows users to" |
| I5 | Key Takeaways present | ⚠️ WARN | Missing — add 3–4 bullet takeaways after intro |
| I6 | No paragraph > 5 lines | ✅ PASS | — |
| I7 | Intro: 2–3 paras, hook opener | ✅ PASS | — |

---

### RECOMMENDED checks

| # | Check | Status | Notes |
|---|---|---|---|
| R1 | Enterprise ICP language | ✅ PASS | "500+ users", "compliance", "IT Director" found |
| R2 | Specific CloudFuze feature | ✅ PASS | "delta migration for 10,000+ users" found |
| R3 | Soft CTA present | ✅ PASS | — |

---

### Summary

| Severity | Count |
|---|---|
| ❌ Critical failures | 2 |
| ⚠️ Warnings | 3 |
| ✅ Passing | 15 |

**Verdict: NOT READY TO PUBLISH**

**Fix these before publishing:**
1. **C5** — Add H3 question headings inside the FAQs section
2. **C10** — Add a numbered list (the step-by-step section is the right place)
3. **I4** — Replace "it allows users to" with "CloudFuze Migrate allows users to" in the CloudFuze section

**Then address before next article:**
- C7: Add 2 more CloudFuze mentions in body sections
- I1: Remove hedging in para 3
- I5: Add Key Takeaways after intro

---

## Important constraints

- Run all 20 checks even if early ones fail — give the complete picture
- Never report a PASS if you haven't checked the item — mark ⚠️ WARN with "unable to verify" if content is unclear
- The competitor name check (C8) is a hard stop — flag it loudly, never just warn
- If CSABF API is available, use its score to supplement C3/C4/C9/C10 — but always re-verify manually if numbers seem off
- The verdict must be explicit: "READY TO PUBLISH", "PUBLISH WITH CAUTION (warnings only)", or "NOT READY TO PUBLISH (X critical failures)"
