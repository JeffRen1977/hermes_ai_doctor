# M5 scripts — Cron → Node webhook (examples)

These scripts are **integration stubs**. Wire `DOCTOR_AGENT_DAILY_WEBHOOK_URL` to a route you implement on `ai-doctor-agent_legacy` (e.g. `POST /internal/cron/daily-report`) that:

1. Authenticates the caller (`Authorization: Bearer …` or mTLS).
2. For each subscribed user: `buildAIContext` → LLM or Hermes MCP → `reportRepo` → WeChat template message.

Do **not** expose this URL on the public internet without auth.

| Script | Purpose |
|--------|---------|
| `trigger-node-daily-report.sh` | `curl` POST from Hermes cron or system crontab |
