"""Backend configuration. Secrets are read only from the process environment/.env."""
import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).with_name(".env"))

DATABASE_URL = os.getenv("DATABASE_URL")
GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"
DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite"


@dataclass(frozen=True)
class GeminiSettings:
    api_key: str = field(repr=False)
    model: str = DEFAULT_GEMINI_MODEL
    timeout_seconds: float = 12


def get_gemini_settings() -> GeminiSettings:
    try:
        timeout = float(os.getenv("GEMINI_TIMEOUT_SECONDS", "12"))
        if not 1 <= timeout <= 30:
            timeout = 12
    except ValueError:
        timeout = 12
    return GeminiSettings(
        api_key=os.getenv("GEMINI_API_KEY", "").strip(),
        model=os.getenv("GEMINI_MODEL", DEFAULT_GEMINI_MODEL).strip(),
        timeout_seconds=timeout,
    )
