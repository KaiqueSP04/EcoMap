from fastapi import HTTPException
from sqlalchemy.exc import SQLAlchemyError

from database import SessionLocal
from models import Occurrence
from schemas import OccurrenceCreate, OccurrenceStatusUpdate
from uploads import resolve_photo_path


def serialize_occurrence(occurrence):
    return {
        "id": occurrence.id,
        "category": occurrence.category,
        "description": occurrence.description,
        "status": occurrence.status,
        "latitude": occurrence.latitude,
        "longitude": occurrence.longitude,
        "photo_path": occurrence.photo_path,
    }


def get_occurrences():
    db = SessionLocal()
    try:
        occurrences = db.query(Occurrence).all()
        return [serialize_occurrence(occurrence) for occurrence in occurrences]
    finally:
        db.close()


def create_occurrence(occurrence: OccurrenceCreate):
    if occurrence.photo_path is not None:
        resolve_photo_path(occurrence.photo_path)
    db = SessionLocal()
    try:
        new_occurrence = Occurrence(
            category=occurrence.category,
            description=occurrence.description,
            status="Registrada",
            latitude=occurrence.latitude,
            longitude=occurrence.longitude,
            photo_path=occurrence.photo_path,
        )
        db.add(new_occurrence)
        db.commit()
        db.refresh(new_occurrence)
        return serialize_occurrence(new_occurrence)
    finally:
        db.close()


def update_occurrence_status(occurrence_id: int, update: OccurrenceStatusUpdate):
    db = SessionLocal()
    try:
        occurrence = db.get(Occurrence, occurrence_id)
        if occurrence is None:
            raise HTTPException(status_code=404, detail="Ocorrência não encontrada.")
        occurrence.status = update.status
        db.commit()
        db.refresh(occurrence)
        return serialize_occurrence(occurrence)
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(status_code=500, detail="Não foi possível atualizar o status.") from None
    finally:
        db.close()
