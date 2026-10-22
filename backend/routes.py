from fastapi import APIRouter

import services
from schemas import OccurrenceCreate


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
