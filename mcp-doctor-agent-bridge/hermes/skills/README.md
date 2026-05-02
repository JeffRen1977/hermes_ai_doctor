# Hermes Skills (M4) — draft pack for doctor-agent

These folders are **draft skills** you can copy into your Hermes skills directory. Exact install paths follow upstream Hermes docs (often under `~/.hermes/skills/` or via the Skills Hub flow).

## Contents

| Skill | Purpose |
|-------|---------|
| `daily-health-report/` | Structured daily / assessment narrative aligned with `reportModels.js` Joi `sections` shape |
| `lab-result-extraction/` | OCR / pasted lab text → strict JSON for downstream Node validation |

## Install (conceptual)

1. Copy each skill folder next to your other Hermes skills (same layout as upstream expects).
2. Reload Hermes or run the skill discovery command documented in [Hermes Skills](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills).
3. Ensure MCP server `doctor-context` is registered so skills can call `health_chat_guard`, `health_context_get`, `report_generate`, etc.

## Alignment with doctor-agent

- Report section keys mirror `ai-doctor-agent_legacy/backend/src/models/reportModels.js` → `sections`: `executiveSummary`, `healthMetrics`, `riskAssessment`, `recommendations`, `actionItems`, `charts`, `attachments`.
- After the model produces JSON, **Node** should still validate with `reportSchema` before `reportRepo.saveReport`.
