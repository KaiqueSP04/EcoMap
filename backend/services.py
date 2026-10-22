from database import SessionLocal
from models import Occurrence
from schemas import OccurrenceCreate


def serialize_occurrence(occurrence):
    return {
        "id": occurrence.id,
        "category": occurrence.category,
        "description": occurrence.description,
        "status": occurrence.status,
    }


def get_occurrences():
    db = SessionLocal()
    try:
        occurrences = db.query(Occurrence).all()
        return [serialize_occurrence(occurrence) for occurrence in occurrences]
    finally:
        db.close()


def create_occurrence(occurrence: OccurrenceCreate):
    db = SessionLocal()
    try:
        new_occurrence = Occurrence(
            category=occurrence.category,
            description=occurrence.description,
            status="Registrada",
        )
        db.add(new_occurrence)
        db.commit()
        db.refresh(new_occurrence)
        return serialize_occurrence(new_occurrence)
    finally:
        db.close()
