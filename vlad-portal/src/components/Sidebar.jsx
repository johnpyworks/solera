import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import {
  BarChart2,
  BrainCircuit,
  Calendar,
  CheckSquare,
  Database,
  LayoutDashboard,
  ListTodo,
  Settings,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { apiFetch } from "../api/client";
import { useAuth } from "../context/AuthContext";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/clients", label: "Clients", icon: Users },
  { to: "/approvals", label: "Approval Queue", icon: CheckSquare, badge: true },
  { to: "/calendar", label: "Calendar", icon: Calendar },
  { to: "/tasks", label: "Active Tasks", icon: ListTodo },
  { to: "/summary", label: "Weekly Summary", icon: BarChart2 },
  { to: "/usage", label: "Usage", icon: TrendingUp },
  { to: "/settings", label: "Settings", icon: Settings },
];

function asList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  return [];
}

export default function Sidebar() {
  const { user } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    async function loadPendingCount() {
      try {
        const approvals = await apiFetch("/approvals/?status=pending");
        setPendingCount(asList(approvals).length);
      } catch (_) {
        setPendingCount(0);
      }
    }

    loadPendingCount();
  }, []);

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <Zap size={20} />
        <span>Solera AI</span>
      </div>
      <nav className="sidebar-nav">
        {nav.map(({ to, label, icon: Icon, badge }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
          >
            <Icon size={18} />
            <span>{label}</span>
            {badge && pendingCount > 0 && <span className="badge">{pendingCount}</span>}
          </NavLink>
        ))}

        {user?.role === "super_admin" && (
          <>
            <NavLink
              to="/prompts"
              className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
            >
              <BrainCircuit size={18} />
              <span>Agent Prompts</span>
            </NavLink>
            <NavLink
              to="/db-explorer"
              className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
            >
              <Database size={18} />
              <span>Database</span>
            </NavLink>
          </>
        )}
      </nav>
      <div className="sidebar-footer">
        <div className="advisor-chip">
          <div className="avatar">{(user?.first_name || user?.username || "V").slice(0, 1).toUpperCase()}</div>
          <div>
            <div className="advisor-name">{user?.full_name || user?.username || "Advisor"}</div>
            <div className="advisor-role">{user?.role || "advisor"}</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
