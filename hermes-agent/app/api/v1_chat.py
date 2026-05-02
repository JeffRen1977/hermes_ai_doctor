from __future__ import annotations

import logging
import time
from uuid import uuid4

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.api.schemas import ChatRequest, ChatSuccessResponse
from app.config import get_settings
from app.llm.client import LLMClient

logger = logging.getLogger(__name__)

router = APIRouter(tags=["v1"])


def _build_messages(req: ChatRequest, settings) -> list[dict[str, str]]:
    if settings.require_non_empty_context and not (req.context or "").strip():
        if not req.payload:
            raise HTTPException(
                status_code=400,
                detail="context or payload required when REQUIRE_NON_EMPTY_CONTEXT is enabled",
            )

    if req.language == "en":
        system = (
            "You are a cautious AI health assistant. You are not a substitute for a licensed clinician. "
            "Always recommend professional care for emergencies or red-flag symptoms. "
            "Base your answer on the user's personal context when provided."
        )
    else:
        system = (
            "你是一名谨慎的 AI 健康助理，不能替代执业医师面诊或急诊。"
            "遇急症或高危症状须建议立即就医。若提供了用户个人健康上下文，须结合该上下文作答，避免编造用户未提供的信息。"
        )

    if (req.context or "").strip():
        system += "\n\n--- 用户健康上下文 ---\n" + req.context.strip()

    user_block = req.message.strip()
    return [{"role": "system", "content": system}, {"role": "user", "content": user_block}]


@router.post("/v1/chat")
async def v1_chat(req: ChatRequest) -> dict:
    settings = get_settings()
    t0 = time.perf_counter()
    trace = req.traceId or str(uuid4())

    opts = req.options
    model = (opts.model if opts else None) or settings.hermes_model
    temperature = (opts.temperature if opts and opts.temperature is not None else 0.3)
    max_tokens = (opts.maxTokens if opts and opts.maxTokens is not None else 1024)

    if opts and opts.stream:
        raise HTTPException(status_code=501, detail="streaming not implemented in v0.1")

    client = LLMClient(settings.hermes_llm_base_url, settings.hermes_model)

    try:
        messages = _build_messages(req, settings)
        if settings.debug_prompts:
            logger.info("trace=%s messages_lens=%s", trace, [len(m.get("content", "")) for m in messages])
        raw = await client.chat_completions(
            messages=messages,
            model=model,
            temperature=float(temperature),
            max_tokens=int(max_tokens),
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("LLM error trace=%s", trace)
        return {"success": False, "error": str(e), "code": "llm_error", "traceId": trace}

    try:
        choice = raw["choices"][0]
        text = choice["message"]["content"] or ""
    except (KeyError, IndexError, TypeError) as e:
        logger.error("Unexpected LLM response trace=%s raw_keys=%s", trace, raw.keys() if isinstance(raw, dict) else type(raw))
        return {
            "success": False,
            "error": f"invalid LLM response: {e}",
            "code": "bad_response",
            "traceId": trace,
        }

    ms = int((time.perf_counter() - t0) * 1000)
    out = ChatSuccessResponse(
        message=text.strip(),
        llm_model=str(raw.get("model") or model),
        processingTimeMs=ms,
        traceId=trace,
        citations=[],
    )
    return out.model_dump(by_alias=True)


class HealthOut(BaseModel):
    status: str = "ok"


@router.get("/v1/health", response_model=HealthOut)
async def v1_health() -> HealthOut:
    return HealthOut()


@router.get("/v1/ready")
async def v1_ready():
    settings = get_settings()
    client = LLMClient(settings.hermes_llm_base_url, settings.hermes_model)
    ok = await client.ping()
    if not ok:
        return JSONResponse(status_code=503, content={"detail": "llm_unreachable"})
    return {"ready": True}
