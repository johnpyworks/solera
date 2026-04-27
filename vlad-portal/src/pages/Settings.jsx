import { useEffect, useState } from "react";
import { ExternalLink, RefreshCw, Save } from "lucide-react";
import {
  fetchConnectorEmbedUrl,
  fetchConnectorStatus,
  MCP_PROVIDER_ACCENTS,
  MCP_PROVIDER_LABELS,
  MCP_PROVIDER_ORDER,
} from "../api/mcp";

const DEFAULT_TOGGLES = {
  email_summary: true,
  email_followup: true,
  reminder_48hr: true,
  reminder_24hr: true,
  action_items: true,
  form_draft: true,
  weekly_summary: true,
};

const TOGGLE_LABELS = {
  email_summary: { label: "Post-Meeting Summary Email", locked: false, description: "Internal advisor notes after each meeting" },
  email_followup: { label: "Client Follow-Up Email", locked: true, description: "Client-facing next steps email - always requires approval" },
  reminder_48hr: { label: "48-Hour Appointment Reminder", locked: false, description: "Email reminder sent 48 hours before each meeting" },
  reminder_24hr: { label: "24-Hour Reminder (call/text)", locked: false, description: "Call/text reminder via 3CX - 24 hours before meeting" },
  action_items: { label: "Action Items", locked: false, description: "Tasks extracted from meeting transcripts queued for approval" },
  form_draft: { label: "Form Drafts", locked: false, description: "Pre-filled carrier forms sent to approval queue" },
  weekly_summary: { label: "Weekly Summary (auto-generate)", locked: false, description: "Auto-generated every Monday at 8am" },
};

function Toggle({ id, checked, locked, onChange }) {
  return (
    <button
      className={`toggle ${checked ? "on" : "off"} ${locked ? "locked" : ""}`}
      onClick={() => !locked && onChange(id, !checked)}
      title={locked ? "This setting cannot be disabled" : ""}
    >
      <div className="toggle-knob" />
    </button>
  );
}

function IntegrationCard({ provider, status }) {
  const tone = status.connected ? "connected" : status.configured ? "configured" : "disconnected";

  return (
    <div className={`integration-card ${tone}`}>
      <div className="integration-card-top">
        <div>
          <div className="integration-label">
            <span
              className="integration-dot"
              style={{ background: MCP_PROVIDER_ACCENTS[provider] }}
            />
            {MCP_PROVIDER_LABELS[provider]}
          </div>
          <div className="integration-state">
            {status.connected ? "Connected" : status.configured ? "Configured, not connected" : "Not configured"}
          </div>
        </div>
        <span className={`integration-pill ${tone}`}>
          {status.connected ? "Live" : status.configured ? "Needs auth" : "Off"}
        </span>
      </div>
      <p className="integration-message">
        {status.message || (status.connected ? "Ready for portal use." : "Open the connector below to complete setup.")}
      </p>
    </div>
  );
}

export default function SettingsPage() {
  const [toggles, setToggles] = useState(DEFAULT_TOGGLES);
  const [prefs, setPrefs] = useState({
    advisor_name: "Vlad Donets",
    email: "vlad@solerafinancial.com",
    signature: "Vlad Donets\nSolera Financial Advisory",
    teams_webhook: "https://outlook.office.com/webhook/...",
    commission_close_day: "Every 2nd Tuesday",
    meeting_cap: 15,
  });
  const [saved, setSaved] = useState(false);
  const [providers, setProviders] = useState({});
  const [embedUrl, setEmbedUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [statusError, setStatusError] = useState("");
  const [embedError, setEmbedError] = useState(false);

  async function loadIntegrationState() {
    setLoading(true);
    setStatusError("");
    try {
      const [statusData, embed] = await Promise.all([
        fetchConnectorStatus(),
        fetchConnectorEmbedUrl(),
      ]);
      setProviders(statusData.providers);
      setEmbedUrl(embed || statusData.embedUrl || "");
      setEmbedError(false);
    } catch (error) {
      setStatusError(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadIntegrationState();
  }, []);

  function handleToggle(id, val) {
    setToggles((prev) => ({ ...prev, [id]: val }));
  }

  function handlePref(key, val) {
    setPrefs((prev) => ({ ...prev, [key]: val }));
  }

  function save() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Settings</h1>
          <p className="subtitle">Configure approvals, preferences, and MCP integrations.</p>
        </div>
        <button className="btn btn-primary" onClick={save}>
          <Save size={15} /> {saved ? "Saved!" : "Save Changes"}
        </button>
      </div>

      <section className="settings-section">
        <div className="section-header-row">
          <div>
            <h2>Integrations</h2>
            <p className="section-desc">Portal MCP status is live. Detailed connection setup runs inside the embedded connector dashboard.</p>
          </div>
          <button className="btn btn-ghost" onClick={loadIntegrationState}>
            <RefreshCw size={15} /> Refresh Status
          </button>
        </div>

        {statusError ? (
          <div className="settings-error">
            {statusError}
          </div>
        ) : loading ? (
          <div className="settings-muted">Loading connector status...</div>
        ) : (
          <div className="integration-grid">
            {MCP_PROVIDER_ORDER.map((provider) => (
              <IntegrationCard
                key={provider}
                provider={provider}
                status={providers[provider] || { configured: false, connected: false, message: "" }}
              />
            ))}
          </div>
        )}

        <div className="integration-embed-header">
          <div>
            <h3>Connector Dashboard</h3>
            <p className="section-desc">Use this embedded dashboard to connect Outlook, Teams, and Zoom credentials.</p>
          </div>
          {embedUrl && (
            <a className="btn btn-ghost" href={embedUrl} target="_blank" rel="noreferrer">
              <ExternalLink size={15} /> Open in New Tab
            </a>
          )}
        </div>

        {embedUrl ? (
          <>
            {embedError && (
              <div className="settings-error">
                The embedded dashboard could not load inside the portal. Use "Open in New Tab" instead.
              </div>
            )}
            <iframe
              title="MCP Connector Dashboard"
              className="integration-iframe"
              src={embedUrl}
              onError={() => setEmbedError(true)}
            />
          </>
        ) : (
          <div className="settings-muted">Connector URL is not available.</div>
        )}
      </section>

      <section className="settings-section">
        <h2>Approval Toggles</h2>
        <p className="section-desc">
          Control which AI outputs require your approval before any action is taken. Locked items
          always require approval and cannot be disabled.
        </p>
        <div className="toggle-list">
          {Object.entries(TOGGLE_LABELS).map(([id, { label, locked, description }]) => (
            <div key={id} className="toggle-row">
              <div className="toggle-info">
                <div className="toggle-label">
                  {label}
                  {locked && <span className="locked-badge">Always on</span>}
                </div>
                <div className="toggle-desc">{description}</div>
              </div>
              <Toggle
                id={id}
                checked={toggles[id]}
                locked={locked}
                onChange={handleToggle}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <h2>Preferences</h2>
        <div className="prefs-grid">
          <div className="pref-field">
            <label>Advisor Name</label>
            <input
              value={prefs.advisor_name}
              onChange={(e) => handlePref("advisor_name", e.target.value)}
            />
          </div>
          <div className="pref-field">
            <label>Reply-To Email</label>
            <input
              value={prefs.email}
              onChange={(e) => handlePref("email", e.target.value)}
            />
          </div>
          <div className="pref-field full-width">
            <label>Email Signature</label>
            <textarea
              rows={3}
              value={prefs.signature}
              onChange={(e) => handlePref("signature", e.target.value)}
            />
          </div>
          <div className="pref-field">
            <label>Teams Webhook URL</label>
            <input
              value={prefs.teams_webhook}
              onChange={(e) => handlePref("teams_webhook", e.target.value)}
            />
          </div>
          <div className="pref-field">
            <label>Commission Close Day</label>
            <input
              value={prefs.commission_close_day}
              onChange={(e) => handlePref("commission_close_day", e.target.value)}
            />
          </div>
          <div className="pref-field">
            <label>Meeting Capacity Cap (per week)</label>
            <input
              type="number"
              min={1}
              max={20}
              value={prefs.meeting_cap}
              onChange={(e) => handlePref("meeting_cap", parseInt(e.target.value, 10))}
            />
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h2>System Info</h2>
        <div className="info-grid">
          <div className="info-item">
            <span className="info-label">Portal Mode</span>
            <span className="info-val active">MCP-integrated UI</span>
          </div>
          <div className="info-item">
            <span className="info-label">Connector Status</span>
            <span className="info-val">{loading ? "Loading" : statusError ? "Unavailable" : "Connected via Django bridge"}</span>
          </div>
          <div className="info-item">
            <span className="info-label">Settings UX</span>
            <span className="info-val">Embedded connector dashboard</span>
          </div>
          <div className="info-item">
            <span className="info-label">Calendar Source</span>
            <span className="info-val">Provider-selectable</span>
          </div>
          <div className="info-item">
            <span className="info-label">Outlook Calendar</span>
            <span className={`info-val ${providers.outlook?.connected ? "active" : "mocked"}`}>
              {providers.outlook?.connected ? "Live" : "Not connected"}
            </span>
          </div>
          <div className="info-item">
            <span className="info-label">Teams / Zoom</span>
            <span className={`info-val ${(providers.teams?.connected || providers.zoom?.connected) ? "active" : "mocked"}`}>
              {(providers.teams?.connected || providers.zoom?.connected) ? "Live transcript sources" : "Not connected"}
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
