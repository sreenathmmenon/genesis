from genesis.tools.implementations import get_tools_for_agent

AVAILABLE_TOOLS = [
    "web_search",
    "github_api",
    "file_reader",
    "http_request",
    "telegram_send",
    "scheduler",
]

__all__ = ["AVAILABLE_TOOLS", "get_tools_for_agent"]
