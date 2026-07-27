from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum


class Priority(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"


class TodoCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    priority: Priority = Priority.medium


class TodoUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    priority: Optional[Priority] = None
    completed: Optional[bool] = None


class Todo(BaseModel):
    id: int
    title: str
    description: Optional[str]
    priority: Priority
    completed: bool

    class Config:
        from_attributes = True
