import { Link } from "react-router-dom";
import { CheckSquare, Zap, Calendar, TrendingUp, AlertTriangle, Flag } from "lucide-react";
import { useApp } from "../context/AppContext";
import { upcomingMeetings, weekStats, clients } from "../data/mockData";

const MEETING_COLORS = {
  Discovery: "#6366f1",
  "LEAP Process": "#8b5cf6",
  Implementation: "#06b6d4",
  "Solera Heartbeat": "#10b981",
};

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function Dashboard() {
  const { approvals, logs, pendingCount } = useApp();
  const pending = approvals.filter((a) => a.status === "pending");
  const recentLogs = logs.slice(0, 4);
  const pct = Math.round((weekStats.meetings_scheduled / weekStats.capacity) * 100);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Good morning, Vlad</h1>
          <p className="subtitle">Monday, March 30, 2026 · Week of {weekStats.week_of}</p>
        </div>
        {weekStats.commission_close_week && (
          <div className="alert-chip">
            <AlertTriangle size={14} /> Commission Close Week
          </div>
        )}
      </div>

      <div className="dashboard-grid">
        {/* Needs You */}
        <div className="card needs-you">
          <div className="card-header">
            <CheckSquare size={18} />
            <h2>Needs You</h2>
            {pendingCount > 0 && <span className="badge">{pendingCount}</span>}
          </div>
          {pending.length === 0 ? (
            <p className="empty-state">All clear — no pending approvals.</p>
          ) : (
            <div className="needs-list">
              {pending.map((item) => {
                const client = clients.find((c) => c.id === item.client_id);
                return (
                  <Link to={`/clients/${item.client_id}`} key={item.id} className="needs-item">
                    <div className="needs-item-left">
                      {client?.language_tag === "ru" && (
                        <Flag size={12} className="flag-icon" title="Russian-speaking client" />
                      )}
                      <div>
                        <div className="needs-client">{item.client_name}</div>
                        <div className="needs-type">{item.item_type.replace(/_/g, " ")}</div>
                      </div>
                    </div>
                    <div className={`urgency-dot ${item.urgency}`} />
                  </Link>
                );
              })}
            </div>
          )}
          <Link to="/approvals" className="card-link">
            View all approvals →
          </Link>
        </div>

        {/* AI Activity */}
        <div className="card ai-activity">
          <div className="card-header">
            <Zap size={18} />
            <h2>AI Activity</h2>
          </div>
          <div className="log-list">
            {recentLogs.map((log) => (
              <div key={log.id} className="log-item">
                <div className="log-agent">{log.agent_name}</div>
                <div className="log-action">{log.action}</div>
                <div className="log-client">{log.client}</div>
              </div>
            ))}
          </div>
          <Link to="/tasks" className="card-link">
            View all tasks →
          </Link>
        </div>

        {/* Upcoming Meetings */}
        <div className="card calendar-card">
          <div className="card-header">
            <Calendar size={18} />
            <h2>Upcoming Meetings</h2>
          </div>
          <div className="meeting-list">
            {upcomingMeetings.slice(0, 4).map((m) => (
              <div key={m.id} className="meeting-item">
                <div
                  className="meeting-type-dot"
                  style={{ background: MEETING_COLORS[m.meeting_type] || "#94a3b8" }}
                />
                <div className="meeting-info">
                  <Link to={`/clients/${m.client_id}`} className="meeting-client-link">
                    {m.client_name}
                  </Link>
                  <div className="meeting-meta">
                    {m.meeting_type} · {formatDate(m.date)} {formatTime(m.date)} · {m.location}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <Link to="/calendar" className="card-link">
            View full calendar →
          </Link>
        </div>

        {/* Week Summary */}
        <div className="card week-card">
          <div className="card-header">
            <TrendingUp size={18} />
            <h2>This Week</h2>
          </div>
          <div className="week-stats">
            <div className="stat-row">
              <span>Meetings scheduled</span>
              <strong>
                {weekStats.meetings_scheduled} / {weekStats.capacity}
              </strong>
            </div>
            <div className="capacity-bar">
              <div className="capacity-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="stat-row">
              <span>Completed this week</span>
              <strong>{weekStats.meetings_completed}</strong>
            </div>
            <div className="stat-row">
              <span>Emails approved</span>
              <strong>{weekStats.emails_approved}</strong>
            </div>
            <div className="stat-row">
              <span>Pending approval</span>
              <strong className={pendingCount > 0 ? "highlight" : ""}>{pendingCount}</strong>
            </div>
          </div>
          <Link to="/summary" className="card-link">
            Full weekly summary →
          </Link>
        </div>
      </div>
    </div>
  );
}
