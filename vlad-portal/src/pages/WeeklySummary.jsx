import { Link } from "react-router-dom";
import { BarChart2, CheckCircle, Clock, AlertTriangle, Users } from "lucide-react";
import { weekStats, upcomingMeetings, clients } from "../data/mockData";
import { useApp } from "../context/AppContext";

const MEETING_COLORS = {
  Discovery: "#6366f1",
  "LEAP Process": "#8b5cf6",
  Implementation: "#06b6d4",
  "Solera Heartbeat": "#10b981",
};

export default function WeeklySummary() {
  const { approvals } = useApp();
  const approved = approvals.filter((a) => a.status === "approved" || a.status === "edited").length;
  const pending = approvals.filter((a) => a.status === "pending").length;

  // Last contact analysis
  const staleClients = clients.filter((c) => {
    if (!c.last_contact_date) return false;
    const last = new Date(c.last_contact_date);
    const now = new Date("2026-03-30");
    const days = Math.round((now - last) / (1000 * 60 * 60 * 24));
    return days > 14;
  });

  const meetingsByType = upcomingMeetings.reduce((acc, m) => {
    acc[m.meeting_type] = (acc[m.meeting_type] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Weekly Summary</h1>
          <p className="subtitle">Auto-generated · Week of {weekStats.week_of}</p>
        </div>
        {weekStats.commission_close_week && (
          <div className="alert-chip">
            <AlertTriangle size={14} /> Commission Close Week
          </div>
        )}
      </div>

      <div className="summary-grid">
        {/* Meeting Stats */}
        <div className="card">
          <div className="card-header">
            <BarChart2 size={18} />
            <h2>Meetings</h2>
          </div>
          <div className="summary-stats">
            <div className="big-stat">
              <span className="big-num">{weekStats.meetings_completed}</span>
              <span className="big-label">Completed</span>
            </div>
            <div className="big-stat">
              <span className="big-num">{weekStats.meetings_scheduled}</span>
              <span className="big-label">Scheduled</span>
            </div>
            <div className="big-stat">
              <span className="big-num">{weekStats.capacity - weekStats.meetings_scheduled}</span>
              <span className="big-label">Available Slots</span>
            </div>
          </div>
          <div className="meetings-by-type">
            {Object.entries(meetingsByType).map(([type, count]) => (
              <div key={type} className="type-row">
                <div className="type-dot" style={{ background: MEETING_COLORS[type] || "#94a3b8" }} />
                <span className="type-name">{type}</span>
                <span className="type-count">{count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Email & Approvals */}
        <div className="card">
          <div className="card-header">
            <CheckCircle size={18} />
            <h2>Emails & Approvals</h2>
          </div>
          <div className="summary-stats">
            <div className="big-stat">
              <span className="big-num" style={{ color: "#10b981" }}>{approved}</span>
              <span className="big-label">Approved</span>
            </div>
            <div className="big-stat">
              <span className="big-num" style={{ color: "#f59e0b" }}>{pending}</span>
              <span className="big-label">Pending</span>
            </div>
          </div>
          <div className="summary-note">
            <Clock size={13} />
            All client-facing emails require approval before sending.
          </div>
        </div>

        {/* Flags */}
        <div className="card">
          <div className="card-header">
            <AlertTriangle size={18} />
            <h2>Flags & Attention</h2>
          </div>
          {staleClients.length === 0 && !weekStats.commission_close_week ? (
            <p className="empty-state">No flags this week.</p>
          ) : (
            <div className="flag-list">
              {weekStats.commission_close_week && (
                <div className="flag-item urgent">
                  <AlertTriangle size={13} />
                  Commission Close week — chase outstanding premiums
                </div>
              )}
              {staleClients.map((c) => (
                <div key={c.id} className="flag-item">
                  <Clock size={13} />
                  <Link to={`/clients/${c.id}`} className="link-inline">{c.name}</Link>
                  {" "}— no contact in 14+ days
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming Week */}
        <div className="card">
          <div className="card-header">
            <Users size={18} />
            <h2>Coming Up</h2>
          </div>
          <div className="upcoming-list">
            {upcomingMeetings.map((m) => (
              <div key={m.id} className="upcoming-row">
                <div
                  className="type-dot"
                  style={{ background: MEETING_COLORS[m.meeting_type] || "#94a3b8" }}
                />
                <div>
                  <Link to={`/clients/${m.client_id}`} className="upcoming-client-link">
                    {m.client_name}
                  </Link>
                  <div className="upcoming-meta">
                    {m.meeting_type} ·{" "}
                    {new Date(m.date).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}{" "}
                    ·{" "}
                    {new Date(m.date).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="summary-note">
            {weekStats.friday_off && (
              <span style={{ color: "#f59e0b" }}>⚠ This Friday is off.</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
