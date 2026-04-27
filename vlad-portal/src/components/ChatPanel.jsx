import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { Mic, MicOff, Send, X, Zap, User, Paperclip, Loader } from "lucide-react";
import { useApp } from "../context/AppContext";
import { clients } from "../data/mockData";
import { apiFetch, apiUpload } from "../api/client";

// ── @ mention popup (global chat only) ──────────────────────────

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
        <button
          key={c.id}
          className="mention-item"
          onMouseDown={(e) => { e.preventDefault(); onSelect(c); }}
        >
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

// ── Main panel ───────────────────────────────────────────────────

// Text file extensions handled client-side via FileReader
const TEXT_EXTS = [".txt", ".vtt", ".srt", ".md", ".csv"];

export default function ChatPanel({ open, onClose, clientId = null }) {
  const {
    chatMessages,
    addChatMessage,
    getClientChatMessages,
    addClientChatMessage,
  } = useApp();

  const [input, setInput]             = useState("");
  // attachedFile: { name: string, content: string } | null
  const [attachedFile, setAttachedFile] = useState(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [mentionQuery, setMentionQuery] = useState(null);
  const [listening, setListening]     = useState(false);
  const [typing, setTyping]           = useState(false);

  const textareaRef    = useRef(null);
  const fileRef        = useRef(null);
  const recognitionRef = useRef(null);
  const messagesEndRef = useRef(null);

  const messages    = clientId ? getClientChatMessages(clientId) : chatMessages;
  const pushMessage = clientId
    ? (msg) => addClientChatMessage(clientId, msg)
    : addChatMessage;

  const contextClient = clientId ? clients.find((c) => c.id === clientId) : null;

  const hints = clientId
    ? [
        { label: "Summarize this client" },
        { label: "Draft a follow-up email" },
        { label: "Send a reminder" },
        { label: "Paste transcript", fill: "Here's my transcript from today's meeting:\n\n" },
      ]
    : [
        { label: "Done discovery with @" },
        { label: "Remind @" },
        { label: "LEAP notes for @" },
        { label: "Weekly summary" },
      ];

  useEffect(() => {
    if (open) setTimeout(() => textareaRef.current?.focus(), 120);
  }, [open]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

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

  async function send() {
    const trimmed = input.trim();
    if (!trimmed && !attachedFile) return;
    if (typing) return;

    // Append file content to the message text
    const fileChunk = attachedFile?.content
      ? `\n\n[TRANSCRIPT FILE: ${attachedFile.name}]\n${attachedFile.content}`
      : "";
    const text = (trimmed + fileChunk) || `[Attached: ${attachedFile?.name}]`;

    pushMessage({
      role: "user",
      content: trimmed || `[Attached: ${attachedFile?.name}]`,
      file: attachedFile?.name || null,
      timestamp: new Date().toISOString(),
    });
    setInput("");
    setAttachedFile(null);
    setTyping(true);

    try {
      const data = await apiFetch("/chat/messages/", {
        method: "POST",
        body: JSON.stringify({
          session_id: clientId || "global",
          content: text,
          ...(clientId ? { client_id: clientId } : {}),
        }),
      });

      pushMessage({
        role: "assistant",
        content: data.assistant.content,
        timestamp: data.assistant.created_at,
        transcript_queued: data.transcript_queued || false,
        schedule_queued: data.schedule_queued || false,
        meeting_id: data.meeting_id || null,
        approval_id: data.approval_id || null,
      });
    } catch (e) {
      pushMessage({
        role: "assistant",
        content: `[AI error: ${e.message}]`,
        timestamp: new Date().toISOString(),
      });
    } finally {
      setTyping(false);
    }
  }

  async function handleFileAttach(e) {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = "";

    const ext = file.name.includes(".")
      ? "." + file.name.split(".").pop().toLowerCase()
      : "";

    if (TEXT_EXTS.includes(ext)) {
      // Read client-side
      const reader = new FileReader();
      reader.onload = (ev) => {
        setAttachedFile({ name: file.name, content: ev.target.result });
      };
      reader.readAsText(file);
    } else {
      // Upload to server-side extraction endpoint
      setFileLoading(true);
      try {
        const fd = new FormData();
        fd.append("file", file);
        const data = await apiUpload("/chat/extract-text/", fd);
        setAttachedFile({ name: file.name, content: data.text });
      } catch (err) {
        alert(err.message || "Could not extract text from this file type.");
      } finally {
        setFileLoading(false);
      }
    }
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
    r.onend   = () => setListening(false);
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
              {clientId ? (contextClient?.name || "Client") : "Orchestrator"}
            </span>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>

        {/* Quick hints */}
        <div className="chat-hints">
          {hints.map((h) => (
            <button
              key={h.label}
              className="chat-hint-chip"
              onClick={() => {
                setInput(h.fill || h.label);
                if (!clientId) setMentionQuery("");
                setTimeout(() => textareaRef.current?.focus(), 50);
              }}
            >
              {h.label}
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
                {msg.transcript_queued && (
                  <div className="chat-transcript-banner">
                    Transcript saved — processing started.{" "}
                    <Link to="/approvals" onClick={onClose}>
                      View Approval Queue
                    </Link>{" "}
                    when ready.
                  </div>
                )}
                {msg.schedule_queued && (
                  <div className="chat-schedule-banner">
                    Meeting proposal added to Approval Queue.{" "}
                    <Link to="/approvals" onClick={onClose}>
                      Review to send invite
                    </Link>
                  </div>
                )}
                <div className="chat-time">{formatTime(msg.timestamp)}</div>
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {typing && (
            <div className="chat-msg assistant">
              <div className="msg-avatar assistant">
                <Zap size={12} />
              </div>
              <div className="msg-content">
                <div className="chat-bubble typing-bubble">
                  <span className="dot" />
                  <span className="dot" />
                  <span className="dot" />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="chat-panel-input">
          {attachedFile && (
            <div className="attachment-preview">
              <Paperclip size={12} />
              <span>{attachedFile.name}</span>
              <button onClick={() => setAttachedFile(null)}><X size={12} /></button>
            </div>
          )}

          {/* @ mention popup — global chat only */}
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
                  ? `Ask about ${contextClient?.name || "this client"}, or paste a transcript…`
                  : "Type a message... use @ to tag a client"
              }
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              rows={2}
              disabled={typing}
            />
            <div className="chat-input-actions">
              <button
                className="icon-btn"
                onClick={() => fileRef.current.click()}
                title={fileLoading ? "Extracting text…" : "Attach file"}
                disabled={typing || fileLoading}
              >
                {fileLoading ? <Loader size={15} className="spin" /> : <Paperclip size={15} />}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".txt,.vtt,.srt,.md,.csv,.docx,.odt,.pdf,.jpg,.jpeg,.png,.gif,.webp,.bmp,.tiff,.doc,.xlsx,.pptx"
                style={{ display: "none" }}
                onChange={handleFileAttach}
              />
              <button
                className={`icon-btn ${listening ? "listening" : ""}`}
                onClick={toggleVoice}
                title="Voice input"
                disabled={typing}
              >
                {listening ? <MicOff size={15} /> : <Mic size={15} />}
              </button>
              <button
                className="icon-btn send-btn"
                onClick={send}
                disabled={(!input.trim() && !attachedFile) || typing}
                title="Send"
              >
                <Send size={15} />
              </button>
            </div>
          </div>
          <div className="chat-input-hint">
            {clientId ? (
              <>Context: <strong>{contextClient?.name || "Client"}</strong> · <kbd>Enter</kbd> to send · <kbd>Shift+Enter</kbd> new line</>
            ) : (
              <><kbd>@</kbd> to tag a client · <kbd>Enter</kbd> to send · <kbd>Shift+Enter</kbd> new line</>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
