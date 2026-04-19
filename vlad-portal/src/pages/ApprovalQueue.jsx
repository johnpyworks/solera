import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Check, X, Edit2, AlertTriangle, ChevronDown, ChevronUp, RefreshCw, Sparkles,
} from "lucide-react";
import { apiFetch } from "../api/client";

const TYPE_LABELS = {
  email_followup: "Client Follow-Up Email",
  email_summary:  "Post-Meeting Summary",
  reminder_48hr:  "48hr Reminder",
  reminder_24hr:  "24hr Reminder",
  action_items:   "Action Items",
  meeting_notes:  "Meeting Notes",
  calendar_event: "Calendar Event",
  form:           "Form Draft",
  questionnaire_link: "Questionnaire Link",
};

const STATUS_COLORS = {
  pending:  "#f59e0b",
  approved: "#10b981",
  rejected: "#ef4444",
  edited:   "#6366f1",
};

// ── Preview Components ─────────────────────────────────────────

function EmailPreview({ content }) {
  return (
    <div className="preview-email">
      {content.to && (
        <div className="preview-subject">
          <strong>To:</strong> {content.to}
        </div>
      )}
      <div className="preview-subject">
        <strong>Subject:</strong> {content.subject}
      </div>
      {content.flag && (
        <div className="preview-flag">
          <AlertTriangle size={13} /> {content.flag}
        </div>
      )}
      <pre className="preview-body">{content.body}</pre>
    </div>
  );
}

function QuestionnairePreview({ content }) {
  return (
    <div className="preview-email">
      <div className="preview-subject"><strong>To:</strong> {content.to}</div>
      <div className="preview-subject"><strong>Subject:</strong> {content.subject}</div>
      <pre className="preview-body">{content.body}</pre>
      {content.link && (
        <div style={{ marginTop: 8 }}>
          <a href={content.link} target="_blank" rel="noreferrer" className="q-link-preview">
            {content.link}
          </a>
        </div>
      )}
    </div>
  );
}

function MeetingNotesPreview({ content }) {
  return (
    <div className="meeting-notes-preview">
      {content.summary && (
        <div className="notes-section">
          <div className="notes-section-label">Summary</div>
          <p className="notes-section-text">{content.summary}</p>
        </div>
      )}
      {content.key_points?.length > 0 && (
        <div className="notes-section">
          <div className="notes-section-label">Key Points</div>
          <ul className="notes-list">
            {content.key_points.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </div>
      )}
      {content.decisions?.length > 0 && (
        <div className="notes-section">
          <div className="notes-section-label">Decisions</div>
          <ul className="notes-list">
            {content.decisions.map((d, i) => <li key={i}>{d}</li>)}
          </ul>
        </div>
      )}
      {content.action_items?.length > 0 && (
        <div className="notes-section">
          <div className="notes-section-label">Action Items</div>
          <div className="action-items-list">
            {content.action_items.map((t, i) => (
              <div key={i} className="action-item-row">
                <span className={`task-owner-badge ${t.owner}`}>{t.owner}</span>
                <span className="action-item-task">{t.task}</span>
                {t.due && <span className="action-item-due">Due {t.due}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ActionItemsPreview({ content }) {
  const tasks = content.tasks || [];
  return (
    <div className="preview-tasks">
      {tasks.length === 0 && (
        <p style={{ color: "var(--text-sm)", fontSize: 13 }}>No tasks extracted.</p>
      )}
      {tasks.map((t, i) => (
        <div key={i} className="action-item-row">
          <span className={`task-owner-badge ${t.owner}`}>{t.owner}</span>
          <span className="action-item-task">{t.task}</span>
          {t.due && <span className="action-item-due">Due {t.due}</span>}
        </div>
      ))}
    </div>
  );
}

function CalendarEventPreview({ content, onUpdate, readOnly }) {
  const [platform, setPlatform]   = useState(content.platform || "zoom");
  const [dateVal, setDateVal]     = useState(
    content.proposed_date ? content.proposed_date.replace("Z", "").substring(0, 16) : ""
  );
  const [duration, setDuration]   = useState(content.duration_min || 60);
  const [subject, setSubject]     = useState(content.subject || "");
  const [attendees, setAttendees] = useState(content.attendees || []);

  function emit(patch) {
    onUpdate?.({ ...content, platform, proposed_date: dateVal, duration_min: duration, subject, attendees, ...patch });
  }

  function handlePlatform(p)  { setPlatform(p); emit({ platform: p }); }
  function handleDate(d)      { setDateVal(d);  emit({ proposed_date: d }); }
  function handleDuration(d)  { setDuration(d); emit({ duration_min: Number(d) }); }
  function handleSubject(s)   { setSubject(s);  emit({ subject: s }); }

  function updateAttendee(i, field, val) {
    const updated = attendees.map((a, idx) => idx === i ? { ...a, [field]: val } : a);
    setAttendees(updated); emit({ attendees: updated });
  }
  function removeAttendee(i) {
    const updated = attendees.filter((_, idx) => idx !== i);
    setAttendees(updated); emit({ attendees: updated });
  }
  function addAttendee() {
    const updated = [...attendees, { name: "", email: "" }];
    setAttendees(updated); emit({ attendees: updated });
  }

  return (
    <div className="calendar-event-preview">
      {content.needs_date && !dateVal && (
        <div className="needs-date-banner">
          <AlertTriangle size={14} />
          No date was agreed in the transcript — please set a meeting date before approving.
        </div>
      )}

      <div className="cal-field-row">
        <span className="cal-label">Subject</span>
        {readOnly ? (
          <span>{content.subject || "—"}</span>
        ) : (
          <input
            type="text"
            className="cal-subject-input"
            value={subject}
            placeholder="Meeting subject"
            onChange={e => handleSubject(e.target.value)}
          />
        )}
      </div>

      <div className="cal-field-row">
        <span className="cal-label">Platform</span>
        {readOnly ? (
          <span style={{ textTransform: "capitalize" }}>{content.platform || "Zoom"}</span>
        ) : (
          <div className="platform-toggle">
            <button
              type="button"
              className={`platform-btn ${platform === "zoom" ? "active" : ""}`}
              onClick={() => handlePlatform("zoom")}
            >
              Zoom
            </button>
            <button
              type="button"
              className={`platform-btn ${platform === "teams" ? "active" : ""}`}
              onClick={() => handlePlatform("teams")}
            >
              Teams
            </button>
          </div>
        )}
      </div>

      <div className="cal-field-row">
        <span className="cal-label">Date &amp; Time</span>
        {readOnly ? (
          <span>
            {content.proposed_date
              ? new Date(content.proposed_date).toLocaleString()
              : "—"}
          </span>
        ) : (
          <input
            type="datetime-local"
            step={1800}
            className="cal-date-input"
            value={dateVal}
            onChange={e => handleDate(e.target.value)}
          />
        )}
      </div>

      <div className="cal-field-row">
        <span className="cal-label">Duration</span>
        {readOnly ? (
          <span>{content.duration_min || 60} min</span>
        ) : (
          <select
            className="cal-duration-select"
            value={duration}
            onChange={e => handleDuration(e.target.value)}
          >
            {[30, 45, 60, 90, 120].map(d => (
              <option key={d} value={d}>{d} min</option>
            ))}
          </select>
        )}
      </div>

      {content.location && (
        <div className="cal-field-row">
          <span className="cal-label">Location</span>
          <span>{content.location}</span>
        </div>
      )}

      <div className="cal-field-row cal-attendees-row">
        <span className="cal-label">Attendees</span>
        {readOnly ? (
          <div className="cal-attendees">
            {attendees.map((a, i) => (
              <span key={i} className="cal-attendee">
                {a.name}{a.email ? ` (${a.email})` : ""}
              </span>
            ))}
          </div>
        ) : (
          <div className="cal-attendees-edit">
            {attendees.map((a, i) => (
              <div key={i} className="cal-attendee-row-edit">
                <input
                  className="cal-att-name"
                  placeholder="Name"
                  value={a.name}
                  onChange={e => updateAttendee(i, "name", e.target.value)}
                />
                <input
                  className="cal-att-email"
                  placeholder="Email"
                  value={a.email}
                  onChange={e => updateAttendee(i, "email", e.target.value)}
                />
                <button className="icon-btn" onClick={() => removeAttendee(i)} type="button">
                  <X size={12} />
                </button>
              </div>
            ))}
            <button className="btn btn-ghost btn-xs" onClick={addAttendee} type="button">
              + Add Attendee
            </button>
          </div>
        )}
      </div>

      {content.body && (
        <div className="cal-field-row cal-body-row">
          <span className="cal-label">Body</span>
          <p className="cal-body-text">{content.body}</p>
        </div>
      )}
    </div>
  );
}

// ── ApprovalCard ───────────────────────────────────────────────

export function ApprovalCard({ item: initialItem, onApprove, onReject, onEdit }) {
  const [item, setItem]         = useState(initialItem);
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing]   = useState(false);
  const [editText, setEditText] = useState(
    typeof item.draft_content === "string"
      ? item.draft_content
      : item.draft_content?.body || JSON.stringify(item.draft_content, null, 2)
  );
  const [actionLoading, setActionLoading] = useState(false);
  // Local content for calendar_event fields (date, platform, duration)
  const [calContent, setCalContent] = useState(item.draft_content);
  // Structured email draft state (to / subject / body)
  const EMAIL_TYPES = ["email_followup", "email_summary", "reminder_48hr", "reminder_24hr"];
  const isEmail = EMAIL_TYPES.includes(item.item_type);
  const [emailDraft, setEmailDraft] = useState({
    to:      item.draft_content?.to      || "",
    subject: item.draft_content?.subject || "",
    body:    item.draft_content?.body    || "",
  });
  // Ask AI inline suggestion
  const [aiSuggestion, setAiSuggestion] = useState(null);
  const [aiLoading, setAiLoading]       = useState(false);
  const [showAiInput, setShowAiInput]   = useState(false);
  const [aiPrompt, setAiPrompt]         = useState("");
  const [approveResult, setApproveResult] = useState(null);

  const isDone      = item.status !== "pending";
  const isCalendar  = item.item_type === "calendar_event";
  const canApprove  = !isCalendar || !calContent.needs_date || !!calContent.proposed_date;

  // calendar_event has its own structured editor — all other types get a textarea
  const hasTextEdit = item.item_type !== "calendar_event";
  const isStructured = ["meeting_notes", "action_items"].includes(item.item_type);

  async function handleApprove() {
    setActionLoading(true);
    try {
      // For calendar events, PATCH first if content changed
      if (isCalendar && JSON.stringify(calContent) !== JSON.stringify(item.draft_content)) {
        const patched = await apiFetch(`/approvals/${item.id}/`, {
          method: "PATCH",
          body: JSON.stringify({ draft_content: calContent }),
        });
        setItem(patched);
      }
      const updated = await apiFetch(`/approvals/${item.id}/approve/`, { method: "POST" });
      setItem(updated);
      if (updated.calendar_sent !== undefined) {
        setApproveResult({ sent: updated.calendar_sent, error: updated.calendar_error || "" });
      }
      onApprove?.(updated);
    } catch (e) {
      alert(`Approve failed: ${e.message}`);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleReject() {
    setActionLoading(true);
    try {
      const updated = await apiFetch(`/approvals/${item.id}/reject/`, { method: "POST" });
      setItem(updated);
      onReject?.(updated);
    } catch (e) {
      alert(`Reject failed: ${e.message}`);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleAskAi(customInstruction = "") {
    setAiLoading(true);
    setAiSuggestion(null);
    const instruction = customInstruction.trim()
      || "Review this draft and suggest specific, concise improvements.";
    try {
      const data = await apiFetch("/chat/messages/", {
        method: "POST",
        body: JSON.stringify({
          session_id: `approval-${item.id}`,
          content: (
            `${instruction}\n\n` +
            `Type: ${item.item_type}\nContent:\n${JSON.stringify(item.draft_content, null, 2)}`
          ),
        }),
      });
      setAiSuggestion(data.assistant.content);
    } catch (e) {
      setAiSuggestion(`[Error: ${e.message}]`);
    } finally {
      setAiLoading(false);
    }
  }

  async function handleSaveEdit() {
    let updated;
    if (isEmail) {
      updated = { ...item.draft_content, ...emailDraft };
    } else if (item.draft_content?.body !== undefined) {
      updated = { ...item.draft_content, body: editText };
    } else {
      try { updated = JSON.parse(editText); } catch { updated = editText; }
    }
    setActionLoading(true);
    try {
      const patched = await apiFetch(`/approvals/${item.id}/`, {
        method: "PATCH",
        body: JSON.stringify({ draft_content: updated }),
      });
      setItem(patched);
      if (isEmail) setEmailDraft({ to: patched.draft_content?.to || "", subject: patched.draft_content?.subject || "", body: patched.draft_content?.body || "" });
      onEdit?.(patched);
      setEditing(false);
    } catch (e) {
      alert(`Save failed: ${e.message}`);
    } finally {
      setActionLoading(false);
    }
  }

  function renderPreview() {
    switch (item.item_type) {
      case "meeting_notes":   return <MeetingNotesPreview content={item.draft_content} />;
      case "action_items":    return <ActionItemsPreview content={item.draft_content} />;
      case "calendar_event":  return (
        <CalendarEventPreview
          content={calContent}
          onUpdate={isDone ? null : setCalContent}
          readOnly={isDone}
        />
      );
      case "questionnaire_link": return <QuestionnairePreview content={item.draft_content} />;
      default:                return <EmailPreview content={item.draft_content} />;
    }
  }

  return (
    <div className={`approval-card ${item.status}`}>
      <div
        className="approval-card-header"
        onClick={() => !editing && setExpanded(v => !v)}
      >
        <div className="approval-left">
          {item.urgency === "high" && (
            <AlertTriangle size={14} className="urgency-icon" title="High priority" />
          )}
          <div>
            {item.client ? (
              <Link
                to={`/clients/${item.client}`}
                className="approval-client-link"
                onClick={e => e.stopPropagation()}
              >
                {item.client_name}
              </Link>
            ) : (
              <span className="approval-client-link">{item.client_name || "—"}</span>
            )}
            <div className="approval-type">
              {TYPE_LABELS[item.item_type] || item.item_type}
            </div>
          </div>
        </div>
        <div className="approval-right">
          <span className="approval-agent">by {item.agent}</span>
          <span
            className="status-pill"
            style={{
              background: STATUS_COLORS[item.status] + "22",
              color: STATUS_COLORS[item.status],
            }}
          >
            {item.status}
          </span>
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </div>

      {expanded && (
        <div className="approval-body">
          {editing && hasTextEdit ? (
            <div className="edit-area">
              {isEmail ? (
                <>
                  <label className="edit-field-label">To</label>
                  <input
                    className="edit-field-input"
                    type="email"
                    value={emailDraft.to}
                    onChange={e => setEmailDraft(d => ({ ...d, to: e.target.value }))}
                    placeholder="recipient@example.com"
                  />
                  <label className="edit-field-label" style={{ marginTop: 8 }}>Subject</label>
                  <input
                    className="edit-field-input"
                    type="text"
                    value={emailDraft.subject}
                    onChange={e => setEmailDraft(d => ({ ...d, subject: e.target.value }))}
                    placeholder="Email subject"
                  />
                  <label className="edit-field-label" style={{ marginTop: 8 }}>Body</label>
                  <textarea
                    value={emailDraft.body}
                    onChange={e => setEmailDraft(d => ({ ...d, body: e.target.value }))}
                    rows={12}
                  />
                </>
              ) : (
                <textarea
                  value={editText}
                  onChange={e => setEditText(e.target.value)}
                  rows={12}
                />
              )}
              <div className="edit-actions">
                <button
                  className="btn btn-primary"
                  onClick={handleSaveEdit}
                  disabled={actionLoading}
                >
                  Save &amp; Mark Edited
                </button>
                <button className="btn btn-ghost" onClick={() => setEditing(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            renderPreview()
          )}

          {/* AI prompt input */}
          {showAiInput && (
            <div className="ai-prompt-wrap">
              <textarea
                className="ai-prompt-input"
                rows={2}
                placeholder="What should AI improve? (leave blank for a general review)"
                value={aiPrompt}
                onChange={e => setAiPrompt(e.target.value)}
              />
              <div className="ai-prompt-actions">
                <button className="btn btn-ghost" onClick={() => { setShowAiInput(false); setAiPrompt(""); }}>
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  disabled={aiLoading}
                  onClick={() => { setShowAiInput(false); handleAskAi(aiPrompt); setAiPrompt(""); }}
                >
                  <Sparkles size={14} /> Ask
                </button>
              </div>
            </div>
          )}

          {/* AI suggestion panel */}
          {aiSuggestion && (
            <div className="ai-suggestion-panel">
              <div className="ai-suggestion-header">
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <Sparkles size={12} /> AI Suggestion
                </span>
                <button className="icon-btn" onClick={() => setAiSuggestion(null)}>
                  <X size={12} />
                </button>
              </div>
              <p className="ai-suggestion-text">{aiSuggestion}</p>
            </div>
          )}

          {!isDone && !editing && (
            <div className="approval-actions">
              <button
                className="btn btn-approve"
                onClick={handleApprove}
                disabled={actionLoading || !canApprove}
                title={!canApprove ? "Please set a meeting date first" : ""}
              >
                <Check size={15} /> {actionLoading ? "…" : "Approve"}
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => setShowAiInput(v => !v)}
                disabled={aiLoading || actionLoading}
                title="Get AI improvement suggestions"
              >
                <Sparkles size={15} /> {aiLoading ? "Thinking…" : "Ask AI"}
              </button>
              {hasTextEdit && (
                <button
                  className="btn btn-edit"
                  onClick={() => setEditing(true)}
                  disabled={actionLoading}
                >
                  <Edit2 size={15} /> {isStructured ? "Edit (JSON)" : "Edit"}
                </button>
              )}
              <button
                className="btn btn-reject"
                onClick={handleReject}
                disabled={actionLoading}
              >
                <X size={15} /> {actionLoading ? "…" : "Reject"}
              </button>
            </div>
          )}

          {isDone && (
            <div className="done-banner">
              {item.status === "approved" && "✓ Approved"}
              {item.status === "rejected" && "✗ Rejected"}
              {item.status === "edited"   && "✎ Edited — ready to approve"}
            </div>
          )}
          {item.item_type === "calendar_event" && approveResult && (
            approveResult.sent && !approveResult.error
              ? <div className="cal-outcome-ok">✓ Zoom meeting created &amp; calendar invite sent</div>
              : approveResult.sent && approveResult.error
                ? <div className="cal-outcome-partial">⚠ {approveResult.error}</div>
                : <div className="cal-outcome-warn">
                    Meeting saved to portal — invite not sent
                    {approveResult.error ? `: ${approveResult.error}` : " (check MCP connector)"}
                  </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── ApprovalQueue Page ─────────────────────────────────────────

export default function ApprovalQueue() {
  const [items, setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);
  const [filter, setFilter] = useState("pending");

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch("/approvals/");
      setItems(Array.isArray(data) ? data : (data.results || []));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  function syncItem(updated) {
    setItems(prev => prev.map(i => i.id === updated.id ? updated : i));
  }

  const filtered = filter === "all" ? items : items.filter(i => i.status === filter);

  const counts = {
    pending:  items.filter(i => i.status === "pending").length,
    approved: items.filter(i => i.status === "approved").length,
    edited:   items.filter(i => i.status === "edited").length,
    rejected: items.filter(i => i.status === "rejected").length,
    all:      items.length,
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Approval Queue</h1>
          <p className="subtitle">
            Review and approve all AI-generated outputs before they go out.
          </p>
        </div>
        <button className="btn btn-ghost" onClick={fetchItems} disabled={loading}>
          <RefreshCw size={15} className={loading ? "spin" : ""} /> Refresh
        </button>
      </div>

      <div className="filter-tabs">
        {["pending", "approved", "edited", "rejected", "all"].map(f => (
          <button
            key={f}
            className={`filter-tab ${filter === f ? "active" : ""}`}
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
            <span className="tab-count">{counts[f]}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="empty-state-full" style={{ paddingTop: 60 }}>
          Loading approvals…
        </div>
      ) : error ? (
        <div className="empty-state-full" style={{ paddingTop: 60, color: "var(--red)" }}>
          <AlertTriangle size={16} style={{ marginRight: 6 }} />
          {error}
          <button
            className="btn btn-ghost"
            onClick={fetchItems}
            style={{ marginLeft: 12 }}
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="approvals-list">
          {filtered.length === 0 ? (
            <div className="empty-state-full">
              {filter === "pending"
                ? "All caught up — no pending items."
                : `No ${filter} items.`}
            </div>
          ) : (
            filtered.map(item => (
              <ApprovalCard
                key={item.id}
                item={item}
                onApprove={syncItem}
                onReject={syncItem}
                onEdit={syncItem}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
