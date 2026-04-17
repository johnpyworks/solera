import { useState } from "react";
import { Settings as SettingsIcon, Save } from "lucide-react";

const DEFAULT_TOGGLES = {
  email_summary: true,
  email_followup: true,
  reminder_48hr: true,
  reminder_24hr: true,
  wealthbox_task: true,
  form_draft: true,
  weekly_summary: true,
};

const TOGGLE_LABELS = {
  email_summary: { label: "Post-Meeting Summary Email", locked: false, description: "Internal advisor notes after each meeting" },
  email_followup: { label: "Client Follow-Up Email", locked: true, description: "Client-facing next steps email — always requires approval" },
  reminder_48hr: { label: "48-Hour Appointment Reminder", locked: false, description: "Email reminder sent 48hrs before each meeting" },
  reminder_24hr: { label: "24-Hour Reminder (call/text)", locked: false, description: "Call/text reminder via 3CX — 24hrs before meeting (Phase 2)" },
  wealthbox_task: { label: "Wealthbox Task Creation", locked: false, description: "Tasks created from LEAP notes queued for approval" },
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
          <p className="subtitle">Configure approvals, preferences, and system rules.</p>
        </div>
        <button className="btn btn-primary" onClick={save}>
          <Save size={15} /> {saved ? "Saved!" : "Save Changes"}
        </button>
      </div>

      {/* Approval Toggles */}
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

      {/* Preferences */}
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
              onChange={(e) => handlePref("meeting_cap", parseInt(e.target.value))}
            />
          </div>
        </div>
      </section>

      {/* Phase Info */}
      <section className="settings-section">
        <h2>System Info</h2>
        <div className="info-grid">
          <div className="info-item">
            <span className="info-label">Phase</span>
            <span className="info-val phase">Phase 1 — UI (Mock Data)</span>
          </div>
          <div className="info-item">
            <span className="info-label">AI Model</span>
            <span className="info-val">claude-sonnet-4-6</span>
          </div>
          <div className="info-item">
            <span className="info-label">Wealthbox</span>
            <span className="info-val mocked">Mocked (Phase 2: live API)</span>
          </div>
          <div className="info-item">
            <span className="info-label">Outlook Calendar</span>
            <span className="info-val mocked">Mocked (Phase 2: Microsoft Graph)</span>
          </div>
          <div className="info-item">
            <span className="info-label">3CX (calls/texts)</span>
            <span className="info-val mocked">Mocked (Phase 2: 3CX API)</span>
          </div>
          <div className="info-item">
            <span className="info-label">Voice Input</span>
            <span className="info-val active">Web Speech API (active)</span>
          </div>
        </div>
      </section>
    </div>
  );
}
