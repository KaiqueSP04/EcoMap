from fastapi import APIRouter, File, UploadFile
from fastapi.responses import FileResponse
from starlette.concurrency import run_in_threadpool

import services
import gemini_service
from schemas import CategorySuggestionRequest, CategorySuggestionResponse, DescriptionSuggestionResponse, OccurrenceCreate, OccurrenceStatusUpdate
from uploads import read_normalized_photo, resolve_photo_path, store_photo


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


@router.post("/occurrences/suggest-category", response_model=CategorySuggestionResponse)
def suggest_category(request: CategorySuggestionRequest):
    return gemini_service.suggest_category(request.description)


@router.patch("/occurrences/{occurrence_id}/status")
def update_occurrence_status(occurrence_id: int, update: OccurrenceStatusUpdate):
    return services.update_occurrence_status(occurrence_id, update)


@router.post("/occurrences/describe-image", response_model=DescriptionSuggestionResponse)
async def describe_image(file: UploadFile = File(...)):
    image = await read_normalized_photo(file)
    return await run_in_threadpool(gemini_service.describe_image, image)


@router.post("/occurrences/improve-description", response_model=DescriptionSuggestionResponse)
def improve_description(request: CategorySuggestionRequest):
    return gemini_service.improve_description(request.description)


@router.post("/uploads", status_code=201)
async def upload_photo(file: UploadFile = File(...)):
    return await store_photo(file)


@router.get("/uploads/{filename}")
def get_photo(filename: str):
    path = resolve_photo_path(f"/uploads/{filename}")
    return FileResponse(path, media_type="image/jpeg", headers={"X-Content-Type-Options": "nosniff"})
