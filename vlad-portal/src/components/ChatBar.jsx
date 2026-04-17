import { useState, useRef, useEffect } from "react";
import { Mic, MicOff, Send, ChevronUp, ChevronDown } from "lucide-react";
import { useApp } from "../context/AppContext";

const AGENT_RESPONSES = {
  discovery: "Got it — routing to Scribe. I'll draft a post-meeting summary and client follow-up email for your approval shortly.",
  leap: "Noted. Routing your LEAP notes to the Service Agent. I'll extract Wealthbox tasks and queue them for your review.",
  remind: "On it. I'll generate appointment reminders for pending meetings and add them to your Approval Queue.",
  schedule: "Checking the calendar. I'll propose available slots that respect your capacity and blocked days.",
  summary: "Pulling your weekly summary now. It'll be ready in the Active Tasks feed.",
  default: "Understood. I'm on it — check your Approval Queue and Active Tasks for updates.",
};

function getResponse(text) {
  const lower = text.toLowerCase();
  if (lower.includes("discovery") || lower.includes("meeting done") || lower.includes("finished"))
    return AGENT_RESPONSES.discovery;
  if (lower.includes("leap")) return AGENT_RESPONSES.leap;
  if (lower.includes("remind")) return AGENT_RESPONSES.remind;
  if (lower.includes("schedule") || lower.includes("book")) return AGENT_RESPONSES.schedule;
  if (lower.includes("summary") || lower.includes("week")) return AGENT_RESPONSES.summary;
  return AGENT_RESPONSES.default;
}

export default function ChatBar() {
  const { chatMessages, addChatMessage } = useApp();
  const [input, setInput] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (expanded && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, expanded]);

  function sendMessage(text) {
    if (!text.trim()) return;
    const userMsg = { role: "user", content: text, timestamp: new Date().toISOString() };
    addChatMessage(userMsg);
    setInput("");
    setTimeout(() => {
      addChatMessage({
        role: "assistant",
        content: getResponse(text),
        timestamp: new Date().toISOString(),
      });
    }, 900);
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  function toggleVoice() {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Voice recognition is not supported in this browser. Try Chrome.");
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      setInput(transcript);
      setListening(false);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  function formatTime(ts) {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  return (
    <div className={`chat-bar ${expanded ? "expanded" : ""}`}>
      {expanded && (
        <div className="chat-history">
          {chatMessages.map((msg, i) => (
            <div key={i} className={`chat-msg ${msg.role}`}>
              <div className="chat-bubble">{msg.content}</div>
              <div className="chat-time">{formatTime(msg.timestamp)}</div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      )}
      <div className="chat-input-row">
        <button
          className="chat-toggle"
          onClick={() => setExpanded((v) => !v)}
          title={expanded ? "Collapse" : "Expand chat"}
        >
          {expanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>
        <input
          className="chat-input"
          placeholder={
            listening ? "Listening..." : 'Talk to your AI team... (e.g. "Priya Discovery done")'
          }
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          className={`icon-btn ${listening ? "listening" : ""}`}
          onClick={toggleVoice}
          title="Voice input"
        >
          {listening ? <MicOff size={18} /> : <Mic size={18} />}
        </button>
        <button
          className="icon-btn send-btn"
          onClick={() => sendMessage(input)}
          title="Send"
          disabled={!input.trim()}
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}
