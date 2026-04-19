import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Calendar, CheckSquare, PlugZap, TrendingUp, Zap } from "lucide-react";
import { apiFetch } from "../api/client";
import {
  fetchConnectorStatus,
  fetchOutlookEvents,
  fetchTeamsMeetings,
  fetchZoomRecordings,
  getDefaultProvider,
  loadPreferredProvider,
  MCP_PROVIDER_LABELS,
  MCP_PROVIDER_ORDER,
} from "../api/mcp";

function asList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  return [];
}

function formatDateTime(value) {
  if (!value) return "Unknown";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getUpcomingLabel(provider, item) {
  if (provider === "outlook") {
    return `${formatDateTime(item.start)}${item.location ? ` - ${item.location}` : ""}`;
  }
  if (provider === "teams") {
    return `${formatDateTime(item.start_time)} - Teams transcript available`;
  }
  return `${formatDateTime(item.start_time)}${item.duration ? ` - ${item.duration} min` : ""}`;
}

export default function Dashboard() {
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [logs, setLogs] = useState([]);
  const [weekStats, setWeekStats] = useState(null);
  const [providers, setProviders] = useState({});
  const [upcomingItems, setUpcomingItems] = useState([]);
  const [upcomingProvider, setUpcomingProvider] = useState("outlook");
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadDashboard() {
      setError("");
      try {
        const [approvals, agentLogs, stats, connectorStatus] = await Promise.all([
          apiFetch("/approvals/?status=pending"),
          apiFetch("/agent-logs/"),
          apiFetch("/meetings/week-stats/"),
          fetchConnectorStatus(),
        ]);

        setPendingApprovals(asList(approvals));
        setLogs(asList(agentLogs).slice(0, 4));
        setWeekStats(stats);
        setProviders(connectorStatus.providers);

        const nextProvider = getDefaultProvider(connectorStatus.providers, loadPreferredProvider());
        setUpcomingProvider(nextProvider);

        if (connectorStatus.providers[nextProvider]?.connected) {
          if (nextProvider === "outlook") {
            setUpcomingItems((await fetchOutlookEvents()).slice(0, 4));
          } else if (nextProvider === "teams") {
            setUpcomingItems((await fetchTeamsMeetings()).slice(0, 4));
          } else {
            setUpcomingItems((await fetchZoomRecordings()).slice(0, 4));
          }
        } else {
          setUpcomingItems([]);
        }
      } catch (loadError) {
        setError(loadError.message);
      }
    }

    loadDashboard();
  }, []);

  const meetingsScheduled = weekStats?.meetings_scheduled || 0;
  const capacity = 15;
  const pct = Math.min(100, Math.round((meetingsScheduled / capacity) * 100));
  const connectedProviders = MCP_PROVIDER_ORDER.filter((provider) => providers[provider]?.connected);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Good morning, Vlad</h1>
          <p className="subtitle">Live dashboard with MCP-backed meeting data and connector health.</p>
        </div>
        {pendingApprovals.length > 0 && (
          <div className="alert-chip">
            <AlertTriangle size={14} /> {pendingApprovals.length} pending approvals
          </div>
        )}
      </div>

      {error && <div className="settings-error" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="integration-summary-strip">
        <div className="integration-summary-title">
          <PlugZap size={16} />
          <span>MCP Status</span>
        </div>
        <div className="integration-summary-list">
          {MCP_PROVIDER_ORDER.map((provider) => (
            <span key={provider} className={`integration-pill ${providers[provider]?.connected ? "connected" : "configured"}`}>
              {MCP_PROVIDER_LABELS[provider]}: {providers[provider]?.connected ? "Live" : "Off"}
            </span>
          ))}
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="card needs-you">
          <div className="card-header">
            <CheckSquare size={18} />
            <h2>Needs You</h2>
            {pendingApprovals.length > 0 && <span className="badge">{pendingApprovals.length}</span>}
          </div>
          {pendingApprovals.length === 0 ? (
            <p className="empty-state">All clear - no pending approvals.</p>
          ) : (
            <div className="needs-list">
              {pendingApprovals.map((item) => (
                item.client ? (
                  <Link to={`/clients/${item.client}`} key={item.id} className="needs-item">
                    <div className="needs-item-left">
                      <div>
                        <div className="needs-client">{item.client_name}</div>
                        <div className="needs-type">{(item.item_type || "").replace(/_/g, " ")}</div>
                      </div>
                    </div>
                    <div className={`urgency-dot ${item.urgency || "normal"}`} />
                  </Link>
                ) : (
                  <div key={item.id} className="needs-item">
                    <div className="needs-item-left">
                      <div>
                        <div className="needs-client">{item.client_name || "System item"}</div>
                        <div className="needs-type">{(item.item_type || "").replace(/_/g, " ")}</div>
                      </div>
                    </div>
                    <div className={`urgency-dot ${item.urgency || "normal"}`} />
                  </div>
                )
              ))}
            </div>
          )}
          <Link to="/approvals" className="card-link">
            View all approvals -&gt;
          </Link>
        </div>

        <div className="card ai-activity">
          <div className="card-header">
            <Zap size={18} />
            <h2>AI Activity</h2>
          </div>
          <div className="log-list">
            {logs.length === 0 ? (
              <p className="empty-state">No agent log entries yet.</p>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="log-item">
                  <div className="log-agent">{log.agent_name}</div>
                  <div className="log-action">{log.action}</div>
                  <div className="log-client">{log.client_name || "System"}</div>
                </div>
              ))
            )}
          </div>
          <Link to="/tasks" className="card-link">
            View all tasks -&gt;
          </Link>
        </div>

        <div className="card calendar-card">
          <div className="card-header">
            <Calendar size={18} />
            <h2>Upcoming from {MCP_PROVIDER_LABELS[upcomingProvider]}</h2>
          </div>
          {connectedProviders.length === 0 ? (
            <p className="empty-state">Connect Outlook, Teams, or Zoom in Settings to populate this card.</p>
          ) : upcomingItems.length === 0 ? (
            <p className="empty-state">No upcoming items returned by {MCP_PROVIDER_LABELS[upcomingProvider]}.</p>
          ) : (
            <div className="meeting-list">
              {upcomingItems.map((item) => {
                const title = item.subject || item.topic || "Untitled";
                const key = item.id || item.lookupId || `${title}-${item.start || item.start_time}`;
                return (
                  <div key={key} className="meeting-item">
                    <div className="meeting-type-dot" style={{ background: "#06b6d4" }} />
                    <div className="meeting-info">
                      <div className="meeting-client">{title}</div>
                      <div className="meeting-meta">{getUpcomingLabel(upcomingProvider, item)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <Link to="/calendar" className="card-link">
            Open provider calendar -&gt;
          </Link>
        </div>

        <div className="card week-card">
          <div className="card-header">
            <TrendingUp size={18} />
            <h2>This Week</h2>
          </div>
          <div className="week-stats">
            <div className="stat-row">
              <span>Meetings scheduled</span>
              <strong>{meetingsScheduled} / {capacity}</strong>
            </div>
            <div className="capacity-bar">
              <div className="capacity-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="stat-row">
              <span>Completed this week</span>
              <strong>{weekStats?.meetings_completed || 0}</strong>
            </div>
            <div className="stat-row">
              <span>Emails approved</span>
              <strong>{weekStats?.emails_approved || 0}</strong>
            </div>
            <div className="stat-row">
              <span>Pending approval</span>
              <strong className={pendingApprovals.length > 0 ? "highlight" : ""}>{pendingApprovals.length}</strong>
            </div>
          </div>
          <Link to="/summary" className="card-link">
            Full weekly summary -&gt;
          </Link>
        </div>
      </div>
    </div>
  );
}
