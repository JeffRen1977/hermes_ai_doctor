from __future__ import annotations

import json
import logging
import time
from typing import Any, Dict, List, Optional
from uuid import uuid4

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.api.schemas import ChatOptions
from app.config import get_settings
from app.llm.client import LLMClient

logger = logging.getLogger(__name__)

router = APIRouter(tags=["v1-analyze"])


class AnalyzeBase(BaseModel):
    userId: Optional[str] = None
    language: str = "zh"
    context: str = ""
    payload: Optional[Dict[str, Any]] = None
    traceId: Optional[str] = None
    options: Optional[ChatOptions] = None


def _opts(opts: Optional[ChatOptions], settings) -> tuple[str, float, int]:
    o = opts or ChatOptions()
    model = o.model or settings.hermes_model
    temp = float(o.temperature if o.temperature is not None else 0.35)
    mx = int(o.maxTokens if o.maxTokens is not None else 2048)
    return model, temp, mx


def _require_context_if_enabled(settings, context: str, payload: Optional[Dict[str, Any]]) -> None:
    if not settings.require_non_empty_context:
        return
    if (context or "").strip():
        return
    if payload:
        return
    raise HTTPException(
        status_code=400,
        detail="context or payload required when REQUIRE_NON_EMPTY_CONTEXT is enabled",
    )


async def _run_analysis(
    *,
    system: str,
    user_content: str,
    trace: str,
    options: Optional[ChatOptions],
) -> Dict[str, Any]:
    settings = get_settings()
    model, temp, mx = _opts(options, settings)
    t0 = time.perf_counter()
    client = LLMClient(settings.hermes_llm_base_url, settings.hermes_model)
    try:
        raw = await client.chat_completions(
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user_content}],
            model=model,
            temperature=temp,
            max_tokens=mx,
        )
        text = (raw.get("choices") or [{}])[0].get("message", {}).get("content") or ""
    except Exception as e:
        logger.exception("analyze LLM error trace=%s", trace)
        return {"success": False, "error": str(e), "code": "llm_error", "traceId": trace}
    ms = int((time.perf_counter() - t0) * 1000)
    return {
        "success": True,
        "analysis": text.strip(),
        "model": raw.get("model") or model,
        "processingTimeMs": ms,
        "traceId": trace,
    }


def _ctx_block(context: str, payload: Optional[Dict[str, Any]]) -> str:
    parts: List[str] = []
    if (context or "").strip():
        parts.append(context.strip())
    if payload:
        parts.append("--- 结构化 PHP (JSON) ---\n" + json.dumps(payload, ensure_ascii=False)[:12000])
    return "\n\n".join(parts) if parts else ""


class AnalyzeRecordsRequest(AnalyzeBase):
    healthData: Dict[str, Any]


@router.post("/v1/analyze/records")
async def analyze_records(req: AnalyzeRecordsRequest) -> Dict[str, Any]:
    settings = get_settings()
    trace = req.traceId or str(uuid4())
    _require_context_if_enabled(settings, req.context, req.payload)

    docs = req.healthData.get("documents") or []
    doc_text = "\n\n---\n\n".join(
        (d.get("text") or d.get("content") or "")[:8000] for d in docs if isinstance(d, dict)
    )
    if not doc_text.strip():
        return {"success": False, "error": "no document text in healthData.documents", "traceId": trace}

    if req.language == "en":
        system = (
            "You are a medical documentation analyst. Not a substitute for a clinician. "
            "Use the user's personal health context when provided."
        )
        user = f"Health documents to analyze:\n{doc_text}\n\nUser/profile JSON:\n{json.dumps(req.healthData, ensure_ascii=False)[:4000]}"
    else:
        system = (
            "你是医疗文档分析助理，不能替代执业医师。请结合用户个人健康上下文（若有）分析下列材料，给出要点、风险与建议，并避免编造上下文中不存在的事实。"
        )
        user = f"待分析健康文档内容：\n{doc_text}\n\n附加 healthData JSON（节选）：\n{json.dumps(req.healthData, ensure_ascii=False)[:4000]}"

    block = _ctx_block(req.context, req.payload)
    if block:
        user = block + "\n\n" + user

    return await _run_analysis(system=system, user_content=user, trace=trace, options=req.options)


class AnalyzeDietRequest(AnalyzeBase):
    foodItems: List[Any] = Field(default_factory=list)
    userHealthData: Dict[str, Any] = Field(default_factory=dict)


@router.post("/v1/analyze/diet")
async def analyze_diet(req: AnalyzeDietRequest) -> Dict[str, Any]:
    settings = get_settings()
    trace = req.traceId or str(uuid4())
    _require_context_if_enabled(settings, req.context, req.payload)

    if req.language == "en":
        system = "You are a dietitian AI assistant. Not medical diagnosis. Use personal context when provided."
        user = f"Food items: {json.dumps(req.foodItems, ensure_ascii=False)}\nUser health: {json.dumps(req.userHealthData, ensure_ascii=False)}"
    else:
        system = "你是营养师与 AI 健康助理，结合用户个人上下文（若有）分析饮食；不能替代面诊。"
        user = f"食物列表: {json.dumps(req.foodItems, ensure_ascii=False)}\n用户健康数据: {json.dumps(req.userHealthData, ensure_ascii=False)}"

    block = _ctx_block(req.context, req.payload)
    if block:
        user = block + "\n\n" + user

    return await _run_analysis(system=system, user_content=user, trace=trace, options=req.options)


class AnalyzeSymptomsRequest(AnalyzeBase):
    symptoms: str = ""
    userProfile: Dict[str, Any] = Field(default_factory=dict)


@router.post("/v1/analyze/symptoms")
async def analyze_symptoms(req: AnalyzeSymptomsRequest) -> Dict[str, Any]:
    settings = get_settings()
    trace = req.traceId or str(uuid4())
    _require_context_if_enabled(settings, req.context, req.payload)

    if req.language == "en":
        system = "You triage symptoms conservatively and recommend professional care when needed."
        user = f"Symptoms: {req.symptoms}\nProfile: {json.dumps(req.userProfile, ensure_ascii=False)}"
    else:
        system = "你是 AI 医生助理，结合用户档案做症状分析；遇重症须建议立即就医；不能替代诊断。"
        user = f"症状描述: {req.symptoms}\n用户信息: {json.dumps(req.userProfile, ensure_ascii=False)}"

    block = _ctx_block(req.context, req.payload)
    if block:
        user = block + "\n\n" + user

    return await _run_analysis(system=system, user_content=user, trace=trace, options=req.options)


class DrugInteractionsRequest(AnalyzeBase):
    medications: List[Any] = Field(default_factory=list)


@router.post("/v1/analyze/drug-interactions")
async def drug_interactions(req: DrugInteractionsRequest) -> Dict[str, Any]:
    settings = get_settings()
    trace = req.traceId or str(uuid4())
    _require_context_if_enabled(settings, req.context, req.payload)

    if req.language == "en":
        system = "You check drug interactions in an educational manner; user must confirm with pharmacist/doctor."
        user = f"Medications: {json.dumps(req.medications, ensure_ascii=False)}"
    else:
        system = "你是用药安全助理，结合用户档案提示相互作用风险；最终以药师/医生为准。"
        user = f"药物列表: {json.dumps(req.medications, ensure_ascii=False)}"

    block = _ctx_block(req.context, req.payload)
    if block:
        user = block + "\n\n" + user

    return await _run_analysis(system=system, user_content=user, trace=trace, options=req.options)
