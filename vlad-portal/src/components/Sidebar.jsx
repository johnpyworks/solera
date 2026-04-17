import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  CheckSquare,
  Calendar,
  ListTodo,
  BarChart2,
  Settings,
  Zap,
  Users,
} from "lucide-react";
import { useApp } from "../context/AppContext";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/clients", label: "Clients", icon: Users },
  { to: "/approvals", label: "Approval Queue", icon: CheckSquare, badge: true },
  { to: "/calendar", label: "Calendar", icon: Calendar },
  { to: "/tasks", label: "Active Tasks", icon: ListTodo },
  { to: "/summary", label: "Weekly Summary", icon: BarChart2 },
  { to: "/settings", label: "Settings", icon: Settings },
];

export default function Sidebar() {
  const { pendingCount } = useApp();

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
            {badge && pendingCount > 0 && (
              <span className="badge">{pendingCount}</span>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-footer">
        <div className="advisor-chip">
          <div className="avatar">V</div>
          <div>
            <div className="advisor-name">Vlad Donets</div>
            <div className="advisor-role">Senior Advisor</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
