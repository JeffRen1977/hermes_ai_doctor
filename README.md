# Hermes AI Doctor

Integration between **[Nous Hermes Agent](https://github.com/NousResearch/hermes-agent)** and the **[ai-doctor-agent](https://github.com/JeffRen1977/ai-doctor-agent)** health backend via an MCP bridge.

## Quick start

| Step | Location |
|------|----------|
| Install MCP bridge | [`mcp-doctor-agent-bridge/README.md`](mcp-doctor-agent-bridge/README.md) |
| Clone doctor-agent backend | Sibling repo: `../ai-doctor-agent` |
| Install on a new computer | [`docs/CAST/CAST_Install_Guide_New_Computer.md`](docs/CAST/CAST_Install_Guide_New_Computer.md) |
| Full setup & run | [`docs/CAST/CAST_Student_Mentor_Guide.md`](docs/CAST/CAST_Student_Mentor_Guide.md) §6 |

## Documentation

All reference docs live under **[`docs/`](docs/README.md)**:

- Design & implementation guides
- M3–M6 runbooks (Telegram, daily report, observability)
- CAST materials
- Hermes skill drafts

## Repository layout

```
hermes/
├── README.md
├── docs/                          # All reference documentation
├── mcp-doctor-agent-bridge/       # Runnable MCP server + scripts
└── ../ai-doctor-agent/            # Doctor-agent backend (sibling repo)
```
