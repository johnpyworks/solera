import { useState } from "react";
import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { MessageSquare } from "lucide-react";
import { AppProvider } from "./context/AppContext";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Sidebar from "./components/Sidebar";
import ChatPanel from "./components/ChatPanel";
import Dashboard from "./pages/Dashboard";
import ApprovalQueue from "./pages/ApprovalQueue";
import CalendarPage from "./pages/Calendar";
import ActiveTasks from "./pages/ActiveTasks";
import ScheduledTasks from "./pages/ScheduledTasks";
import WeeklySummary from "./pages/WeeklySummary";
import SettingsPage from "./pages/Settings";
import ClientList from "./pages/ClientList";
import ClientProfile from "./pages/ClientProfile";
import QuestionnairePage from "./pages/QuestionnairePage";
import LoginPage from "./pages/LoginPage";
import DatabaseExplorerPage from "./pages/DatabaseExplorer";
import UsageDashboard from "./pages/UsageDashboard";
import AgentPromptsPage from "./pages/AgentPrompts";
import "./index.css";

function AppShell() {
  const [chatOpen, setChatOpen] = useState(false);
  const location = useLocation();

  // Detect if we're on a client profile page and extract the client id
  const clientMatch = location.pathname.match(/^\/clients\/([^/]+)$/);
  const activeChatClientId = clientMatch ? clientMatch[1] : null;

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-area">
        <div className="page-content">
          <Routes>
            <Route path="/" element={<Dashboard onOpenChat={() => setChatOpen(true)} />} />
            <Route path="/clients" element={<ClientList />} />
            <Route path="/clients/:id" element={<ClientProfile onOpenChat={() => setChatOpen(true)} />} />
            <Route path="/approvals" element={<ApprovalQueue />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/tasks" element={<ActiveTasks />} />
            <Route path="/scheduled" element={<ScheduledTasks />} />
            <Route path="/summary" element={<WeeklySummary />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/db-explorer" element={<AdminRoute><DatabaseExplorerPage /></AdminRoute>} />
            <Route path="/prompts" element={<AdminRoute><AgentPromptsPage /></AdminRoute>} />
            <Route path="/usage" element={<UsageDashboard />} />
          </Routes>
        </div>
      </div>

      {/* Floating chat trigger */}
      <button
        className="chat-fab"
        onClick={() => setChatOpen(true)}
        title="Open AI Assistant"
      >
        <MessageSquare size={22} />
        <span>Ask AI</span>
      </button>

      <ChatPanel
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        clientId={activeChatClientId}
      />
    </div>
  );
}

function AdminRoute({ children }) {
  const { user } = useAuth();
  if (user?.role !== "super_admin") return <Navigate to="/" replace />;
  return children;
}

function AuthGate() {
  const { user, loading } = useAuth();
  if (loading) return <div className="auth-loading">Loading...</div>;
  if (!user) return <LoginPage />;
  return <AppShell />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/form/:token" element={<QuestionnairePage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="*" element={<AuthGate />} />
          </Routes>
        </BrowserRouter>
      </AppProvider>
    </AuthProvider>
  );
}
