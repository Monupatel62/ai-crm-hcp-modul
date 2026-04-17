"""
LangGraph AI Agent for CRM HCP Interaction Module
==================================================
Using Google Gemini API for LLM
Tools:
  1. extract_entities          – NLP entity extraction via Gemini LLM
  2. summarize                 – Summarise interaction into notes
  3. infer_sentiment           – Detect / normalise sentiment
  4. search_materials_or_samples – Enrich materials & samples lists
  5. suggest_followup          – AI-powered follow-up suggestions
  6. log_interaction           – Final node: new interaction
  7. edit_interaction          – Final node: patch existing draft
"""

import json
import re
from datetime import datetime
from typing import Any, TypedDict

from langgraph.graph import END, StateGraph
import google.generativeai as genai

from .config import settings


# ─── State ────────────────────────────────────────────────────

class AgentState(TypedDict):
    message: str
    draft: dict[str, Any]
    tool_trace: list[str]
    reply: str
    draft_updates: dict[str, Any]
    parsed: dict[str, Any]
    mode: str          # "log" | "edit"  — set by route_node, read by action_router


# ─── Helpers ──────────────────────────────────────────────────

def _safe_json(text: str) -> dict[str, Any]:
    """Parse JSON, falling back to first {...} block scan."""
    try:
        return json.loads(text)
    except (json.JSONDecodeError, TypeError):
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if m:
            try:
                return json.loads(m.group(0))
            except (json.JSONDecodeError, ValueError):
                pass
    return {}


def _extract_hcp_name(message: str) -> str:
    """Robust HCP name extractor for fallback mode."""
    dr = re.search(r"\bdr\.?\s+([A-Z][a-zA-Z]{1,20})\b", message, re.IGNORECASE)
    if dr:
        return "Dr. " + dr.group(1).title()
    verb = re.search(
        r"(?:met\s+with|met|visited|called|spoke\s+to|talked\s+to)\s+([A-Z][a-zA-Z]{1,20})\b",
        message,
    )
    if verb:
        return verb.group(1).title()
    nm = re.search(
        r"name\s+(?:was|is)(?: actually)?\s+([A-Z][a-zA-Z\s]{1,30}?)(?:\s+and|\s*[,.]|$)",
        message, re.IGNORECASE,
    )
    if nm:
        return nm.group(1).strip().title()
    return ""


# ─── LLM System Prompt ────────────────────────────────────────

_SYSTEM_PROMPT = (
    "You are an AI CRM copilot for life-science field representatives.\n"
    "Parse the user message and current form draft, then return ONLY valid JSON — "
    "no markdown, no explanation.\n\n"
    "JSON schema:\n"
    "{\n"
    '  "summary": "<one-sentence summary>",\n'
    '  "entities": {\n'
    '    "hcp_name": "<Dr. Lastname>",\n'
    '    "interaction_type": "<Meeting|Call|Email|Conference|Other>",\n'
    '    "interaction_date": "<YYYY-MM-DD>",\n'
    '    "interaction_time": "<HH:MM>",\n'
    '    "attendees": ["<name>"],\n'
    '    "topics_discussed": "<key topics>",\n'
    '    "materials_shared": ["<item>"],\n'
    '    "samples_distributed": ["<item>"],\n'
    '    "sentiment": "<Positive|Neutral|Negative>",\n'
    '    "outcomes": "<outcomes>",\n'
    '    "follow_up_actions": "<follow-up>",\n'
    '    "voice_note_summary": ""\n'
    "  },\n"
    '  "suggested_followups": ["<suggestion>"],\n'
    '  "reply": "<professional confirmation reflecting HCP name, interaction type, and key topic>"\n'
    "}\n\n"
    "CRITICAL EXTRACTION RULES:\n"
    "- interaction_date: Extract date from message. If user says 'today', use " + datetime.now().strftime("%Y-%m-%d") + ". "
    "Parse natural language dates (e.g., 'April 16' → 2026-04-16, 'yesterday' → previous day).\n"
    "- interaction_time: Extract time. If not mentioned, use empty string ''. Format: HH:MM (24-hour).\n"
    "- interaction_type: Determine type based on keywords:\n"
    "  * 'met', 'meeting', 'visit', 'in-person' → Meeting\n"
    "  * 'called', 'phone', 'call' → Call\n"
    "  * 'email', 'sent email' → Email\n"
    "  * 'conference', 'symposium', 'congress' → Conference\n"
    "  * Otherwise → Other\n\n"
    "Rules for 'reply' field:\n"
    "- Be professional and concise (1-2 sentences max)\n"
    "- Reference the HCP name and interaction type when available\n"
    "- Mention one key topic discussed if relevant\n"
    "- Examples:\n"
    '  - "Recorded meeting with Dr. Johnson on OncoBoost Phase III trial. Sentiment: Positive."\n'
    '  - "Updated interaction with Dr. Smith via email regarding clinical efficacy data."\n'
    "- Avoid generic responses like 'Got it'\n\n"
    "Other Rules:\n"
    "- For edits (sorry/actually/change/update/correction): copy unchanged fields "
    "from current_draft; only modify mentioned fields.\n"
    "- sentiment must be exactly: Positive, Neutral, or Negative.\n"
    "- interaction_type must be: Meeting, Call, Email, Conference, or Other.\n"
    "- All list fields must be JSON arrays.\n"
    "- If field not mentioned, return empty string '' or empty array [].\n"
)


def _call_groq(message: str, draft: dict[str, Any]) -> dict[str, Any]:
    """Call Google Gemini LLM and return parsed structured result."""
    if not settings.gemini_api_key:
        return {}
    
    genai.configure(api_key=settings.gemini_api_key)
    model = genai.GenerativeModel(
        "gemini-2.0-flash",
        generation_config=genai.types.GenerationConfig(
            response_mime_type="application/json"
        ),
    )
    
    payload = json.dumps({"message": message, "current_draft": draft}, default=str)
    prompt = _SYSTEM_PROMPT + "\n\nUser Input:\n" + payload
    
    try:
        response = model.generate_content(prompt)
        raw = response.text if response else ""
        print(f"✅ Gemini response received, length: {len(raw)}")
    except Exception as e:
        print(f"❌ ERROR calling Gemini: {e}")
        return {}
    
    parsed = _safe_json(raw)
    print(f"Parsed JSON: {parsed}")
    
    if parsed:
        # Coerce list fields
        entities = parsed.get("entities") or {}
        for lf in ("attendees", "materials_shared", "samples_distributed"):
            v = entities.get(lf, [])
            if isinstance(v, str):
                entities[lf] = [x.strip() for x in v.split(",") if x.strip()]
            elif not isinstance(v, list):
                entities[lf] = []
        parsed["entities"] = entities
        if not isinstance(parsed.get("suggested_followups"), list):
            parsed["suggested_followups"] = []
        
        # Ensure critical fields are always returned (even if empty)
        if "interaction_date" not in entities:
            entities["interaction_date"] = ""
        if "interaction_time" not in entities:
            entities["interaction_time"] = ""
        if "interaction_type" not in entities:
            entities["interaction_type"] = ""
    else:
        print(f"⚠️ No JSON parsed. Raw response preview: {raw[:200]}")
    return parsed


def _fallback(message: str, draft: dict[str, Any]) -> dict[str, Any]:
    """Rule-based fallback when Groq API key is absent."""
    low = message.lower()
    now = datetime.now()

    hcp_name = _extract_hcp_name(message) or draft.get("hcp_name", "")

    sentiment = draft.get("sentiment", "Neutral")
    for word, val in [("positive", "Positive"), ("negative", "Negative"), ("neutral", "Neutral")]:
        if word in low:
            sentiment = val
            break

    itype = draft.get("interaction_type", "Meeting")
    if "call" in low:
        itype = "Call"
    elif "email" in low:
        itype = "Email"
    elif "conference" in low:
        itype = "Conference"

    materials = list(draft.get("materials_shared") or [])
    for kw, lbl in [("brochure","Brochure"),("clinical pdf","Clinical PDF"),("pdf","Clinical PDF"),("leaflet","Leaflet"),("poster","Poster")]:
        if kw in low and lbl not in materials:
            materials.append(lbl)

    samples = list(draft.get("samples_distributed") or [])
    if "sample" in low:
        m = re.search(r"(\w+)\s+sample", message, re.IGNORECASE)
        lbl = (m.group(1).title() + " Sample") if m else "Product Sample"
        if lbl not in samples:
            samples.append(lbl)

    attendees = list(draft.get("attendees") or [])
    if hcp_name and hcp_name not in attendees:
        attendees.insert(0, hcp_name)

    topics = draft.get("topics_discussed", "") or message.strip()
    outcomes = draft.get("outcomes", "")
    if "interested" in low:
        outcomes = "HCP showed strong interest in the discussed product."
    follow_up = draft.get("follow_up_actions", "")
    if "follow" in low:
        follow_up = "Schedule a follow-up discussion."

    suggestions: list[str] = []
    if sentiment == "Positive":
        suggestions += ["Schedule follow-up meeting in 2 weeks", "Add HCP to advisory board invite list"]
    elif sentiment == "Negative":
        suggestions += ["Share softer educational summary", "Escalate to medical science liaison"]
    else:
        suggestions.append("Schedule check-in call in 1 month")
    if any(k in low for k in ["phase iii", "trial", "efficacy", "oncob"]):
        suggestions.append("Send OncoBoost Phase III PDF")

    is_edit = any(w in low for w in ["actually","sorry","change","update","correction","keep everything","wrong","mistake"])
    reply = (
        "✏️ Done! I updated the field you mentioned and kept everything else unchanged."
        if is_edit else
        "✅ Got it! I've extracted the details and filled the interaction form."
    )

    return {
        "summary": message.strip(),
        "entities": {
            "hcp_name": hcp_name,
            "interaction_type": itype,
            "interaction_date": draft.get("interaction_date") or now.strftime("%Y-%m-%d"),
            "interaction_time": draft.get("interaction_time") or now.strftime("%H:%M"),
            "attendees": attendees,
            "topics_discussed": topics,
            "materials_shared": materials,
            "samples_distributed": samples,
            "sentiment": sentiment,
            "outcomes": outcomes,
            "follow_up_actions": follow_up,
            "voice_note_summary": draft.get("voice_note_summary", ""),
        },
        "suggested_followups": suggestions,
        "reply": reply,
    }


def _invoke_llm(message: str, draft: dict[str, Any]) -> dict[str, Any]:
    result = _call_groq(message, draft)
    return result if result else _fallback(message, draft)


# ─── Node 0: route_node (sets mode in state) ──────────────────

def route_node(state: AgentState) -> AgentState:
    """
    Routing node — determines log vs edit mode.
    Must be a proper node (not just a router function) so that
    state["mode"] is persisted correctly in LangGraph state.
    """
    low = state["message"].lower()
    edit_signals = [
        "actually", "sorry", "change", "update", "correction",
        "instead", "keep everything", "wrong", "mistake", "fix",
        "modify", "rename", "replace",
    ]
    is_edit = any(sig in low for sig in edit_signals) and bool(state["draft"])
    return {**state, "mode": "edit" if is_edit else "log"}


def _route_to_extract(state: AgentState) -> str:
    return "extract_entities"


# ─── Tool 1: extract_entities ─────────────────────────────────

def extract_entities_tool(state: AgentState) -> AgentState:
    """
    Tool 1 – extract_entities
    Calls the Groq LLM (gemma2-9b-it) to parse the user's natural language
    message into structured CRM fields. In edit mode the LLM is instructed
    to preserve unchanged fields from the current draft.
    """
    state["tool_trace"].append("extract_entities")
    parsed = _invoke_llm(state["message"], state["draft"])
    state["parsed"] = parsed
    entities = parsed.get("entities") or {}
    merged = dict(state["draft"])
    for k, v in entities.items():
        if v not in ("", None, []):
            merged[k] = v
    merged["interaction_notes"] = parsed.get("summary", state["message"])
    state["draft_updates"] = merged
    return state


# ─── Tool 2: summarize ────────────────────────────────────────

def summarize_tool(state: AgentState) -> AgentState:
    """
    Tool 2 – summarize
    Uses the LLM-generated summary sentence to populate interaction_notes
    and (if empty) topics_discussed.
    """
    state["tool_trace"].append("summarize")
    summary = state["parsed"].get("summary") or state["message"]
    state["draft_updates"]["interaction_notes"] = summary
    if not state["draft_updates"].get("topics_discussed"):
        state["draft_updates"]["topics_discussed"] = summary
    return state


# ─── Tool 3: infer_sentiment ──────────────────────────────────

def infer_sentiment_tool(state: AgentState) -> AgentState:
    """
    Tool 3 – infer_sentiment
    Normalises sentiment to exactly Positive / Neutral / Negative.
    Falls back to keyword scanning if LLM returned unexpected value.
    """
    state["tool_trace"].append("infer_sentiment")
    raw = (state["draft_updates"].get("sentiment") or "Neutral").strip().title()
    if raw not in ("Positive", "Neutral", "Negative"):
        low = state["message"].lower()
        raw = "Positive" if "positive" in low else ("Negative" if "negative" in low else "Neutral")
    state["draft_updates"]["sentiment"] = raw
    return state


# ─── Tool 4: search_materials_or_samples ──────────────────────

def search_materials_tool(state: AgentState) -> AgentState:
    """
    Tool 4 – search_materials_or_samples
    Enriches materials_shared and samples_distributed.
    Adds context-driven items (e.g. clinical trial mention → Phase III PDF)
    on top of whatever the LLM already extracted.
    """
    state["tool_trace"].append("search_materials_or_samples")
    materials = list(state["draft_updates"].get("materials_shared") or [])
    samples   = list(state["draft_updates"].get("samples_distributed") or [])
    topics    = (state["draft_updates"].get("topics_discussed") or "").lower()
    msg_low   = state["message"].lower()

    # Context-inferred material
    if not materials:
        if any(k in topics for k in ["efficacy", "phase iii", "clinical", "trial", "oncob"]):
            materials.append("OncoBoost Phase III PDF")
        if "brochure" in msg_low:
            materials.append("Brochure")

    # Context-inferred sample
    if not samples and "sample" in msg_low:
        m = re.search(r"(\w+)\s+sample", state["message"], re.IGNORECASE)
        samples.append((m.group(1).title() + " Sample") if m else "OncoBoost Starter Sample")

    state["draft_updates"]["materials_shared"]    = materials
    state["draft_updates"]["samples_distributed"] = samples
    return state


# ─── Tool 5: suggest_followup ─────────────────────────────────

def suggest_followup_tool(state: AgentState) -> AgentState:
    """
    Tool 5 – suggest_followup
    Generates AI-powered follow-up suggestions combining LLM output
    with rule-based logic (sentiment + topics + materials).
    """
    state["tool_trace"].append("suggest_followup")
    llm_sugg  = list(state["parsed"].get("suggested_followups") or [])
    sentiment = state["draft_updates"].get("sentiment", "Neutral")
    topics    = (state["draft_updates"].get("topics_discussed") or "").lower()
    materials = state["draft_updates"].get("materials_shared", [])

    extras: list[str] = []
    if sentiment == "Positive":
        extras += ["Schedule follow-up meeting in 2 weeks", "Add HCP to advisory board invite list"]
        if materials:
            extras.append(f"Send follow-up on: {materials[0]}")
    elif sentiment == "Negative":
        extras += ["Share softer educational summary", "Escalate to medical science liaison"]
    else:
        extras.append("Schedule check-in call in 1 month")

    if any(k in topics for k in ["phase iii", "trial", "efficacy", "oncob"]):
        extras.append("Send OncoBoost Phase III PDF")

    combined = llm_sugg + [e for e in extras if e not in llm_sugg]
    state["draft_updates"]["ai_suggested_followups"] = list(dict.fromkeys(combined))
    return state


# ─── Tool 6: log_interaction ──────────────────────────────────

def log_interaction_tool(state: AgentState) -> AgentState:
    """
    Tool 6 – log_interaction
    Final node for NEW interactions.
    Sets the confirmation reply shown to the user in the chat panel.
    The actual DB save is triggered separately by the frontend Save button.
    """
    state["tool_trace"].append("log_interaction")
    state["reply"] = state["parsed"].get(
        "reply",
        "✅ Interaction logged! The form has been filled. Review and click Save.",
    )
    return state


# ─── Tool 7: edit_interaction ─────────────────────────────────

def edit_interaction_tool(state: AgentState) -> AgentState:
    """
    Tool 7 – edit_interaction
    Final node for EDITS to an existing draft.
    Only the mentioned fields are changed; all others are preserved.
    """
    state["tool_trace"].append("edit_interaction")
    state["reply"] = state["parsed"].get(
        "reply",
        "✏️ Done! I updated the fields you mentioned and kept everything else unchanged.",
    )
    return state


# ─── Conditional router after suggest_followup ────────────────

def action_router(state: AgentState) -> str:
    return "edit_interaction" if state["mode"] == "edit" else "log_interaction"


# ─── Build LangGraph ──────────────────────────────────────────

graph = StateGraph(AgentState)

graph.add_node("route_node",               route_node)
graph.add_node("extract_entities",         extract_entities_tool)
graph.add_node("summarize",                summarize_tool)
graph.add_node("infer_sentiment",          infer_sentiment_tool)
graph.add_node("search_materials_or_samples", search_materials_tool)
graph.add_node("suggest_followup",         suggest_followup_tool)
graph.add_node("log_interaction",          log_interaction_tool)
graph.add_node("edit_interaction",         edit_interaction_tool)

graph.set_entry_point("route_node")
graph.add_conditional_edges("route_node", _route_to_extract, {"extract_entities": "extract_entities"})
graph.add_edge("extract_entities",            "summarize")
graph.add_edge("summarize",                   "infer_sentiment")
graph.add_edge("infer_sentiment",             "search_materials_or_samples")
graph.add_edge("search_materials_or_samples", "suggest_followup")
graph.add_conditional_edges(
    "suggest_followup", action_router,
    {"log_interaction": "log_interaction", "edit_interaction": "edit_interaction"},
)
graph.add_edge("log_interaction",  END)
graph.add_edge("edit_interaction", END)

agent_app = graph.compile()


# ─── Public entry point ───────────────────────────────────────

def run_agent(message: str, draft: dict[str, Any] | None = None) -> dict[str, Any]:
    """Run the full LangGraph pipeline and return reply + updated draft + tool trace."""
    initial: AgentState = {
        "message":       message,
        "draft":         draft or {},
        "tool_trace":    [],
        "reply":         "",
        "draft_updates": {},
        "parsed":        {},
        "mode":          "log",
    }
    result = agent_app.invoke(initial)
    return {
        "reply":         result["reply"],
        "draft_updates": result["draft_updates"],
        "tool_trace":    result["tool_trace"],
    }
