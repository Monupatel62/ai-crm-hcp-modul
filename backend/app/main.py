from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from . import crud, schemas
from .agent import run_agent
from .config import settings
from .database import get_db, init_db

init_db()

app = FastAPI(title=settings.app_name, version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "groq_key_set": bool(settings.groq_api_key),
        "model": settings.groq_model,
        "database_url": settings.database_url,
    }


# ── Interactions ──────────────────────────────────────────────────────────────

@app.get("/api/interactions", response_model=list[schemas.InteractionRead])
def list_interactions(db: Session = Depends(get_db)):
    return crud.list_interactions(db)


@app.get("/api/interactions/{iid}", response_model=schemas.InteractionRead)
def get_interaction(iid: int, db: Session = Depends(get_db)):
    obj = crud.get_interaction(db, iid)
    if not obj:
        raise HTTPException(404, "Interaction not found")
    return obj


@app.post("/api/interactions", response_model=schemas.InteractionRead)
def create_interaction(payload: schemas.InteractionCreate, db: Session = Depends(get_db)):
    return crud.create_interaction(db, payload)


@app.put("/api/interactions/{iid}", response_model=schemas.InteractionRead)
def update_interaction(iid: int, payload: schemas.InteractionUpdate, db: Session = Depends(get_db)):
    obj = crud.update_interaction(db, iid, payload)
    if not obj:
        raise HTTPException(404, "Interaction not found")
    return obj


# ── HCPs ──────────────────────────────────────────────────────────────────────

@app.get("/api/hcps", response_model=list[schemas.HCPRead])
def list_hcps(q: str | None = Query(default=None), db: Session = Depends(get_db)):
    return crud.search_hcps(db, q) if q else crud.list_hcps(db)


@app.get("/api/hcps/{hid}", response_model=schemas.HCPRead)
def get_hcp(hid: int, db: Session = Depends(get_db)):
    hcp = crud.get_hcp(db, hid)
    if not hcp:
        raise HTTPException(404, "HCP not found")
    return schemas.HCPRead(
        id=hcp.id, name=hcp.name, specialty=hcp.specialty or "",
        organization=hcp.organization or "", territory=hcp.territory or "",
        interaction_count=len(hcp.interactions),
    )


@app.put("/api/hcps/{hid}", response_model=schemas.HCPRead)
def update_hcp(hid: int, payload: schemas.HCPUpdate, db: Session = Depends(get_db)):
    hcp = crud.update_hcp(db, hid, payload)
    if not hcp:
        raise HTTPException(404, "HCP not found")
    return schemas.HCPRead(
        id=hcp.id, name=hcp.name, specialty=hcp.specialty or "",
        organization=hcp.organization or "", territory=hcp.territory or "",
        interaction_count=len(hcp.interactions),
    )


# ── AI Chat ───────────────────────────────────────────────────────────────────

@app.post("/api/chat", response_model=schemas.ChatResponse)
def chat(payload: schemas.ChatRequest):
    draft = payload.draft.model_dump() if payload.draft else {}
    return run_agent(payload.message, draft)


# Legacy aliases
@app.post("/ai/chat", response_model=schemas.ChatResponse)
def chat_alias(payload: schemas.ChatRequest):
    draft = payload.draft.model_dump() if payload.draft else {}
    return run_agent(payload.message, draft)
