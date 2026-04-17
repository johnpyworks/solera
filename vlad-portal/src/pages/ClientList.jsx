import { useState } from "react";
import { Link } from "react-router-dom";
import { Search, Plus, X, ChevronUp, ChevronDown, Flag, LayoutGrid, List, Users } from "lucide-react";
import { useApp } from "../context/AppContext";
import { households } from "../data/mockData";

const STAGES = ["All", "Discovery", "LEAP Process", "Implementation", "Solera Heartbeat"];

const STAGE_COLORS = {
  Discovery: "#6366f1",
  "LEAP Process": "#8b5cf6",
  Implementation: "#06b6d4",
  "Solera Heartbeat": "#10b981",
};

const ADVISORS = ["vlad", "slava"];

// ── New Client Modal ──────────────────────────────────────────

function NewClientModal({ onClose, onSave }) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    assigned_advisor: "vlad",
    meeting_stage: "Discovery",
    language_tag: null,
  });
  const [error, setError] = useState("");

  function handleChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) { setError("Name is required."); return; }
    if (!form.email.trim()) { setError("Email is required."); return; }
    onSave(form);
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>New Client</h2>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>
        <form className="modal-form" onSubmit={handleSubmit}>
          <div className="form-row">
            <label>Full Name *</label>
            <input className="form-input" placeholder="e.g. Jane Smith" value={form.name}
              onChange={(e) => handleChange("name", e.target.value)} />
          </div>
          <div className="form-row">
            <label>Email *</label>
            <input className="form-input" type="email" placeholder="client@email.com" value={form.email}
              onChange={(e) => handleChange("email", e.target.value)} />
          </div>
          <div className="form-row">
            <label>Phone</label>
            <input className="form-input" placeholder="(555) 555-0000" value={form.phone}
              onChange={(e) => handleChange("phone", e.target.value)} />
          </div>
          <div className="form-row-2">
            <div className="form-row">
              <label>Assigned Advisor</label>
              <select className="form-input" value={form.assigned_advisor}
                onChange={(e) => handleChange("assigned_advisor", e.target.value)}>
                {ADVISORS.map((a) => (
                  <option key={a} value={a}>{a.charAt(0).toUpperCase() + a.slice(1)}</option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <label>Meeting Stage</label>
              <select className="form-input" value={form.meeting_stage}
                onChange={(e) => handleChange("meeting_stage", e.target.value)}>
                {STAGES.filter((s) => s !== "All").map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-row form-check-row">
            <label className="check-label">
              <input type="checkbox" checked={form.language_tag === "ru"}
                onChange={(e) => handleChange("language_tag", e.target.checked ? "ru" : null)} />
              Russian-speaking client (RU flag)
            </label>
          </div>
          {error && <div className="form-error">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">Add Client</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Card View ─────────────────────────────────────────────────

function CardView({ clients, getPendingCount, getHousehold, getMemberCount }) {
  if (clients.length === 0) {
    return <div className="empty-state-full">No clients match your search.</div>;
  }
  return (
    <div className="client-grid">
      {clients.map((client) => {
        const pending = getPendingCount(client.id);
        const household = getHousehold(client);
        const memberCount = getMemberCount(client);
        const days = client.last_contact_date
          ? Math.round((new Date() - new Date(client.last_contact_date)) / 86400000)
          : null;
        const isStale = days !== null && days > 14;

        return (
          <Link key={client.id} to={`/clients/${client.id}`}
            className={`client-card${pending > 0 ? " client-card-attention" : ""}`}>
            <div className="client-card-top">
              <div className="client-avatar-lg">{client.name[0]}</div>
              <div className="client-card-info">
                <div className="client-card-name">{client.name}</div>
                <div className="client-stage-badge"
                  style={{ color: STAGE_COLORS[client.meeting_stage] || "#94a3b8" }}>
                  {client.meeting_stage}
                </div>
              </div>
              <div className="client-card-flags">
                {client.language_tag === "ru" && <span className="ru-tag">RU</span>}
                {household && (
                  <span className="household-badge" title={household.name}>
                    <Users size={10} /> {memberCount + 1}
                  </span>
                )}
              </div>
            </div>
            <div className="client-card-meta">
              <div className="client-meta-row">
                <span className="client-meta-label">Last contact</span>
                <span className={`client-meta-val${isStale ? " stale" : ""}`}>
                  {client.last_contact_date
                    ? new Date(client.last_contact_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                    : "Never"}
                  {isStale && " · stale"}
                </span>
              </div>
              {client.assigned_advisor && (
                <div className="client-meta-row">
                  <span className="client-meta-label">Advisor</span>
                  <span className="client-meta-val" style={{ textTransform: "capitalize" }}>
                    {client.assigned_advisor}
                  </span>
                </div>
              )}
            </div>
            {pending > 0 && (
              <div className="client-pending-chip">
                {pending} pending approval{pending > 1 ? "s" : ""}
              </div>
            )}
          </Link>
        );
      })}
    </div>
  );
}

// ── Table View ────────────────────────────────────────────────

function TableView({ clients, getPendingCount, getHousehold, getMemberCount }) {
  const [sortCol, setSortCol] = useState("name");
  const [sortDir, setSortDir] = useState("asc");

  function handleSort(col) {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  }

  const sorted = [...clients].sort((a, b) => {
    let av = a[sortCol] || "";
    let bv = b[sortCol] || "";
    if (sortCol === "last_contact_date") {
      av = av ? new Date(av).getTime() : 0;
      bv = bv ? new Date(bv).getTime() : 0;
      return sortDir === "asc" ? av - bv : bv - av;
    }
    return sortDir === "asc"
      ? av.toString().localeCompare(bv.toString())
      : bv.toString().localeCompare(av.toString());
  });

  function SortIcon({ col }) {
    if (sortCol !== col) return <ChevronUp size={12} style={{ color: "var(--border)", marginLeft: 3 }} />;
    return sortDir === "asc"
      ? <ChevronUp size={12} style={{ color: "var(--accent)", marginLeft: 3 }} />
      : <ChevronDown size={12} style={{ color: "var(--accent)", marginLeft: 3 }} />;
  }

  if (clients.length === 0) {
    return <div className="empty-state-full">No clients match your search.</div>;
  }

  return (
    <div className="clients-table-wrap">
      <table className="clients-table">
        <thead>
          <tr>
            {[
              { col: "name", label: "Client" },
              { col: "meeting_stage", label: "Stage" },
              { col: "last_contact_date", label: "Last Contact" },
              { col: "assigned_advisor", label: "Advisor" },
            ].map(({ col, label }) => (
              <th key={col} className="sortable-th" onClick={() => handleSort(col)}>
                {label}<SortIcon col={col} />
              </th>
            ))}
            <th>Approvals</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((client) => {
            const pending = getPendingCount(client.id);
            const days = client.last_contact_date
              ? Math.round((new Date() - new Date(client.last_contact_date)) / 86400000)
              : null;
            const isStale = days !== null && days > 14;
            const contactLabel = client.last_contact_date
              ? new Date(client.last_contact_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
              : "—";

            return (
              <tr key={client.id} className={`client-row${pending > 0 ? " client-row-attention" : ""}`}>
                <td>
                  <Link to={`/clients/${client.id}`} className="client-row-name-link">
                    <div className="client-row-avatar">{client.name[0]}</div>
                    <div>
                      <div className="client-row-name">
                        {client.name}
                        {(() => {
                          const h = getHousehold(client);
                          const mc = getMemberCount(client);
                          return h ? (
                            <span className="household-badge" title={h.name}>
                              <Users size={10} /> {mc + 1}
                            </span>
                          ) : null;
                        })()}
                      </div>
                      <div className="client-row-email">{client.email || "—"}</div>
                    </div>
                    {client.language_tag === "ru" && (
                      <Flag size={11} className="flag-icon" title="Russian-speaking" />
                    )}
                  </Link>
                </td>
                <td>
                  <span className="client-stage-pill"
                    style={{
                      color: STAGE_COLORS[client.meeting_stage] || "#94a3b8",
                      background: (STAGE_COLORS[client.meeting_stage] || "#94a3b8") + "18",
                    }}>
                    {client.meeting_stage}
                  </span>
                </td>
                <td className={isStale ? "stale-cell" : ""}>
                  {contactLabel}
                  {isStale && <span className="stale-badge">stale</span>}
                </td>
                <td style={{ textTransform: "capitalize" }}>{client.assigned_advisor || "—"}</td>
                <td>
                  {pending > 0
                    ? <span className="pending-badge-sm">{pending} pending</span>
                    : <span className="no-pending">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────

export default function ClientList() {
  const { approvals, allClients, addClient, getMembersForHousehold } = useApp();
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("All");
  const [showModal, setShowModal] = useState(false);
  const [view, setView] = useState("table"); // "table" | "card"

  function getPendingCount(clientId) {
    return approvals.filter((a) => a.client_id === clientId && a.status === "pending").length;
  }

  function getHousehold(client) {
    if (!client.household_id) return null;
    return households.find((h) => h.id === client.household_id) || null;
  }

  function getMemberCount(client) {
    if (!client.household_id) return 0;
    return getMembersForHousehold(client.household_id).length;
  }

  // Only show primary contacts and singles — not linked members (they have no client record anyway)
  const filtered = allClients.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.email || "").toLowerCase().includes(search.toLowerCase());
    const matchesStage = stageFilter === "All" || c.meeting_stage === stageFilter;
    return matchesSearch && matchesStage;
  });

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Clients</h1>
          <p className="subtitle">{allClients.length} client{allClients.length !== 1 ? "s" : ""} across your book of business</p>
        </div>
        <div className="page-header-actions">
          <div className="client-search-wrap">
            <Search size={15} />
            <input
              className="client-search"
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {/* View toggle */}
          <div className="view-toggle">
            <button
              className={`view-toggle-btn${view === "table" ? " active" : ""}`}
              onClick={() => setView("table")}
              title="Table view"
            >
              <List size={15} />
            </button>
            <button
              className={`view-toggle-btn${view === "card" ? " active" : ""}`}
              onClick={() => setView("card")}
              title="Card view"
            >
              <LayoutGrid size={15} />
            </button>
          </div>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            <Plus size={15} /> New Client
          </button>
        </div>
      </div>

      <div className="filter-tabs">
        {STAGES.map((s) => (
          <button key={s}
            className={`filter-tab ${stageFilter === s ? "active" : ""}`}
            onClick={() => setStageFilter(s)}>
            {s}
            <span className="tab-count">
              {s === "All" ? allClients.length : allClients.filter((c) => c.meeting_stage === s).length}
            </span>
          </button>
        ))}
      </div>

      {view === "card"
        ? <CardView clients={filtered} getPendingCount={getPendingCount} getHousehold={getHousehold} getMemberCount={getMemberCount} />
        : <TableView clients={filtered} getPendingCount={getPendingCount} getHousehold={getHousehold} getMemberCount={getMemberCount} />
      }

      {showModal && (
        <NewClientModal onClose={() => setShowModal(false)} onSave={addClient} />
      )}
    </div>
  );
}
