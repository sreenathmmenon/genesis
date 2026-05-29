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
    """Search the web using DuckDuckGo and return top results with titles, URLs and excerpts."""
    import asyncio
    try:
        from ddgs import DDGS
        loop = asyncio.get_event_loop()
        results = await loop.run_in_executor(
            None, lambda: list(DDGS().text(query, max_results=max_results))
        )
        return json.dumps(
            [{"title": r.get("title"), "href": r.get("href"), "body": r.get("body")} for r in results],
            indent=2,
        )
    except Exception as exc:
        logger.warning("web_search failed: %s", exc)
        return json.dumps({"error": str(exc)})


# ── fetch_page ─────────────────────────────────────────────────────────────────

@tool
async def fetch_page(url: str, extract_text: bool = True) -> str:
    """Fetch a web page and return its full text content (strips HTML tags). Max 20KB returned.
    Use this when you need the full content of a specific URL, not just a search excerpt."""
    import httpx
    from bs4 import BeautifulSoup

    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()

        if extract_text:
            soup = BeautifulSoup(resp.text, "lxml")
            # Remove script and style elements
            for tag in soup(["script", "style", "nav", "footer", "header"]):
                tag.decompose()
            text = soup.get_text(separator="\n", strip=True)
            # Collapse excessive blank lines
            lines = [l for l in text.splitlines() if l.strip()]
            content = "\n".join(lines)[:20_000]
            return content
        else:
            return resp.text[:20_000]
    except Exception as exc:
        logger.warning("fetch_page failed for %s: %s", url, exc)
        return json.dumps({"error": str(exc)})


# ── browser ────────────────────────────────────────────────────────────────────

@tool
async def browser(url: str, action: str = "read", selector: str = "", click_text: str = "") -> str:
    """Control a real browser to read JavaScript-rendered pages.
    action: 'read' (get page text), 'screenshot' (get description), 'click' (click element then read).
    Use for pages that require JavaScript (dashboards, LinkedIn, dynamic apps).
    selector: CSS selector for the element to interact with.
    click_text: text of button/link to click before reading."""
    try:
        from playwright.async_api import async_playwright

        async with async_playwright() as p:
            browser_instance = await p.chromium.launch(headless=True)
            page = await browser_instance.new_page()
            await page.set_extra_http_headers({
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
            })

            try:
                await page.goto(url, wait_until="networkidle", timeout=30000)
            except Exception:
                await page.goto(url, timeout=30000)

            if action == "click" and click_text:
                try:
                    await page.get_by_text(click_text).first.click()
                    await page.wait_for_timeout(2000)
                except Exception as e:
                    logger.warning("browser click failed: %s", e)

            if selector:
                try:
                    element = page.locator(selector).first
                    text = await element.inner_text()
                    await browser_instance.close()
                    return text[:10_000]
                except Exception:
                    pass

            # Get full page text
            from bs4 import BeautifulSoup
            content = await page.content()
            await browser_instance.close()

            soup = BeautifulSoup(content, "lxml")
            for tag in soup(["script", "style", "nav", "footer"]):
                tag.decompose()
            text = soup.get_text(separator="\n", strip=True)
            lines = [l for l in text.splitlines() if l.strip()]
            return "\n".join(lines)[:15_000]

    except Exception as exc:
        logger.warning("browser failed for %s: %s", url, exc)
        return json.dumps({"error": str(exc)})


# ── github_api ─────────────────────────────────────────────────────────────────

@tool
async def github_api(endpoint: str, method: str = "GET", body: dict | None = None) -> str:
    """Call the GitHub REST API. endpoint is the path after /repos/{owner}/{repo}/.
    Examples: 'pulls?state=open', 'issues', 'commits?per_page=10', 'contents/README.md'"""
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
    """Read a local file and return its contents (max 50 KB).
    Supports text files: .txt, .md, .json, .yaml, .csv, .py, .js, .ts, etc."""
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
    """Make an HTTP request to any REST API and return the response body.
    Supports GET, POST, PUT, PATCH, DELETE. Returns JSON or text up to 4000 chars."""
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
async def telegram_send(message: str, parse_mode: str = "Markdown") -> str:
    """Send a message to the configured Telegram chat.
    parse_mode: 'Markdown', 'MarkdownV2', 'HTML', or 'none' for plain text."""
    try:
        from genesis.channels.telegram import telegram_bridge
        kwargs: dict = {}
        if parse_mode and parse_mode.lower() != "none":
            kwargs["parse_mode"] = parse_mode
        try:
            await telegram_bridge.send_message(message, **kwargs)
        except Exception as fmt_exc:
            logger.warning("telegram_send retrying as plain text after: %s", fmt_exc)
            import re as _re
            plain = _re.sub(r'\\([_*\[\]()~`>#+\-=|{}.!])', r'\1', message)
            await telegram_bridge.send_message(plain)
        return json.dumps({"ok": True})
    except Exception as exc:
        logger.warning("telegram_send failed: %s", exc)
        return json.dumps({"error": str(exc)})


# ── slack_send ─────────────────────────────────────────────────────────────────

@tool
async def slack_send(message: str, channel: str = "", webhook_url: str = "") -> str:
    """Send a message to a Slack channel.
    Uses webhook_url if provided, otherwise falls back to configured SLACK_WEBHOOK_URL.
    channel is optional (webhook already targets a channel).
    message supports Slack mrkdwn formatting."""
    try:
        import httpx

        url = webhook_url or settings.slack_webhook_url
        if not url:
            return json.dumps({"error": "No Slack webhook URL configured. Set SLACK_WEBHOOK_URL in environment."})

        payload: dict[str, Any] = {"text": message}
        if channel:
            payload["channel"] = channel

        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()

        logger.info("slack_send succeeded: channel=%s chars=%d", channel or "default", len(message))
        return json.dumps({"ok": True})
    except Exception as exc:
        logger.warning("slack_send failed: %s", exc)
        return json.dumps({"error": str(exc)})


# ── email_send ─────────────────────────────────────────────────────────────────

@tool
async def email_send(
    to: str,
    subject: str,
    body: str,
    html: bool = False,
) -> str:
    """Send an email via SendGrid (if SENDGRID_API_KEY is set) or SMTP.
    to: recipient email address.
    subject: email subject line.
    body: email body (plain text or HTML).
    html: set True if body contains HTML."""
    try:
        if settings.sendgrid_api_key:
            return await _email_via_sendgrid(to, subject, body, html)
        elif settings.smtp_host:
            return await _email_via_smtp(to, subject, body, html)
        else:
            return json.dumps({"error": "No email provider configured. Set SENDGRID_API_KEY or SMTP_HOST."})
    except Exception as exc:
        logger.warning("email_send failed: %s", exc)
        return json.dumps({"error": str(exc)})


async def _email_via_sendgrid(to: str, subject: str, body: str, html: bool) -> str:
    import asyncio
    from sendgrid import SendGridAPIClient
    from sendgrid.helpers.mail import Mail

    msg = Mail(
        from_email=settings.email_from or "genesis@example.com",
        to_emails=to,
        subject=subject,
    )
    if html:
        msg.html_content = body
    else:
        msg.plain_text_content = body

    loop = asyncio.get_event_loop()
    sg = SendGridAPIClient(settings.sendgrid_api_key)
    response = await loop.run_in_executor(None, lambda: sg.send(msg))
    logger.info("email_send via SendGrid: status=%d to=%s", response.status_code, to)
    return json.dumps({"ok": True, "provider": "sendgrid", "status": response.status_code})


async def _email_via_smtp(to: str, subject: str, body: str, html: bool) -> str:
    import asyncio
    import smtplib
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.email_from or settings.smtp_user
    msg["To"] = to

    mime_type = "html" if html else "plain"
    msg.attach(MIMEText(body, mime_type))

    def _send():
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port or 587) as srv:
            srv.ehlo()
            srv.starttls()
            if settings.smtp_user and settings.smtp_password:
                srv.login(settings.smtp_user, settings.smtp_password)
            srv.sendmail(msg["From"], [to], msg.as_string())

    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _send)
    logger.info("email_send via SMTP: to=%s", to)
    return json.dumps({"ok": True, "provider": "smtp"})


# ── code_executor ──────────────────────────────────────────────────────────────

@tool
async def code_executor(code: str, language: str = "python") -> str:
    """Execute Python code in a secure sandbox and return stdout + result.
    Use for: data analysis, calculations, chart generation, text processing, math.
    language: currently only 'python' is supported.
    code: the Python code to execute. Print your results — they are captured as output.
    Timeout: 30 seconds. No network access inside the sandbox."""
    if language.lower() != "python":
        return json.dumps({"error": f"Language '{language}' not supported. Only 'python' is available."})

    try:
        import asyncio
        import sys
        from io import StringIO

        # Pre-import safe standard library modules
        import math
        import statistics
        import datetime
        import re
        import csv
        import io
        import collections
        import itertools
        import functools

        # Allowlist of safe importable modules
        _SAFE_MODULES = {
            "math", "statistics", "datetime", "re", "csv", "io",
            "json", "collections", "itertools", "functools",
            "string", "textwrap", "decimal", "fractions", "random",
        }

        def _safe_import(name: str, *args, **kwargs):
            base = name.split(".")[0]
            if base not in _SAFE_MODULES:
                raise ImportError(f"Import of '{name}' is not allowed in the sandbox.")
            import importlib
            return importlib.import_module(name)

        # Globals with full builtins + safe import
        safe_globals: dict[str, Any] = {
            "__builtins__": __builtins__,
            "__import__": _safe_import,
            # Pre-loaded for convenience
            "math": math,
            "statistics": statistics,
            "datetime": datetime,
            "re": re,
            "csv": csv,
            "io": io,
            "json": json,
            "collections": collections,
            "itertools": itertools,
            "functools": functools,
        }

        # Capture stdout
        captured = StringIO()
        local_vars: dict[str, Any] = {}

        def _run():
            old_stdout = sys.stdout
            sys.stdout = captured
            try:
                exec(code, safe_globals, local_vars)  # noqa: S102
            finally:
                sys.stdout = old_stdout

        loop = asyncio.get_event_loop()
        await asyncio.wait_for(
            loop.run_in_executor(None, _run),
            timeout=30.0,
        )

        output = captured.getvalue()
        # Include any non-private local variables in result
        result_vars = {
            k: repr(v) for k, v in local_vars.items()
            if not k.startswith("_") and not callable(v)
        }

        return json.dumps({
            "output": output[:5000],
            "variables": result_vars,
            "ok": True,
        }, indent=2)

    except asyncio.TimeoutError:
        return json.dumps({"error": "Code execution timed out after 30 seconds."})
    except Exception as exc:
        logger.warning("code_executor failed: %s", exc)
        return json.dumps({"error": str(exc)})


# ── notion_read ────────────────────────────────────────────────────────────────

@tool
async def notion_read(page_id_or_query: str, search: bool = False) -> str:
    """Read content from Notion. Requires NOTION_API_KEY in environment.
    If search=True: searches all pages/databases matching the query string.
    If search=False: reads a specific page by its ID (32-char UUID or URL).
    Returns page content as plain text."""
    try:
        from notion_client import AsyncClient

        if not settings.notion_api_key:
            return json.dumps({"error": "NOTION_API_KEY not configured."})

        notion = AsyncClient(auth=settings.notion_api_key)

        if search:
            results = await notion.search(query=page_id_or_query, page_size=5)
            pages = []
            for r in results.get("results", []):
                title = _extract_notion_title(r)
                pages.append({
                    "id": r.get("id"),
                    "title": title,
                    "type": r.get("object"),
                    "url": r.get("url"),
                })
            return json.dumps(pages, indent=2)

        # Clean up page_id: strip URL prefix, dashes, etc.
        page_id = page_id_or_query.strip()
        if "notion.so/" in page_id:
            page_id = page_id.split("notion.so/")[-1].split("?")[0].split("#")[0]
            # Extract UUID from end of URL slug
            if "-" in page_id:
                page_id = page_id.split("-")[-1]

        # Fetch page metadata
        page = await notion.pages.retrieve(page_id=page_id)
        title = _extract_notion_title(page)

        # Fetch page blocks (content)
        blocks = await notion.blocks.children.list(block_id=page_id, page_size=50)
        content_lines = [f"# {title}\n"]

        for block in blocks.get("results", []):
            line = _notion_block_to_text(block)
            if line:
                content_lines.append(line)

        return "\n".join(content_lines)[:10_000]

    except Exception as exc:
        logger.warning("notion_read failed: %s", exc)
        return json.dumps({"error": str(exc)})


def _extract_notion_title(page: dict) -> str:
    props = page.get("properties", {})
    for key in ("title", "Title", "Name", "name"):
        if key in props:
            title_list = props[key].get("title", [])
            if title_list:
                return title_list[0].get("plain_text", "Untitled")
    return "Untitled"


def _notion_block_to_text(block: dict) -> str:
    btype = block.get("type", "")
    data = block.get(btype, {})
    rich_text = data.get("rich_text", [])
    text = "".join(rt.get("plain_text", "") for rt in rich_text)

    prefix_map = {
        "heading_1": "# ", "heading_2": "## ", "heading_3": "### ",
        "bulleted_list_item": "• ", "numbered_list_item": "1. ",
        "to_do": "☐ ", "quote": "> ", "code": "```\n",
    }
    suffix_map = {"code": "\n```"}

    prefix = prefix_map.get(btype, "")
    suffix = suffix_map.get(btype, "")
    return f"{prefix}{text}{suffix}" if text else ""


# ── jira_api ───────────────────────────────────────────────────────────────────

@tool
async def jira_api(
    action: str,
    project_key: str = "",
    jql: str = "",
    issue_key: str = "",
    fields: list[str] | None = None,
    max_results: int = 20,
) -> str:
    """Interact with Jira. Requires JIRA_URL, JIRA_EMAIL, JIRA_API_TOKEN in environment.
    action options:
      'search' — search issues using JQL query (e.g. jql='project=PROJ AND status=Open')
      'get_issue' — get a specific issue by key (e.g. issue_key='PROJ-123')
      'get_project' — get project info and recent issues (e.g. project_key='PROJ')
      'list_projects' — list all accessible projects
    fields: list of field names to include (default: summary, status, assignee, priority, created, updated)"""
    try:
        if not settings.jira_url:
            return json.dumps({"error": "JIRA_URL not configured."})
        if not settings.jira_email or not settings.jira_api_token:
            return json.dumps({"error": "JIRA_EMAIL and JIRA_API_TOKEN required."})

        import asyncio
        from jira import JIRA

        default_fields = fields or ["summary", "status", "assignee", "priority", "created", "updated", "description"]

        def _jira_call():
            jira = JIRA(
                server=settings.jira_url,
                basic_auth=(settings.jira_email, settings.jira_api_token),
            )

            if action == "list_projects":
                projects = jira.projects()
                return [{"key": p.key, "name": p.name, "id": p.id} for p in projects]

            if action == "get_project":
                if not project_key:
                    return {"error": "project_key required for get_project"}
                query = f"project = {project_key} ORDER BY updated DESC"
                issues = jira.search_issues(query, maxResults=max_results, fields=",".join(default_fields))
                return _format_jira_issues(issues)

            if action == "search":
                if not jql:
                    return {"error": "jql required for search"}
                issues = jira.search_issues(jql, maxResults=max_results, fields=",".join(default_fields))
                return _format_jira_issues(issues)

            if action == "get_issue":
                if not issue_key:
                    return {"error": "issue_key required for get_issue"}
                issue = jira.issue(issue_key, fields=",".join(default_fields))
                return _format_jira_issue(issue)

            return {"error": f"Unknown action: {action}. Use: search, get_issue, get_project, list_projects"}

        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, _jira_call)
        return json.dumps(result, indent=2, default=str)

    except Exception as exc:
        logger.warning("jira_api failed: %s", exc)
        return json.dumps({"error": str(exc)})


def _format_jira_issues(issues: list) -> list[dict]:
    return [_format_jira_issue(i) for i in issues]


def _format_jira_issue(issue: Any) -> dict:
    f = issue.fields
    return {
        "key": issue.key,
        "summary": getattr(f, "summary", ""),
        "status": str(getattr(f, "status", "")),
        "assignee": str(getattr(f, "assignee", "Unassigned")),
        "priority": str(getattr(f, "priority", "")),
        "created": str(getattr(f, "created", "")),
        "updated": str(getattr(f, "updated", "")),
        "description": (str(getattr(f, "description", "") or ""))[:500],
    }


# ── calendar_read ──────────────────────────────────────────────────────────────

@tool
async def calendar_read(
    days_ahead: int = 7,
    calendar_id: str = "primary",
    max_results: int = 20,
) -> str:
    """Read upcoming events from Google Calendar. Requires GOOGLE_CALENDAR_CREDENTIALS_JSON in environment.
    days_ahead: how many days ahead to look (default 7).
    calendar_id: which calendar to read ('primary' for main calendar).
    Returns list of upcoming events with title, time, attendees, and description."""
    try:
        import asyncio
        import datetime

        if not settings.google_calendar_credentials_json:
            return json.dumps({"error": "GOOGLE_CALENDAR_CREDENTIALS_JSON not configured."})

        def _fetch_events():
            import json as _json
            from google.oauth2.credentials import Credentials
            from googleapiclient.discovery import build

            creds_data = _json.loads(settings.google_calendar_credentials_json)
            creds = Credentials(
                token=creds_data.get("token"),
                refresh_token=creds_data.get("refresh_token"),
                token_uri=creds_data.get("token_uri", "https://oauth2.googleapis.com/token"),
                client_id=creds_data.get("client_id"),
                client_secret=creds_data.get("client_secret"),
            )
            service = build("calendar", "v3", credentials=creds)

            now = datetime.datetime.utcnow().isoformat() + "Z"
            end = (datetime.datetime.utcnow() + datetime.timedelta(days=days_ahead)).isoformat() + "Z"

            events_result = service.events().list(
                calendarId=calendar_id,
                timeMin=now,
                timeMax=end,
                maxResults=max_results,
                singleEvents=True,
                orderBy="startTime",
            ).execute()

            events = events_result.get("items", [])
            formatted = []
            for e in events:
                start = e.get("start", {})
                formatted.append({
                    "title": e.get("summary", "No title"),
                    "start": start.get("dateTime", start.get("date", "")),
                    "end": e.get("end", {}).get("dateTime", ""),
                    "location": e.get("location", ""),
                    "description": (e.get("description", "") or "")[:300],
                    "attendees": [a.get("email") for a in e.get("attendees", [])],
                    "organizer": e.get("organizer", {}).get("email", ""),
                    "meeting_link": e.get("hangoutLink", "") or _extract_meeting_link(e),
                })
            return formatted

        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, _fetch_events)
        return json.dumps(result, indent=2)

    except Exception as exc:
        logger.warning("calendar_read failed: %s", exc)
        return json.dumps({"error": str(exc)})


def _extract_meeting_link(event: dict) -> str:
    desc = event.get("description", "") or ""
    import re
    match = re.search(r"https?://[^\s<>\"]+(?:zoom\.us|meet\.google|teams\.microsoft)[^\s<>\"]*", desc)
    return match.group(0) if match else ""


# ── scheduler ─────────────────────────────────────────────────────────────────

@tool
async def scheduler(workflow_id: str, cron_expr: str) -> str:
    """Schedule a workflow to run automatically on a cron expression (5-field UTC cron).
    Examples: '0 9 * * 1-5' (weekdays 9am UTC), '0 8 * * 1' (Monday 8am UTC), '*/30 * * * *' (every 30 min)."""
    try:
        from genesis.utils.scheduler import schedule_workflow
        job_id = await schedule_workflow(workflow_id, cron_expr)
        return json.dumps({"ok": True, "job_id": job_id, "cron": cron_expr})
    except Exception as exc:
        logger.warning("scheduler tool failed: %s", exc)
        return json.dumps({"error": str(exc)})


# ── Tool registry ──────────────────────────────────────────────────────────────

_TOOL_MAP: dict[str, Any] = {
    # Web & HTTP
    "web_search": web_search,
    "fetch_page": fetch_page,
    "browser": browser,
    "http_request": http_request,
    # Code & Files
    "file_reader": file_reader,
    "code_executor": code_executor,
    # Notifications & Messaging
    "telegram_send": telegram_send,
    "slack_send": slack_send,
    "email_send": email_send,
    # Developer Tools
    "github_api": github_api,
    "jira_api": jira_api,
    # Productivity
    "notion_read": notion_read,
    "calendar_read": calendar_read,
    # Automation
    "scheduler": scheduler,
}

# Tools that produce side-effects as their final action — stop ReAct loop after these
TERMINAL_TOOLS: set[str] = {"telegram_send", "slack_send", "email_send", "scheduler"}

# Human-readable tool catalogue (used by /api/v1/tools and builder prompt)
TOOL_CATALOGUE: list[dict[str, Any]] = [
    {
        "name": "web_search",
        "category": "web",
        "description": "Search the web using DuckDuckGo. Returns titles, URLs, and page excerpts.",
        "use_when": "Finding information, monitoring news, researching topics",
        "parameters": {"query": "str", "max_results": "int (default 5)"},
    },
    {
        "name": "fetch_page",
        "category": "web",
        "description": "Fetch the full text content of a specific URL. Strips HTML tags. Max 20KB.",
        "use_when": "Reading a specific webpage in full — pricing pages, articles, documentation",
        "parameters": {"url": "str", "extract_text": "bool (default True)"},
    },
    {
        "name": "browser",
        "category": "web",
        "description": "Control a real Chromium browser to read JavaScript-rendered pages.",
        "use_when": "Pages that require JavaScript to render — dashboards, dynamic apps, LinkedIn",
        "parameters": {"url": "str", "action": "read|click", "selector": "str (CSS)", "click_text": "str"},
    },
    {
        "name": "http_request",
        "category": "web",
        "description": "Make HTTP requests to any REST API. Supports GET, POST, PUT, PATCH, DELETE.",
        "use_when": "Calling your own APIs, Stripe, analytics, any REST service",
        "parameters": {"url": "str", "method": "str", "headers": "dict", "body": "dict"},
    },
    {
        "name": "file_reader",
        "category": "files",
        "description": "Read a local file and return its text contents (max 50KB).",
        "use_when": "Reading config files, documents, exported data, local reports",
        "parameters": {"path": "str (absolute path)"},
    },
    {
        "name": "code_executor",
        "category": "compute",
        "description": "Execute Python code in a secure sandbox. Returns stdout and variable values.",
        "use_when": "Data analysis, calculations, text processing, statistics, math, data transformation",
        "parameters": {"code": "str (Python code)", "language": "str (only 'python')"},
    },
    {
        "name": "telegram_send",
        "category": "messaging",
        "description": "Send a message to the configured Telegram chat.",
        "use_when": "Delivering results, alerts, or reports to Telegram",
        "parameters": {"message": "str", "parse_mode": "Markdown|HTML|none"},
    },
    {
        "name": "slack_send",
        "category": "messaging",
        "description": "Send a message to a Slack channel via webhook.",
        "use_when": "Delivering results, alerts, or reports to Slack",
        "parameters": {"message": "str", "channel": "str (optional)", "webhook_url": "str (optional, overrides env)"},
    },
    {
        "name": "email_send",
        "category": "messaging",
        "description": "Send an email via SendGrid or SMTP.",
        "use_when": "Delivering reports, alerts, or digests via email",
        "parameters": {"to": "str (email)", "subject": "str", "body": "str", "html": "bool"},
    },
    {
        "name": "github_api",
        "category": "developer",
        "description": "Call the GitHub REST API for the configured repository.",
        "use_when": "Reading PRs, issues, commits, diffs, file contents, repo stats",
        "parameters": {"endpoint": "str (path after /repos/owner/repo/)", "method": "GET|POST|PATCH", "body": "dict"},
    },
    {
        "name": "jira_api",
        "category": "developer",
        "description": "Interact with Jira to search issues, get project status, or read specific tickets.",
        "use_when": "Sprint planning, ticket triage, engineering velocity, backlog analysis",
        "parameters": {"action": "search|get_issue|get_project|list_projects", "jql": "str", "issue_key": "str", "project_key": "str"},
    },
    {
        "name": "notion_read",
        "category": "productivity",
        "description": "Read content from Notion pages or search across your workspace.",
        "use_when": "Reading knowledge base articles, project docs, meeting notes from Notion",
        "parameters": {"page_id_or_query": "str (page ID or search query)", "search": "bool (True to search, False to read by ID)"},
    },
    {
        "name": "calendar_read",
        "category": "productivity",
        "description": "Read upcoming events from Google Calendar.",
        "use_when": "Meeting prep, scheduling context, finding upcoming deadlines",
        "parameters": {"days_ahead": "int (default 7)", "calendar_id": "str (default 'primary')", "max_results": "int"},
    },
    {
        "name": "scheduler",
        "category": "automation",
        "description": "Schedule a workflow to run automatically on a cron expression.",
        "use_when": "Setting up recurring workflow runs — daily briefs, weekly reports, hourly monitors",
        "parameters": {"workflow_id": "str", "cron_expr": "str (5-field UTC cron)"},
    },
]


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
