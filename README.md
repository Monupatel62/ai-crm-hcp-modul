# AI-First CRM - HCP Log Interaction Screen

Task 1 submission for the AI-First CRM HCP Module assignment.

## Assignment alignment

- Frontend: React + Redux Toolkit
- Backend: FastAPI + Python
- AI agent framework: LangGraph
- LLM: Groq using `gemma2-9b-it`
- Database: SQLAlchemy with SQLite for local dev, plus PostgreSQL/MySQL-ready `DATABASE_URL`
- UX requirement: both structured form logging and conversational chat logging are supported
- Font: Google Inter

## What this project does

This module helps life-science field representatives log Healthcare Professional interactions in two ways:

1. Structured form entry
2. Conversational AI entry

Users can type directly into the form, or describe the interaction in chat and let the LangGraph assistant fill and refine the draft.

## Core screen: Log Interaction

The screen is split into two working areas:

- Left panel: editable interaction form
- Right panel: conversational AI assistant

The draft can be created from either side, edited from either side, and saved to the backend database.

## LangGraph agent role

The LangGraph agent acts as the CRM orchestration layer for HCP interaction capture. It:

- interprets free-text interaction notes
- extracts structured sales-call entities
- summarizes the interaction
- normalizes sentiment
- enriches materials and sample information
- suggests smart follow-up actions
- handles both new logging and edit flows

## LangGraph tools

This implementation contains 7 tools:

1. `extract_entities`
   Uses Groq `gemma2-9b-it` to convert natural language into CRM-ready structured fields.

2. `summarize`
   Creates concise interaction notes and fills summary-oriented fields.

3. `infer_sentiment`
   Normalizes HCP sentiment into `Positive`, `Neutral`, or `Negative`.

4. `search_materials_or_samples`
   Enriches materials and sample fields based on context from the interaction.

5. `suggest_followup`
   Generates sales follow-up recommendations for the rep.

6. `log_interaction`
   Final node for new interaction capture.

7. `edit_interaction`
   Final node for updating an existing interaction while preserving unchanged fields.

## Architecture

```text
User
 ├─ Structured form entry
 └─ Conversational chat entry
        |
        v
React + Redux UI
        |
        v
FastAPI backend
        |
        v
LangGraph workflow
 ├─ extract_entities
 ├─ summarize
 ├─ infer_sentiment
 ├─ search_materials_or_samples
 ├─ suggest_followup
 ├─ log_interaction
 └─ edit_interaction
        |
        v
Groq API (gemma2-9b-it)
        |
        v
SQLAlchemy persistence
 ├─ SQLite for local development
 ├─ PostgreSQL-ready
 └─ MySQL-ready
```

## Tech stack

| Layer | Stack |
|---|---|
| Frontend | React 18, Redux Toolkit, Vite |
| Backend | FastAPI, SQLAlchemy, Pydantic |
| Agent | LangGraph, LangChain Core |
| LLM | Groq `gemma2-9b-it` |
| Database | SQLite / PostgreSQL / MySQL via `DATABASE_URL` |
| Export | jsPDF, html2canvas |

## Database readiness

The app runs locally with SQLite by default for convenience:

```env
DATABASE_URL=sqlite:///./crm.db
```

It is also ready to point at PostgreSQL or MySQL through `DATABASE_URL`:

```env
# PostgreSQL
DATABASE_URL=postgresql+psycopg://postgres:password@localhost:5432/ai_crm

# MySQL
DATABASE_URL=mysql+pymysql://root:password@localhost:3306/ai_crm
```

`backend/app/database.py` uses provider-aware SQLAlchemy engine options, so SQLite gets the right `check_same_thread` config while PostgreSQL/MySQL work without SQLite-only arguments.

## Local setup

### Backend

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --port 8000
```

### Frontend

```powershell
cd frontend
npm install
copy .env.example .env
npm run dev
```

## Environment variables

### Backend

```env
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL=gemma2-9b-it
DATABASE_URL=sqlite:///./crm.db
```

### Frontend

```env
VITE_API_BASE=http://localhost:8000
```

## Key APIs

- `GET /health`
- `POST /api/chat`
- `GET /api/interactions`
- `POST /api/interactions`
- `PUT /api/interactions/{id}`
- `GET /api/hcps`
- `PUT /api/hcps/{id}`

## Demo-ready behaviors

- log via structured form only
- log via AI chat only
- AI-assisted edit flow
- save and reload interaction history
- update HCP master profile
- download selected interaction as PDF

## Suggested demo prompts

```text
Today I met with Dr. Smith and discussed Product X efficacy. The sentiment was positive and I shared the brochure.

Met Dr. Mehta for a call, discussed clinical trial updates, neutral sentiment, no materials shared.

Sorry, change the sentiment to negative and keep everything else the same.

I visited Dr. Sharma at Apollo Hospital, discussed OncoBoost Phase III data, she was very interested. Shared clinical PDF and 2 samples.

Update the HCP name to Dr. Kapoor and add follow-up: send advisory board invite.
```

## Project structure

```text
backend/
  app/
    agent.py
    config.py
    crud.py
    database.py
    main.py
    models.py
    schemas.py
  .env.example
  requirements.txt

frontend/
  src/
    App.jsx
    main.jsx
    store.js
    styles.css
    assets/
  .env.example
  package.json
  vite.config.js
```

## Notes for reviewers

- The assignment requested Groq + `gemma2-9b-it`, and the backend is now aligned to that stack.
- The assignment asked for structured form logging or conversational chat logging; both are available in the UI.
- The assignment requested MySQL/Postgres SQL; local development uses SQLite, but configuration is ready for PostgreSQL/MySQL through `DATABASE_URL`.
