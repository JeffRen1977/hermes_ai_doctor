from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    internal_token: str = "dev-change-me"
    hermes_llm_base_url: str = "http://127.0.0.1:11434/v1"
    hermes_model: str = "llama3.2"
    require_non_empty_context: bool = False
    debug_prompts: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
