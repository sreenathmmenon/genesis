from __future__ import annotations

import json
from typing import Any

from langchain_core.tools import tool

from genesis.config import settings
from genesis.utils.logger import get_logger

logger = get_logger("genesis.tools")


# ── web_search ─────────────────────────────────────────────────────────────────

@tool
async def web_search(query: str, max_results: int = 5) -> str:
    """Search the web using DuckDuckGo and return top results."""
    try:
        from duckduckgo_search import AsyncDDGS
        async with AsyncDDGS() as ddgs:
            results = await ddgs.atext(query, max_results=max_results)
        return json.dumps(
            [{"title": r.get("title"), "href": r.get("href"), "body": r.get("body")} for r in results],
            indent=2,
        )
    except Exception as exc:
        logger.warning("web_search failed: %s", exc)
        return json.dumps({"error": str(exc)})


# ── github_api ─────────────────────────────────────────────────────────────────

@tool
async def github_api(endpoint: str, method: str = "GET", body: dict | None = None) -> str:
    """Call the GitHub REST API. endpoint is the path after /repos/{owner}/{repo}/."""
    import httpx

    owner = settings.github_repo_owner
    repo = settings.github_repo_name
    base = f"https://api.github.com/repos/{owner}/{repo}/{endpoint.lstrip('/')}"
    headers = {
        "Authorization": f"Bearer {settings.github_token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.request(method.upper(), base, headers=headers, json=body)
            resp.raise_for_status()
            return json.dumps(resp.json(), indent=2)
    except Exception as exc:
        logger.warning("github_api failed: %s", exc)
        return json.dumps({"error": str(exc)})


# ── file_reader ────────────────────────────────────────────────────────────────

@tool
async def file_reader(path: str) -> str:
    """Read a local file and return its contents (max 50 KB)."""
    import aiofiles

    try:
        async with aiofiles.open(path, mode="r", encoding="utf-8") as fh:
            content = await fh.read(51_200)
        return content
    except Exception as exc:
        logger.warning("file_reader failed for %s: %s", path, exc)
        return json.dumps({"error": str(exc)})


# ── http_request ───────────────────────────────────────────────────────────────

@tool
async def http_request(
    url: str,
    method: str = "GET",
    headers: dict | None = None,
    body: dict | None = None,
) -> str:
    """Make an HTTP request and return the response body (JSON or text)."""
    import httpx

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.request(
                method.upper(), url, headers=headers or {}, json=body
            )
            resp.raise_for_status()
            try:
                return json.dumps(resp.json(), indent=2)
            except Exception:
                return resp.text[:4000]
    except Exception as exc:
        logger.warning("http_request failed: %s", exc)
        return json.dumps({"error": str(exc)})


# ── telegram_send ──────────────────────────────────────────────────────────────

@tool
async def telegram_send(message: str) -> str:
    """Send a Markdown message to the configured Telegram chat."""
    try:
        from genesis.channels.telegram import telegram_bridge
        await telegram_bridge.send_message(message)
        return json.dumps({"ok": True})
    except Exception as exc:
        logger.warning("telegram_send failed: %s", exc)
        return json.dumps({"error": str(exc)})


# ── scheduler ─────────────────────────────────────────────────────────────────

@tool
async def scheduler(workflow_id: str, cron_expr: str) -> str:
    """Schedule a workflow to run on a cron expression (5-field UTC cron)."""
    try:
        from genesis.utils.scheduler import schedule_workflow
        job_id = await schedule_workflow(workflow_id, cron_expr)
        return json.dumps({"ok": True, "job_id": job_id, "cron": cron_expr})
    except Exception as exc:
        logger.warning("scheduler tool failed: %s", exc)
        return json.dumps({"error": str(exc)})


# ── Tool registry ──────────────────────────────────────────────────────────────

_TOOL_MAP: dict[str, Any] = {
    "web_search": web_search,
    "github_api": github_api,
    "file_reader": file_reader,
    "http_request": http_request,
    "telegram_send": telegram_send,
    "scheduler": scheduler,
}


def get_tools_for_agent(tool_names: list[str]) -> list[Any]:
    """Return LangChain tool objects for the given tool names."""
    result = []
    for name in tool_names:
        t = _TOOL_MAP.get(name)
        if t is None:
            logger.warning("Unknown tool requested: %s", name)
        else:
            result.append(t)
    return result
