import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, X, Edit2, Flag, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { useApp } from "../context/AppContext";
import { clients } from "../data/mockData";

const TYPE_LABELS = {
  email_followup: "Client Follow-Up Email",
  email_summary: "Post-Meeting Summary",
  reminder_48hr: "48hr Reminder",
  reminder_24hr: "24hr Reminder",
  wealthbox_task: "Wealthbox Tasks",
  form: "Form Draft",
  questionnaire_link: "Questionnaire Link",
};

const STATUS_COLORS = {
  pending: "#f59e0b",
  approved: "#10b981",
  rejected: "#ef4444",
  edited: "#6366f1",
};

function EmailPreview({ content }) {
  return (
    <div className="preview-email">
      <div className="preview-subject">
        <strong>Subject:</strong> {content.subject}
      </div>
      {content.flag && (
        <div className="preview-flag">
          <Flag size={13} /> {content.flag}
        </div>
      )}
      <pre className="preview-body">{content.body}</pre>
    </div>
  );
}

function QuestionnairePreview({ content }) {
  return (
    <div className="preview-email">
      <div className="preview-subject">
        <strong>To:</strong> {content.to}
      </div>
      <div className="preview-subject">
        <strong>Subject:</strong> {content.subject}
      </div>
      <pre className="preview-body">{content.body}</pre>
      <div style={{ marginTop: 8 }}>
        <a href={content.link} target="_blank" rel="noreferrer" className="q-link-preview">
          {content.link}
        </a>
      </div>
    </div>
  );
}

function TaskPreview({ content }) {
  return (
    <div className="preview-tasks">
      {content.tasks.map((t, i) => (
        <div key={i} className={`task-row priority-${t.priority}`}>
          <span className="task-priority">{t.priority}</span>
          <span className="task-title">{t.title}</span>
          <span className="task-due">Due {t.due}</span>
        </div>
      ))}
    </div>
  );
}

export function ApprovalCard({ item }) {
  const { approveItem, rejectItem, editItem } = useApp();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(
    typeof item.draft_content === "string"
      ? item.draft_content
      : item.draft_content.body || JSON.stringify(item.draft_content, null, 2)
  );

  const client = clients.find((c) => c.id === item.client_id);
  const isRussian = client?.language_tag === "ru";
  const isDone = item.status !== "pending";

  function handleSaveEdit() {
    const updated =
      item.draft_content.body !== undefined
        ? { ...item.draft_content, body: editText }
        : editText;
    editItem(item.id, updated);
    setEditing(false);
  }

  return (
    <div className={`approval-card ${item.status} ${isRussian ? "russian-flag" : ""}`}>
      <div className="approval-card-header" onClick={() => !editing && setExpanded((v) => !v)}>
        <div className="approval-left">
          {isRussian && <Flag size={14} className="flag-icon" title="Russian-speaking client" />}
          {item.urgency === "high" && (
            <AlertTriangle size={14} className="urgency-icon" title="High priority" />
          )}
          <div>
            <Link
              to={`/clients/${item.client_id}`}
              className="approval-client-link"
              onClick={(e) => e.stopPropagation()}
            >
              {item.client_name}
            </Link>
            <div className="approval-type">{TYPE_LABELS[item.item_type] || item.item_type}</div>
          </div>
        </div>
        <div className="approval-right">
          <span className="approval-agent">by {item.agent}</span>
          <span
            className="status-pill"
            style={{ background: STATUS_COLORS[item.status] + "22", color: STATUS_COLORS[item.status] }}
          >
            {item.status}
          </span>
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </div>

      {expanded && (
        <div className="approval-body">
          {isRussian && (
            <div className="russian-warning">
              <Flag size={13} /> Russian-speaking client — review carefully before approving.
              Vlad should call personally if needed.
            </div>
          )}

          {editing ? (
            <div className="edit-area">
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                rows={12}
              />
              <div className="edit-actions">
                <button className="btn btn-primary" onClick={handleSaveEdit}>
                  Save & Mark Edited
                </button>
                <button className="btn btn-ghost" onClick={() => setEditing(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              {item.item_type === "wealthbox_task" ? (
                <TaskPreview content={item.draft_content} />
              ) : item.item_type === "questionnaire_link" ? (
                <QuestionnairePreview content={item.draft_content} />
              ) : (
                <EmailPreview content={item.draft_content} />
              )}
            </>
          )}

          {!isDone && !editing && (
            <div className="approval-actions">
              <button className="btn btn-approve" onClick={() => approveItem(item.id)}>
                <Check size={15} /> Approve
              </button>
              <button className="btn btn-edit" onClick={() => setEditing(true)}>
                <Edit2 size={15} /> Edit
              </button>
              <button className="btn btn-reject" onClick={() => rejectItem(item.id)}>
                <X size={15} /> Reject
              </button>
            </div>
          )}

          {isDone && (
            <div className="done-banner">
              {item.status === "approved" && "✓ Approved — ready to send"}
              {item.status === "rejected" && "✗ Rejected"}
              {item.status === "edited" && "✎ Edited — ready to send"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ApprovalQueue() {
  const { approvals } = useApp();
  const [filter, setFilter] = useState("pending");

  const filtered =
    filter === "all" ? approvals : approvals.filter((a) => a.status === filter);

  const counts = {
    pending: approvals.filter((a) => a.status === "pending").length,
    approved: approvals.filter((a) => a.status === "approved").length,
    edited: approvals.filter((a) => a.status === "edited").length,
    rejected: approvals.filter((a) => a.status === "rejected").length,
    all: approvals.length,
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Approval Queue</h1>
          <p className="subtitle">Review and approve all AI-generated outputs before they go out.</p>
        </div>
      </div>

      <div className="filter-tabs">
        {["pending", "approved", "edited", "rejected", "all"].map((f) => (
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

      <div className="approvals-list">
        {filtered.length === 0 ? (
          <div className="empty-state-full">
            {filter === "pending" ? "All caught up — no pending items." : `No ${filter} items.`}
          </div>
        ) : (
          filtered.map((item) => <ApprovalCard key={item.id} item={item} />)
        )}
      </div>
    </div>
  );
}
