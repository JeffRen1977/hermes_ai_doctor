---
name: daily-health-report
description: >-
  Draft a daily or periodic health report narrative as JSON sections compatible
  with doctor-agent reportModels Joi schema; requires MCP personal context first.
---

# Daily health report (doctor-agent compatible)

## Preconditions

- MCP tools from `mcp-doctor-agent-bridge` are enabled.
- You have `userId` (sanitized id) and `userEmail` (real email for `report_generate`).

## Workflow

1. Call **`health_chat_guard`** with:

```json
{
  "userId": "<sanitized_user_id>",
  "options": {
    "medications": true,
    "vitalsRecent": true,
    "chatRecent": true,
    "language": "zh"
  }
}
```

2. If `canAnswerHealthQuestion` is **false**: stop and return only `fallbackMessage` to the user.

3. If **true**: use `contextResult.systemPromptContext` as the primary factual basis. Optionally call **`risk_detect_anomalies`** when the user cares about wearable trends (pass `userEmail` + optional `options.timeRange`).

4. Produce **`sections` JSON** exactly in the shape below (all keys present; use empty string / empty array / empty object where unknown).

5. For persistence, the operator (or a follow-up automation step) calls MCP **`report_generate`** with `userEmail` and `reportType` (`health-assessment` or `comprehensive-report`). Do not invent `reportId`; Node assigns it via `createReport`.

## Output schema (sections only)

Return **only** valid JSON (no markdown fences) matching:

```json
{
  "sections": {
    "executiveSummary": "string",
    "healthMetrics": {},
    "riskAssessment": [],
    "recommendations": [],
    "actionItems": [],
    "charts": [],
    "attachments": []
  }
}
```

### Field hints

- `executiveSummary`: 3–6 sentences, zh, no fabricated numbers; cite qualitative trends from context only.
- `healthMetrics`: flat or nested metrics object; omit unknown subkeys rather than hallucinating labs.
- `riskAssessment`: array of `{ "title": "...", "severity": "low|medium|high", "detail": "..." }` (extra keys are stripped by Joi if unknown — prefer only these three).
- `recommendations`: array of short actionable strings.
- `actionItems`: array of `{ "title": "...", "due": "optional ISO or human text", "owner": "user|clinic" }`.
- `charts` / `attachments`: leave empty unless you have structured chart specs or document IDs from Node.

## Safety

- No individualized diagnosis if guard failed.
- Include a one-line disclaimer: Not medical diagnosis; seek in-person care for emergencies.
