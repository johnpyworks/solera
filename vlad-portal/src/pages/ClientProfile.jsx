import { useState, useEffect, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  MessageSquare,
  FileText,
  Calendar,
  Mail,
  StickyNote,
  Upload,
  Paperclip,
  CheckCircle,
  Clock,
  Users,
  Plus,
  X,
  ClipboardList,
  Check,
  Sparkles,
  BookOpen,
} from "lucide-react";
import MDEditor from "@uiw/react-md-editor";
import { useApp } from "../context/AppContext";
import { apiFetch, apiUpload } from "../api/client";
import { ApprovalCard } from "./ApprovalQueue";

const STAGE_COLORS = {
  Discovery: "#6366f1",
  "LEAP Process": "#8b5cf6",
  Implementation: "#06b6d4",
  "Solera Heartbeat": "#10b981",
};

const MEETING_COLORS = {
  Discovery: "#6366f1",
  "LEAP Process": "#8b5cf6",
  Implementation: "#06b6d4",
  "Solera Heartbeat": "#10b981",
};

const FILE_TYPE_LABELS = {
  transcript: "Transcript",
  form: "Form",
  document: "Document",
  brief: "Brief",
};

const TABS = ["Overview", "Meetings", "Emails", "Notes", "Files", "Tasks"];

// ── Household Panel ───────────────────────────────────────────

function HouseholdPanel({ client }) {
  const { addHouseholdMember, addMemberNote } = useApp();
  const [adding, setAdding] = useState(false);
  const [expandedMember, setExpandedMember] = useState(null);
  const [noteInputs, setNoteInputs] = useState({});
  const [form, setForm] = useState({ name: "", relationship: "Spouse", email: "", phone: "" });

  const household = client.household_detail;
  if (!household) return null;

  // Members from API response + any in-memory additions for this session
  const members = household.members || [];

  function handleAdd(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    addHouseholdMember(household.id, form);
    setForm({ name: "", relationship: "Spouse", email: "", phone: "" });
    setAdding(false);
  }

  function handleAddNote(memberId) {
    const text = (noteInputs[memberId] || "").trim();
    if (!text) return;
    addMemberNote(memberId, text);
    setNoteInputs((prev) => ({ ...prev, [memberId]: "" }));
  }

  return (
    <div className="household-panel">
      <div className="household-panel-header">
        <div className="household-panel-title">
          <Users size={14} />
          <span>{household.name}</span>
          <span className="household-count">{members.length + 1} members</span>
        </div>
        <button className="icon-btn" onClick={() => setAdding((v) => !v)} title="Add member">
          <Plus size={14} />
        </button>
      </div>

      {/* Primary (current client) */}
      <div className="hh-member primary">
        <div className="hh-member-avatar">{(client.full_name || "?")[0]}</div>
        <div className="hh-member-info">
          <div className="hh-member-name">{client.full_name}</div>
          <div className="hh-member-rel">Primary</div>
        </div>
      </div>

      {/* Linked members */}
      {members.map((m) => (
        <div key={m.id} className="hh-member-wrap">
          <div className="hh-member" onClick={() => setExpandedMember(expandedMember === m.id ? null : m.id)}>
            <div className="hh-member-avatar secondary">{m.name[0]}</div>
            <div className="hh-member-info">
              <div className="hh-member-name">{m.name}</div>
              <div className="hh-member-rel">{m.relationship}</div>
            </div>
            <div className="hh-member-contact">
              {m.email && <span>{m.email}</span>}
              {m.phone && <span>{m.phone}</span>}
            </div>
          </div>

          {expandedMember === m.id && (
            <div className="hh-member-notes">
              {(m.notes || []).length > 0 && (
                <div className="hh-notes-list">
                  {m.notes.map((n) => (
                    <div key={n.id} className="hh-note">
                      <span className="hh-note-author">{n.author}</span>
                      <span className="hh-note-text">{n.text}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="hh-note-add">
                <input
                  className="form-input"
                  placeholder={`Note about ${m.name}...`}
                  value={noteInputs[m.id] || ""}
                  onChange={(e) => setNoteInputs((prev) => ({ ...prev, [m.id]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") handleAddNote(m.id); }}
                />
                <button className="btn btn-primary btn-sm" onClick={() => handleAddNote(m.id)}>Add</button>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Add member form */}
      {adding && (
        <form className="hh-add-form" onSubmit={handleAdd}>
          <div className="hh-add-header">
            <span>Add household member</span>
            <button type="button" className="icon-btn" onClick={() => setAdding(false)}><X size={13} /></button>
          </div>
          <input className="form-input" placeholder="Full name *" value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
          <div className="form-row-2">
            <select className="form-input" value={form.relationship}
              onChange={(e) => setForm((p) => ({ ...p, relationship: e.target.value }))}>
              {["Spouse", "Partner", "Child", "Parent", "Sibling", "Other"].map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <input className="form-input" placeholder="Phone" value={form.phone}
              onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
          </div>
          <input className="form-input" placeholder="Email" value={form.email}
            onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
          <button type="submit" className="btn btn-primary" style={{ width: "100%" }}>Add Member</button>
        </form>
      )}
    </div>
  );
}

// ── Overview Tab ──────────────────────────────────────────────

function OverviewTab({ client, clientMeetings, clientApprovals, clientNotes, clientFiles, submissions = [], tasks, memories }) {
  // Build merged timeline from all sources
  const timeline = [
    ...clientMeetings.map((m) => ({
      type: "meeting",
      date: m.scheduled_at,
      label: `${m.meeting_type} meeting`,
      sub: `${m.duration_min} min · ${m.location || ""}`,
      color: MEETING_COLORS[m.meeting_type] || "#94a3b8",
    })),
    ...clientApprovals.map((a) => ({
      type: "email",
      date: a.created_at,
      label: a.item_type.replace(/_/g, " "),
      sub: `by ${a.agent} · ${a.status}`,
      color: "#6366f1",
    })),
    ...(clientNotes || []).map((n) => ({
      type: "note",
      date: n.created_at,
      label: n.note_type === "ai_summary" ? "AI summary added" : "Note added",
      sub: n.text.slice(0, 70) + (n.text.length > 70 ? "…" : ""),
      color: "#10b981",
    })),
    ...(clientFiles || []).map((f) => ({
      type: "file",
      date: f.uploaded_at,
      label: `File uploaded — ${f.name}`,
      sub: `${f.size_kb} KB · by ${f.uploaded_by}`,
      color: "#f59e0b",
    })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  function formatDate(iso) {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  const nextMeeting = clientMeetings
    .filter((m) => new Date(m.scheduled_at) > new Date())
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))[0];

  const pendingApprovals = clientApprovals.filter((a) => a.status === "pending").length;

  return (
    <div className="profile-overview">
      <div className="overview-left">
        <div className="overview-quick-stats">
          <div className="quick-stat">
            <div className="quick-stat-val">{clientMeetings.length}</div>
            <div className="quick-stat-label">Meetings</div>
          </div>
          <div className="quick-stat">
            <div className="quick-stat-val" style={pendingApprovals > 0 ? { color: "#f59e0b" } : {}}>
              {pendingApprovals}
            </div>
            <div className="quick-stat-label">Pending approvals</div>
          </div>
          <div className="quick-stat">
            <div className="quick-stat-val">{(clientNotes || []).length}</div>
            <div className="quick-stat-label">Notes</div>
          </div>
          <div className="quick-stat">
            <div className="quick-stat-val">{(clientFiles || []).length}</div>
            <div className="quick-stat-label">Files</div>
          </div>
        </div>

        {client.household && <HouseholdPanel client={client} />}

        {submissions.length > 0 && (
          <div className="q-submission-card">
            <div className="q-submission-header">
              <ClipboardList size={14} />
              <span>Questionnaire Submitted</span>
            </div>
            {submissions.map((s, i) => (
              <div key={i} className="q-submission-row">
                <CheckCircle size={13} style={{ color: "#10b981" }} />
                <span>{new Date(s.submitted_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                <span className="q-submission-email">{s.client_email}</span>
              </div>
            ))}
          </div>
        )}

        {nextMeeting && (
          <div className="next-meeting-card">
            <div className="next-meeting-label">Next meeting</div>
            <div className="next-meeting-type" style={{ color: MEETING_COLORS[nextMeeting.meeting_type] }}>
              {nextMeeting.meeting_type}
            </div>
            <div className="next-meeting-date">
              {new Date(nextMeeting.scheduled_at).toLocaleDateString("en-US", {
                weekday: "short", month: "short", day: "numeric",
              })}{" "}
              at{" "}
              {new Date(nextMeeting.scheduled_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              {nextMeeting.location ? ` · ${nextMeeting.location}` : ""}
            </div>
          </div>
        )}

        {/* Open Tasks */}
        {tasks && tasks.length > 0 && (
          <div className="tasks-panel">
            <div className="tasks-panel-header">
              <ClipboardList size={14} />
              <span>Open Tasks</span>
            </div>
            {tasks.filter(t => t.status === "open").map(task => (
              <div key={task.id} className="task-item">
                <span className={`task-owner-badge ${task.owner_type}`}>{task.owner_type}</span>
                <span className="task-title">{task.title}</span>
                {task.due_date && <span className="task-due">{new Date(task.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}
              </div>
            ))}
          </div>
        )}

        {/* Client Memory / Context */}
        {memories && memories.length > 0 && (
          <div className="memory-panel">
            <div className="memory-panel-header">
              <StickyNote size={14} />
              <span>Client Context</span>
            </div>
            {memories.map(m => (
              <div key={m.id} className="memory-item">
                <span className="memory-key">{m.key.replace(/_/g, " ")}</span>
                <span className="memory-value">{m.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="overview-right">
        <h3 className="timeline-heading">Activity</h3>
        {timeline.length === 0 ? (
          <p className="empty-state">No activity yet.</p>
        ) : (
          <div className="timeline">
            {timeline.map((item, i) => (
              <div key={i} className="timeline-item">
                <div className="timeline-dot" style={{ borderColor: item.color + "66" }}>
                  {item.type === "meeting" && <Calendar size={12} style={{ color: item.color }} />}
                  {item.type === "email" && <Mail size={12} style={{ color: item.color }} />}
                  {item.type === "note" && <StickyNote size={12} style={{ color: item.color }} />}
                  {item.type === "file" && <Paperclip size={12} style={{ color: item.color }} />}
                </div>
                <div className="timeline-body">
                  <div className="timeline-label">{item.label}</div>
                  <div className="timeline-sub">{item.sub}</div>
                  <div className="timeline-date">{formatDate(item.date)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Transcript Modal ──────────────────────────────────────────

function TranscriptModal({ meeting, clientId, onClose, onProcessingStart, onProcessingDone }) {
  const [tab, setTab] = useState("paste"); // "paste" | "file"
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("idle"); // "idle" | "saving" | "processing" | "done" | "error"
  const [error, setError] = useState("");
  const pollRef = useRef(null);

  async function handleProcess() {
    if (tab === "paste" && !text.trim()) return;
    if (tab === "file" && !file) return;

    setStatus("saving");
    setError("");

    try {
      // Step 1: Save transcript to meeting
      if (tab === "paste") {
        await apiFetch(`/meetings/${meeting.id}/`, {
          method: "PATCH",
          body: JSON.stringify({ transcript_text: text.trim() }),
        });
      } else {
        // File upload via /documents/upload/
        const formData = new FormData();
        formData.append("client", clientId);
        formData.append("meeting", meeting.id);
        formData.append("file", file);
        await apiUpload("/documents/upload/", formData);
        // Also read file text and patch the meeting
        const fileText = await file.text();
        await apiFetch(`/meetings/${meeting.id}/`, {
          method: "PATCH",
          body: JSON.stringify({ transcript_text: fileText }),
        });
      }

      // Step 2: Trigger processing
      setStatus("processing");
      onProcessingStart(meeting.id);
      await apiFetch(`/meetings/${meeting.id}/process/`, { method: "POST" });

      // Step 3: Poll agent logs for completion
      let attempts = 0;
      pollRef.current = setInterval(async () => {
        attempts++;
        try {
          const logs = await apiFetch(`/agent-logs/?client_id=${clientId}&ordering=-created_at&page_size=5`);
          const results = Array.isArray(logs) ? logs : (logs.results || []);
          const done = results.find(l => l.status === "complete" || l.status === "failed");
          if (done || attempts > 30) { // max ~2 min
            clearInterval(pollRef.current);
            setStatus("done");
            onProcessingDone(meeting.id);
          }
        } catch (_) {}
      }, 4000);
    } catch (err) {
      setStatus("error");
      setError(err.message || "Failed to process transcript.");
    }
  }

  // Cleanup poll on unmount
  useEffect(() => () => clearInterval(pollRef.current), []);

  return (
    <div className="modal-overlay" onClick={status === "idle" ? onClose : undefined}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add Transcript</h2>
          {status === "idle" && <button className="icon-btn" onClick={onClose}><X size={16} /></button>}
        </div>
        <div className="modal-form">
          <p className="transcript-meeting-label">
            {meeting.meeting_type} · {new Date(meeting.scheduled_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </p>

          {status === "idle" && (
            <>
              <div className="transcript-tabs">
                <button className={`transcript-tab${tab === "paste" ? " active" : ""}`} onClick={() => setTab("paste")}>Paste Text</button>
                <button className={`transcript-tab${tab === "file" ? " active" : ""}`} onClick={() => setTab("file")}>Upload File</button>
              </div>
              {tab === "paste" ? (
                <textarea
                  className="note-textarea"
                  rows={10}
                  placeholder="Paste the meeting transcript here..."
                  value={text}
                  onChange={e => setText(e.target.value)}
                  style={{ minHeight: 200 }}
                />
              ) : (
                <div className="file-drop-area" onClick={() => document.getElementById("transcript-file-input").click()}>
                  <input
                    id="transcript-file-input"
                    type="file"
                    accept=".txt,.vtt,.srt"
                    style={{ display: "none" }}
                    onChange={e => setFile(e.target.files[0])}
                  />
                  {file ? (
                    <span className="file-selected"><FileText size={16} /> {file.name}</span>
                  ) : (
                    <span className="file-drop-hint"><Upload size={20} /><br />Click to select .txt, .vtt, or .srt file</span>
                  )}
                </div>
              )}
            </>
          )}

          {status === "saving" && <div className="processing-status"><Clock size={16} /> Saving transcript…</div>}
          {status === "processing" && (
            <div className="processing-status">
              <Clock size={16} /> Processing with AI… this may take 30–60 seconds.
              <p className="processing-sub">Scribe is reading the transcript and generating drafts for the Approval Queue.</p>
            </div>
          )}
          {status === "done" && (
            <div className="processing-done">
              <CheckCircle size={24} style={{ color: "#10b981" }} />
              <p>Drafts are ready in the <strong>Approval Queue</strong>.</p>
              <button className="btn btn-primary" onClick={onClose}>Done</button>
            </div>
          )}
          {status === "error" && (
            <div>
              <div className="form-error">{error}</div>
              <button className="btn btn-ghost" onClick={() => setStatus("idle")}>Try Again</button>
            </div>
          )}
        </div>
        {status === "idle" && (
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary"
              onClick={handleProcess}
              disabled={(tab === "paste" && !text.trim()) || (tab === "file" && !file)}>
              Process with AI
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── New Meeting Modal ─────────────────────────────────────────

function NewMeetingModal({ clientId, onClose, onCreated }) {
  const MEETING_TYPES = ["Discovery", "LEAP Process", "Implementation", "Solera Heartbeat", "30-Day Check-In", "Other"];
  const [form, setForm] = useState({
    meeting_type: "Discovery",
    scheduled_at: "",
    duration_min: 60,
    location: "Zoom",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.scheduled_at) { setError("Date and time required."); return; }
    setSaving(true);
    try {
      const meeting = await apiFetch("/meetings/", {
        method: "POST",
        body: JSON.stringify({ ...form, client: clientId }),
      });
      onCreated(meeting);
    } catch (err) {
      setError(err.message || "Failed to create meeting.");
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>New Meeting</h2>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>
        <form className="modal-form" onSubmit={handleSubmit}>
          <div className="form-row">
            <label>Meeting Type</label>
            <select className="form-input" value={form.meeting_type} onChange={e => setForm(p => ({ ...p, meeting_type: e.target.value }))}>
              {MEETING_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="form-row">
            <label>Date & Time</label>
            <input className="form-input" type="datetime-local" value={form.scheduled_at}
              onChange={e => setForm(p => ({ ...p, scheduled_at: e.target.value }))} />
          </div>
          <div className="form-row-2">
            <div className="form-row">
              <label>Duration (min)</label>
              <input className="form-input" type="number" min={15} max={240} step={15} value={form.duration_min}
                onChange={e => setForm(p => ({ ...p, duration_min: parseInt(e.target.value) }))} />
            </div>
            <div className="form-row">
              <label>Location</label>
              <input className="form-input" placeholder="Zoom" value={form.location}
                onChange={e => setForm(p => ({ ...p, location: e.target.value }))} />
            </div>
          </div>
          {error && <div className="form-error">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Creating…" : "Create Meeting"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Meetings Tab ──────────────────────────────────────────────

function MeetingsTab({ clientId, clientMeetings, setClientMeetings, meetingsLoading }) {
  const [expanded, setExpanded] = useState(null);
  const [showNewMeeting, setShowNewMeeting] = useState(false);
  const [transcriptModal, setTranscriptModal] = useState(null); // meeting object or null
  const [processingId, setProcessingId] = useState(null); // meeting.id being processed
  const [processDone, setProcessDone] = useState({}); // { [meetingId]: true }

  function formatDateTime(iso) {
    return new Date(iso).toLocaleDateString("en-US", {
      weekday: "short", month: "short", day: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }

  const sorted = [...clientMeetings].sort((a, b) => new Date(b.scheduled_at) - new Date(a.scheduled_at));
  const isPast = (date) => new Date(date) < new Date();

  if (meetingsLoading) {
    return <p className="empty-state">Loading meetings…</p>;
  }

  return (
    <div className="meetings-tab">
      <div className="meetings-tab-header">
        <button className="btn btn-primary btn-sm" onClick={() => setShowNewMeeting(true)}>
          <Plus size={14} /> New Meeting
        </button>
      </div>

      {showNewMeeting && (
        <NewMeetingModal
          clientId={clientId}
          onClose={() => setShowNewMeeting(false)}
          onCreated={(newMeeting) => {
            setClientMeetings(prev => [newMeeting, ...prev]);
            setShowNewMeeting(false);
          }}
        />
      )}

      {sorted.length === 0 ? (
        <p className="empty-state">No meetings on record for this client.</p>
      ) : (
        sorted.map((m) => {
          const past = isPast(m.scheduled_at);
          return (
            <div key={m.id} className="meeting-record">
              <div
                className="meeting-record-header"
                onClick={() => setExpanded(expanded === m.id ? null : m.id)}
              >
                <div className="meeting-record-left">
                  <div
                    className="meeting-type-pill"
                    style={{ background: (MEETING_COLORS[m.meeting_type] || "#94a3b8") + "22", color: MEETING_COLORS[m.meeting_type] || "#94a3b8" }}
                  >
                    {m.meeting_type}
                  </div>
                  <div>
                    <div className="meeting-record-date">{formatDateTime(m.scheduled_at)}</div>
                    <div className="meeting-record-meta">
                      {m.duration_min} min{m.location ? ` · ${m.location}` : ""}
                    </div>
                  </div>
                </div>
                <div className="meeting-record-right">
                  {past ? (
                    <span className="badge-status complete"><CheckCircle size={12} /> Past</span>
                  ) : (
                    <span className="badge-status upcoming"><Clock size={12} /> Upcoming</span>
                  )}
                  <div className="meeting-record-actions" onClick={e => e.stopPropagation()}>
                    {m.processed ? (
                      <span className="badge-processed"><CheckCircle size={12} /> Processed</span>
                    ) : (
                      processingId === m.id ? (
                        <span className="processing-badge"><Clock size={12} /> Processing…</span>
                      ) : processDone[m.id] ? (
                        <span className="badge-processed"><CheckCircle size={12} /> Drafts ready</span>
                      ) : (
                        <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); setTranscriptModal(m); }}>
                          Add Transcript
                        </button>
                      )
                    )}
                  </div>
                </div>
              </div>
              {expanded === m.id && (m.transcript_text || m.leap_notes_text) && (
                <div className="meeting-record-body">
                  {m.transcript_text && (
                    <>
                      <div className="notes-section-label">Meeting Transcript / Notes</div>
                      <pre className="meeting-notes-text">{m.transcript_text}</pre>
                    </>
                  )}
                  {m.leap_notes_text && (
                    <>
                      <div className="notes-section-label">LEAP Notes</div>
                      <pre className="meeting-notes-text">{m.leap_notes_text}</pre>
                    </>
                  )}
                </div>
              )}
              {expanded === m.id && !m.transcript_text && !m.leap_notes_text && (
                <div className="meeting-record-body">
                  <p className="empty-state">No notes or transcript attached to this meeting.</p>
                </div>
              )}
            </div>
          );
        })
      )}

      {transcriptModal && (
        <TranscriptModal
          meeting={transcriptModal}
          clientId={clientId}
          onClose={() => setTranscriptModal(null)}
          onProcessingStart={(id) => setProcessingId(id)}
          onProcessingDone={(id) => { setProcessingId(null); setProcessDone(prev => ({ ...prev, [id]: true })); setTranscriptModal(null); }}
        />
      )}
    </div>
  );
}

// ── Emails Tab ────────────────────────────────────────────────

function EmailsTab({ clientApprovals }) {
  if (clientApprovals.length === 0) {
    return <p className="empty-state">No emails or approvals for this client yet.</p>;
  }
  return (
    <div className="approvals-list">
      {clientApprovals.map((item) => (
        <ApprovalCard key={item.id} item={item} />
      ))}
    </div>
  );
}

// ── Notes Tab ─────────────────────────────────────────────────

const NOTE_MAX = 5000;

function NotesTab({ notes, notesLoading, onAddNote }) {
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleAdd() {
    const text = draft.trim();
    if (!text || text.length > NOTE_MAX) return;
    setSaving(true);
    setError("");
    try {
      await onAddNote(text);
      setDraft("");
    } catch (err) {
      setError(err.message || "Failed to save note.");
    } finally {
      setSaving(false);
    }
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    });
  }

  const remaining = NOTE_MAX - draft.length;
  const overLimit = draft.length > NOTE_MAX;

  return (
    <div className="notes-tab">
      <div className="note-add">
        <textarea
          className="note-textarea"
          placeholder="Add a note about this client..."
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
        />
        <div className="note-add-footer">
          <span className={`note-char-count${overLimit ? " over-limit" : remaining < 200 ? " near-limit" : ""}`}>
            {draft.length}/{NOTE_MAX}
          </span>
          <button
            className="btn btn-primary"
            onClick={handleAdd}
            disabled={!draft.trim() || overLimit || saving}
          >
            {saving ? "Saving…" : "Add Note"}
          </button>
        </div>
        {error && <div className="form-error">{error}</div>}
      </div>
      <div className="notes-list">
        {notesLoading ? (
          <p className="empty-state">Loading notes…</p>
        ) : notes.length === 0 ? (
          <p className="empty-state">No notes yet.</p>
        ) : (
          notes.map((note) => (
            <div key={note.id} className="note-item">
              <div className="note-meta">
                <span className="note-author">{note.author}</span>
                <span className="note-date">{formatDate(note.created_at)}</span>
              </div>
              <p className="note-text">{note.text}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Files Tab ─────────────────────────────────────────────────

const ACCEPTED_TYPES = ".pdf,.docx,.xlsx,.txt,.vtt,.srt";
const FILE_TYPE_ICONS = { pdf: "PDF", docx: "DOC", xlsx: "XLS", txt: "TXT", transcript: "TXT", other: "FILE" };

function FilesTab({ clientId }) {
  const [files, setFiles] = useState(null); // null = loading
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [wikiStatus, setWikiStatus] = useState({}); // { [fileId]: "indexing" | "done" }
  const fileInputRef = useRef(null);

  useEffect(() => {
    apiFetch(`/clients/${clientId}/files/`)
      .then(d => setFiles(Array.isArray(d) ? d : (d.results || [])))
      .catch(() => setFiles([]));
  }, [clientId]);

  async function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setUploadError("");
    try {
      const formData = new FormData();
      formData.append("client", clientId);
      formData.append("file", file);
      const newFile = await apiUpload("/documents/upload/", formData);
      setFiles(prev => [newFile, ...(prev || [])]);
      // Show "indexing" badge briefly
      setWikiStatus(prev => ({ ...prev, [newFile.id]: "indexing" }));
      setTimeout(() => {
        setWikiStatus(prev => ({ ...prev, [newFile.id]: "done" }));
      }, 8000);
    } catch (err) {
      setUploadError(err.message || "Upload failed.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  return (
    <div className="files-tab">
      {/* Upload area */}
      <div
        className="file-drop-area"
        onClick={() => !uploading && fileInputRef.current?.click()}
        style={{ cursor: uploading ? "default" : "pointer" }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES}
          style={{ display: "none" }}
          onChange={handleUpload}
        />
        {uploading ? (
          <span className="file-drop-hint"><Clock size={18} /> Uploading and indexing…</span>
        ) : (
          <span className="file-drop-hint">
            <Upload size={18} />
            <span>Click to upload a file</span>
            <span style={{ fontSize: 11, color: "var(--text-sm)" }}>PDF · Word · Excel · TXT · VTT</span>
          </span>
        )}
      </div>
      {uploadError && <div className="form-error" style={{ marginTop: 8 }}>{uploadError}</div>}

      {/* File list */}
      {files === null ? (
        <p className="empty-state">Loading files…</p>
      ) : files.length === 0 ? (
        <p className="empty-state">No files uploaded yet. Upload a document to start building the client knowledge base.</p>
      ) : (
        <div className="files-list" style={{ marginTop: 16 }}>
          {files.map((f) => (
            <div key={f.id} className="file-item">
              <div className="file-type-chip">{FILE_TYPE_ICONS[f.file_type] || "FILE"}</div>
              <div className="file-info">
                <div className="file-name">{f.name}</div>
                <div className="file-meta">
                  {f.size_kb} KB · {formatDate(f.created_at)} · by {f.uploaded_by}
                  {f.meeting && " · linked to meeting"}
                </div>
              </div>
              {wikiStatus[f.id] === "indexing" && (
                <span className="file-wiki-badge indexing"><Clock size={11} /> Indexing…</span>
              )}
              {wikiStatus[f.id] === "done" && (
                <span className="file-wiki-badge done"><CheckCircle size={11} /> Indexed</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Send Questionnaire Modal ──────────────────────────────────

function SendQuestionnaireModal({ client, onClose }) {
  const { createQuestionnaireToken } = useApp();
  const [email, setEmail] = useState(client.email || "");
  const [sent, setSent] = useState(false);
  const [token] = useState(`tok_${client.id}_${Date.now()}`);
  const previewLink = `${window.location.origin}/form/${token}`;

  function handleSend() {
    createQuestionnaireToken(client.id, email, token);
    setSent(true);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Send Questionnaire</h2>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>

        {sent ? (
          <div className="q-modal-sent">
            <CheckCircle size={32} style={{ color: "#10b981" }} />
            <p>Added to the <strong>Approval Queue</strong>. Once approved, the client will receive an email with their form link.</p>
            <button className="btn btn-primary" onClick={onClose}>Done</button>
          </div>
        ) : (
          <>
            <div className="modal-form">
              <div className="form-row">
                <label>Send to (email)</label>
                <input className="form-input" type="email" value={email}
                  onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="form-row">
                <label>Email Preview</label>
                <div className="q-email-preview">
                  <div className="q-ep-row"><strong>To:</strong> {email || "(enter email above)"}</div>
                  <div className="q-ep-row"><strong>Subject:</strong> Your Solera Financial Questionnaire</div>
                  <div className="q-ep-body">
                    Hi {client.full_name},
                    <br /><br />
                    Please complete your financial questionnaire using the secure link below:
                    <br /><br />
                    <span className="q-ep-link">{previewLink}</span>
                    <br /><br />
                    This form typically takes 10–15 minutes. You can also print a blank version from the form page.
                    <br /><br />
                    Thank you,<br />
                    Vlad Donets<br />
                    Solera Financial Advisory
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSend} disabled={!email.trim()}>
                Send for Approval
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Meeting Prep Panel ────────────────────────────────────────

const MEETING_TYPES_PREP = [
  "", "Discovery", "LEAP Process", "Implementation",
  "Solera Heartbeat", "30-Day Check-In", "Annual Review", "Other",
];

function MeetingPrepPanel({ clientId, clientName, onClose }) {
  const [meetingType, setMeetingType] = useState("");
  const [focus, setFocus] = useState("");
  const [status, setStatus] = useState("idle"); // idle | loading | done | error
  const [brief, setBrief] = useState("");
  const [articlesUsed, setArticlesUsed] = useState([]);
  const [error, setError] = useState("");

  async function handleGenerate() {
    setStatus("loading");
    setError("");
    try {
      const result = await apiFetch(`/clients/${clientId}/prep/`, {
        method: "POST",
        body: JSON.stringify({ meeting_type: meetingType, focus }),
      });
      setBrief(result.brief || "");
      setArticlesUsed(result.articles_used || []);
      setStatus("done");
    } catch (err) {
      setError(err.message || "Failed to generate prep brief.");
      setStatus("error");
    }
  }

  return (
    <div className="prep-panel-overlay" onClick={onClose}>
      <div className="prep-panel" onClick={e => e.stopPropagation()}>
        <div className="prep-panel-header">
          <div className="prep-panel-title">
            <BookOpen size={16} />
            <span>Meeting Prep — {clientName}</span>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>

        {status !== "done" && (
          <div className="prep-panel-form">
            <div className="form-row">
              <label>Meeting type (optional)</label>
              <select className="form-input" value={meetingType} onChange={e => setMeetingType(e.target.value)}>
                {MEETING_TYPES_PREP.map(t => <option key={t} value={t}>{t || "— select or leave blank —"}</option>)}
              </select>
            </div>
            <div className="form-row">
              <label>Focus area (optional)</label>
              <input
                className="form-input"
                placeholder='e.g. "insurance only" or "review open action items"'
                value={focus}
                onChange={e => setFocus(e.target.value)}
              />
            </div>
            {status === "error" && <div className="form-error">{error}</div>}
            <button
              className="btn btn-primary"
              onClick={handleGenerate}
              disabled={status === "loading"}
              style={{ width: "100%" }}
            >
              {status === "loading" ? (
                <><Clock size={14} /> Generating brief…</>
              ) : (
                <><Sparkles size={14} /> Generate Prep Brief</>
              )}
            </button>
            {status === "loading" && (
              <p className="prep-loading-hint">Reading client knowledge base… this takes 15–30 seconds.</p>
            )}
          </div>
        )}

        {status === "done" && (
          <div className="prep-panel-result">
            {articlesUsed.length > 0 && (
              <div className="prep-sources">
                <span className="prep-sources-label">Sources used:</span>
                {articlesUsed.map(a => (
                  <span key={a.type} className="prep-source-tag">{a.title}</span>
                ))}
              </div>
            )}
            <div className="prep-brief-body" data-color-mode="dark">
              <MDEditor.Markdown source={brief} />
            </div>
            <button
              className="btn btn-ghost"
              style={{ marginTop: 16 }}
              onClick={() => setStatus("idle")}
            >
              Generate New Brief
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main ClientProfile ────────────────────────────────────────

export default function ClientProfile({ onOpenChat }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { clientFiles, getSubmissionsForClient } = useApp();
  const [activeTab, setActiveTab] = useState("Overview");
  const [showQModal, setShowQModal] = useState(false);
  const [showPrepPanel, setShowPrepPanel] = useState(false);

  // Fetch client from real API
  const [client, setClient] = useState(null);
  const [clientLoading, setClientLoading] = useState(true);

  useEffect(() => {
    setClientLoading(true);
    setClient(null);
    apiFetch(`/clients/${id}/`)
      .then((data) => setClient(data))
      .catch(() => setClient(false))
      .finally(() => setClientLoading(false));
  }, [id]);

  // Notes — fetched from real API, shared between Overview and Notes tabs
  const [notes, setNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(true);

  useEffect(() => {
    setNotesLoading(true);
    apiFetch(`/clients/${id}/notes/`)
      .then((data) => setNotes(Array.isArray(data) ? data : (data.results || [])))
      .catch(() => setNotes([]))
      .finally(() => setNotesLoading(false));
  }, [id]);

  // Meetings — fetched from real API
  const [clientMeetings, setClientMeetings] = useState([]);
  const [meetingsLoading, setMeetingsLoading] = useState(true);

  useEffect(() => {
    setMeetingsLoading(true);
    apiFetch(`/clients/${id}/meetings/`)
      .then(data => setClientMeetings(Array.isArray(data) ? data : (data.results || [])))
      .catch(() => setClientMeetings([]))
      .finally(() => setMeetingsLoading(false));
  }, [id]);

  // Tasks and memories
  const [tasks, setTasks] = useState([]);
  const [memories, setMemories] = useState([]);
  const [taskAiResults, setTaskAiResults] = useState({});

  useEffect(() => {
    apiFetch(`/clients/${id}/tasks/`).then(d => setTasks(Array.isArray(d) ? d : (d.results || []))).catch(() => {});
    apiFetch(`/clients/${id}/memories/`).then(d => setMemories(Array.isArray(d) ? d : (d.results || []))).catch(() => {});
  }, [id]);

  async function markTaskDone(taskId) {
    try {
      await apiFetch(`/clients/${id}/tasks/${taskId}/`, {
        method: "PATCH",
        body: JSON.stringify({ status: "done" }),
      });
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: "done" } : t));
    } catch (e) {
      alert(`Could not update task: ${e.message}`);
    }
  }

  async function handleTaskAskAi(task) {
    try {
      const data = await apiFetch("/chat/messages/", {
        method: "POST",
        body: JSON.stringify({
          session_id: `task-${task.id}`,
          content: `What's the best way to complete this action item? Task: "${task.title}" (owner: ${task.owner_type})`,
          client_id: id,
        }),
      });
      setTaskAiResults(prev => ({ ...prev, [task.id]: data.assistant.content }));
    } catch (e) {
      setTaskAiResults(prev => ({ ...prev, [task.id]: `[Error: ${e.message}]` }));
    }
  }

  // Approvals — fetched from real API
  const [clientApprovals, setClientApprovals] = useState([]);

  useEffect(() => {
    apiFetch(`/clients/${id}/approvals/`)
      .then(d => setClientApprovals(Array.isArray(d) ? d : (d.results || [])))
      .catch(() => setClientApprovals([]));
  }, [id]);

  async function handleAddNote(text) {
    const note = await apiFetch(`/clients/${id}/notes/`, {
      method: "POST",
      body: JSON.stringify({ text, note_type: "advisor_note" }),
    });
    setNotes((prev) => [note, ...prev]);
  }

  if (clientLoading) {
    return (
      <div className="page">
        <div className="empty-state" style={{ marginTop: 80 }}>Loading client…</div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="page">
        <p className="empty-state">
          Client not found.{" "}
          <Link to="/clients" style={{ color: "var(--accent)" }}>
            Back to Clients
          </Link>
        </p>
      </div>
    );
  }

  const pendingCount = clientApprovals.filter((a) => a.status === "pending").length;
  const firstName = (client.full_name || "").split(" ")[0] || "Client";

  return (
    <div className="page">
      {/* Back nav */}
      <button className="back-btn" onClick={() => navigate("/clients")}>
        <ArrowLeft size={15} /> All Clients
      </button>

      {/* Client header */}
      <div className="client-profile-header">
        <div className="client-profile-avatar">{(client.full_name || "?")[0]}</div>
        <div className="client-profile-info">
          <div className="client-profile-name-row">
            <h1>{client.full_name}</h1>
            {client.language_tag === "ru" && <span className="ru-tag">RU</span>}
          </div>
          <div className="client-profile-meta">
            <span
              className="stage-pill"
              style={{
                background: (STAGE_COLORS[client.meeting_stage] || "#94a3b8") + "22",
                color: STAGE_COLORS[client.meeting_stage] || "#94a3b8",
              }}
            >
              {client.meeting_stage}
            </span>
            {client.wealthbox_id && (
              <span className="meta-sep">{client.wealthbox_id}</span>
            )}
            {client.owner_username && (
              <span className="meta-sep">Advisor: {client.owner_username}</span>
            )}
            {pendingCount > 0 && (
              <span className="meta-pending">{pendingCount} pending approval{pendingCount > 1 ? "s" : ""}</span>
            )}
          </div>
          <div className="client-contacts">
            {client.email && <span>{client.email}</span>}
            {client.phone && <span>{client.phone}</span>}
          </div>
        </div>
        <div className="profile-header-actions">
          <button className="btn btn-ghost" onClick={() => setShowQModal(true)}>
            <ClipboardList size={15} />
            Send Questionnaire
          </button>
          <button className="btn btn-ghost" onClick={() => setShowPrepPanel(true)}>
            <BookOpen size={15} />
            Prep for Meeting
          </button>
          <button className="btn btn-primary" onClick={onOpenChat}>
            <MessageSquare size={15} />
            Ask AI about {firstName}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="filter-tabs">
        {TABS.map((tab) => (
          <button
            key={tab}
            className={`filter-tab ${activeTab === tab ? "active" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
            {tab === "Emails" && clientApprovals.length > 0 && (
              <span className="tab-count">{clientApprovals.length}</span>
            )}
            {tab === "Meetings" && clientMeetings.length > 0 && (
              <span className="tab-count">{clientMeetings.length}</span>
            )}
            {tab === "Notes" && notes.length > 0 && (
              <span className="tab-count">{notes.length}</span>
            )}
            {tab === "Files" && (clientFiles[id] || []).length > 0 && (
              <span className="tab-count">{(clientFiles[id] || []).length}</span>
            )}
            {tab === "Tasks" && tasks.filter(t => t.status === "open").length > 0 && (
              <span className="tab-count">{tasks.filter(t => t.status === "open").length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "Overview" && (
        <OverviewTab
          client={client}
          clientMeetings={clientMeetings}
          clientApprovals={clientApprovals}
          clientNotes={notes}
          clientFiles={clientFiles[id]}
          submissions={getSubmissionsForClient(id)}
          tasks={tasks}
          memories={memories}
        />
      )}
      {activeTab === "Meetings" && (
        <MeetingsTab
          clientId={id}
          clientMeetings={clientMeetings}
          setClientMeetings={setClientMeetings}
          meetingsLoading={meetingsLoading}
        />
      )}
      {activeTab === "Emails" && <EmailsTab clientApprovals={clientApprovals} />}
      {activeTab === "Notes" && (
        <NotesTab notes={notes} notesLoading={notesLoading} onAddNote={handleAddNote} />
      )}
      {activeTab === "Files" && <FilesTab clientId={id} />}

      {activeTab === "Tasks" && (() => {
        const openTasks = tasks.filter(t => t.status === "open");
        const doneTasks = tasks.filter(t => t.status === "done");
        function fmtDate(d) {
          return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
        }
        return (
          <div className="tasks-tab">
            <h3 className="tasks-tab-heading">Open Tasks</h3>
            {openTasks.length === 0 && (
              <p className="empty-state">No open tasks. Approve action items in the Approval Queue to populate tasks.</p>
            )}
            {openTasks.map(task => (
              <div key={task.id} className="task-card-full">
                <div className="task-card-left">
                  <span className={`task-owner-badge ${task.owner_type}`}>{task.owner_type}</span>
                  <span className="task-title">{task.title}</span>
                  {task.due_date && <span className="task-due">Due {fmtDate(task.due_date)}</span>}
                </div>
                <div className="task-card-actions">
                  <button
                    className="btn btn-ghost btn-xs"
                    onClick={() => handleTaskAskAi(task)}
                    title="Ask AI for guidance on this task"
                  >
                    <Sparkles size={13} /> Ask AI
                  </button>
                  <button
                    className="btn btn-approve btn-xs"
                    onClick={() => markTaskDone(task.id)}
                    title="Mark as done"
                  >
                    <Check size={13} /> Done
                  </button>
                </div>
                {taskAiResults[task.id] && (
                  <div className="task-ai-suggestion">{taskAiResults[task.id]}</div>
                )}
              </div>
            ))}

            {doneTasks.length > 0 && (
              <details className="done-tasks-section">
                <summary>Completed ({doneTasks.length})</summary>
                <div style={{ marginTop: 8 }}>
                  {doneTasks.map(task => (
                    <div key={task.id} className="task-card-full done">
                      <span className={`task-owner-badge ${task.owner_type}`}>{task.owner_type}</span>
                      <span className="task-title task-title-done">{task.title}</span>
                      {task.due_date && <span className="task-due">Due {fmtDate(task.due_date)}</span>}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        );
      })()}

      {showQModal && (
        <SendQuestionnaireModal client={client} onClose={() => setShowQModal(false)} />
      )}

      {showPrepPanel && (
        <MeetingPrepPanel
          clientId={id}
          clientName={client.full_name}
          onClose={() => setShowPrepPanel(false)}
        />
      )}
    </div>
  );
}
