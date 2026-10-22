from fastapi import APIRouter, File, UploadFile
from fastapi.responses import FileResponse

import services
from schemas import OccurrenceCreate
from uploads import resolve_photo_path, store_photo


router = APIRouter()


@router.get("/")
def root():
    return {"message": "EcoMap API funcionando"}


@router.get("/occurrences")
def get_occurrences():
    return services.get_occurrences()


@router.post("/occurrences")
def create_occurrence(occurrence: OccurrenceCreate):
    return services.create_occurrence(occurrence)


@router.post("/uploads", status_code=201)
async def upload_photo(file: UploadFile = File(...)):
    return await store_photo(file)


@router.get("/uploads/{filename}")
def get_photo(filename: str):
    path = resolve_photo_path(f"/uploads/{filename}")
    return FileResponse(path, media_type="image/jpeg", headers={"X-Content-Type-Options": "nosniff"})
