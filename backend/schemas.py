from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from uploads import PHOTO_PATH_PATTERN


class OccurrenceStatusUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["Registrada", "Em análise", "Resolvida"]


class OccurrenceCreate(BaseModel):
    category: str
    description: str
    latitude: float | None = Field(default=None, ge=-90, le=90, allow_inf_nan=False)
    longitude: float | None = Field(default=None, ge=-180, le=180, allow_inf_nan=False)
    photo_path: str | None = Field(default=None, pattern=PHOTO_PATH_PATTERN)

    @field_validator("category", "description")
    @classmethod
    def require_non_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Campo obrigatório.")
        return value

    @model_validator(mode="after")
    def require_coordinate_pair(self):
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("Informe latitude e longitude juntas.")
        return self
