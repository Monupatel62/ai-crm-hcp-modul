import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import {
  applySuggestion,
  askAssistant,
  clearBanner,
  fetchHcps,
  fetchInteractions,
  loadInteraction,
  resetEditor,
  saveInteraction,
  setChatInput,
  updateDraftField,
  updateHcpProfile,
  updateInteraction,
  useDemoPrompt,
} from "./store";

const SentimentIcon = ({ value }) => {
  if (value === "Positive") return <span className="senti-icon positive">😊</span>;
  if (value === "Negative") return <span className="senti-icon negative">😟</span>;
  return <span className="senti-icon neutral">😐</span>;
};

const ToolChip = ({ name }) => {
  const labels = {
    extract_entities: "Extract Entities",
    summarize: "Summarize",
    infer_sentiment: "Infer Sentiment",
    search_materials_or_samples: "Search Materials",
    suggest_followup: "Suggest Follow-up",
    log_interaction: "Log Interaction",
    edit_interaction: "Edit Interaction",
  };
  return <span className="tool-chip">{labels[name] || name}</span>;
};

export default function App() {
  const dispatch = useDispatch();
  const {
    draft,
    chatInput,
    chatHistory,
    demoPrompts,
    interactions,
    hcps,
    selectedInteractionId,
    status,
    error,
    successMessage,
  } = useSelector((state) => state.crm);

  const chatEndRef = useRef(null);
  const [profileForm, setProfileForm] = useState({
    specialty: "",
    organization: "",
    territory: "",
  });

  const selectedHcp = hcps.find(
    (hcp) => hcp.name.toLowerCase() === (draft.hcp_name || "").toLowerCase(),
  );
  const selectedInteraction =
    interactions.find((interaction) => interaction.id === selectedInteractionId) || null;

  useEffect(() => {
    dispatch(fetchInteractions());
    dispatch(fetchHcps());
  }, [dispatch]);

  useEffect(() => {
    setProfileForm({
      specialty: selectedHcp?.specialty || "",
      organization: selectedHcp?.organization || "",
      territory: selectedHcp?.territory || "",
    });
  }, [selectedHcp]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  useEffect(() => {
    if (!error && !successMessage) return undefined;
    const timeout = setTimeout(() => dispatch(clearBanner()), 3000);
    return () => clearTimeout(timeout);
  }, [dispatch, error, successMessage]);

  const handleSend = () => {
    if (!chatInput.trim() || status === "thinking") return;
    dispatch(askAssistant());
  };

  const handleSave = () => {
    if (selectedInteractionId) dispatch(updateInteraction());
    else dispatch(saveInteraction(draft));
  };

  const handlePdfDownload = async () => {
    const element = document.querySelector(".record-card");
    if (!element || !selectedInteraction) return;

    try {
      const canvas = await html2canvas(element, { scale: 2 });
      const image = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const width = 190;
      const height = (canvas.height * width) / canvas.width;
      pdf.addImage(image, "PNG", 10, 10, width, height);
      pdf.save(`interaction_${selectedInteraction.id}_${selectedInteraction.interaction_date}.pdf`);
    } catch (downloadError) {
      console.error("PDF generation failed:", downloadError);
    }
  };

  return (
    <div className="shell">
      {(error || successMessage) && (
        <div className={`banner ${error ? "banner-err" : "banner-ok"}`}>
          <span>{error || successMessage}</span>
          <button type="button" onClick={() => dispatch(clearBanner())}>
            ×
          </button>
        </div>
      )}

      <div className="page-title">Log HCP Interaction</div>

      <section className="entry-modes">
        <div className="entry-mode-card">
          <span className="entry-mode-kicker">Mode 1</span>
          <h2>Structured form logging</h2>
          <p>
            Reps can type or edit interaction fields directly and save without relying on chat.
          </p>
        </div>
        <div className="entry-mode-card">
          <span className="entry-mode-kicker">Mode 2</span>
          <h2>Conversational AI logging</h2>
          <p>
            Reps can describe the interaction in natural language and let LangGraph update the draft.
          </p>
        </div>
      </section>

      <div className="main-grid">
        <section className="card form-card">
          <div className="card-header">
            <div>
              <div>Interaction Details</div>
              <div className="card-subtitle">
                Every field is editable. You can log from the form, the chat panel, or both.
              </div>
            </div>
            <span className={`mode-badge ${selectedInteractionId ? "edit-mode" : "new-mode"}`}>
              {selectedInteractionId ? `Editing #${selectedInteractionId}` : "New Draft"}
            </span>
          </div>

          <div className="form-body">
            <div className="row-2">
              <div className="field">
                <label>HCP Name</label>
                <select
                  className="editable-input"
                  value={draft.hcp_name || ""}
                  onChange={(event) =>
                    dispatch(updateDraftField({ field: "hcp_name", value: event.target.value }))
                  }
                >
                  <option value="">Search or select HCP...</option>
                  {hcps.map((hcp) => (
                    <option key={hcp.id} value={hcp.name}>
                      {hcp.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Interaction Type</label>
                <select
                  className="editable-input"
                  value={draft.interaction_type || "Meeting"}
                  onChange={(event) =>
                    dispatch(
                      updateDraftField({ field: "interaction_type", value: event.target.value }),
                    )
                  }
                >
                  <option>Meeting</option>
                  <option>Call</option>
                  <option>Email</option>
                  <option>Site Visit</option>
                  <option>Conference</option>
                  <option>Other</option>
                </select>
              </div>
            </div>

            <div className="row-2">
              <div className="field">
                <label>Date</label>
                <input
                  type="date"
                  className="editable-input"
                  value={draft.interaction_date || ""}
                  onChange={(event) =>
                    dispatch(
                      updateDraftField({ field: "interaction_date", value: event.target.value }),
                    )
                  }
                />
              </div>
              <div className="field">
                <label>Time</label>
                <input
                  type="time"
                  className="editable-input"
                  value={draft.interaction_time || ""}
                  onChange={(event) =>
                    dispatch(
                      updateDraftField({ field: "interaction_time", value: event.target.value }),
                    )
                  }
                />
              </div>
            </div>

            <div className="field">
              <label>Attendees</label>
              <textarea
                className="editable-input"
                rows={2}
                placeholder="Enter attendee names separated by commas"
                value={draft.attendees?.join(", ") || ""}
                onChange={(event) =>
                  dispatch({
                    type: updateDraftField.type,
                    payload: {
                      field: "attendees",
                      value: event.target.value
                        .split(",")
                        .map((name) => name.trim())
                        .filter(Boolean),
                    },
                  })
                }
              />
            </div>

            <div className="field">
              <label>Topics Discussed</label>
              <textarea
                className="editable-input"
                rows={3}
                placeholder="Discussed therapy area, objections, clinical data, formulary questions..."
                value={draft.topics_discussed || ""}
                onChange={(event) =>
                  dispatch(
                    updateDraftField({ field: "topics_discussed", value: event.target.value }),
                  )
                }
              />
            </div>

            <div className="subsection">
              <div className="subsection-title">Materials Shared and Samples Distributed</div>

              <div className="resource-box">
                <div className="field">
                  <label>Materials Shared</label>
                  <textarea
                    className="editable-input"
                    rows={2}
                    placeholder="Brochure, slide deck, clinical PDF..."
                    value={draft.materials_shared?.join(", ") || ""}
                    onChange={(event) =>
                      dispatch({
                        type: updateDraftField.type,
                        payload: {
                          field: "materials_shared",
                          value: event.target.value
                            .split(",")
                            .map((item) => item.trim())
                            .filter(Boolean),
                        },
                      })
                    }
                  />
                </div>
              </div>

              <div className="resource-box mt-8">
                <div className="field">
                  <label>Samples Distributed</label>
                  <textarea
                    className="editable-input"
                    rows={2}
                    placeholder="Starter packs, product samples..."
                    value={draft.samples_distributed?.join(", ") || ""}
                    onChange={(event) =>
                      dispatch({
                        type: updateDraftField.type,
                        payload: {
                          field: "samples_distributed",
                          value: event.target.value
                            .split(",")
                            .map((item) => item.trim())
                            .filter(Boolean),
                        },
                      })
                    }
                  />
                </div>
              </div>
            </div>

            <div className="field">
              <label>Observed or Inferred HCP Sentiment</label>
              <div className="sentiment-row">
                {["Positive", "Neutral", "Negative"].map((value) => (
                  <label
                    key={value}
                    className={`senti-option ${draft.sentiment === value ? "senti-active" : ""}`}
                  >
                    <input
                      type="radio"
                      name="sentiment"
                      value={value}
                      checked={draft.sentiment === value}
                      onChange={() => dispatch(updateDraftField({ field: "sentiment", value }))}
                    />
                    <span className={`radio-circle ${draft.sentiment === value ? "radio-on" : ""}`}>
                      {draft.sentiment === value && <span className="radio-dot" />}
                    </span>
                    <SentimentIcon value={value} />
                    {value}
                  </label>
                ))}
              </div>
            </div>

            <div className="field">
              <label>Outcomes</label>
              <textarea
                className="editable-input"
                rows={2}
                placeholder="What changed after the interaction?"
                value={draft.outcomes || ""}
                onChange={(event) =>
                  dispatch(updateDraftField({ field: "outcomes", value: event.target.value }))
                }
              />
            </div>

            <div className="field">
              <label>Follow-up Actions</label>
              <textarea
                className="editable-input"
                rows={2}
                placeholder="Next steps, reminders, commitments..."
                value={draft.follow_up_actions || ""}
                onChange={(event) =>
                  dispatch(
                    updateDraftField({ field: "follow_up_actions", value: event.target.value }),
                  )
                }
              />
            </div>

            {draft.ai_suggested_followups?.length > 0 && (
              <div className="ai-followups">
                <div className="ai-followups-title">AI suggested follow-ups</div>
                {draft.ai_suggested_followups.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className="followup-item"
                    onClick={() => dispatch(applySuggestion(item))}
                  >
                    + {item}
                  </button>
                ))}
              </div>
            )}

            <div className="action-row">
              <button type="button" className="btn-ghost" onClick={() => dispatch(resetEditor())}>
                New Draft
              </button>
              <button
                type="button"
                className="btn-save"
                onClick={handleSave}
                disabled={status === "saving"}
              >
                {status === "saving" ? "Saving..." : selectedInteractionId ? "Update" : "Save"}
              </button>
            </div>
          </div>
        </section>

        <aside className="card ai-card">
          <div className="card-header">
            <div className="ai-header-left">
              <div className="ai-avatar">🤖</div>
              <div>
                <div className="ai-title">Conversational Assistant</div>
                <div className="ai-sub">Groq `gemma2-9b-it` + LangGraph</div>
              </div>
            </div>
          </div>

          <div className="demo-chips">
            {demoPrompts.map((prompt, index) => (
              <button
                key={prompt}
                type="button"
                className="demo-chip"
                onClick={() => dispatch(useDemoPrompt(prompt))}
              >
                Demo {index + 1}
              </button>
            ))}
          </div>

          <div className="chat-history">
            {chatHistory.length === 0 && (
              <div className="chat-placeholder">
                <div className="chat-placeholder-icon">💬</div>
                <p>
                  Example: Met Dr. Smith, discussed Product X efficacy, positive sentiment, and
                  shared the brochure.
                </p>
                <p className="hint">The AI will extract details and update the structured form.</p>
              </div>
            )}

            {chatHistory.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`msg ${message.role}`}>
                <div className="msg-bubble">
                  {message.role === "assistant" && <div className="msg-avatar">🤖</div>}
                  <div className="msg-content">
                    <p>{message.text}</p>
                    {message.role === "assistant" && message.tools?.length > 0 && (
                      <div className="tool-trace">
                        {message.tools.map((tool) => (
                          <ToolChip key={tool} name={tool} />
                        ))}
                      </div>
                    )}
                  </div>
                  {message.role === "user" && <div className="msg-avatar user-av">👤</div>}
                </div>
              </div>
            ))}

            {status === "thinking" && (
              <div className="msg assistant">
                <div className="msg-bubble">
                  <div className="msg-avatar">🤖</div>
                  <div className="msg-content">
                    <div className="typing-dots">
                      <span />
                      <span />
                      <span />
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="chat-input-area">
            <textarea
              rows={3}
              placeholder="Describe the HCP interaction in natural language..."
              value={chatInput}
              onChange={(event) => dispatch(setChatInput(event.target.value))}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  handleSend();
                }
              }}
              disabled={status === "thinking"}
            />
            <button
              type="button"
              className="btn-log"
              onClick={handleSend}
              disabled={!chatInput.trim() || status === "thinking"}
            >
              {status === "thinking" ? "..." : "Log"}
            </button>
          </div>
        </aside>
      </div>

      {selectedHcp && (
        <section className="card hcp-card">
          <div className="card-header">HCP Master Record - {selectedHcp.name}</div>
          <div className="hcp-body">
            <div className="hcp-stat">
              <span>Past Interactions</span>
              <strong>{selectedHcp.interaction_count}</strong>
            </div>
            <div className="hcp-fields">
              {[
                ["specialty", "Specialty", "e.g. Oncology"],
                ["organization", "Organization", "Hospital or clinic"],
                ["territory", "Territory", "Assigned territory"],
              ].map(([key, label, placeholder]) => (
                <label key={key} className="hcp-field">
                  <span>{label}</span>
                  <input
                    type="text"
                    placeholder={placeholder}
                    value={profileForm[key]}
                    onChange={(event) =>
                      setProfileForm((current) => ({ ...current, [key]: event.target.value }))
                    }
                  />
                </label>
              ))}
            </div>
            <button
              type="button"
              className="btn-sm save-hcp"
              onClick={() =>
                dispatch(updateHcpProfile({ hcpId: selectedHcp.id, payload: profileForm }))
              }
              disabled={status === "saving"}
            >
              {status === "saving" ? "Saving..." : "Save HCP Profile"}
            </button>
          </div>
        </section>
      )}

      <section className="card history-card">
        <div className="card-header">Recent Saved Interactions</div>
        <div className="history-list">
          {interactions.length === 0 && (
            <div className="empty-state">
              No interactions yet. Use the form or the AI assistant, then click Save.
            </div>
          )}
          {interactions.map((interaction) => (
            <button
              key={interaction.id}
              type="button"
              className={`history-item ${
                selectedInteractionId === interaction.id ? "history-active" : ""
              }`}
              onClick={() => dispatch(loadInteraction(interaction))}
            >
              <div className="history-top">
                <strong>{interaction.hcp_name || "Unnamed HCP"}</strong>
                <span className="history-id">#{interaction.id}</span>
              </div>
              <div className="history-meta">
                {interaction.interaction_type} · {interaction.interaction_date} ·{" "}
                {interaction.interaction_time}
              </div>
              <div className="history-preview">
                {interaction.topics_discussed || interaction.interaction_notes || "No summary."}
              </div>
              <div className={`history-badge senti-${(interaction.sentiment || "Neutral").toLowerCase()}`}>
                {interaction.sentiment || "Neutral"}
              </div>
            </button>
          ))}
        </div>
      </section>

      {selectedInteraction && (
        <section className="card record-card">
          <div className="card-header">
            <span>Selected Record - #{selectedInteraction.id}</span>
            <button type="button" className="btn-download" onClick={handlePdfDownload}>
              Download PDF
            </button>
          </div>
          <div className="record-grid">
            {[
              ["HCP", selectedInteraction.hcp_name],
              ["Type", selectedInteraction.interaction_type],
              ["Date", selectedInteraction.interaction_date],
              ["Time", selectedInteraction.interaction_time],
              ["Sentiment", selectedInteraction.sentiment],
            ].map(([label, value]) => (
              <div key={label} className="rec-cell">
                <span className="rec-label">{label}</span>
                <div className="rec-val">{value || "-"}</div>
              </div>
            ))}
            <div className="rec-cell full">
              <span className="rec-label">Topics</span>
              <div className="rec-val">{selectedInteraction.topics_discussed || "-"}</div>
            </div>
            <div className="rec-cell full">
              <span className="rec-label">Outcomes</span>
              <div className="rec-val">{selectedInteraction.outcomes || "-"}</div>
            </div>
            <div className="rec-cell full">
              <span className="rec-label">Follow-up</span>
              <div className="rec-val">{selectedInteraction.follow_up_actions || "-"}</div>
            </div>
            <div className="rec-cell full">
              <span className="rec-label">Materials</span>
              <div className="rec-val">
                {selectedInteraction.materials_shared?.join(", ") || "-"}
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
