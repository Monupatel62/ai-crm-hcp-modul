import json
from sqlalchemy import Column, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from .database import Base


class HCP(Base):
    __tablename__ = "hcps"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), unique=True, index=True)
    specialty = Column(String(255), default="")
    organization = Column(String(255), default="")
    territory = Column(String(255), default="")

    interactions = relationship("Interaction", back_populates="hcp_record")


class Interaction(Base):
    __tablename__ = "interactions"

    id = Column(Integer, primary_key=True, index=True)
    hcp_id = Column(Integer, ForeignKey("hcps.id"), nullable=True)
    hcp_name = Column(String(255), default="")
    interaction_type = Column(String(100), default="Meeting")
    interaction_date = Column(String(20), default="")
    interaction_time = Column(String(10), default="")
    attendees_json = Column(Text, default="[]")
    topics_discussed = Column(Text, default="")
    materials_shared_json = Column(Text, default="[]")
    samples_distributed_json = Column(Text, default="[]")
    sentiment = Column(String(50), default="Neutral")
    outcomes = Column(Text, default="")
    follow_up_actions = Column(Text, default="")
    ai_suggested_followups_json = Column(Text, default="[]")
    interaction_notes = Column(Text, default="")
    voice_note_summary = Column(Text, default="")

    hcp_record = relationship("HCP", back_populates="interactions")

    @property
    def attendees(self):
        try:
            return json.loads(self.attendees_json or "[]")
        except Exception:
            return []

    @property
    def materials_shared(self):
        try:
            return json.loads(self.materials_shared_json or "[]")
        except Exception:
            return []

    @property
    def samples_distributed(self):
        try:
            return json.loads(self.samples_distributed_json or "[]")
        except Exception:
            return []

    @property
    def ai_suggested_followups(self):
        try:
            return json.loads(self.ai_suggested_followups_json or "[]")
        except Exception:
            return []
