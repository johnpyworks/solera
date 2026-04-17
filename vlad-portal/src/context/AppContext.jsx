import { createContext, useContext, useState } from "react";
import {
  approvalItems as initialItems,
  agentLogs as initialLogs,
  clients,
  householdMembers as initialMembers,
  questionnaireTokens as initialTokens,
} from "../data/mockData";

const AppContext = createContext();

function buildDefaultGreeting(clientId) {
  const client = clients.find((c) => c.id === clientId);
  if (!client) return [];
  const days = client.last_contact_date
    ? Math.round((new Date() - new Date(client.last_contact_date)) / 86400000)
    : null;
  const contactLine = days !== null ? ` Last contact was ${days} day${days !== 1 ? "s" : ""} ago.` : "";
  return [
    {
      role: "assistant",
      content: `You're now in ${client.name}'s client space — ${client.meeting_stage} stage.${contactLine} What would you like to do?`,
      timestamp: new Date().toISOString(),
    },
  ];
}

export function AppProvider({ children }) {
  const [approvals, setApprovals] = useState(initialItems);
  const [logs, setLogs] = useState(initialLogs);
  const [chatMessages, setChatMessages] = useState([
    {
      role: "assistant",
      content:
        "Good morning, Vlad. You have 3 items waiting for your approval. You have 4 meetings scheduled this week. How can I help?",
      timestamp: new Date().toISOString(),
    },
  ]);

  const [clientChats, setClientChats] = useState({});

  const [clientNotes, setClientNotes] = useState(
    Object.fromEntries(clients.map((c) => [c.id, c.notes || []]))
  );

  const [clientFiles] = useState(
    Object.fromEntries(clients.map((c) => [c.id, c.files || []]))
  );

  // Household members — seeded from mockData, mutable
  const [members, setMembers] = useState(
    initialMembers.map((m) => ({ ...m, notes: m.notes || [] }))
  );

  function approveItem(id) {
    setApprovals((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status: "approved" } : item))
    );
  }

  function rejectItem(id) {
    setApprovals((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status: "rejected" } : item))
    );
  }

  function editItem(id, newContent) {
    setApprovals((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, status: "edited", draft_content: newContent } : item
      )
    );
  }

  function addChatMessage(message) {
    setChatMessages((prev) => [...prev, message]);
  }

  function getClientChatMessages(clientId) {
    return clientChats[clientId] || buildDefaultGreeting(clientId);
  }

  function addClientChatMessage(clientId, message) {
    setClientChats((prev) => ({
      ...prev,
      [clientId]: [...(prev[clientId] || buildDefaultGreeting(clientId)), message],
    }));
  }

  function addClientNote(clientId, text) {
    const newNote = {
      id: `n_${Date.now()}`,
      text,
      author: "vlad",
      created_at: new Date().toISOString(),
      type: "advisor_note",
    };
    setClientNotes((prev) => ({
      ...prev,
      [clientId]: [...(prev[clientId] || []), newNote],
    }));
  }

  // Household member actions
  function getMembersForHousehold(householdId) {
    return members.filter((m) => m.household_id === householdId);
  }

  function addHouseholdMember(householdId, memberData) {
    const newMember = {
      id: `hm_${Date.now()}`,
      household_id: householdId,
      notes: [],
      ...memberData,
    };
    setMembers((prev) => [...prev, newMember]);
    return newMember;
  }

  function addMemberNote(memberId, text) {
    const newNote = {
      id: `mn_${Date.now()}`,
      text,
      author: "vlad",
      created_at: new Date().toISOString(),
    };
    setMembers((prev) =>
      prev.map((m) =>
        m.id === memberId ? { ...m, notes: [...m.notes, newNote] } : m
      )
    );
  }

  // Questionnaire tokens + submissions
  const [tokens, setTokens] = useState(initialTokens);
  const [submissions, setSubmissions] = useState(
    Object.fromEntries(
      initialTokens
        .filter((t) => t.status === "submitted")
        .map((t) => [t.token, { _submittedAt: t.created_at }])
    )
  );

  function createQuestionnaireToken(clientId, email, providedToken = null) {
    const client = allClients.find((c) => c.id === clientId);
    const token = providedToken || `tok_${clientId}_${Date.now()}`;
    const newToken = {
      token,
      client_id: clientId,
      client_name: client?.name || "",
      client_email: email,
      created_at: new Date().toISOString(),
      status: "pending",
    };
    setTokens((prev) => [...prev, newToken]);
    const link = `${typeof window !== "undefined" ? window.location.origin : "http://localhost:5174"}/form/${token}`;
    const newApproval = {
      id: `a_q_${Date.now()}`,
      task_id: null,
      item_type: "questionnaire_link",
      client_id: clientId,
      client_name: client?.name || "",
      agent: "Advisor",
      urgency: "normal",
      status: "pending",
      created_at: new Date().toISOString(),
      draft_content: {
        to: email,
        subject: "Your Solera Financial Questionnaire",
        body: `Hi ${client?.name || ""},\n\nPlease complete your financial questionnaire using the secure link below:\n\n${link}\n\nThis form typically takes 10–15 minutes. You can also request a printable version from the form page.\n\nThank you,\nVlad Donets\nSolera Financial Advisory`,
        link,
      },
    };
    setApprovals((prev) => [...prev, newApproval]);
    return token;
  }

  function submitQuestionnaire(token, formData) {
    setSubmissions((prev) => ({
      ...prev,
      [token]: { ...formData, _submittedAt: new Date().toISOString() },
    }));
    setTokens((prev) =>
      prev.map((t) => (t.token === token ? { ...t, status: "submitted" } : t))
    );
  }

  function getTokenInfo(token) {
    return tokens.find((t) => t.token === token) || null;
  }

  function getSubmissionsForClient(clientId) {
    return tokens
      .filter((t) => t.client_id === clientId && t.status === "submitted")
      .map((t) => ({ ...submissions[t.token], token: t.token, client_email: t.client_email, submitted_at: submissions[t.token]?._submittedAt }));
  }

  // New client (Phase 1: in-memory only)
  const [extraClients, setExtraClients] = useState([]);

  function addClient(clientData) {
    const newClient = {
      id: `c_${Date.now()}`,
      ...clientData,
      wealthbox_id: null,
      anniversary_date: null,
      last_contact_date: null,
      household_id: null,
      is_primary: true,
      notes: [],
      files: [],
    };
    setExtraClients((prev) => [...prev, newClient]);
    setClientNotes((prev) => ({ ...prev, [newClient.id]: [] }));
    return newClient;
  }

  const allClients = [...clients, ...extraClients];

  const pendingCount = approvals.filter((a) => a.status === "pending").length;

  return (
    <AppContext.Provider
      value={{
        approvals,
        logs,
        chatMessages,
        pendingCount,
        approveItem,
        rejectItem,
        editItem,
        addChatMessage,
        clientChats,
        clientNotes,
        clientFiles,
        getClientChatMessages,
        addClientChatMessage,
        addClientNote,
        allClients,
        addClient,
        members,
        getMembersForHousehold,
        addHouseholdMember,
        addMemberNote,
        tokens,
        submissions,
        createQuestionnaireToken,
        submitQuestionnaire,
        getTokenInfo,
        getSubmissionsForClient,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
