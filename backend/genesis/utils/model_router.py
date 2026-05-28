from langchain_anthropic import ChatAnthropic
from langchain_core.language_models import BaseChatModel
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_openai import ChatOpenAI

from genesis.config import settings

ALLOWED_MODELS = [
    "claude-sonnet-4-5",
    "claude-opus-4-7",
    "claude-haiku-4-5-20251001",
    "gpt-4o",
    "gpt-4o-mini",
    "gemini-1.5-pro",
    "gemini-1.5-flash",
]


def get_llm(model_name: str, temperature: float = 0.1) -> BaseChatModel:
    if model_name not in ALLOWED_MODELS:
        raise ValueError(f"Model '{model_name}' is not in the allowed list: {ALLOWED_MODELS}")

    if model_name.startswith("claude-"):
        return ChatAnthropic(
            model=model_name,
            temperature=temperature,
            anthropic_api_key=settings.anthropic_api_key,
            max_tokens=8096,
        )

    if model_name.startswith(("gpt-", "o1-")):
        return ChatOpenAI(
            model=model_name,
            temperature=temperature,
            api_key=settings.openai_api_key,
        )

    if model_name.startswith("gemini-"):
        return ChatGoogleGenerativeAI(
            model=model_name,
            temperature=temperature,
            google_api_key=settings.google_api_key,
        )

    raise ValueError(f"Unknown model provider for '{model_name}'")
