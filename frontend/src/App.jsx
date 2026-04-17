import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import {
  askAssistant, clearBanner, fetchHcps, fetchInteractions,
  loadInteraction, resetEditor, saveInteraction, setChatInput,
  updateHcpProfile, updateInteraction, useDemoPrompt, applySuggestion,
  updateDraftField,
} from "./store";

/* ─── Sentiment icon ──────────────────────────────────────────── */
const SentimentIcon = ({ value }) => {
  if (value === "Positive") return <span className="senti-icon positive">😊</span>;
  if (value === "Negative") return <span className="senti-icon negative">😟</span>;
  return <span className="senti-icon neutral">😐</span>;
};

/* ─── Tool chip ──────────────────────────────────────────────── */
const ToolChip = ({ name }) => {
  const labels = {
    extract_entities: "🔍 Extract Entities",
    summarize: "📝 Summarize",
    infer_sentiment: "💡 Infer Sentiment",
    "search_materials_or_samples": "🔬 Search Materials",
    suggest_followup: "📅 Suggest Follow-up",
    log_interaction: "✅ Log Interaction",
    edit_interaction: "✏️ Edit Interaction",
  };
  return <span className="tool-chip">{labels[name] || name}</span>;
};

/* ─── Main App ───────────────────────────────────────────────── */
export default function App() {
  const dispatch = useDispatch();
  const { draft, chatInput, chatHistory, demoPrompts, toolTrace,
    interactions, hcps, selectedInteractionId, status, error, successMessage } = useSelector((s) => s.crm);

  const chatEndRef = useRef(null);
  const [profileForm, setProfileForm] = useState({ specialty: "", organization: "", territory: "" });

  const selectedHcp = hcps.find((h) => h.name.toLowerCase() === (draft.hcp_name || "").toLowerCase());
  const selectedInteraction = interactions.find((i) => i.id === selectedInteractionId) || null;

  useEffect(() => { dispatch(fetchInteractions()); dispatch(fetchHcps()); }, [dispatch]);
  useEffect(() => {
    setProfileForm({
      specialty: selectedHcp?.specialty || "",
      organization: selectedHcp?.organization || "",
      territory: selectedHcp?.territory || "",
    });
  }, [selectedHcp]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatHistory]);
  
  // Auto-dismiss banner after 3 seconds
  useEffect(() => {
    if (error || successMessage) {
      const timeout = setTimeout(() => dispatch(clearBanner()), 3000);
      return () => clearTimeout(timeout);
    }
  }, [error, successMessage, dispatch]);

  const handleSend = () => {
    if (!chatInput.trim() || status === "thinking") return;
    dispatch(askAssistant());
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleSave = () => {
    if (selectedInteractionId) dispatch(updateInteraction());
    else dispatch(saveInteraction(draft));
  };

  return (
    <div className="shell">
      {/* ── Banner ── */}
      {(error || successMessage) && (
        <div className={`banner ${error ? "banner-err" : "banner-ok"}`}>
          <span>{error || successMessage}</span>
          <button type="button" onClick={() => dispatch(clearBanner())}>✕</button>
        </div>
      )}

      <div className="page-title">⚕️ Log HCP Interaction</div>

      {/* ── Main grid ── */}
      <div className="main-grid">

        {/* ═══════════════ LEFT: FORM PANEL ═══════════════ */}
        <section className="card form-card">
          <div className="card-header">
            <span>Interaction Details</span>
            <span className={`mode-badge ${selectedInteractionId ? "edit-mode" : "new-mode"}`}>
              {selectedInteractionId ? `Editing #${selectedInteractionId}` : "New Draft"}
            </span>
          </div>

          <div className="form-body">
            {/* Row 1: HCP Name + Type */}
            <div className="row-2">
              <div className="field">
                <label>HCP Name</label>
                <select
                  className="editable-input"
                  value={draft.hcp_name || ""}
                  onChange={(e) => dispatch(updateDraftField({ field: "hcp_name", value: e.target.value }))}
                >
                  <option value="">Search or select HCP…</option>
                  {hcps.map((h) => (
                    <option key={h.id} value={h.name}>{h.name}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Interaction Type</label>
                <select
                  className="editable-input"
                  value={draft.interaction_type || "Meeting"}
                  onChange={(e) => dispatch(updateDraftField({ field: "interaction_type", value: e.target.value }))}
                >
                  <option>Meeting</option>
                  <option>Call</option>
                  <option>Email</option>
                  <option>Site Visit</option>
                  <option>Conference</option>
                </select>
              </div>
            </div>

            {/* Row 2: Date + Time */}
            <div className="row-2">
              <div className="field">
                <label>Date</label>
                <input
                  type="date"
                  className="editable-input"
                  value={draft.interaction_date || ""}
                  onChange={(e) => dispatch(updateDraftField({ field: "interaction_date", value: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>Time</label>
                <input
                  type="time"
                  className="editable-input"
                  value={draft.interaction_time || ""}
                  onChange={(e) => dispatch(updateDraftField({ field: "interaction_time", value: e.target.value }))}
                />
              </div>
            </div>

            {/* Attendees */}
            <div className="field">
              <label>Attendees</label>
              <textarea
                className="editable-input"
                placeholder="Enter names (comma-separated)…"
                value={draft.attendees?.join(", ") || ""}
                onChange={(e) => {
                  const names = e.target.value.split(",").map(n => n.trim()).filter(Boolean);
                  dispatch(updateDraftField({ field: "attendees", value: names }));
                }}
                rows={2}
              />
            </div>

            {/* Topics */}
            <div className="field">
              <label>Topics Discussed</label>
              <textarea
                className="editable-input"
                placeholder="Enter key discussion points…"
                value={draft.topics_discussed || ""}
                onChange={(e) => dispatch(updateDraftField({ field: "topics_discussed", value: e.target.value }))}
                rows={3}
              />
            </div>

            {/* Materials */}
            <div className="subsection">
              <div className="subsection-title">Materials Shared / Samples Distributed</div>

              <div className="resource-box">
                <div className="field">
                  <label>Materials Shared</label>
                  <textarea
                    className="editable-input"
                    placeholder="Enter materials (comma-separated)…"
                    value={draft.materials_shared?.join(", ") || ""}
                    onChange={(e) => {
                      const items = e.target.value.split(",").map(m => m.trim()).filter(Boolean);
                      dispatch(updateDraftField({ field: "materials_shared", value: items }));
                    }}
                    rows={2}
                  />
                </div>
              </div>

              <div className="resource-box mt-8">
                <div className="field">
                  <label>Samples Distributed</label>
                  <textarea
                    className="editable-input"
                    placeholder="Enter samples (comma-separated)…"
                    value={draft.samples_distributed?.join(", ") || ""}
                    onChange={(e) => {
                      const items = e.target.value.split(",").map(s => s.trim()).filter(Boolean);
                      dispatch(updateDraftField({ field: "samples_distributed", value: items }));
                    }}
                    rows={2}
                  />
                </div>
              </div>
            </div>

            {/* Sentiment */}
            <div className="field">
              <label>Observed/Inferred HCP Sentiment</label>
              <div className="sentiment-row">
                {["Positive", "Neutral", "Negative"].map((v) => (
                  <label key={v} className={`senti-option ${draft.sentiment === v ? "senti-active" : ""}`}>
                    <input
                      type="radio"
                      name="sentiment"
                      value={v}
                      checked={draft.sentiment === v}
                      onChange={() => dispatch(updateDraftField({ field: "sentiment", value: v }))}
                    />
                    <span className={`radio-circle ${draft.sentiment === v ? "radio-on" : ""}`}>
                      {draft.sentiment === v && <span className="radio-dot" />}
                    </span>
                    <SentimentIcon value={v} />
                    {v}
                  </label>
                ))}
              </div>
            </div>

            {/* Outcomes */}
            <div className="field">
              <label>Outcomes</label>
              <textarea
                className="editable-input"
                placeholder="Key outcomes or agreements…"
                value={draft.outcomes || ""}
                onChange={(e) => dispatch(updateDraftField({ field: "outcomes", value: e.target.value }))}
                rows={2}
              />
            </div>

            {/* Follow-up */}
            <div className="field">
              <label>Follow-up Actions</label>
              <textarea
                className="editable-input"
                placeholder="Enter next steps or tasks…"
                value={draft.follow_up_actions || ""}
                onChange={(e) => dispatch(updateDraftField({ field: "follow_up_actions", value: e.target.value }))}
                rows={2}
              />
            </div>

            {/* AI suggested follow-ups */}
            {draft.ai_suggested_followups?.length > 0 && (
              <div className="ai-followups">
                <div className="ai-followups-title">⚡ AI Suggested Follow-ups:</div>
                {draft.ai_suggested_followups.map((item) => (
                  <button
                    key={item} type="button"
                    className="followup-item"
                    onClick={() => dispatch(applySuggestion(item))}
                    title="Click to append to Follow-up Actions"
                  >
                    + {item}
                  </button>
                ))}
              </div>
            )}

            {/* Action buttons */}
            <div className="action-row">
              <button type="button" className="btn-ghost" onClick={() => dispatch(resetEditor())}>
                🗒 New Draft
              </button>
              <button
                type="button" className="btn-save"
                onClick={handleSave} disabled={status === "saving"}
              >
                {status === "saving" ? "Saving…" : selectedInteractionId ? "💾 Update" : "💾 Save"}
              </button>
            </div>
          </div>
        </section>

        {/* ═══════════════ RIGHT: AI ASSISTANT ═══════════════ */}
        <aside className="card ai-card">
          <div className="card-header">
            <div className="ai-header-left">
              <div className="ai-avatar">🤖</div>
              <div>
                <div className="ai-title">AI Assistant</div>
              </div>
            </div>
          </div>

          {/* Chat history */}
          <div className="chat-history">
            {chatHistory.length === 0 && (
              <div className="chat-placeholder">
                <div className="chat-placeholder-icon">💬</div>
                <p>Log interaction details here (e.g., <em>"Met Dr. Smith, discussed Product X efficacy, positive sentiment, shared brochure"</em>) or ask for help.</p>
                <p className="hint">The AI will automatically fill the form on the left.</p>
              </div>
            )}

            {chatHistory.map((msg, idx) => (
              <div key={idx} className={`msg ${msg.role}`}>
                <div className="msg-bubble">
                  {msg.role === "assistant" && <div className="msg-avatar">🤖</div>}
                  <div className="msg-content">
                    <p>{msg.text}</p>
                    {msg.role === "assistant" && msg.tools?.length > 0 && (
                      <div className="tool-trace">
                        {msg.tools.map((t) => <ToolChip key={t} name={t} />)}
                      </div>
                    )}
                  </div>
                  {msg.role === "user" && <div className="msg-avatar user-av">👤</div>}
                </div>
              </div>
            ))}

            {status === "thinking" && (
              <div className="msg assistant">
                <div className="msg-bubble">
                  <div className="msg-avatar">🤖</div>
                  <div className="msg-content">
                    <div className="typing-dots"><span/><span/><span/></div>
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input area */}
          <div className="chat-input-area">
            <textarea
              rows={3}
              placeholder="Describe interaction… (e.g. 'Met Dr. Sharma, positive, shared brochure')"
              value={chatInput}
              onChange={(e) => dispatch(setChatInput(e.target.value))}
              onKeyDown={handleKeyDown}
              disabled={status === "thinking"}
            />
            <button
              type="button" className="btn-log"
              onClick={handleSend}
              disabled={!chatInput.trim() || status === "thinking"}
            >
              {status === "thinking" ? "…" : "⚡ Log"}
            </button>
          </div>
        </aside>
      </div>

      {/* ═══════════════ HCP MASTER CONTEXT ═══════════════ */}
      {selectedHcp && (
        <section className="card hcp-card">
          <div className="card-header">HCP Master Record — {selectedHcp.name}</div>
          <div className="hcp-body">
            <div className="hcp-stat"><span>Past Interactions</span><strong>{selectedHcp.interaction_count}</strong></div>
            <div className="hcp-fields">
              {[["specialty", "Specialty", "e.g. Oncology"],
                ["organization", "Organization", "Hospital or clinic"],
                ["territory", "Territory", "Assigned territory"]].map(([k, lbl, ph]) => (
                <label key={k} className="hcp-field">
                  <span>{lbl}</span>
                  <input
                    type="text" placeholder={ph}
                    value={profileForm[k]}
                    onChange={(e) => setProfileForm((f) => ({ ...f, [k]: e.target.value }))}
                  />
                </label>
              ))}
            </div>
            <button
              type="button" className="btn-sm save-hcp"
              onClick={() => dispatch(updateHcpProfile({ hcpId: selectedHcp.id, payload: profileForm }))}
              disabled={status === "saving"}
            >
              {status === "saving" ? "Saving…" : "Save HCP Profile"}
            </button>
          </div>
        </section>
      )}

      {/* ═══════════════ HISTORY ═══════════════ */}
      <section className="card history-card">
        <div className="card-header">Recent Saved Interactions</div>
        <div className="history-list">
          {interactions.length === 0 && (
            <div className="empty-state">No interactions yet. Log with AI → click Save.</div>
          )}
          {interactions.map((it) => (
            <button
              key={it.id} type="button"
              className={`history-item ${selectedInteractionId === it.id ? "history-active" : ""}`}
              onClick={() => dispatch(loadInteraction(it))}
            >
              <div className="history-top">
                <strong>{it.hcp_name || "Unnamed HCP"}</strong>
                <span className="history-id">#{it.id}</span>
              </div>
              <div className="history-meta">
                {it.interaction_type} · {it.interaction_date} · {it.interaction_time}
              </div>
              <div className="history-preview">{it.topics_discussed || it.interaction_notes || "No summary."}</div>
              <div className={`history-badge senti-${(it.sentiment || "Neutral").toLowerCase()}`}>
                {it.sentiment || "Neutral"}
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* ═══════════════ RECORD DETAIL ═══════════════ */}
      {selectedInteraction && (
        <section className="card record-card">
          <div className="card-header">
            <span>Selected Record — #{selectedInteraction.id}</span>
            <button
              type="button"
              className="btn-download"
              onClick={async () => {
                const element = document.querySelector(".record-card");
                if (!element) return;
                
                try {
                  const canvas = await html2canvas(element, { scale: 2 });
                  const imgData = canvas.toDataURL("image/png");
                  const pdf = new jsPDF("p", "mm", "a4");
                  const imgWidth = 190;
                  const imgHeight = (canvas.height * imgWidth) / canvas.width;
                  pdf.addImage(imgData, "PNG", 10, 10, imgWidth, imgHeight);
                  pdf.save(`interaction_${selectedInteraction.id}_${selectedInteraction.interaction_date}.pdf`);
                } catch (error) {
                  console.error("PDF generation failed:", error);
                }
              }}
              title="Download record as PDF"
            >
              ⬇️ Download PDF
            </button>
          </div>
          <div className="record-grid">
            {[
              ["HCP", selectedInteraction.hcp_name],
              ["Type", selectedInteraction.interaction_type],
              ["Date", selectedInteraction.interaction_date],
              ["Time", selectedInteraction.interaction_time],
              ["Sentiment", selectedInteraction.sentiment],
            ].map(([l, v]) => (
              <div key={l} className="rec-cell">
                <span className="rec-label">{l}</span>
                <div className="rec-val">{v || "—"}</div>
              </div>
            ))}
            <div className="rec-cell full">
              <span className="rec-label">Topics</span>
              <div className="rec-val">{selectedInteraction.topics_discussed || "—"}</div>
            </div>
            <div className="rec-cell full">
              <span className="rec-label">Outcomes</span>
              <div className="rec-val">{selectedInteraction.outcomes || "—"}</div>
            </div>
            <div className="rec-cell full">
              <span className="rec-label">Follow-up</span>
              <div className="rec-val">{selectedInteraction.follow_up_actions || "—"}</div>
            </div>
            <div className="rec-cell full">
              <span className="rec-label">Materials</span>
              <div className="rec-val">{selectedInteraction.materials_shared?.join(", ") || "—"}</div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
