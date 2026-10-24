"""Local image storage for the academic demonstration."""
import re
import warnings
from io import BytesIO
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError
from starlette.concurrency import run_in_threadpool

UPLOAD_DIR = Path(__file__).resolve().parent / "uploads"
MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_IMAGE_PIXELS = 20_000_000
PHOTO_PATH_PATTERN = r"^/uploads/[0-9a-f]{32}\.jpg$"
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}


def resolve_photo_path(photo_path: str) -> Path:
    if re.fullmatch(PHOTO_PATH_PATTERN, photo_path) is None:
        raise HTTPException(status_code=422, detail="Referência de foto inválida.")
    path = UPLOAD_DIR / photo_path.rsplit("/", 1)[-1]
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Foto não encontrada.")
    return path


def normalize_image(content: bytes, content_type: str | None) -> bytes:
    if content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=415, detail="Use uma imagem JPEG, PNG ou WebP.")
    if len(content) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="A foto deve ter no máximo 8 MB.")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(content)) as image:
                if image.format not in {"JPEG", "PNG", "WEBP"}:
                    raise HTTPException(status_code=415, detail="Formato de imagem não permitido.")
                if image.width * image.height > MAX_IMAGE_PIXELS:
                    raise HTTPException(status_code=413, detail="A foto deve ter no máximo 20 megapixels.")
                image.verify()
            with Image.open(BytesIO(content)) as image:
                image = ImageOps.exif_transpose(image)
                image.thumbnail((2048, 2048))
                # A fresh RGB image discards EXIF (including GPS), ICC and other metadata.
                clean = Image.new("RGB", image.size, "white")
                if image.mode in {"RGBA", "LA"} or "transparency" in image.info:
                    rgba = image.convert("RGBA")
                    clean.paste(rgba, mask=rgba.getchannel("A"))
                else:
                    clean.paste(image.convert("RGB"))
                result = BytesIO()
                clean.save(result, format="JPEG", quality=85)
                return result.getvalue()
    except (Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise HTTPException(status_code=413, detail="Dimensões da foto excedem o limite.") from None
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError):
        raise HTTPException(status_code=415, detail="Imagem inválida ou corrompida.") from None


async def read_normalized_photo(file: UploadFile) -> bytes:
    try:
        content = bytearray()
        while chunk := await file.read(64 * 1024):
            content.extend(chunk)
            if len(content) > MAX_IMAGE_BYTES:
                raise HTTPException(status_code=413, detail="A foto deve ter no máximo 8 MB.")
        return await run_in_threadpool(normalize_image, bytes(content), file.content_type)
    finally:
        await file.close()


async def store_photo(file: UploadFile) -> dict[str, str]:
    normalized = await read_normalized_photo(file)
    return await run_in_threadpool(write_photo, normalized)


def write_photo(normalized: bytes) -> dict[str, str]:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid4().hex}.jpg"
    target = UPLOAD_DIR / filename
    created = False
    try:
        with target.open("xb") as output:
            created = True
            output.write(normalized)
    except OSError:
        if created:
            target.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail="Não foi possível armazenar a foto.") from None
    return {"photo_path": f"/uploads/{filename}"}
