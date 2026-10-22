import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, String
from sqlalchemy.orm import declarative_base, sessionmaker


load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")


engine = create_engine(DATABASE_URL)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)

Base = declarative_base()


class Occurrence(Base):
    __tablename__ = "occurrences"

    id = Column(Integer, primary_key=True, index=True)
    category = Column(String, nullable=False)
    description = Column(String, nullable=False)
    status = Column(String, nullable=False, default="Registrada")


Base.metadata.create_all(bind=engine)


app = FastAPI(title="EcoMap API")


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class OccurrenceCreate(BaseModel):
    category: str
    description: str


@app.get("/")
def root():
    return {"message": "EcoMap API funcionando"}


@app.get("/occurrences")
def get_occurrences():
    db = SessionLocal()

    try:
        occurrences = db.query(Occurrence).all()

        return [
            {
                "id": occurrence.id,
                "category": occurrence.category,
                "description": occurrence.description,
                "status": occurrence.status,
            }
            for occurrence in occurrences
        ]

    finally:
        db.close()


@app.post("/occurrences")
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

        return {
            "id": new_occurrence.id,
            "category": new_occurrence.category,
            "description": new_occurrence.description,
            "status": new_occurrence.status,
        }

    finally:
        db.close()