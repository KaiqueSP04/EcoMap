from pydantic import BaseModel


class OccurrenceCreate(BaseModel):
    category: str
    description: str
