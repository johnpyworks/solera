import { useEffect, useState, useCallback } from "react";
import { BarChart2, RefreshCw } from "lucide-react";
import { apiFetch } from "../api/client";

// ── Helpers ───────────────────────────────────────────────────

function formatTokens(n) {
  if (!n) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatCost(val) {
  const num = parseFloat(val);
  if (isNaN(num)) return "$0.00";
  return `$${num.toFixed(2)}`;
}

function timeAgo(dateStr) {
  if (!dateStr) return "—";
  const now = new Date();
  const then = new Date(dateStr);
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMs / 3_600_000);
  if (diffHr < 24) return `${diffHr} hr ago`;
  return then.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

// ── Stat Card ─────────────────────────────────────────────────

function StatCard({ label, primary, secondary }) {
  return (
    <div className="usage-stat-card">
      <div className="usage-stat-label">{label}</div>
      <div className="usage-stat-primary">{primary}</div>
      {secondary && <div className="usage-stat-secondary">{secondary}</div>}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────

export default function UsageDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await apiFetch("/agent-logs/usage-summary/");
      setData(result);
    } catch (err) {
      setError(err.message || "Failed to load usage data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // ── Loading ──────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="page">
        <div className="page-header">
          <div>
            <h1>Usage</h1>
            <p className="subtitle">Loading usage data…</p>
          </div>
        </div>
        <div className="usage-loading">Fetching token usage…</div>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="page">
        <div className="page-header">
          <div>
            <h1>Usage</h1>
            <p className="subtitle">AI token consumption</p>
          </div>
        </div>
        <div className="usage-error">
          <p>{error}</p>
          <button className="btn btn-ghost" onClick={load}>
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      </div>
    );
  }

  // ── Derived values ───────────────────────────────────────────
  const todayTotal =
    (data.today?.input_tokens ?? 0) + (data.today?.output_tokens ?? 0);
  const weekTotal =
    (data.this_week?.input_tokens ?? 0) + (data.this_week?.output_tokens ?? 0);
  const agentCount = Array.isArray(data.by_agent) ? data.by_agent.length : 0;
  const byDay = Array.isArray(data.by_day) ? data.by_day.slice(-7) : [];
  const byAgent = Array.isArray(data.by_agent) ? data.by_agent : [];
  const recentSessions = Array.isArray(data.recent_sessions)
    ? data.recent_sessions
    : [];

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1>Usage</h1>
          <p className="subtitle">
            AI token consumption &middot;{" "}
            <strong style={{ color: "var(--text-h)" }}>
              {formatTokens(weekTotal)}
            </strong>{" "}
            tokens this week
          </p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-ghost" onClick={load}>
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="usage-stats-row">
        <StatCard
          label="Today"
          primary={formatTokens(todayTotal) + " tokens"}
          secondary={formatCost(data.today?.cost_usd)}
        />
        <StatCard
          label="This Week"
          primary={formatTokens(weekTotal) + " tokens"}
          secondary={formatCost(data.this_week?.cost_usd)}
        />
        <StatCard
          label="Active Agents"
          primary={`${agentCount} agent${agentCount !== 1 ? "s" : ""}`}
          secondary="ran this week"
        />
      </div>

      {/* Two-column section: By Agent + Daily Trend */}
      <div className="usage-grid">

        {/* By Agent */}
        <div className="card">
          <div className="card-header">
            <BarChart2 size={16} />
            <h2>By Agent</h2>
          </div>
          {byAgent.length === 0 ? (
            <p className="usage-empty">No agent data for this period.</p>
          ) : (
            <div className="usage-table-wrap">
              <table className="usage-table">
                <thead>
                  <tr>
                    <th>Agent</th>
                    <th>Sessions</th>
                    <th>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {byAgent.map((row, i) => (
                    <tr key={i}>
                      <td>{row.agent_name || "—"}</td>
                      <td>{row.sessions ?? "—"}</td>
                      <td>{formatCost(row.cost_usd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Daily Trend */}
        <div className="card">
          <div className="card-header">
            <BarChart2 size={16} />
            <h2>Daily Trend</h2>
          </div>
          {byDay.length === 0 ? (
            <p className="usage-empty">No daily data available.</p>
          ) : (
            <div className="usage-table-wrap">
              <table className="usage-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Tokens</th>
                    <th>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {byDay.map((row, i) => (
                    <tr key={i}>
                      <td>{formatDate(row.date)}</td>
                      <td>{formatTokens(row.total_tokens)}</td>
                      <td>{formatCost(row.cost_usd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Recent Sessions */}
      <div className="card" style={{ marginTop: "24px" }}>
        <div className="card-header">
          <BarChart2 size={16} />
          <h2>Recent Sessions</h2>
        </div>
        {recentSessions.length === 0 ? (
          <p className="usage-empty">No recent sessions found.</p>
        ) : (
          <div className="usage-table-wrap">
            <table className="usage-table">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Model</th>
                  <th>In Tokens</th>
                  <th>Out Tokens</th>
                  <th>Cost</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {recentSessions.map((s) => (
                  <tr key={s.id}>
                    <td>{s.agent_name || "—"}</td>
                    <td>
                      <span className="usage-model-pill">
                        {s.model || "—"}
                      </span>
                    </td>
                    <td>{formatTokens(s.input_tokens)}</td>
                    <td>{formatTokens(s.output_tokens)}</td>
                    <td>{formatCost(s.cost_usd)}</td>
                    <td className="usage-time-ago">{timeAgo(s.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
