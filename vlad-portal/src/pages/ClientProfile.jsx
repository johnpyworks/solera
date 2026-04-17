import { useState } from "react";
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
} from "lucide-react";
import { clients, meetings, upcomingMeetings, approvalItems, households } from "../data/mockData";
import { useApp } from "../context/AppContext";
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

const TABS = ["Overview", "Meetings", "Emails", "Notes", "Files"];

// ── Household Panel ───────────────────────────────────────────

function HouseholdPanel({ client }) {
  const { getMembersForHousehold, addHouseholdMember, addMemberNote } = useApp();
  const [adding, setAdding] = useState(false);
  const [expandedMember, setExpandedMember] = useState(null);
  const [noteInputs, setNoteInputs] = useState({});
  const [form, setForm] = useState({ name: "", relationship: "Spouse", email: "", phone: "" });

  const household = households.find((h) => h.id === client.household_id);
  if (!household) return null;

  const members = getMembersForHousehold(client.household_id);

  function handleAdd(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    addHouseholdMember(client.household_id, form);
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
        <div className="hh-member-avatar">{client.name[0]}</div>
        <div className="hh-member-info">
          <div className="hh-member-name">{client.name}</div>
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
              {m.notes.length > 0 && (
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

function OverviewTab({ client, clientMeetings, clientApprovals, clientNotes, clientFiles, submissions = [] }) {
  // Build merged timeline from all sources
  const timeline = [
    ...clientMeetings.map((m) => ({
      type: "meeting",
      date: m.date,
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
      label: n.type === "ai_summary" ? "AI summary added" : "Note added",
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
    .filter((m) => new Date(m.date) > new Date())
    .sort((a, b) => new Date(a.date) - new Date(b.date))[0];

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

        {client.household_id && <HouseholdPanel client={client} />}

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
              {new Date(nextMeeting.date).toLocaleDateString("en-US", {
                weekday: "short", month: "short", day: "numeric",
              })}{" "}
              at{" "}
              {new Date(nextMeeting.date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              {nextMeeting.location ? ` · ${nextMeeting.location}` : ""}
            </div>
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

// ── Meetings Tab ──────────────────────────────────────────────

function MeetingsTab({ clientMeetings }) {
  const [expanded, setExpanded] = useState(null);

  function formatDateTime(iso) {
    return new Date(iso).toLocaleDateString("en-US", {
      weekday: "short", month: "short", day: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }

  const sorted = [...clientMeetings].sort((a, b) => new Date(b.date) - new Date(a.date));
  const isPast = (date) => new Date(date) < new Date();

  if (sorted.length === 0) {
    return <p className="empty-state">No meetings on record for this client.</p>;
  }

  return (
    <div className="meetings-tab">
      {sorted.map((m) => {
        const past = isPast(m.date);
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
                  <div className="meeting-record-date">{formatDateTime(m.date)}</div>
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
      })}
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

function NotesTab({ clientId }) {
  const { clientNotes, addClientNote } = useApp();
  const [draft, setDraft] = useState("");
  const notes = (clientNotes[clientId] || []).slice().reverse();

  function handleAdd() {
    if (!draft.trim()) return;
    addClientNote(clientId, draft.trim());
    setDraft("");
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    });
  }

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
        <button className="btn btn-primary" onClick={handleAdd} disabled={!draft.trim()}>
          Add Note
        </button>
      </div>
      <div className="notes-list">
        {notes.length === 0 ? (
          <p className="empty-state">No notes yet.</p>
        ) : (
          notes.map((note) => (
            <div key={note.id} className="note-item">
              <div className="note-meta">
                <span className="note-author">{note.author}</span>
                <span className="note-date">{formatDate(note.created_at)}</span>
                <span className={`note-type-badge ${note.type}`}>
                  {note.type.replace(/_/g, " ")}
                </span>
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

function FilesTab({ clientId }) {
  const { clientFiles } = useApp();
  const files = clientFiles[clientId] || [];

  function formatDate(iso) {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  return (
    <div className="files-tab">
      <div className="files-upload-hint">
        <div className="upload-placeholder">
          <Upload size={18} />
          <span>File uploads will be available in Phase 2 (Django backend)</span>
        </div>
      </div>
      {files.length === 0 ? (
        <p className="empty-state">No files attached to this client yet.</p>
      ) : (
        <div className="files-list">
          {files.map((f) => (
            <div key={f.id} className="file-item">
              <div className="file-icon">
                <FileText size={16} />
              </div>
              <div className="file-info">
                <div className="file-name">{f.name}</div>
                <div className="file-meta">
                  {f.size_kb} KB · Uploaded {formatDate(f.uploaded_at)} by {f.uploaded_by}
                  {f.meeting_id && " · linked to meeting"}
                </div>
              </div>
              <span className="file-type-badge">{FILE_TYPE_LABELS[f.type] || f.type}</span>
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
                    Hi {client.name},
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

// ── Main ClientProfile ────────────────────────────────────────

export default function ClientProfile({ onOpenChat }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { approvals, clientNotes, clientFiles, getSubmissionsForClient } = useApp();
  const [activeTab, setActiveTab] = useState("Overview");
  const [showQModal, setShowQModal] = useState(false);

  // Look in both static clients and any newly added clients
  const client = clients.find((c) => c.id === id);

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

  const clientMeetings = [
    ...meetings.filter((m) => m.client_id === id),
    ...upcomingMeetings.filter((m) => m.client_id === id),
  ];

  const clientApprovals = approvals.filter((a) => a.client_id === id);
  const pendingCount = clientApprovals.filter((a) => a.status === "pending").length;

  return (
    <div className="page">
      {/* Back nav */}
      <button className="back-btn" onClick={() => navigate("/clients")}>
        <ArrowLeft size={15} /> All Clients
      </button>

      {/* Client header */}
      <div className="client-profile-header">
        <div className="client-profile-avatar">{client.name[0]}</div>
        <div className="client-profile-info">
          <div className="client-profile-name-row">
            <h1>{client.name}</h1>
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
          <button className="btn btn-primary" onClick={onOpenChat}>
            <MessageSquare size={15} />
            Ask AI about {client.name.split(" ")[0]}
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
            {tab === "Notes" && (clientNotes[id] || []).length > 0 && (
              <span className="tab-count">{(clientNotes[id] || []).length}</span>
            )}
            {tab === "Files" && (clientFiles[id] || []).length > 0 && (
              <span className="tab-count">{(clientFiles[id] || []).length}</span>
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
          clientNotes={clientNotes[id]}
          clientFiles={clientFiles[id]}
          submissions={getSubmissionsForClient(id)}
        />
      )}
      {activeTab === "Meetings" && <MeetingsTab clientMeetings={clientMeetings} />}
      {activeTab === "Emails" && <EmailsTab clientApprovals={clientApprovals} />}
      {activeTab === "Notes" && <NotesTab clientId={id} />}
      {activeTab === "Files" && <FilesTab clientId={id} />}

      {showQModal && (
        <SendQuestionnaireModal client={client} onClose={() => setShowQModal(false)} />
      )}
    </div>
  );
}
