from sqlalchemy import Column, Integer, String

from database import Base


class Occurrence(Base):
    __tablename__ = "occurrences"

    id = Column(Integer, primary_key=True, index=True)
    category = Column(String, nullable=False)
    description = Column(String, nullable=False)
    status = Column(String, nullable=False, default="Registrada")
