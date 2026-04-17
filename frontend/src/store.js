import { configureStore, createAsyncThunk, createSlice } from "@reduxjs/toolkit";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

const createInitialDraft = () => ({
  hcp_name: "",
  interaction_type: "Meeting",
  interaction_date: new Date().toISOString().slice(0, 10),
  interaction_time: new Date().toTimeString().slice(0, 5),
  attendees: [],
  topics_discussed: "",
  materials_shared: [],
  samples_distributed: [],
  sentiment: "Neutral",
  outcomes: "",
  follow_up_actions: "",
  ai_suggested_followups: [],
  interaction_notes: "",
  voice_note_summary: "",
});

const demoPrompts = [
  "Today I met with Dr. Smith and discussed Product X efficacy. The sentiment was positive and I shared the brochure.",
  "Met Dr. Mehta for a call, discussed clinical trial updates, neutral sentiment, no materials shared.",
  "Sorry, change the sentiment to negative and keep everything else the same.",
  "I visited Dr. Sharma at Apollo Hospital, discussed OncoBoost Phase III data, she was very interested. Shared clinical PDF and 2 samples.",
  "Update the HCP name to Dr. Kapoor and add follow-up: send advisory board invite.",
];

export const fetchInteractions = createAsyncThunk("crm/fetchInteractions", async () => {
  const res = await fetch(`${API_BASE}/api/interactions`);
  if (!res.ok) throw new Error("Unable to fetch interactions");
  return res.json();
});

export const fetchHcps = createAsyncThunk("crm/fetchHcps", async () => {
  const res = await fetch(`${API_BASE}/api/hcps`);
  if (!res.ok) throw new Error("Unable to fetch HCPs");
  return res.json();
});

export const updateHcpProfile = createAsyncThunk("crm/updateHcpProfile", async ({ hcpId, payload }) => {
  const res = await fetch(`${API_BASE}/api/hcps/${hcpId}`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Unable to update HCP profile");
  return res.json();
});

export const saveInteraction = createAsyncThunk("crm/saveInteraction", async (draft) => {
  const res = await fetch(`${API_BASE}/api/interactions`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  });
  if (!res.ok) throw new Error("Unable to save interaction");
  return res.json();
});

export const updateInteraction = createAsyncThunk("crm/updateInteraction", async (_, { getState }) => {
  const { crm } = getState();
  const res = await fetch(`${API_BASE}/api/interactions/${crm.selectedInteractionId}`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(crm.draft),
  });
  if (!res.ok) throw new Error("Unable to update interaction");
  return res.json();
});

export const askAssistant = createAsyncThunk("crm/askAssistant", async (_, { getState }) => {
  const { crm } = getState();
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: crm.chatInput, draft: crm.draft }),
  });
  if (!res.ok) throw new Error("Assistant request failed – is the backend running?");
  return res.json();
});

const crmSlice = createSlice({
  name: "crm",
  initialState: {
    draft: createInitialDraft(),
    chatInput: "",
    chatHistory: [],
    assistantReply: "",
    demoPrompts,
    toolTrace: [],
    interactions: [],
    hcps: [],
    selectedInteractionId: null,
    status: "idle",
    error: "",
    successMessage: "",
  },
  reducers: {
    setChatInput(state, action) { state.chatInput = action.payload; },
    useDemoPrompt(state, action) { state.chatInput = action.payload; },
    updateDraftField(state, action) {
      const { field, value } = action.payload;
      state.draft[field] = value;
    },
    applySuggestion(state, action) {
      const cur = state.draft.follow_up_actions || "";
      state.draft.follow_up_actions = [cur, action.payload].filter(Boolean).join("\n");
    },
    loadInteraction(state, action) {
      state.selectedInteractionId = action.payload.id;
      state.draft = { ...createInitialDraft(), ...action.payload };
      state.chatInput = ""; state.chatHistory = [];
      state.assistantReply = ""; state.toolTrace = [];
    },
    resetEditor(state) {
      state.selectedInteractionId = null;
      state.draft = createInitialDraft();
      state.chatInput = ""; state.chatHistory = [];
      state.assistantReply = ""; state.toolTrace = [];
      state.error = ""; state.successMessage = "";
    },
    clearBanner(state) { state.error = ""; state.successMessage = ""; },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchInteractions.fulfilled, (s, a) => { s.interactions = a.payload; })
      .addCase(fetchHcps.fulfilled, (s, a) => { s.hcps = a.payload; })
      // hcp profile
      .addCase(updateHcpProfile.pending, (s) => { s.status = "saving"; s.error = ""; })
      .addCase(updateHcpProfile.fulfilled, (s, a) => {
        s.status = "idle";
        s.hcps = s.hcps.map((h) => (h.id === a.payload.id ? a.payload : h));
        s.successMessage = "✅ HCP profile updated.";
      })
      .addCase(updateHcpProfile.rejected, (s, a) => { s.status = "error"; s.error = a.error.message || "HCP update failed"; })
      // save
      .addCase(saveInteraction.pending, (s) => { s.status = "saving"; s.error = ""; s.successMessage = ""; })
      .addCase(saveInteraction.fulfilled, (s, a) => {
        s.status = "idle"; s.selectedInteractionId = a.payload.id;
        s.interactions.unshift(a.payload);
        s.draft = createInitialDraft();
        s.chatInput = ""; s.chatHistory = [];
        s.assistantReply = ""; s.toolTrace = [];
        s.successMessage = "✅ Interaction saved to database!";
      })
      .addCase(saveInteraction.rejected, (s, a) => { s.status = "error"; s.error = a.error.message || "Save failed"; })
      // update
      .addCase(updateInteraction.pending, (s) => { s.status = "saving"; s.error = ""; s.successMessage = ""; })
      .addCase(updateInteraction.fulfilled, (s, a) => {
        s.status = "idle";
        s.interactions = s.interactions.map((i) => (i.id === a.payload.id ? a.payload : i));
        s.draft = createInitialDraft();
        s.chatInput = ""; s.chatHistory = [];
        s.assistantReply = ""; s.toolTrace = [];
        s.selectedInteractionId = null;
        s.successMessage = "✅ Interaction updated!";
      })
      .addCase(updateInteraction.rejected, (s, a) => { s.status = "error"; s.error = a.error.message || "Update failed"; })
      // chat
      .addCase(askAssistant.pending, (s) => {
        s.status = "thinking"; s.error = ""; s.successMessage = "";
        if (s.chatInput.trim()) s.chatHistory.push({ role: "user", text: s.chatInput.trim() });
      })
      .addCase(askAssistant.fulfilled, (s, a) => {
        s.status = "idle";
        const { reply, draft_updates, tool_trace } = a.payload;
        s.assistantReply = reply; s.toolTrace = tool_trace || [];
        if (draft_updates && Object.keys(draft_updates).length) {
          s.draft = { ...s.draft, ...draft_updates };
        }
        s.chatHistory.push({ role: "assistant", text: reply, tools: tool_trace || [] });
        s.chatInput = "";
      })
      .addCase(askAssistant.rejected, (s, a) => {
        s.status = "error"; s.error = a.error.message || "Assistant failed";
        s.chatHistory.push({ role: "assistant", text: "⚠️ " + (a.error.message || "Backend error"), tools: [] });
        s.chatInput = "";
      });
  },
});

export const { setChatInput, useDemoPrompt, applySuggestion, loadInteraction, resetEditor, clearBanner, updateDraftField } = crmSlice.actions;
export const store = configureStore({ reducer: { crm: crmSlice.reducer } });
