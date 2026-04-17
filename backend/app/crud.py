import json
from sqlalchemy.orm import Session

from . import models, schemas


def _get_or_create_hcp(db: Session, name: str) -> models.HCP | None:
    if not name:
        return None
    hcp = db.query(models.HCP).filter(models.HCP.name.ilike(name)).first()
    if not hcp:
        hcp = models.HCP(name=name)
        db.add(hcp)
        db.commit()
        db.refresh(hcp)
    return hcp


def list_interactions(db: Session) -> list[models.Interaction]:
    return db.query(models.Interaction).order_by(models.Interaction.id.desc()).all()


def get_interaction(db: Session, interaction_id: int) -> models.Interaction | None:
    return db.query(models.Interaction).filter(models.Interaction.id == interaction_id).first()


def create_interaction(db: Session, payload: schemas.InteractionCreate) -> models.Interaction:
    hcp = _get_or_create_hcp(db, payload.hcp_name)
    interaction = models.Interaction(
        hcp_id=hcp.id if hcp else None,
        hcp_name=payload.hcp_name,
        interaction_type=payload.interaction_type,
        interaction_date=payload.interaction_date,
        interaction_time=payload.interaction_time,
        attendees_json=json.dumps(payload.attendees),
        topics_discussed=payload.topics_discussed,
        materials_shared_json=json.dumps(payload.materials_shared),
        samples_distributed_json=json.dumps(payload.samples_distributed),
        sentiment=payload.sentiment,
        outcomes=payload.outcomes,
        follow_up_actions=payload.follow_up_actions,
        ai_suggested_followups_json=json.dumps(payload.ai_suggested_followups),
        interaction_notes=payload.interaction_notes,
        voice_note_summary=payload.voice_note_summary,
    )
    db.add(interaction)
    db.commit()
    db.refresh(interaction)
    return interaction


def update_interaction(db: Session, interaction_id: int, payload: schemas.InteractionUpdate) -> models.Interaction | None:
    interaction = get_interaction(db, interaction_id)
    if not interaction:
        return None
    hcp = _get_or_create_hcp(db, payload.hcp_name)
    interaction.hcp_id = hcp.id if hcp else None
    interaction.hcp_name = payload.hcp_name
    interaction.interaction_type = payload.interaction_type
    interaction.interaction_date = payload.interaction_date
    interaction.interaction_time = payload.interaction_time
    interaction.attendees_json = json.dumps(payload.attendees)
    interaction.topics_discussed = payload.topics_discussed
    interaction.materials_shared_json = json.dumps(payload.materials_shared)
    interaction.samples_distributed_json = json.dumps(payload.samples_distributed)
    interaction.sentiment = payload.sentiment
    interaction.outcomes = payload.outcomes
    interaction.follow_up_actions = payload.follow_up_actions
    interaction.ai_suggested_followups_json = json.dumps(payload.ai_suggested_followups)
    interaction.interaction_notes = payload.interaction_notes
    interaction.voice_note_summary = payload.voice_note_summary
    db.commit()
    db.refresh(interaction)
    return interaction


def list_hcps(db: Session) -> list[models.HCP]:
    return db.query(models.HCP).order_by(models.HCP.name).all()


def search_hcps(db: Session, query: str) -> list[models.HCP]:
    return db.query(models.HCP).filter(models.HCP.name.ilike(f"%{query}%")).all()


def get_hcp(db: Session, hcp_id: int) -> models.HCP | None:
    return db.query(models.HCP).filter(models.HCP.id == hcp_id).first()


def update_hcp(db: Session, hcp_id: int, payload: schemas.HCPUpdate) -> models.HCP | None:
    hcp = get_hcp(db, hcp_id)
    if not hcp:
        return None
    if payload.specialty is not None:
        hcp.specialty = payload.specialty
    if payload.organization is not None:
        hcp.organization = payload.organization
    if payload.territory is not None:
        hcp.territory = payload.territory
    db.commit()
    db.refresh(hcp)
    return hcp
