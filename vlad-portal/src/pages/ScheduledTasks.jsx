import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api/client";

const RANGE_OPTIONS = [
  { label: "7 days", value: 7 },
  { label: "14 days", value: 14 },
  { label: "30 days", value: 30 },
];

function reminderBadge(reminder) {
  if (!reminder) {
    return <span className="badge-pill badge-grey">Not Queued</span>;
  }
  const { status, sent_at } = reminder;
  if (status === "approved" && sent_at) {
    return <span className="badge-pill badge-green">Sent</span>;
  }
  if (status === "approved") {
    return <span className="badge-pill badge-green">Approved</span>;
  }
  if (status === "pending" || status === "edited") {
    return <span className="badge-pill badge-yellow">Pending Approval</span>;
  }
  if (status === "rejected") {
    return <span className="badge-pill badge-red">Rejected</span>;
  }
  return <span className="badge-pill badge-grey">—</span>;
}

function formatDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function platformLabel(m) {
  if (m.zoom_meeting_id) return "Zoom";
  if (m.outlook_event_id) return "Outlook";
  if (m.location) return m.location;
  return "—";
}

export default function ScheduledTasks() {
  const [meetings, setMeetings] = useState([]);
  const [days, setDays] = useState(14);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const fetchMeetings = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await apiFetch(`/meetings/upcoming/?days=${days}`);
      setMeetings(Array.isArray(data) ? data : []);
      setError(null);
    } catch (e) {
      if (!silent) setError(e.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchMeetings();
    const interval = setInterval(() => fetchMeetings(true), 60000);
    return () => clearInterval(interval);
  }, [fetchMeetings]);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Scheduled Tasks</h1>
          <p className="page-subtitle">Upcoming meetings and their 48-hour reminder status</p>
        </div>
        <div className="range-toggle">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`btn btn-sm ${days === opt.value ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setDays(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="loading-state">Loading scheduled meetings…</div>}
      {error && <div className="error-state">{error}</div>}

      {!loading && !error && meetings.length === 0 && (
        <div className="empty-state">
          <p>No upcoming meetings in the next {days} days.</p>
        </div>
      )}

      {!loading && meetings.length > 0 && (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date &amp; Time</th>
                <th>Client</th>
                <th>Meeting Type</th>
                <th>Duration</th>
                <th>Platform</th>
                <th>48hr Reminder</th>
              </tr>
            </thead>
            <tbody>
              {meetings.map((m) => (
                <tr key={m.id}>
                  <td className="nowrap">{formatDateTime(m.scheduled_at)}</td>
                  <td>
                    <div className="cell-primary">{m.client_name}</div>
                    {m.client_email && (
                      <div className="cell-secondary">{m.client_email}</div>
                    )}
                  </td>
                  <td>{m.meeting_type}</td>
                  <td>{m.duration_min} min</td>
                  <td>{platformLabel(m)}</td>
                  <td>
                    <span
                      style={{ cursor: m.reminder_48hr?.status === "pending" ? "pointer" : "default" }}
                      title={m.reminder_48hr?.status === "pending" ? "Click to review in Approval Queue" : undefined}
                      onClick={() => {
                        if (m.reminder_48hr?.status === "pending" || m.reminder_48hr?.status === "edited") {
                          navigate("/approvals");
                        }
                      }}
                    >
                      {reminderBadge(m.reminder_48hr)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
