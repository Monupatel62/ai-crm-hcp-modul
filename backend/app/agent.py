"""
LangGraph AI Agent for the AI-First CRM HCP module.

Implements the assignment-required workflow with Groq and `gemma2-9b-it`.
"""

import json
import re
from datetime import datetime, timedelta
from typing import Any, TypedDict

import requests
from langgraph.graph import END, StateGraph

from .config import settings


class AgentState(TypedDict):
    message: str
    draft: dict[str, Any]
    tool_trace: list[str]
    reply: str
    draft_updates: dict[str, Any]
    parsed: dict[str, Any]
    mode: str


def _safe_json(text: str) -> dict[str, Any]:
    try:
        return json.loads(text)
    except (json.JSONDecodeError, TypeError):
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if not match:
            return {}
        try:
            return json.loads(match.group(0))
        except (json.JSONDecodeError, ValueError):
            return {}


def _extract_hcp_name(message: str) -> str:
    dr = re.search(r"\bdr\.?\s+([A-Z][a-zA-Z]{1,20})\b", message, re.IGNORECASE)
    if dr:
        return "Dr. " + dr.group(1).title()

    verb = re.search(
        r"(?:met\s+with|met|visited|called|spoke\s+to|talked\s+to)\s+([A-Z][a-zA-Z]{1,20})\b",
        message,
    )
    if verb:
        return verb.group(1).title()

    name_match = re.search(
        r"name\s+(?:was|is)(?: actually)?\s+([A-Z][a-zA-Z\s]{1,30}?)(?:\s+and|\s*[,.]|$)",
        message,
        re.IGNORECASE,
    )
    if name_match:
        return name_match.group(1).strip().title()
    return ""


def _resolve_relative_date(message: str) -> str:
    low = message.lower()
    today = datetime.now().date()
    if "today" in low:
        return today.isoformat()
    if "yesterday" in low:
        return (today - timedelta(days=1)).isoformat()
    if "tomorrow" in low:
        return (today + timedelta(days=1)).isoformat()
    return ""


_SYSTEM_PROMPT = (
    "You are an AI CRM copilot for life-science field representatives.\n"
    "Return only valid JSON. No markdown. No explanation.\n\n"
    "Schema:\n"
    "{\n"
    '  "summary": "<one-sentence summary>",\n'
    '  "entities": {\n'
    '    "hcp_name": "<Dr. Lastname>",\n'
    '    "interaction_type": "<Meeting|Call|Email|Conference|Site Visit|Other>",\n'
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
    '  "reply": "<professional confirmation referencing the HCP and activity>"\n'
    "}\n\n"
    "Rules:\n"
    f"- If user says today, use {datetime.now().date().isoformat()}.\n"
    "- Parse natural language dates into YYYY-MM-DD where possible.\n"
    "- Parse time into 24-hour HH:MM.\n"
    "- Interaction type mapping:\n"
    "  met/meeting/in-person -> Meeting\n"
    "  call/phone/spoke -> Call\n"
    "  email/mail -> Email\n"
    "  conference/symposium/congress -> Conference\n"
    "  site visit/hospital visit/clinic visit -> Site Visit\n"
    "  otherwise -> Other\n"
    "- For edit requests, preserve unchanged fields from current_draft.\n"
    "- All list fields must be arrays.\n"
    "- Sentiment must be Positive, Neutral, or Negative.\n"
    "- If a field is not mentioned, return empty string or empty array.\n"
)


def _call_groq(message: str, draft: dict[str, Any]) -> dict[str, Any]:
    if not settings.groq_api_key:
        return {}

    payload = json.dumps({"message": message, "current_draft": draft}, default=str)
    response = requests.post(
        "https://api.groq.com/openai/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {settings.groq_api_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": settings.groq_model,
            "temperature": 0.1,
            "messages": [
                {
                    "role": "system",
                    "content": "Return JSON only for CRM extraction.",
                },
                {
                    "role": "user",
                    "content": _SYSTEM_PROMPT + "\n\nUser Input:\n" + payload,
                },
            ],
        },
        timeout=30,
    )
    response.raise_for_status()

    raw = (
        response.json()
        .get("choices", [{}])[0]
        .get("message", {})
        .get("content", "")
    )
    parsed = _safe_json(raw)
    if not parsed:
        return {}

    entities = parsed.get("entities") or {}
    for list_field in ("attendees", "materials_shared", "samples_distributed"):
        value = entities.get(list_field, [])
        if isinstance(value, str):
            entities[list_field] = [item.strip() for item in value.split(",") if item.strip()]
        elif not isinstance(value, list):
            entities[list_field] = []

    parsed["entities"] = entities
    if not isinstance(parsed.get("suggested_followups"), list):
        parsed["suggested_followups"] = []
    entities.setdefault("interaction_date", "")
    entities.setdefault("interaction_time", "")
    entities.setdefault("interaction_type", "")
    return parsed


def _fallback(message: str, draft: dict[str, Any]) -> dict[str, Any]:
    low = message.lower()
    now = datetime.now()

    hcp_name = _extract_hcp_name(message) or draft.get("hcp_name", "")

    sentiment = draft.get("sentiment", "Neutral")
    for word, value in [("positive", "Positive"), ("negative", "Negative"), ("neutral", "Neutral")]:
        if word in low:
            sentiment = value
            break

    interaction_type = draft.get("interaction_type", "Meeting")
    if any(keyword in low for keyword in ["site visit", "hospital visit", "clinic visit"]):
        interaction_type = "Site Visit"
    elif "conference" in low or "symposium" in low or "congress" in low:
        interaction_type = "Conference"
    elif "email" in low:
        interaction_type = "Email"
    elif "call" in low or "phone" in low:
        interaction_type = "Call"
    elif "meeting" in low or "met " in low or "visited" in low:
        interaction_type = "Meeting"

    materials = list(draft.get("materials_shared") or [])
    for keyword, label in [
        ("brochure", "Brochure"),
        ("clinical pdf", "Clinical PDF"),
        ("pdf", "Clinical PDF"),
        ("leaflet", "Leaflet"),
        ("deck", "Product Deck"),
        ("slide", "Clinical Slides"),
    ]:
        if keyword in low and label not in materials:
            materials.append(label)

    samples = list(draft.get("samples_distributed") or [])
    if "sample" in low:
        match = re.search(r"(\w+)\s+sample", message, re.IGNORECASE)
        sample_label = (match.group(1).title() + " Sample") if match else "Product Sample"
        if sample_label not in samples:
            samples.append(sample_label)

    attendees = list(draft.get("attendees") or [])
    if hcp_name and hcp_name not in attendees:
        attendees.insert(0, hcp_name)

    topics = draft.get("topics_discussed", "") or message.strip()
    outcomes = draft.get("outcomes", "")
    if "interested" in low:
        outcomes = "HCP showed strong interest in the discussed therapy."

    follow_up = draft.get("follow_up_actions", "")
    if "follow" in low and not follow_up:
        follow_up = "Schedule a follow-up discussion."

    interaction_date = draft.get("interaction_date") or _resolve_relative_date(message) or now.strftime("%Y-%m-%d")
    interaction_time = draft.get("interaction_time") or now.strftime("%H:%M")

    suggestions: list[str] = []
    if sentiment == "Positive":
        suggestions.extend(["Schedule follow-up meeting in 2 weeks", "Share clinical evidence pack"])
    elif sentiment == "Negative":
        suggestions.extend(["Escalate to medical science liaison", "Send concise objection-handling summary"])
    else:
        suggestions.append("Schedule check-in call in 1 month")
    if any(keyword in low for keyword in ["phase iii", "trial", "efficacy", "oncob"]):
        suggestions.append("Send OncoBoost Phase III evidence summary")

    is_edit = any(word in low for word in ["actually", "sorry", "change", "update", "correction", "wrong", "mistake"])
    reply = (
        "Updated the interaction draft and preserved the unchanged fields."
        if is_edit
        else "Captured the interaction details. You can save directly or refine the draft."
    )

    return {
        "summary": message.strip(),
        "entities": {
            "hcp_name": hcp_name,
            "interaction_type": interaction_type,
            "interaction_date": interaction_date,
            "interaction_time": interaction_time,
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
    try:
        result = _call_groq(message, draft)
    except Exception as exc:
        print(f"Groq request failed: {exc}")
        result = {}
    return result if result else _fallback(message, draft)


def route_node(state: AgentState) -> AgentState:
    low = state["message"].lower()
    edit_signals = [
        "actually",
        "sorry",
        "change",
        "update",
        "correction",
        "instead",
        "keep everything",
        "wrong",
        "mistake",
        "fix",
        "modify",
        "rename",
        "replace",
    ]
    is_edit = any(signal in low for signal in edit_signals) and bool(state["draft"])
    return {**state, "mode": "edit" if is_edit else "log"}


def _route_to_extract(state: AgentState) -> str:
    return "extract_entities"


def extract_entities_tool(state: AgentState) -> AgentState:
    state["tool_trace"].append("extract_entities")
    parsed = _invoke_llm(state["message"], state["draft"])
    state["parsed"] = parsed

    entities = parsed.get("entities") or {}
    merged = dict(state["draft"])
    for key, value in entities.items():
        if value not in ("", None, []):
            merged[key] = value

    merged["interaction_notes"] = parsed.get("summary", state["message"])
    state["draft_updates"] = merged
    return state


def summarize_tool(state: AgentState) -> AgentState:
    state["tool_trace"].append("summarize")
    summary = state["parsed"].get("summary") or state["message"]
    state["draft_updates"]["interaction_notes"] = summary
    if not state["draft_updates"].get("topics_discussed"):
        state["draft_updates"]["topics_discussed"] = summary
    return state


def infer_sentiment_tool(state: AgentState) -> AgentState:
    state["tool_trace"].append("infer_sentiment")
    raw = (state["draft_updates"].get("sentiment") or "Neutral").strip().title()
    if raw not in ("Positive", "Neutral", "Negative"):
        low = state["message"].lower()
        raw = "Positive" if "positive" in low else ("Negative" if "negative" in low else "Neutral")
    state["draft_updates"]["sentiment"] = raw
    return state


def search_materials_tool(state: AgentState) -> AgentState:
    state["tool_trace"].append("search_materials_or_samples")
    materials = list(state["draft_updates"].get("materials_shared") or [])
    samples = list(state["draft_updates"].get("samples_distributed") or [])
    topics = (state["draft_updates"].get("topics_discussed") or "").lower()
    message = state["message"].lower()

    if not materials:
        if any(keyword in topics for keyword in ["efficacy", "phase iii", "clinical", "trial", "oncob"]):
            materials.append("OncoBoost Phase III PDF")
        if "brochure" in message:
            materials.append("Brochure")

    if not samples and "sample" in message:
        match = re.search(r"(\w+)\s+sample", state["message"], re.IGNORECASE)
        samples.append((match.group(1).title() + " Sample") if match else "OncoBoost Starter Sample")

    state["draft_updates"]["materials_shared"] = materials
    state["draft_updates"]["samples_distributed"] = samples
    return state


def suggest_followup_tool(state: AgentState) -> AgentState:
    state["tool_trace"].append("suggest_followup")
    llm_suggestions = list(state["parsed"].get("suggested_followups") or [])
    sentiment = state["draft_updates"].get("sentiment", "Neutral")
    topics = (state["draft_updates"].get("topics_discussed") or "").lower()
    materials = state["draft_updates"].get("materials_shared", [])

    extras: list[str] = []
    if sentiment == "Positive":
        extras.extend(["Schedule follow-up meeting in 2 weeks", "Add HCP to speaker program shortlist"])
        if materials:
            extras.append(f"Send follow-up on: {materials[0]}")
    elif sentiment == "Negative":
        extras.extend(["Share objection-handling summary", "Escalate to medical science liaison"])
    else:
        extras.append("Schedule check-in call in 1 month")

    if any(keyword in topics for keyword in ["phase iii", "trial", "efficacy", "oncob"]):
        extras.append("Send OncoBoost Phase III evidence summary")

    combined = llm_suggestions + [item for item in extras if item not in llm_suggestions]
    state["draft_updates"]["ai_suggested_followups"] = list(dict.fromkeys(combined))
    return state


def log_interaction_tool(state: AgentState) -> AgentState:
    state["tool_trace"].append("log_interaction")
    state["reply"] = state["parsed"].get(
        "reply",
        "Interaction draft prepared. Review it in the structured form and click Save.",
    )
    return state


def edit_interaction_tool(state: AgentState) -> AgentState:
    state["tool_trace"].append("edit_interaction")
    state["reply"] = state["parsed"].get(
        "reply",
        "Draft updated. The fields you did not mention were preserved.",
    )
    return state


def action_router(state: AgentState) -> str:
    return "edit_interaction" if state["mode"] == "edit" else "log_interaction"


graph = StateGraph(AgentState)
graph.add_node("route_node", route_node)
graph.add_node("extract_entities", extract_entities_tool)
graph.add_node("summarize", summarize_tool)
graph.add_node("infer_sentiment", infer_sentiment_tool)
graph.add_node("search_materials_or_samples", search_materials_tool)
graph.add_node("suggest_followup", suggest_followup_tool)
graph.add_node("log_interaction", log_interaction_tool)
graph.add_node("edit_interaction", edit_interaction_tool)

graph.set_entry_point("route_node")
graph.add_conditional_edges("route_node", _route_to_extract, {"extract_entities": "extract_entities"})
graph.add_edge("extract_entities", "summarize")
graph.add_edge("summarize", "infer_sentiment")
graph.add_edge("infer_sentiment", "search_materials_or_samples")
graph.add_edge("search_materials_or_samples", "suggest_followup")
graph.add_conditional_edges(
    "suggest_followup",
    action_router,
    {"log_interaction": "log_interaction", "edit_interaction": "edit_interaction"},
)
graph.add_edge("log_interaction", END)
graph.add_edge("edit_interaction", END)

agent_app = graph.compile()


def run_agent(message: str, draft: dict[str, Any] | None = None) -> dict[str, Any]:
    initial: AgentState = {
        "message": message,
        "draft": draft or {},
        "tool_trace": [],
        "reply": "",
        "draft_updates": {},
        "parsed": {},
        "mode": "log",
    }
    result = agent_app.invoke(initial)
    return {
        "reply": result["reply"],
        "draft_updates": result["draft_updates"],
        "tool_trace": result["tool_trace"],
    }
