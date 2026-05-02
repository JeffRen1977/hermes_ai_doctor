from __future__ import annotations

import logging
from typing import Any, List, Optional

import httpx

logger = logging.getLogger(__name__)


class LLMClient:
    def __init__(self, base_url: str, default_model: str, timeout_s: float = 120.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.default_model = default_model
        self.timeout_s = timeout_s

    async def chat_completions(
        self,
        *,
        messages: List[dict],
        model: Optional[str] = None,
        temperature: float = 0.3,
        max_tokens: int = 1024,
    ) -> dict:
        url = f"{self.base_url}/chat/completions"
        body: dict = {
            "model": model or self.default_model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": False,
        }
        async with httpx.AsyncClient(timeout=self.timeout_s) as client:
            r = await client.post(url, json=body)
            r.raise_for_status()
            return r.json()

    async def ping(self) -> bool:
        """Lightweight readiness check (one tiny completion)."""
        try:
            await self.chat_completions(
                messages=[{"role": "user", "content": "ping"}],
                max_tokens=4,
                temperature=0,
            )
            return True
        except Exception as e:
            logger.warning("LLM ping failed: %s", e)
            return False
