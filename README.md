# AI-First CRM — HCP Interaction Module

> **Task 1 Submission** — AI-First CRM HCP Module with LangGraph Agent

---

## 📸 Screenshot

Split-screen layout:
- **Left** — Interaction Details form (read-only; filled entirely by AI)
- **Right** — AI Assistant chat panel (powered by Google Gemini + LangGraph)

---

## 🏗️ Architecture

```
User (Chat Input)
       │
       ▼
React + Redux (Frontend)
  ├─ chatInput → POST /api/chat
  └─ draft_updates → auto-fill form
       │
       ▼
FastAPI (Backend)  /api/chat
       │
       ▼
LangGraph Agent  ──► Google Gemini (`gemini-2.0-flash`)
  │
  ├── [Tool 1] extract_entities   ← NLP entity extraction via LLM
  ├── [Tool 2] summarize          ← Generates interaction notes
  ├── [Tool 3] infer_sentiment    ← Normalises Positive/Neutral/Negative
  ├── [Tool 4] search_materials   ← Enriches materials & samples lists
  ├── [Tool 5] suggest_followup   ← AI follow-up suggestions
  ├── [Tool 6] log_interaction    ← Final node for NEW interactions
  └── [Tool 7] edit_interaction   ← Final node for EDITS
       │
       ▼
SQLite / Postgres DB (SQLAlchemy)
  ├─ hcps table
  └─ interactions table
```

---

## 🔧 Tech Stack

| Layer     | Technology                          |
|-----------|-------------------------------------|
| Frontend  | React 18, Redux Toolkit, Vite       |
| Backend   | Python 3.11+, FastAPI, Uvicorn      |
| AI Agent  | LangGraph 0.2, LangChain Core       |
| LLM       | Google Gemini — `gemini-2.0-flash` |
| Database  | SQLite (dev) / PostgreSQL (prod)    |
| Font      | Google Inter                        |

---

## 🚀 Quick Start

### Prerequisites
- Python 3.11+
- Node.js 18+
- Free Gemini API key: https://aistudio.google.com/app/apikeys

---

### 1. Clone the repo

```bash
git clone https://github.com/YOUR_USERNAME/ai-crm-hcp-module.git
cd ai-crm-hcp-module
```

---

### 2. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Create .env file
cp .env.example .env
# → Edit .env and add your GEMINI_API_KEY

# Start the server
uvicorn app.main:app --reload --port 8000
```

Backend runs at: http://localhost:8000  
Health check: http://localhost:8000/health

---

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Create .env file
cp .env.example .env
# → VITE_API_BASE=http://localhost:8000

# Start dev server
npm run dev
```

Frontend runs at: http://localhost:5173

---

## 🤖 LangGraph Tools — Details

### Tool 1: `extract_entities`
Calls the Google Gemini model (`gemini-2.0-flash`) with a structured system prompt.
Extracts: `hcp_name`, `interaction_type`, `date`, `time`, `sentiment`,
`topics_discussed`, `materials_shared`, `samples_distributed`, `outcomes`,
`follow_up_actions`, `attendees`.

### Tool 2: `summarize`
Uses the LLM-generated summary to populate `interaction_notes` and fill
`topics_discussed` if not already present.

### Tool 3: `infer_sentiment`
Normalises the sentiment value to exactly `Positive`, `Neutral`, or `Negative`.
Falls back to keyword scanning if the LLM returns an unexpected value.

### Tool 4: `search_materials_or_samples`
Enriches `materials_shared` and `samples_distributed` based on topics
(e.g. clinical trial → clinical PDF) and explicit keywords.

### Tool 5: `suggest_followup`
Generates follow-up suggestions by combining LLM output with rule-based
logic based on sentiment and topics.

### Tool 6: `log_interaction` *(conditional final node)*
Sets the confirmation reply for new interaction drafts.

### Tool 7: `edit_interaction` *(conditional final node)*
Sets the confirmation reply for edits. Triggered when the user message
contains edit signals ("actually", "sorry", "change", "update", etc.).

---

## 🔁 LangGraph Flow

```
START
  └─► [Route] → detect log vs edit
        │
        ▼
  extract_entities  (Tool 1 — LLM call)
        │
        ▼
  summarize         (Tool 2)
        │
        ▼
  infer_sentiment   (Tool 3)
        │
        ▼
  search_materials  (Tool 4)
        │
        ▼
  suggest_followup  (Tool 5)
        │
        ├── (mode=log) ──► log_interaction  (Tool 6) ──► END
        └── (mode=edit) ─► edit_interaction (Tool 7) ──► END
```

---

## 🧪 Demo Prompts

### Log Interaction (Tool 6 path)
```
Today I met with Dr. Smith and discussed Product X efficacy.
The sentiment was positive and I shared the brochure.
```

### Edit Interaction (Tool 7 path)
```
Sorry, change the sentiment to negative and keep everything else the same.
```

### Complex log
```
I visited Dr. Sharma at Apollo Hospital, discussed OncoBoost Phase III data,
she was very interested. Shared clinical PDF and 2 samples.
```

### Edit HCP name
```
Update the HCP name to Dr. Kapoor and add follow-up: send advisory board invite.
```

---

## 📁 Project Structure

```
ai-crm-hcp-module/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── agent.py        ← LangGraph agent + 7 tools
│   │   ├── config.py       ← Settings / env vars
│   │   ├── crud.py         ← DB operations
│   │   ├── database.py     ← SQLAlchemy setup
│   │   ├── main.py         ← FastAPI routes
│   │   ├── models.py       ← DB models
│   │   └── schemas.py      ← Pydantic schemas
│   ├── .env.example
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx         ← Main UI (split-screen)
│   │   ├── store.js        ← Redux store + async thunks
│   │   ├── styles.css      ← Google Inter, full design
│   │   └── main.jsx        ← React entry point
│   ├── .env.example
│   └── package.json
│
└── README.md
```

---

## 📌 Key Rules Followed

- ✅ Form is **read-only** — filled ONLY by AI assistant
- ✅ LangGraph agent with **5+ tools** all active
- ✅ Google Gemini (`gemini-2.0-flash`) called for entity extraction
- ✅ Edit interaction correctly **preserves unchanged fields**
- ✅ Redux state management for the form draft
- ✅ FastAPI backend with proper CORS
- ✅ SQLite DB for persistence
- ✅ Google Inter font throughout

---

## 🔑 Environment Variables

| Variable        | Required | Description                        |
|-----------------|----------|------------------------------------|
| `GEMINI_API_KEY` | Yes     | Get free at ai.google.dev / AI Studio |
| `DATABASE_URL`   | No      | Default: `sqlite:///./crm.db`         |
