from fastapi import APIRouter

from genesis.api.agents import router as agents_router
from genesis.api.audit import router as audit_router
from genesis.api.genesis import router as genesis_router
from genesis.api.health import router as health_router
from genesis.api.runs import router as runs_router
from genesis.api.scheduler import router as scheduler_router
from genesis.api.telegram_webhook import router as telegram_router
from genesis.api.templates import router as templates_router
from genesis.api.tools import router as tools_router
from genesis.api.websocket import router as websocket_router
from genesis.api.workflows import router as workflows_router

router = APIRouter()
router.include_router(agents_router)
router.include_router(workflows_router)
router.include_router(runs_router)
router.include_router(health_router)
router.include_router(templates_router)
router.include_router(tools_router)
router.include_router(scheduler_router)
router.include_router(websocket_router)
router.include_router(genesis_router)
router.include_router(telegram_router)
router.include_router(audit_router)
