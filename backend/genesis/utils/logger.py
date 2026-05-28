import logging
import os
from pathlib import Path

LOG_DIR = Path(__file__).parent.parent.parent / "logs"
LOG_FILE = LOG_DIR / "genesis.log"

_FORMAT = "%(asctime)s | %(levelname)s | %(name)s | %(message)s"
_DATE_FMT = "%Y-%m-%d %H:%M:%S"

_configured = False


def _configure() -> None:
    global _configured
    if _configured:
        return

    LOG_DIR.mkdir(parents=True, exist_ok=True)

    from genesis.config import settings  # noqa: PLC0415

    level = getattr(logging, settings.log_level.upper(), logging.INFO)

    console = logging.StreamHandler()
    console.setFormatter(logging.Formatter(_FORMAT, datefmt=_DATE_FMT))

    file_handler = logging.FileHandler(LOG_FILE, encoding="utf-8")
    file_handler.setFormatter(logging.Formatter(_FORMAT, datefmt=_DATE_FMT))

    root = logging.getLogger("genesis")
    root.setLevel(level)
    root.addHandler(console)
    root.addHandler(file_handler)
    root.propagate = False

    _configured = True


def get_logger(name: str) -> logging.Logger:
    _configure()
    return logging.getLogger(name)


logger = get_logger("genesis")
