# Genesis — AI Agent Orchestration Platform

## Project
Multi-agent platform where users describe outcomes in natural language and Genesis builds, validates, and deploys the agent system autonomously.

## Stack
- Backend: Python 3.12, FastAPI, LangGraph 1.0, APScheduler
- Frontend: Next.js 15 (App Router), ReactFlow (@xyflow/react), TypeScript, Tailwind, Zustand
- Infrastructure: PostgreSQL 16, Redis 7, Qdrant Cloud
- LLM: Claude Sonnet 4 (meta-agents), user-configurable per generated agent
- Messaging: Telegram (python-telegram-bot v20 async)
- Sandbox: Modal.com for generated code execution

## Rules — always follow these
- Always async/await in Python. Never use sync SQLAlchemy.
- Never use print() — use Python logging module with proper levels
- All API responses use Pydantic v2 models
- All DB operations use SQLAlchemy 2.0 async style
- TypeScript strict mode. No 'any' types.
- Never hardcode secrets — always use config.py / environment variables
- All agents communicate via LangGraph state + Redis pub/sub
- Write complete working code. Never write TODOs or placeholder functions.
- Never write stub implementations — if something is complex, implement it fully

## Architecture — 3 strict layers
1. UI Layer: Next.js + ReactFlow canvas + monitoring panel
2. API + Runtime Layer: FastAPI + LangGraph 1.0 + agent pipeline
3. Persistence Layer: PostgreSQL + Redis + Qdrant

## Key insight
Genesis's Builder Agent generates real LangGraph StateGraph Python code at runtime.
The visual canvas maps 1:1 to the LangGraph graph. What ReactFlow renders IS what executes.
