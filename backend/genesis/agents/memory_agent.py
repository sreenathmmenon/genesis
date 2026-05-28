from __future__ import annotations

import json
from typing import Any

from genesis.config import settings
from genesis.utils.logger import get_logger

logger = get_logger("genesis.memory_agent")

_COLLECTION = settings.qdrant_collection_name
_VECTOR_DIM = 1536  # OpenAI text-embedding-3-small


async def _get_qdrant():
    from qdrant_client import AsyncQdrantClient
    return AsyncQdrantClient(
        url=settings.qdrant_url,
        api_key=settings.qdrant_api_key or None,
    )


async def _embed(text: str) -> list[float]:
    from openai import AsyncOpenAI
    client = AsyncOpenAI(api_key=settings.openai_api_key)
    resp = await client.embeddings.create(model="text-embedding-3-small", input=text)
    return resp.data[0].embedding


async def _ensure_collection() -> None:
    from qdrant_client.models import Distance, VectorParams
    client = await _get_qdrant()
    collections = [c.name for c in (await client.get_collections()).collections]
    if _COLLECTION not in collections:
        await client.create_collection(
            collection_name=_COLLECTION,
            vectors_config=VectorParams(size=_VECTOR_DIM, distance=Distance.COSINE),
        )
        logger.info("Created Qdrant collection: %s", _COLLECTION)
    await client.close()


async def store_successful_pattern(
    intent: str,
    workflow: dict[str, Any],
    build_id: str,
) -> None:
    """Persist a successful workflow pattern for future similarity retrieval."""
    try:
        import uuid
        from qdrant_client.models import PointStruct

        await _ensure_collection()
        vector = await _embed(intent)

        client = await _get_qdrant()
        await client.upsert(
            collection_name=_COLLECTION,
            points=[
                PointStruct(
                    id=str(uuid.uuid4()),
                    vector=vector,
                    payload={
                        "intent": intent,
                        "build_id": build_id,
                        "workflow_name": workflow.get("workflow_name", ""),
                        "description": workflow.get("description", ""),
                        "agent_count": len(workflow.get("graph_json", {}).get("nodes", [])),
                        "workflow_snapshot": json.dumps(workflow)[:4000],
                    },
                )
            ],
        )
        await client.close()
        logger.info("Stored pattern for build_id=%s", build_id)
    except Exception as exc:
        logger.warning("Failed to store pattern: %s", exc)


async def find_similar_patterns(
    intent: str,
    limit: int = 3,
    score_threshold: float = 0.75,
) -> list[dict[str, Any]]:
    """Find previously successful workflows similar to the given intent."""
    try:
        from qdrant_client.models import ScoredPoint

        vector = await _embed(intent)
        client = await _get_qdrant()

        results: list[ScoredPoint] = await client.search(
            collection_name=_COLLECTION,
            query_vector=vector,
            limit=limit,
            score_threshold=score_threshold,
            with_payload=True,
        )
        await client.close()

        return [
            {
                "score": r.score,
                "intent": r.payload.get("intent", ""),
                "workflow_name": r.payload.get("workflow_name", ""),
                "description": r.payload.get("description", ""),
                "agent_count": r.payload.get("agent_count", 0),
                "workflow_snapshot": r.payload.get("workflow_snapshot", "{}"),
            }
            for r in results
        ]
    except Exception as exc:
        logger.warning("Pattern search failed: %s", exc)
        return []
