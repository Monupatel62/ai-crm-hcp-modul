from typing import Any, Optional
from pydantic import BaseModel, field_validator


class HCPRead(BaseModel):
    id: int
    name: str
    specialty: str = ""
    organization: str = ""
    territory: str = ""
    interaction_count: int = 0

    model_config = {"from_attributes": True}


class HCPUpdate(BaseModel):
    specialty: Optional[str] = None
    organization: Optional[str] = None
    territory: Optional[str] = None


class InteractionDraft(BaseModel):
    hcp_name: str = ""
    interaction_type: str = "Meeting"
    interaction_date: str = ""
    interaction_time: str = ""
    attendees: list[str] = []
    topics_discussed: str = ""
    materials_shared: list[str] = []
    samples_distributed: list[str] = []
    sentiment: str = "Neutral"
    outcomes: str = ""
    follow_up_actions: str = ""
    ai_suggested_followups: list[str] = []
    interaction_notes: str = ""
    voice_note_summary: str = ""


class InteractionCreate(InteractionDraft):
    pass


class InteractionUpdate(InteractionDraft):
    pass


class InteractionRead(BaseModel):
    id: int
    hcp_name: str = ""
    interaction_type: str = "Meeting"
    interaction_date: str = ""
    interaction_time: str = ""
    attendees: list[str] = []
    topics_discussed: str = ""
    materials_shared: list[str] = []
    samples_distributed: list[str] = []
    sentiment: str = "Neutral"
    outcomes: str = ""
    follow_up_actions: str = ""
    ai_suggested_followups: list[str] = []
    interaction_notes: str = ""
    voice_note_summary: str = ""

    model_config = {"from_attributes": True}

    @field_validator("attendees", "materials_shared", "samples_distributed", "ai_suggested_followups", mode="before")
    @classmethod
    def parse_json_list(cls, v: Any) -> list:
        if isinstance(v, list):
            return v
        if isinstance(v, str):
            import json
            try:
                result = json.loads(v)
                return result if isinstance(result, list) else []
            except Exception:
                return []
        return []


class ChatRequest(BaseModel):
    message: str
    draft: Optional[InteractionDraft] = None


class ChatResponse(BaseModel):
    reply: str
    draft_updates: dict[str, Any] = {}
    tool_trace: list[str] = []
