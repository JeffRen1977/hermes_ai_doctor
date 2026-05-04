# M5 scripts — Cron → Node webhook

`ai-doctor-agent_legacy` 已实现 **`POST /internal/cron/daily-report`**（Bearer）。本目录脚本用于从 **crontab / launchd / 云 Scheduler** 唤醒该接口。

**实操清单与排错：** `../hermes/DAILY_REPORT_RUNBOOK.md`  
**macOS 定时示例：** `launchd/io.hermes.doctor-daily-report.plist.example`（复制到 `~/Library/LaunchAgents/` 后编辑路径与密钥）

不要在公网暴露该 URL 且**不配** Bearer。

| Script | Purpose |
|--------|---------|
| `trigger-node-daily-report.sh` | `curl` POST；支持 `DOCTOR_AGENT_DAILY_DRY_RUN`、`DOCTOR_AGENT_DAILY_USER_EMAILS`（见脚本内注释） |
