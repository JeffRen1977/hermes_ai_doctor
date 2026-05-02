# Hermes Agent

FastAPI service: `/v1/health`, `/v1/ready`, `/v1/chat` → OpenAI-compatible LLM (Ollama / vLLM).

## Run locally

```bash
cd hermes-agent
python -m venv .venv && source .venv/bin/activate
pip install -e .
cp ../.env.example ../.env   # edit HERMES_* and INTERNAL_TOKEN
export $(grep -v '^#' ../.env | xargs)
uvicorn app.main:app --host 0.0.0.0 --port 8100 --reload
```

## Docker

From repo root: `docker compose up -d --build`. Pull a Hermes-capable model in Ollama first, e.g. `docker exec -it hermes-llm ollama pull llama3.2` (swap for your Hermes tag).
