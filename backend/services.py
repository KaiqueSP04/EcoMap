from database import SessionLocal
from models import Occurrence
from schemas import OccurrenceCreate
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
