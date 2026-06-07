# Documentation index

## Architecture & implementation

| Document | Audience |
|----------|----------|
| [hermes_design_document.md](hermes_design_document.md) | Why we built this; system design |
| [hermes_implementation_guide.md](hermes_implementation_guide.md) | Engineer checklist; Hermes + MCP + backend integration |

## Integration runbooks (`hermes/`)

| Document | Topic |
|----------|--------|
| [M3_system_prompt_template.md](hermes/M3_system_prompt_template.md) | System prompt template for health guard |
| [M3_tool_call_strategy.md](hermes/M3_tool_call_strategy.md) | When to call which MCP tool |
| [Telegram_only_personal_chat_and_daily_report.md](hermes/Telegram_only_personal_chat_and_daily_report.md) | Telegram chat + binding |
| [DAILY_REPORT_RUNBOOK.md](hermes/DAILY_REPORT_RUNBOOK.md) | Daily report → Telegram (step-by-step) |
| [HERMES_CRON_DAILY_REPORT.md](hermes/HERMES_CRON_DAILY_REPORT.md) | Hermes built-in cron registration |
| [M5_cron_and_node_webhook.md](hermes/M5_cron_and_node_webhook.md) | Cron → Node webhook architecture |
| [M6_observability_circuit_mcp_audit.md](hermes/M6_observability_circuit_mcp_audit.md) | Observability & security checklist |
| [doctor-agent-backend.env.example](hermes/doctor-agent-backend.env.example) | Backend env template (copy to `ai-doctor-agent/backend/.env`) |
| [skills/](hermes/skills/) | Hermes skill drafts (daily report, lab extraction) |

## CAST competition (`competition/`)

| Document | Purpose |
|----------|---------|
| [CAST_Research_Paper_hermes_ai_doctor.md](competition/CAST_Research_Paper_hermes_ai_doctor.md) | Research paper draft |
| [CAST_Presentation_Outline_hermes_ai_doctor.md](competition/CAST_Presentation_Outline_hermes_ai_doctor.md) | Slide outline |
| [CAST_Student_Mentor_Guide.md](competition/CAST_Student_Mentor_Guide.md) | Student & mentor guide (includes run instructions) |

## Runnable code

MCP bridge and scripts: [`../mcp-doctor-agent-bridge/`](../mcp-doctor-agent-bridge/README.md)
