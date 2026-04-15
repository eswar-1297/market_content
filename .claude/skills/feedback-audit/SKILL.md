---
name: feedback-audit
description: Audits all learned rules in the CloudFuze Content Agent's feedback system. Use this when someone asks to "audit feedback rules", "review learned rules", "check what rules are active", "are there duplicate rules", "clean up rules", "how many rules do we have", or when the rules list needs pruning before it bloats past 30 entries. Reads learned-rules.json, groups rules by category, flags overlaps and conflicts, and recommends which to merge, keep, or delete.
---

# Feedback Audit Skill

The agent learns permanent rules from writer negative feedback and saves them to `server/data/learned-rules.json`. Over time these can accumulate redundancies, conflicts, and vague entries that dilute the useful ones. This skill audits the full ruleset and gives a clear action plan.

## Step 1 — Load the rules

Read `server/data/learned-rules.json` directly. If the server is running, also cross-check with the live endpoint:

```bash
curl -s http://localhost:3001/api/copilot/learned-rules 2>/dev/null
```

Use whichever gives you more data. Note the total rule count and the date range (oldest vs newest `createdAt`).

## Step 2 — Categorise every rule

Assign each rule to exactly one category. Use these categories (from the codebase's actual behavior areas):

| Category | What it covers |
|---|---|
| **Specificity** | Rules about being concrete, using exact numbers, naming platforms explicitly |
| **Structure** | Rules about article layout, section ordering, H2/H3 usage, paragraph length |
| **CloudFuze mentions** | Rules about how CloudFuze features are described or how often it is named |
| **Tone & language** | Rules about hedging, fluff, passive voice, marketing words |
| **Framework generation** | Rules specifically about how frameworks/outlines are built |
| **Article editing** | Rules about what to do when editing existing content |
| **Pronouns & references** | Rules about avoiding "it", "this tool", dangling references |
| **Topic alignment** | Rules about staying on-topic, not drifting to generic advice |
| **FAQ / Fanout** | Rules about FAQ quality, question specificity, fanout relevance |
| **Other** | Anything that doesn't fit the above |

## Step 3 — Flag problems

For each problem found, note the rule index (0-based, matching the array position in the JSON).

### Overlapping rules
Two rules overlap when they address the same behavior. Example:
- Rule 3: "Always provide specific details and examples relevant to the topic"
- Rule 7: "Never respond with generic advice — always reference specific platforms mentioned in the topic"

These say the same thing. Flag both with a recommended merge text.

### Conflicting rules
Two rules conflict when following one makes it harder to follow the other. Example:
- Rule 2: "Keep responses concise and under 300 words"
- Rule 5: "Always include at least 3 detailed examples with full context"

Flag both and ask the user which one should take precedence.

### Vague rules
A rule is vague if it cannot be acted on without interpretation. Examples of vague:
- "Be more helpful"
- "Provide better responses"
- "Always be specific"

Flag these for either sharpening or deletion.

### Stale rules
A rule is stale if it was created more than 60 days ago AND there are newer rules that supersede it on the same topic.

### Overfull ruleset
If total rule count exceeds 20, flag it — the agent performs worse when the rules section of the system prompt becomes too long. Recommend trimming to the 15 most impactful rules.

## Step 4 — Output the audit report

Use this exact format:

---

## Feedback Rules Audit

**Total rules:** X | **Date range:** YYYY-MM-DD → YYYY-MM-DD | **Health:** 🟢 Good / 🟡 Needs pruning / 🔴 Bloated

### Rules by category

**Specificity (X rules)**
- [0] Rule text here *(status: ok / overlap with #N / vague / stale)*
- [2] Rule text here

**Structure (X rules)**
- [1] Rule text here
...

*(continue for all categories)*

---

### Issues found

#### Overlapping rules
- Rules **#3 and #7** say the same thing (both about generic vs specific advice).
  - Suggested merge: *"Always reference the specific platforms and use cases in the topic — never respond with generic advice. Include exact names (SharePoint, Google Drive, OneDrive) and at least one concrete example."*
  - **Action:** Delete #3, update #7 with the merged text

#### Vague rules
- Rule **#4**: *"Always provide specific details"* — too broad to be actionable.
  - **Action:** Replace with: *"Always include at least one concrete data point (file count, user count, percentage, or platform name) in every response paragraph."*

#### Conflicts
*(if any)*

#### Stale rules
*(if any)*

---

### Recommended actions

| Action | Rule index | Reason |
|---|---|---|
| Delete | #3 | Duplicate of #7 |
| Sharpen | #4 | Too vague |
| Keep | #0, #1, #2, #5, #6, #7 | Clear and actionable |

**If you want me to apply these changes**, say "apply the audit" and I will:
1. Edit `server/data/learned-rules.json` directly with the merged/sharpened/deleted rules
2. Restart the rules by calling `DELETE /api/copilot/learned-rules/:index` for removals, in reverse index order to avoid index shifting
3. Confirm the final clean ruleset

---

## Important constraints

- Never delete rules without showing the user first and getting confirmation — rules represent real writer pain points
- When merging two rules, always show the merged text for approval before writing to disk
- Index order matters when deleting via the API — always delete from highest index to lowest to avoid index shifting
- If the server is not running, do all analysis from the file directly and skip API calls
