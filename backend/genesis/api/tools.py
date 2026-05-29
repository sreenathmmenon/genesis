from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from genesis.tools.implementations import TOOL_CATALOGUE, _TOOL_MAP

router = APIRouter(prefix="/tools", tags=["tools"])


@router.get("/")
async def list_tools() -> list[dict[str, Any]]:
    """List all available tools with descriptions, categories, and parameters."""
    return TOOL_CATALOGUE


@router.get("/names")
async def list_tool_names() -> list[str]:
    """Return just the tool names — used by the frontend tool selector."""
    return list(_TOOL_MAP.keys())


@router.get("/{tool_name}")
async def get_tool(tool_name: str) -> dict[str, Any]:
    """Get details for a specific tool."""
    for t in TOOL_CATALOGUE:
        if t["name"] == tool_name:
            return t
    from fastapi import HTTPException
    raise HTTPException(status_code=404, detail=f"Tool '{tool_name}' not found")
