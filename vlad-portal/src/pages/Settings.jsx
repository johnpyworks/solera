import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Eye, EyeOff, RefreshCw, Save } from "lucide-react";
import {
  fetchConnectorStatus,
  fetchCredentials,
  saveCredentials,
  testConnection,
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

const PROVIDER_FIELDS = {
  outlook: [
    { key: "MS_CLIENT_ID", label: "Application (Client) ID" },
    { key: "MS_CLIENT_SECRET", label: "Client Secret Value" },
    { key: "MS_TENANT_ID", label: "Directory (Tenant) ID" },
  ],
  teams: [
    { key: "TEAMS_CLIENT_ID", label: "Application (Client) ID" },
    { key: "TEAMS_CLIENT_SECRET", label: "Client Secret Value" },
    { key: "TEAMS_TENANT_ID", label: "Directory (Tenant) ID" },
  ],
  zoom: [
    { key: "ZOOM_ACCOUNT_ID", label: "Account ID" },
    { key: "ZOOM_API_KEY", label: "Client ID" },
    { key: "ZOOM_API_SECRET", label: "Client Secret" },
  ],
};

const ALL_PROVIDERS = ["outlook", "teams", "zoom"];

const PROVIDER_HINTS = {
  outlook: {
    title: "How to find your Outlook credentials",
    steps: [
      "Go to portal.azure.com and sign in.",
      "Search for Microsoft Entra ID → App registrations → New registration.",
      "Name your app, set Redirect URI to http://localhost:4000/auth/outlook/callback (Web platform).",
      "After creation, copy the Application (Client) ID and Directory (Tenant) ID from the Overview page.",
      "Go to Certificates & secrets → New client secret. Copy the secret Value (not the Secret ID).",
      "Under API permissions → Add a permission → Microsoft Graph → Delegated, add: Calendars.ReadWrite, Mail.Send, User.Read, offline_access.",
    ],
    warning: "Always copy the secret Value, not the Secret ID. The wrong field causes error AADSTS7000215.",
    fieldHints: {
      MS_CLIENT_ID: "Azure Portal → App registrations → Overview",
      MS_CLIENT_SECRET: "Certificates & secrets → Value column (not the ID column)",
      MS_TENANT_ID: "Azure Portal → Microsoft Entra ID → Overview",
    },
  },
  teams: {
    title: "How to find your Teams credentials",
    steps: [
      "Go to portal.azure.com and sign in.",
      "Search for Microsoft Entra ID → App registrations → New registration.",
      "Name your app, set Redirect URI to http://localhost:4000/auth/teams/callback (Web platform).",
      "After creation, copy the Application (Client) ID and Directory (Tenant) ID from the Overview page.",
      "Go to Certificates & secrets → New client secret. Copy the secret Value (not the Secret ID).",
      "Under API permissions → Add a permission → Microsoft Graph → Delegated, add: OnlineMeetings.Read, OnlineMeetingTranscript.Read.All, Calendars.Read, User.Read, offline_access.",
    ],
    warning: "Always copy the secret Value, not the Secret ID. The wrong field causes error AADSTS7000215.",
    fieldHints: {
      TEAMS_CLIENT_ID: "Azure Portal → App registrations → Overview",
      TEAMS_CLIENT_SECRET: "Certificates & secrets → Value column (not the ID column)",
      TEAMS_TENANT_ID: "Azure Portal → Microsoft Entra ID → Overview",
    },
  },
  zoom: {
    title: "How to find your Zoom credentials",
    steps: [
      "Go to marketplace.zoom.us and sign in.",
      "Click Develop → Build App in the top navigation.",
      "Choose Server-to-Server OAuth (requires a paid Zoom account).",
      "On the App Credentials tab, copy the Account ID, Client ID, and Client Secret.",
      "Under Scopes, add at minimum: user:read:admin, meeting:read:admin, recording:read:admin.",
      "Activate the app if it is not already active.",
    ],
    warning: null,
    fieldHints: {
      ZOOM_ACCOUNT_ID: "Zoom Marketplace → App Credentials tab",
      ZOOM_API_KEY: "Zoom Marketplace → App Credentials → Client ID",
      ZOOM_API_SECRET: "Zoom Marketplace → App Credentials → Client Secret",
    },
  },
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
            <span className="integration-dot" style={{ background: MCP_PROVIDER_ACCENTS[provider] }} />
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
        {status.message || (status.connected ? "Ready for portal use." : "Enter credentials below to complete setup.")}
      </p>
    </div>
  );
}

function ProviderPanel({ provider, status, onStatusRefresh }) {
  const fields = PROVIDER_FIELDS[provider];
  const hint = PROVIDER_HINTS[provider];
  const [open, setOpen] = useState(!status?.connected);
  const [hintOpen, setHintOpen] = useState(false);
  const [values, setValues] = useState(() => Object.fromEntries(fields.map((f) => [f.key, ""])));
  const [shown, setShown] = useState({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);
  const [testMsg, setTestMsg] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const data = await fetchCredentials(provider);
        if (data?.credentials) {
          setValues((prev) => {
            const next = { ...prev };
            for (const f of fields) {
              if (data.credentials[f.key]) next[f.key] = data.credentials[f.key];
            }
            return next;
          });
        }
      } catch (_) {}
    }
    load();
  }, [provider]);

  async function handleSave() {
    setSaving(true);
    setSaveMsg(null);
    setTestMsg(null);
    try {
      await saveCredentials(provider, values);
      setSaveMsg({ ok: true, text: "Credentials saved." });
      onStatusRefresh();
    } catch (e) {
      setSaveMsg({ ok: false, text: e.message || "Save failed." });
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestMsg(null);
    try {
      const result = await testConnection(provider);
      setTestMsg({ ok: result.ok, text: result.message || (result.ok ? "Connection successful." : "Connection failed.") });
      if (result.ok) onStatusRefresh();
    } catch (e) {
      setTestMsg({ ok: false, text: e.message || "Test failed." });
    } finally {
      setTesting(false);
    }
  }

  const tone = status?.connected ? "connected" : status?.configured ? "configured" : "disconnected";

  return (
    <div className="cred-panel">
      <button className="cred-panel-header" onClick={() => setOpen((v) => !v)}>
        <div className="cred-panel-title">
          <span className="integration-dot" style={{ background: MCP_PROVIDER_ACCENTS[provider] }} />
          <strong>{MCP_PROVIDER_LABELS[provider]}</strong>
          <span className={`integration-pill ${tone}`} style={{ marginLeft: 8 }}>
            {status?.connected ? "Live" : status?.configured ? "Needs auth" : "Off"}
          </span>
        </div>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {open && (
        <div className="cred-panel-body">
          <div className="cred-hint-toggle" onClick={() => setHintOpen((v) => !v)}>
            <span>📋 {hint.title}</span>
            {hintOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </div>
          {hintOpen && (
            <div className="cred-hint-body">
              <ol className="cred-hint-steps">
                {hint.steps.map((s, i) => <li key={i}>{s}</li>)}
              </ol>
              {hint.warning && (
                <div className="cred-hint-warning">⚠️ {hint.warning}</div>
              )}
            </div>
          )}

          {fields.map((f) => (
            <div key={f.key} className="cred-field">
              <label className="cred-field-label">{f.label}</label>
              <div className="cred-field-input-wrap">
                <input
                  type={shown[f.key] ? "text" : "password"}
                  value={values[f.key]}
                  placeholder={`Enter ${f.label}`}
                  onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  className="cred-input"
                />
                <button
                  className="cred-eye"
                  onClick={() => setShown((prev) => ({ ...prev, [f.key]: !prev[f.key] }))}
                  title={shown[f.key] ? "Hide" : "Show"}
                  type="button"
                >
                  {shown[f.key] ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              {hint.fieldHints?.[f.key] && (
                <span className="cred-field-hint">{hint.fieldHints[f.key]}</span>
              )}
            </div>
          ))}

          <div className="cred-actions">
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button className="btn btn-ghost" onClick={handleTest} disabled={testing}>
              {testing ? "Testing…" : "Test Connection"}
            </button>
          </div>

          {saveMsg && (
            <div className={`cred-result ${saveMsg.ok ? "ok" : "err"}`}>{saveMsg.text}</div>
          )}
          {testMsg && (
            <div className={`cred-result ${testMsg.ok ? "ok" : "err"}`}>{testMsg.text}</div>
          )}
        </div>
      )}
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
  const [loading, setLoading] = useState(true);
  const [statusError, setStatusError] = useState("");

  async function loadIntegrationState() {
    setLoading(true);
    setStatusError("");
    try {
      const statusData = await fetchConnectorStatus();
      setProviders(statusData.providers);
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
            <p className="section-desc">Live connector status. Enter credentials for each provider below.</p>
          </div>
          <button className="btn btn-ghost" onClick={loadIntegrationState}>
            <RefreshCw size={15} /> Refresh Status
          </button>
        </div>

        {statusError ? (
          <div className="settings-error">{statusError}</div>
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

        <div className="cred-panels">
          {ALL_PROVIDERS.map((provider) => (
            <ProviderPanel
              key={provider}
              provider={provider}
              status={providers[provider] || { configured: false, connected: false }}
              onStatusRefresh={loadIntegrationState}
            />
          ))}
        </div>
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
            <span className="info-val active">Native credential forms</span>
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
