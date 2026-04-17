import { useState, useRef, useEffect } from "react";
import { Mic, MicOff, Send, X, Zap, User, Paperclip, Search } from "lucide-react";
import { useApp } from "../context/AppContext";
import { clients } from "../data/mockData";

// ── @ mention popup ──────────────────────────────────────────

function MentionPopup({ query, onSelect }) {
  const filtered = clients.filter((c) =>
    c.name.toLowerCase().includes(query.toLowerCase())
  );

  if (filtered.length === 0) return (
    <div className="mention-popup">
      <div className="mention-empty">No clients match "{query}"</div>
    </div>
  );

  return (
    <div className="mention-popup">
      {filtered.map((c) => (
        <button key={c.id} className="mention-item" onMouseDown={(e) => { e.preventDefault(); onSelect(c); }}>
          <div className="mention-avatar">{c.name[0]}</div>
          <div className="mention-info">
            <span className="mention-name">{c.name}</span>
            <span className="mention-stage">{c.meeting_stage}</span>
          </div>
          {c.language_tag === "ru" && <span className="ru-tag">RU</span>}
        </button>
      ))}
    </div>
  );
}

// ── AI response logic ────────────────────────────────────────

function parseMessage(text, attachedFile, clientId) {
  const lower = text.toLowerCase();

  // If in client context, resolve client from clientId
  const contextClient = clientId ? clients.find((c) => c.id === clientId) : null;

  // Extract @mentions (only used when no clientId context)
  const mentionMatches = text.match(/@([^@\s][^@]*?)(?=\s|$|please|see|with|and)/gi) || [];
  const mentionedNames = mentionMatches.map((m) => m.slice(1).trim());
  const primaryName = contextClient?.name || (mentionedNames.length > 0 ? mentionedNames[0] : null);

  const hasMeeting = lower.match(/discovery|leap|implementation|heartbeat|check.?in|meeting/);
  const hasTranscript = attachedFile || lower.match(/transcript|notes|attached/);
  const hasReminder = lower.match(/remind|reminder/);
  const hasSchedule = lower.match(/schedule|book|reschedule/);
  const hasService = lower.match(/premium|form|service|wealthbox|overdue/);
  const hasSummary = lower.match(/summary|week|report/);
  const hasSummarize = lower.match(/summarize|overview|who is|tell me about/);

  if (hasSummarize && contextClient) {
    return `Here's a summary of **${contextClient.name}**: currently in the **${contextClient.meeting_stage}** stage. Last contact: ${contextClient.last_contact_date || "unknown"}. Would you like me to draft a follow-up, process meeting notes, or do something else?`;
  }

  if (hasMeeting && primaryName) {
    const meetingType = lower.match(/discovery/) ? "Discovery"
      : lower.match(/leap/) ? "LEAP Process"
      : lower.match(/implementation/) ? "Implementation"
      : lower.match(/heartbeat/) ? "Solera Heartbeat"
      : lower.match(/check.?in/) ? "30-Day Check-In"
      : "meeting";

    if (hasTranscript) {
      return `Got it. Routing ${meetingType} notes for **${primaryName}** to the Scribe agent. I'll draft a post-meeting summary and a client follow-up email — check your Approval Queue shortly.${attachedFile ? ` Transcript file "${attachedFile}" received.` : ""}`;
    }
    return `Noted — ${meetingType} with **${primaryName}**. If you have a transcript or notes to attach, send them and I'll have Scribe draft the emails. Or I can proceed with just what you've described.`;
  }

  if (hasReminder && primaryName) {
    return `On it — queuing appointment reminders for **${primaryName}**. Check the Approval Queue for the draft.`;
  }
  if (hasSchedule) {
    return `I'll check the calendar and propose available slots${primaryName ? ` for **${primaryName}**` : ""}. Respecting your 15-meeting cap, Monday block, and alternating Fridays off.`;
  }
  if (hasService) {
    return `Routing to the Service Agent${primaryName ? ` for **${primaryName}**` : ""}. I'll pull the relevant forms and queue any Wealthbox tasks for your review.`;
  }
  if (hasSummary) {
    return "Pulling your weekly summary now — head to the Weekly Summary page or I'll surface the highlights here in a moment.";
  }
  if (!contextClient && mentionedNames.length > 0) {
    return `Got it — I see you mentioned **${mentionedNames.join(", ")}**. What would you like me to do? (e.g. send a reminder, process meeting notes, prep a service request)`;
  }
  if (contextClient) {
    return `Understood. What would you like me to do for **${contextClient.name}**? (e.g. process meeting notes, send a reminder, draft a follow-up)`;
  }
  return "Understood. What client or task should I action on? You can use @name to tag a client.";
}

// ── Main panel ───────────────────────────────────────────────

export default function ChatPanel({ open, onClose, clientId = null }) {
  const {
    chatMessages,
    addChatMessage,
    getClientChatMessages,
    addClientChatMessage,
  } = useApp();

  const [input, setInput] = useState("");
  const [attachedFile, setAttachedFile] = useState(null);
  const [mentionQuery, setMentionQuery] = useState(null);
  const [listening, setListening] = useState(false);
  const textareaRef = useRef(null);
  const fileRef = useRef(null);
  const recognitionRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Switch data source based on whether we're in a client context
  const messages = clientId ? getClientChatMessages(clientId) : chatMessages;
  const pushMessage = clientId
    ? (msg) => addClientChatMessage(clientId, msg)
    : addChatMessage;

  const contextClient = clientId ? clients.find((c) => c.id === clientId) : null;

  const hints = clientId
    ? [
        "Summarize this client",
        "Process meeting notes",
        "Draft a follow-up email",
        "Send a reminder",
      ]
    : [
        "Done discovery with @",
        "Remind @",
        "LEAP notes for @",
        "Weekly summary",
      ];

  useEffect(() => {
    if (open) setTimeout(() => textareaRef.current?.focus(), 120);
  }, [open]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleInputChange(e) {
    const val = e.target.value;
    setInput(val);

    if (clientId) {
      setMentionQuery(null);
      return;
    }

    const cursor = e.target.selectionStart;
    const textBeforeCursor = val.slice(0, cursor);
    const atMatch = textBeforeCursor.match(/@(\w[\w\s]*)$/);

    if (atMatch) {
      setMentionQuery(atMatch[1]);
    } else if (textBeforeCursor.endsWith("@")) {
      setMentionQuery("");
    } else {
      setMentionQuery(null);
    }
  }

  function handleMentionSelect(client) {
    const cursor = textareaRef.current.selectionStart;
    const textBeforeCursor = input.slice(0, cursor);
    const replaced = textBeforeCursor.replace(/@(\w[\w\s]*)?$/, `@${client.name} `);
    const newVal = replaced + input.slice(cursor);
    setInput(newVal);
    setMentionQuery(null);
    setTimeout(() => {
      textareaRef.current?.focus();
      const pos = replaced.length;
      textareaRef.current?.setSelectionRange(pos, pos);
    }, 0);
  }

  function handleKeyDown(e) {
    if (e.key === "Escape") { setMentionQuery(null); return; }
    if (mentionQuery !== null) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function send() {
    const trimmed = input.trim();
    if (!trimmed && !attachedFile) return;

    const text = trimmed || `[Attached: ${attachedFile}]`;
    pushMessage({ role: "user", content: text, file: attachedFile, timestamp: new Date().toISOString() });
    setInput("");

    const fileName = attachedFile;
    setAttachedFile(null);

    setTimeout(() => {
      pushMessage({
        role: "assistant",
        content: parseMessage(text, fileName, clientId),
        timestamp: new Date().toISOString(),
      });
    }, 700);
  }

  function handleFileAttach(e) {
    const file = e.target.files[0];
    if (file) setAttachedFile(file.name);
    e.target.value = "";
  }

  function toggleVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Voice input requires Chrome or Edge."); return; }
    if (listening) { recognitionRef.current?.stop(); setListening(false); return; }
    const r = new SR();
    r.lang = "en-US";
    r.interimResults = false;
    r.onresult = (e) => {
      setInput((prev) => prev + (prev ? " " : "") + e.results[0][0].transcript);
      setListening(false);
    };
    r.onerror = () => setListening(false);
    r.onend = () => setListening(false);
    recognitionRef.current = r;
    r.start();
    setListening(true);
  }

  function renderContent(content) {
    return content.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
      part.startsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : part
    );
  }

  function formatTime(ts) {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  return (
    <>
      {open && <div className="chat-overlay" onClick={onClose} />}

      <div className={`chat-panel ${open ? "open" : ""}`}>
        {/* Header */}
        <div className="chat-panel-header">
          <div className="chat-panel-title">
            <Zap size={16} />
            <span>Solera AI</span>
            <span className="chat-panel-sub">
              {contextClient ? contextClient.name : "Orchestrator"}
            </span>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>

        {/* Quick hints */}
        <div className="chat-hints">
          {hints.map((h) => (
            <button
              key={h}
              className="chat-hint-chip"
              onClick={() => {
                setInput(h);
                if (!clientId) setMentionQuery("");
                setTimeout(() => textareaRef.current?.focus(), 50);
              }}
            >
              {h}
            </button>
          ))}
        </div>

        {/* Messages */}
        <div className="chat-messages">
          {messages.map((msg, i) => (
            <div key={i} className={`chat-msg ${msg.role}`}>
              <div className={`msg-avatar ${msg.role}`}>
                {msg.role === "assistant" ? <Zap size={12} /> : <User size={12} />}
              </div>
              <div className="msg-content">
                <div className="chat-bubble">
                  {renderContent(msg.content)}
                  {msg.file && (
                    <div className="bubble-attachment">
                      <Paperclip size={11} /> {msg.file}
                    </div>
                  )}
                </div>
                <div className="chat-time">{formatTime(msg.timestamp)}</div>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="chat-panel-input">
          {attachedFile && (
            <div className="attachment-preview">
              <Paperclip size={12} />
              <span>{attachedFile}</span>
              <button onClick={() => setAttachedFile(null)}><X size={12} /></button>
            </div>
          )}

          {/* @ mention popup — only in global mode */}
          {!clientId && (
            <div className="mention-anchor">
              {mentionQuery !== null && (
                <MentionPopup query={mentionQuery} onSelect={handleMentionSelect} />
              )}
            </div>
          )}

          <div className="chat-input-wrap">
            <textarea
              ref={textareaRef}
              className="chat-textarea"
              placeholder={
                listening
                  ? "Listening..."
                  : clientId
                  ? `Ask about ${contextClient?.name || "this client"}...`
                  : "Type a message... use @ to tag a client"
              }
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              rows={2}
            />
            <div className="chat-input-actions">
              <button className="icon-btn" onClick={() => fileRef.current.click()} title="Attach transcript">
                <Paperclip size={15} />
              </button>
              <input ref={fileRef} type="file" accept=".txt,.md,.docx" style={{ display: "none" }} onChange={handleFileAttach} />
              <button className={`icon-btn ${listening ? "listening" : ""}`} onClick={toggleVoice} title="Voice input">
                {listening ? <MicOff size={15} /> : <Mic size={15} />}
              </button>
              <button className="icon-btn send-btn" onClick={send} disabled={!input.trim() && !attachedFile} title="Send">
                <Send size={15} />
              </button>
            </div>
          </div>
          <div className="chat-input-hint">
            {clientId ? (
              <>Context: <strong>{contextClient?.name}</strong> · <kbd>Enter</kbd> to send · <kbd>Shift+Enter</kbd> new line</>
            ) : (
              <><kbd>@</kbd> to tag a client · <kbd>Enter</kbd> to send · <kbd>Shift+Enter</kbd> new line</>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
