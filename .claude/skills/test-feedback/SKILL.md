---
name: test-feedback
description: Tests that a feedback-driven code change actually works end-to-end in the CloudFuze Content Agent. Use this immediately after /apply-feedback runs, when someone says "test the feedback change", "verify the fix", "does the change work?", or "run feedback tests". It checks: server syntax, API health, rule persistence, and that the new behavior appears in a live agent response.
---

# Test Feedback Skill

After `apply-feedback` patches code, this skill runs a fast end-to-end check to confirm the fix works and nothing regressed.

## Test sequence

Run ALL steps in order. Stop and report failure at the first broken step.

---

### Step 1 — Syntax check (no server needed)

Check the files most likely edited by the last `apply-feedback` run. Run in parallel:

```bash
node --input-type=module --eval "import('./server/services/agentEngine.js').catch(e=>{console.error('agentEngine:',e.message);process.exit(1)})" 2>&1
node --input-type=module --eval "import('./server/utils/copilotPrompts.js').catch(e=>{console.error('copilotPrompts:',e.message);process.exit(1)})" 2>&1
node --input-type=module --eval "import('./server/services/ruleEngine.js').catch(e=>{console.error('ruleEngine:',e.message);process.exit(1)})" 2>&1
node --input-type=module --eval "import('./server/services/feedbackLearningService.js').catch(e=>{console.error('feedbackLearning:',e.message);process.exit(1)})" 2>&1
```

If any import fails → report the error and stop. The syntax is broken.

---

### Step 2 — Check server status

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/copilot/learned-rules 2>&1
```

- **200** → server is running, continue
- **Connection refused** → server is not running. Tell the user: "Server is not running. Start it with `npm run server` then re-run `/test-feedback`." Stop here.
- **Other error** → report it and stop

---

### Step 3 — Verify rules loaded

```bash
curl -s http://localhost:3001/api/copilot/learned-rules 2>&1
```

Parse the response. Check:
- `count` ≥ 0 (endpoint works)
- Rules array is present

Report the rule count. If the rule from the last feedback is present, note it specifically.

---

### Step 4 — Submit a test negative feedback + verify rule creation

Send a distinct test feedback (use a unique comment so you can identify it):

```bash
curl -s -X POST http://localhost:3001/api/copilot/feedback \
  -H "Content-Type: application/json" \
  -d '{
    "traceId": "test-trace-skill-verify-001",
    "score": 0,
    "comment": "TEST_SKILL_VERIFY: Always state the exact file count when describing migration scale, e.g. 10000 files not just many files",
    "userMessage": "Write an intro about email migration",
    "assistantResponse": "CloudFuze handles many files during migration",
    "topic": "email migration test"
  }' 2>&1
```

Expected response: `{"success":true, "ruleGenerated":true}` or similar.

Wait 3 seconds for async rule generation, then check rules increased:
```bash
sleep 3 && curl -s http://localhost:3001/api/copilot/learned-rules 2>&1
```

Confirm rule count went up by 1 (or that the test rule appears in the list).

---

### Step 5 — Live agent smoke test (if API key is available)

Check if an AI key is configured:
```bash
grep -E "^(OPENAI_API_KEY|GEMINI_API_KEY|ANTHROPIC_API_KEY)=.+" server/.env 2>/dev/null | head -1
```

If a key is found, send a minimal chat message that exercises the behavior area the feedback targeted. Use the context from the last `apply-feedback` run to craft the right prompt. For example:

- If feedback was about CloudFuze feature specificity → ask: "What does CloudFuze do for email migration?"
- If feedback was about bullet list frequency → ask: "List the steps to migrate Google Drive to SharePoint"
- If feedback was about article structure → ask: "Generate a framework for OneDrive migration"

```bash
curl -s -X POST http://localhost:3001/api/copilot/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "<test_message_here>",
    "conversationHistory": [],
    "writerContext": {"topic": "test topic"},
    "provider": "openai"
  }' 2>&1 | head -100
```

Read the response and verify the new behavior appears. If it does → pass. If the old behavior is still present → report it with the exact text that shows the problem.

If no AI key is configured, skip this step and note that live chat verification was skipped.

---

### Step 6 — Clean up test rule

Remove the test rule you added in Step 4 so it doesn't pollute the real learned rules:

```bash
# Get current rules and find the test rule index
RULES=$(curl -s http://localhost:3001/api/copilot/learned-rules)
echo "$RULES"
```

Find the index of the rule containing `TEST_SKILL_VERIFY` and delete it:
```bash
curl -s -X DELETE http://localhost:3001/api/copilot/learned-rules/<INDEX> 2>&1
```

---

## Result report format

Always end with a clear summary:

```
## Test Results

| Step | Status | Notes |
|------|--------|-------|
| Syntax check | ✅ PASS / ❌ FAIL | ... |
| Server health | ✅ PASS / ❌ FAIL | ... |
| Rules endpoint | ✅ PASS / ❌ FAIL | X rules loaded |
| Feedback → rule creation | ✅ PASS / ❌ FAIL | ... |
| Live agent smoke test | ✅ PASS / ⏭ SKIPPED / ❌ FAIL | ... |
| Test rule cleanup | ✅ PASS / ❌ FAIL | ... |

**Overall: PASS / FAIL**
```

If anything fails, include the exact error and suggest a fix.
