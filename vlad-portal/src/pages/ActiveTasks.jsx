import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle, Clock, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { agentLogs } from "../data/mockData";

const AGENT_COLORS = {
  Orchestrator: "#94a3b8",
  Scribe: "#6366f1",
  Scheduler: "#06b6d4",
  "Service Agent": "#10b981",
  Processor: "#f59e0b",
};

const STATUS_ICONS = {
  complete: <CheckCircle size={15} style={{ color: "#10b981" }} />,
  in_progress: <Clock size={15} style={{ color: "#f59e0b" }} />,
  failed: <AlertCircle size={15} style={{ color: "#ef4444" }} />,
};

const MOCK_EXTENDED = [
  ...agentLogs,
  {
    id: "log6",
    agent_id: 3,
    agent_name: "Service Agent",
    task_id: "t7",
    action: "Checking premium status for James & Carol Thornton — Penn Mutual underwriting",
    client: "James & Carol Thornton",
    client_id: "c5",
    status: "in_progress",
    timestamp: "2026-03-30T09:15:00",
  },
  {
    id: "log7",
    agent_id: 2,
    agent_name: "Scheduler",
    task_id: "t8",
    action: "Queuing 48hr reminder for Priya Nair — LEAP Process Apr 7",
    client: "Priya Nair",
    client_id: "c4",
    status: "complete",
    timestamp: "2026-04-05T08:00:00",
  },
];

function formatTime(ts) {
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ActiveTasks() {
  const [expanded, setExpanded] = useState(null);
  const [agentFilter, setAgentFilter] = useState("all");

  const agents = ["all", ...new Set(MOCK_EXTENDED.map((l) => l.agent_name))];
  const filtered =
    agentFilter === "all"
      ? MOCK_EXTENDED
      : MOCK_EXTENDED.filter((l) => l.agent_name === agentFilter);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Active Tasks</h1>
          <p className="subtitle">Live feed of what your AI agents have done and are doing.</p>
        </div>
      </div>

      <div className="filter-tabs">
        {agents.map((a) => (
          <button
            key={a}
            className={`filter-tab ${agentFilter === a ? "active" : ""}`}
            onClick={() => setAgentFilter(a)}
          >
            {a === "all" ? "All Agents" : a}
          </button>
        ))}
      </div>

      <div className="tasks-list">
        {filtered
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
          .map((log) => (
            <div key={log.id} className="task-card">
              <div
                className="task-card-header"
                onClick={() => setExpanded(expanded === log.id ? null : log.id)}
              >
                <div className="task-left">
                  {STATUS_ICONS[log.status] || STATUS_ICONS.complete}
                  <div
                    className="agent-chip"
                    style={{
                      background: (AGENT_COLORS[log.agent_name] || "#94a3b8") + "22",
                      color: AGENT_COLORS[log.agent_name] || "#94a3b8",
                    }}
                  >
                    {log.agent_name}
                  </div>
                  <div className="task-action">{log.action}</div>
                </div>
                <div className="task-right">
                  {log.client_id ? (
                    <Link
                      to={`/clients/${log.client_id}`}
                      className="task-client-link"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {log.client}
                    </Link>
                  ) : (
                    <span className="task-client">{log.client}</span>
                  )}
                  <span className="task-time">{formatTime(log.timestamp)}</span>
                  {expanded === log.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </div>
              </div>
              {expanded === log.id && (
                <div className="task-detail">
                  <div className="detail-row">
                    <span>Task ID</span>
                    <code>{log.task_id}</code>
                  </div>
                  <div className="detail-row">
                    <span>Agent</span>
                    <span>{log.agent_name} (Agent {log.agent_id})</span>
                  </div>
                  <div className="detail-row">
                    <span>Status</span>
                    <span className={`status-text ${log.status}`}>{log.status}</span>
                  </div>
                  <div className="detail-row">
                    <span>Client</span>
                    <span>{log.client}</span>
                  </div>
                  <div className="detail-row">
                    <span>Timestamp</span>
                    <span>{formatTime(log.timestamp)}</span>
                  </div>
                </div>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}
