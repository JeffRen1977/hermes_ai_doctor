from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class ChatOptions(BaseModel):
    model: Optional[str] = None
    temperature: Optional[float] = Field(default=None, ge=0, le=2)
    maxTokens: Optional[int] = Field(default=None, ge=1, le=8192)
    stream: bool = False


class ChatRequest(BaseModel):
    userId: Optional[str] = None
    message: str = Field(..., min_length=1, max_length=32000)
    language: Literal["zh", "en"] = "zh"
    context: str = ""
    payload: Optional[Dict[str, Any]] = None
    options: Optional[ChatOptions] = None
    traceId: Optional[str] = None


class ChatSuccessResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    success: Literal[True] = True
    message: str
    llm_model: str = Field(serialization_alias="model")
    processingTimeMs: int
    traceId: Optional[str] = None
    citations: List[Dict[str, Any]] = Field(default_factory=list)


class ChatErrorResponse(BaseModel):
    success: Literal[False] = False
    error: str
    code: Optional[str] = None
