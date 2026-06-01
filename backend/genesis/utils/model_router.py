from __future__ import annotations

from langchain_anthropic import ChatAnthropic
from langchain_core.language_models import BaseChatModel
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_openai import ChatOpenAI

from genesis.config import settings
from genesis.utils.logger import get_logger

logger = get_logger("genesis.model_router")

ALLOWED_MODELS = [
    "claude-sonnet-4-6",
    "claude-sonnet-4-5",
    "claude-opus-4-7",
    "claude-haiku-4-5-20251001",
    "gpt-4o",
    "gpt-4o-mini",
    "gemini-1.5-pro",
    "gemini-1.5-flash",
]

# Errors that indicate the API key is exhausted/invalid — not transient
_CREDIT_ERRORS = (
    "credit balance is too low",
    "insufficient_quota",
    "rate_limit_exceeded",
    "billing",
    "quota exceeded",
)


def _is_credit_error(exc: Exception) -> bool:
    msg = str(exc).lower()
    return any(phrase in msg for phrase in _CREDIT_ERRORS)


# Models that reject the `temperature` parameter entirely (it is deprecated for
# them server-side). For these we must omit the field rather than send a default.
_NO_TEMPERATURE_MODELS = {
    "claude-opus-4-7",
}


def get_llm(model_name: str, temperature: float = 0.1, max_tokens: int = 8096) -> BaseChatModel:
    if model_name not in ALLOWED_MODELS:
        raise ValueError(f"Model '{model_name}' is not in the allowed list: {ALLOWED_MODELS}")

    if model_name.startswith("claude-"):
        kwargs: dict = {
            "model": model_name,
            "anthropic_api_key": settings.anthropic_api_key,
            "max_tokens": max_tokens,
        }
        if model_name not in _NO_TEMPERATURE_MODELS:
            kwargs["temperature"] = temperature
        return ChatAnthropic(**kwargs)

    if model_name.startswith(("gpt-", "o1-")):
        return ChatOpenAI(
            model=model_name,
            temperature=temperature,
            api_key=settings.openai_api_key,
            max_tokens=max_tokens,
        )

    if model_name.startswith("gemini-"):
        return ChatGoogleGenerativeAI(
            model=model_name,
            temperature=temperature,
            google_api_key=settings.google_api_key,
            max_output_tokens=max_tokens,
        )

    raise ValueError(f"Unknown model provider for '{model_name}'")


async def ainvoke_with_fallback(
    primary_lm: BaseChatModel,
    messages: list,
    primary_model_name: str,
    max_tokens: int = 8096,
    tools: list | None = None,
    tool_choice: str | None = None,
) -> object:
    """Invoke the primary LLM; on credit/quota error, fall back through
    OpenAI gpt-4o-mini → gemini-1.5-flash, in that order.

    tools: raw tool objects to bind to fallback LLMs (not already-bound lm).
    tool_choice: 'any' or 'auto' — passed to bind_tools for first-round forcing.
    """
    try:
        return await primary_lm.ainvoke(messages)
    except Exception as exc:
        if not _is_credit_error(exc):
            raise

        logger.warning(
            "Primary model %s credit/quota error — trying fallbacks. Error: %s",
            primary_model_name,
            str(exc)[:200],
        )

    def _bind(lm: BaseChatModel) -> BaseChatModel:
        if not tools:
            return lm
        if tool_choice:
            return lm.bind_tools(tools, tool_choice=tool_choice)
        return lm.bind_tools(tools)

    # Fallback 1: OpenAI gpt-4o-mini
    if settings.openai_api_key:
        try:
            fallback_lm = _bind(ChatOpenAI(
                model="gpt-4o-mini",
                temperature=0.1,
                api_key=settings.openai_api_key,
                max_tokens=max_tokens,
            ))
            logger.info("Falling back to gpt-4o-mini for node")
            return await fallback_lm.ainvoke(messages)
        except Exception as exc2:
            if not _is_credit_error(exc2):
                raise
            logger.warning("gpt-4o-mini also failed: %s", str(exc2)[:200])

    # Fallback 2: Google gemini-1.5-flash
    if settings.google_api_key:
        try:
            fallback_lm = _bind(ChatGoogleGenerativeAI(
                model="gemini-1.5-flash",
                temperature=0.1,
                google_api_key=settings.google_api_key,
                max_output_tokens=max_tokens,
            ))
            logger.info("Falling back to gemini-1.5-flash for node")
            return await fallback_lm.ainvoke(messages)
        except Exception as exc3:
            logger.warning("gemini-1.5-flash also failed: %s", str(exc3)[:200])
            raise exc3

    # No fallbacks available — re-raise original
    raise RuntimeError(
        f"Primary model {primary_model_name} exhausted and no fallback API keys configured. "
        "Set OPENAI_API_KEY or GOOGLE_API_KEY in environment."
    )
