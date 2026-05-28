from fastapi import APIRouter

from genesis.api.agents import router as agents_router
from genesis.api.workflows import router as workflows_router
from genesis.api.runs import router as runs_router
from genesis.api.health import router as health_router
from genesis.api.templates import router as templates_router
from genesis.api.websocket import router as websocket_router

router = APIRouter()
router.include_router(agents_router)
router.include_router(workflows_router)
router.include_router(runs_router)
router.include_router(health_router)
router.include_router(templates_router)
router.include_router(websocket_router)
