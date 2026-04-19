import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Search, Plus, X, ChevronUp, ChevronDown, Flag,
  LayoutGrid, List, Users, ChevronLeft, ChevronRight,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { apiFetch } from "../api/client";

const STAGES = ["All", "Discovery", "LEAP Process", "Implementation", "Solera Heartbeat"];

const STAGE_COLORS = {
  Discovery: "#6366f1",
  "LEAP Process": "#8b5cf6",
  Implementation: "#06b6d4",
  "Solera Heartbeat": "#10b981",
};

// ── Error parser ──────────────────────────────────────────────

function parseApiError(err) {
  if (err.data && typeof err.data === "object" && !err.data.detail) {
    const messages = [];
    function walk(obj, prefix) {
      for (const [k, v] of Object.entries(obj)) {
        const label = (prefix ? `${prefix} › ` : "") + k.replace(/_/g, " ");
        if (Array.isArray(v)) messages.push(`${label}: ${v.join(", ")}`);
        else if (v && typeof v === "object") walk(v, label);
      }
    }
    walk(err.data, "");
    if (messages.length) return messages.join("\n");
  }
  return err.message || "Failed to create client.";
}

// ── New Client Modal ──────────────────────────────────────────

function NewClientModal({ onClose }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    meeting_stage: "Discovery",
    language_tag: null,
    addressLine1: "",
    city: "",
    state: "",
    zip: "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function handleChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.firstName.trim()) { setError("First name is required."); return; }
    if (!form.lastName.trim()) { setError("Last name is required."); return; }
    if (!form.email.trim()) { setError("Email is required."); return; }

    const payload = {
      first_name: form.firstName.trim(),
      last_name: form.lastName.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      meeting_stage: form.meeting_stage,
      language_tag: form.language_tag || "",
    };
    if (form.addressLine1.trim()) {
      payload.address = {
        address_line1: form.addressLine1.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        zip_code: form.zip.trim(),
      };
    }

    setSaving(true);
    try {
      const newClient = await apiFetch("/clients/", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      onClose();
      navigate(`/clients/${newClient.id}`);
    } catch (err) {
      setError(parseApiError(err));
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>New Client</h2>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>
        <form className="modal-form" onSubmit={handleSubmit}>
          <div className="form-row-2">
            <div className="form-row">
              <label>First Name *</label>
              <input className="form-input" placeholder="Jane" value={form.firstName}
                onChange={(e) => handleChange("firstName", e.target.value)} />
            </div>
            <div className="form-row">
              <label>Last Name *</label>
              <input className="form-input" placeholder="Smith" value={form.lastName}
                onChange={(e) => handleChange("lastName", e.target.value)} />
            </div>
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
          <div className="form-row">
            <label>Address</label>
            <input className="form-input" placeholder="Street address" value={form.addressLine1}
              onChange={(e) => handleChange("addressLine1", e.target.value)} />
          </div>
          <div className="form-row-3">
            <div className="form-row">
              <label>City</label>
              <input className="form-input" placeholder="City" value={form.city}
                onChange={(e) => handleChange("city", e.target.value)} />
            </div>
            <div className="form-row">
              <label>State</label>
              <input className="form-input" placeholder="CA" value={form.state}
                onChange={(e) => handleChange("state", e.target.value)} />
            </div>
            <div className="form-row">
              <label>Zip</label>
              <input className="form-input" placeholder="94105" value={form.zip}
                onChange={(e) => handleChange("zip", e.target.value)} />
            </div>
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
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Saving…" : "Add Client"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Pagination ────────────────────────────────────────────────

function Pagination({ page, total, pageSize, onPage }) {
  if (total <= pageSize) return null;
  const totalPages = Math.ceil(total / pageSize);
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="pagination">
      <button
        className="pagination-btn"
        onClick={() => onPage(page - 1)}
        disabled={page === 1}
      >
        <ChevronLeft size={15} /> Prev
      </button>
      <span className="pagination-info">
        {from}–{to} of {total} clients · page {page} of {totalPages}
      </span>
      <button
        className="pagination-btn"
        onClick={() => onPage(page + 1)}
        disabled={page === totalPages}
      >
        Next <ChevronRight size={15} />
      </button>
    </div>
  );
}

// ── Card View ─────────────────────────────────────────────────

function CardView({ clients, getPendingCount }) {
  if (clients.length === 0) {
    return <div className="empty-state-full">No clients match your search.</div>;
  }
  return (
    <div className="client-grid">
      {clients.map((client) => {
        const pending = getPendingCount(client.id);
        const days = client.last_contact_date
          ? Math.round((new Date() - new Date(client.last_contact_date)) / 86400000)
          : null;
        const isStale = days !== null && days > 14;

        return (
          <Link key={client.id} to={`/clients/${client.id}`}
            className={`client-card${pending > 0 ? " client-card-attention" : ""}`}>
            <div className="client-card-top">
              <div className="client-avatar-lg">{(client.full_name || "?")[0]}</div>
              <div className="client-card-info">
                <div className="client-card-name">{client.full_name}</div>
                <div className="client-stage-badge"
                  style={{ color: STAGE_COLORS[client.meeting_stage] || "#94a3b8" }}>
                  {client.meeting_stage}
                </div>
              </div>
              <div className="client-card-flags">
                {client.language_tag === "ru" && <span className="ru-tag">RU</span>}
                {client.household_name && (
                  <span className="household-badge" title={client.household_name}>
                    <Users size={10} />
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
              {client.owner_username && (
                <div className="client-meta-row">
                  <span className="client-meta-label">Advisor</span>
                  <span className="client-meta-val" style={{ textTransform: "capitalize" }}>
                    {client.owner_username}
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

function TableView({ clients, getPendingCount }) {
  const [sortCol, setSortCol] = useState("full_name");
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
              { col: "full_name", label: "Client" },
              { col: "meeting_stage", label: "Stage" },
              { col: "last_contact_date", label: "Last Contact" },
              { col: "owner_username", label: "Advisor" },
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
                    <div className="client-row-avatar">{(client.full_name || "?")[0]}</div>
                    <div>
                      <div className="client-row-name">
                        {client.full_name}
                        {client.household_name && (
                          <span className="household-badge" title={client.household_name}>
                            <Users size={10} />
                          </span>
                        )}
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
                <td style={{ textTransform: "capitalize" }}>{client.owner_username || "—"}</td>
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

const PAGE_SIZE = 20;

export default function ClientList() {
  const { approvals } = useApp();
  const [clients, setClients] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("All");
  const [showModal, setShowModal] = useState(false);
  const [view, setView] = useState("table");

  // Debounce search — only fire fetch after 300ms of no typing
  const searchDebounceRef = useRef(null);

  const fetchClients = useCallback(async (pg, q, stage) => {
    setLoading(true);
    try {
      let url = `/clients/?page=${pg}&page_size=${PAGE_SIZE}`;
      if (q)             url += `&search=${encodeURIComponent(q)}`;
      if (stage !== "All") url += `&meeting_stage=${encodeURIComponent(stage)}`;
      const data = await apiFetch(url);
      // DRF paginated: { count, next, previous, results }
      const results = Array.isArray(data) ? data : (data.results || []);
      const count   = Array.isArray(data) ? data.length : (data.count || 0);
      setClients(results);
      setTotal(count);
    } catch (err) {
      console.error("Failed to load clients:", err);
      setClients([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Re-fetch when page or stageFilter changes
  useEffect(() => {
    fetchClients(page, search, stageFilter);
  }, [page, stageFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounce search — reset to page 1 on new search
  function handleSearchChange(value) {
    setSearch(value);
    clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setPage(1);
      fetchClients(1, value, stageFilter);
    }, 300);
  }

  function handleStageFilter(stage) {
    setStageFilter(stage);
    setPage(1);
  }

  function getPendingCount(clientId) {
    return approvals.filter((a) => a.client_id === clientId && a.status === "pending").length;
  }

  // Stage tab counts — from currently loaded page only (approximate for filtered views)
  const stageCounts = STAGES.reduce((acc, s) => {
    acc[s] = s === "All" ? total : clients.filter((c) => c.meeting_stage === s).length;
    return acc;
  }, {});

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Clients</h1>
          <p className="subtitle">
            {loading ? "Loading…" : `${total} client${total !== 1 ? "s" : ""} across your book of business`}
          </p>
        </div>
        <div className="page-header-actions">
          <div className="client-search-wrap">
            <Search size={15} />
            <input
              className="client-search"
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
            {search && (
              <button
                className="search-clear-btn"
                onClick={() => handleSearchChange("")}
                title="Clear search"
              >
                <X size={13} />
              </button>
            )}
          </div>
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
            onClick={() => handleStageFilter(s)}>
            {s}
            <span className="tab-count">{stageCounts[s] ?? 0}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="clients-loading">Loading clients…</div>
      ) : view === "card" ? (
        <CardView clients={clients} getPendingCount={getPendingCount} />
      ) : (
        <TableView clients={clients} getPendingCount={getPendingCount} />
      )}

      <Pagination page={page} total={total} pageSize={PAGE_SIZE} onPage={setPage} />

      {showModal && (
        <NewClientModal onClose={() => { setShowModal(false); fetchClients(page, search, stageFilter); }} />
      )}
    </div>
  );
}
