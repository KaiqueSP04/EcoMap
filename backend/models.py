from sqlalchemy import Column, Double, Integer, String

from database import Base


class Occurrence(Base):
    __tablename__ = "occurrences"

    id = Column(Integer, primary_key=True, index=True)
    category = Column(String, nullable=False)
    description = Column(String, nullable=False)
    status = Column(String, nullable=False, default="Registrada")
    latitude = Column(Double, nullable=True)
    longitude = Column(Double, nullable=True)
    photo_path = Column(String, nullable=True)
