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
  const response = await fetch(`${API_BASE}/api/interactions`);
  if (!response.ok) throw new Error("Unable to fetch interactions");
  return response.json();
});

export const fetchHcps = createAsyncThunk("crm/fetchHcps", async () => {
  const response = await fetch(`${API_BASE}/api/hcps`);
  if (!response.ok) throw new Error("Unable to fetch HCPs");
  return response.json();
});

export const updateHcpProfile = createAsyncThunk(
  "crm/updateHcpProfile",
  async ({ hcpId, payload }) => {
    const response = await fetch(`${API_BASE}/api/hcps/${hcpId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error("Unable to update HCP profile");
    return response.json();
  },
);

export const saveInteraction = createAsyncThunk("crm/saveInteraction", async (draft) => {
  const response = await fetch(`${API_BASE}/api/interactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  });
  if (!response.ok) throw new Error("Unable to save interaction");
  return response.json();
});

export const updateInteraction = createAsyncThunk(
  "crm/updateInteraction",
  async (_, { getState }) => {
    const { crm } = getState();
    const response = await fetch(`${API_BASE}/api/interactions/${crm.selectedInteractionId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(crm.draft),
    });
    if (!response.ok) throw new Error("Unable to update interaction");
    return response.json();
  },
);

export const askAssistant = createAsyncThunk("crm/askAssistant", async (_, { getState }) => {
  const { crm } = getState();
  const response = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: crm.chatInput, draft: crm.draft }),
  });
  if (!response.ok) throw new Error("Assistant request failed - is the backend running?");
  return response.json();
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
    setChatInput(state, action) {
      state.chatInput = action.payload;
    },
    useDemoPrompt(state, action) {
      state.chatInput = action.payload;
    },
    updateDraftField(state, action) {
      const { field, value } = action.payload;
      state.draft[field] = value;
    },
    applySuggestion(state, action) {
      const current = state.draft.follow_up_actions || "";
      state.draft.follow_up_actions = [current, action.payload].filter(Boolean).join("\n");
    },
    loadInteraction(state, action) {
      state.selectedInteractionId = action.payload.id;
      state.draft = { ...createInitialDraft(), ...action.payload };
      state.chatInput = "";
      state.chatHistory = [];
      state.assistantReply = "";
      state.toolTrace = [];
    },
    resetEditor(state) {
      state.selectedInteractionId = null;
      state.draft = createInitialDraft();
      state.chatInput = "";
      state.chatHistory = [];
      state.assistantReply = "";
      state.toolTrace = [];
      state.error = "";
      state.successMessage = "";
    },
    clearBanner(state) {
      state.error = "";
      state.successMessage = "";
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchInteractions.fulfilled, (state, action) => {
        state.interactions = action.payload;
      })
      .addCase(fetchHcps.fulfilled, (state, action) => {
        state.hcps = action.payload;
      })
      .addCase(updateHcpProfile.pending, (state) => {
        state.status = "saving";
        state.error = "";
      })
      .addCase(updateHcpProfile.fulfilled, (state, action) => {
        state.status = "idle";
        state.hcps = state.hcps.map((hcp) => (hcp.id === action.payload.id ? action.payload : hcp));
        state.successMessage = "HCP profile updated.";
      })
      .addCase(updateHcpProfile.rejected, (state, action) => {
        state.status = "error";
        state.error = action.error.message || "HCP update failed";
      })
      .addCase(saveInteraction.pending, (state) => {
        state.status = "saving";
        state.error = "";
        state.successMessage = "";
      })
      .addCase(saveInteraction.fulfilled, (state, action) => {
        state.status = "idle";
        state.selectedInteractionId = action.payload.id;
        state.interactions.unshift(action.payload);
        state.draft = createInitialDraft();
        state.chatInput = "";
        state.chatHistory = [];
        state.assistantReply = "";
        state.toolTrace = [];
        state.successMessage = "Interaction saved to database.";
      })
      .addCase(saveInteraction.rejected, (state, action) => {
        state.status = "error";
        state.error = action.error.message || "Save failed";
      })
      .addCase(updateInteraction.pending, (state) => {
        state.status = "saving";
        state.error = "";
        state.successMessage = "";
      })
      .addCase(updateInteraction.fulfilled, (state, action) => {
        state.status = "idle";
        state.interactions = state.interactions.map((item) =>
          item.id === action.payload.id ? action.payload : item,
        );
        state.draft = createInitialDraft();
        state.chatInput = "";
        state.chatHistory = [];
        state.assistantReply = "";
        state.toolTrace = [];
        state.selectedInteractionId = null;
        state.successMessage = "Interaction updated.";
      })
      .addCase(updateInteraction.rejected, (state, action) => {
        state.status = "error";
        state.error = action.error.message || "Update failed";
      })
      .addCase(askAssistant.pending, (state) => {
        state.status = "thinking";
        state.error = "";
        state.successMessage = "";
        if (state.chatInput.trim()) {
          state.chatHistory.push({ role: "user", text: state.chatInput.trim() });
        }
      })
      .addCase(askAssistant.fulfilled, (state, action) => {
        state.status = "idle";
        const { reply, draft_updates, tool_trace } = action.payload;
        state.assistantReply = reply;
        state.toolTrace = tool_trace || [];
        if (draft_updates && Object.keys(draft_updates).length) {
          state.draft = { ...state.draft, ...draft_updates };
        }
        state.chatHistory.push({ role: "assistant", text: reply, tools: tool_trace || [] });
        state.chatInput = "";
      })
      .addCase(askAssistant.rejected, (state, action) => {
        state.status = "error";
        state.error = action.error.message || "Assistant failed";
        state.chatHistory.push({
          role: "assistant",
          text: `Warning: ${action.error.message || "Backend error"}`,
          tools: [],
        });
        state.chatInput = "";
      });
  },
});

export const {
  setChatInput,
  useDemoPrompt,
  applySuggestion,
  loadInteraction,
  resetEditor,
  clearBanner,
  updateDraftField,
} = crmSlice.actions;

export const store = configureStore({
  reducer: { crm: crmSlice.reducer },
});
