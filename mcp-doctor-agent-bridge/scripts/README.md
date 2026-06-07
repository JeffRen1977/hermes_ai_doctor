# M5 scripts — Cron → Node webhook

`ai-doctor-agent_legacy` implements **`POST /internal/cron/daily-report`** (Bearer). Scripts in this directory wake that endpoint from **crontab / launchd / cloud Scheduler**.

**Runbook and troubleshooting:** `../hermes/DAILY_REPORT_RUNBOOK.md`  
**macOS schedule example:** `launchd/io.hermes.doctor-daily-report.plist.example` (copy to `~/Library/LaunchAgents/` and edit paths and secrets)

Do not expose this URL on the public internet without Bearer authentication.

| Script | Purpose |
|--------|---------|
| `trigger-node-daily-report.sh` | `curl` POST; supports `DOCTOR_AGENT_DAILY_DRY_RUN`, `DOCTOR_AGENT_DAILY_USER_EMAILS` (see script comments) |
