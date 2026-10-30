from pydantic import BaseModel
from typing import Optional


class ConversationCreate(BaseModel):
    title:     str = "Nouvelle conversation"
    databases: list[str] = []


class ConversationOut(BaseModel):
    id:         str
    title:      str
    databases:  list[str]
    created_at: str
    updated_at: str
    messages:   list[dict] = []


class MessageCreate(BaseModel):
    content: str


class MessageOut(BaseModel):
    id:             str
    conv_id:        str
    role:           str          # "user" | "assistant"
    content:        str
    pipeline_steps: list = []
    created_at:     str


class DatabaseSelection(BaseModel):
    databases: list[str]


class PipelineEvent(BaseModel):
    type:    str                 # "step" | "token" | "figures" | "done" | "error"
    payload: dict = {}
