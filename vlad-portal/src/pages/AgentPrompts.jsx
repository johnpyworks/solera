import { useEffect, useState } from "react";
import MDEditor from "@uiw/react-md-editor";
import { ChevronRight, RotateCcw, Save } from "lucide-react";
import { apiFetch } from "../api/client";

const AGENT_ORDER = ["Scribe", "Service Agent", "Scheduler", "Chat"];

function groupByAgent(prompts) {
  const groups = {};
  for (const p of prompts) {
    if (!groups[p.agent_name]) groups[p.agent_name] = [];
    groups[p.agent_name].push(p);
  }
  return groups;
}

function VariableHints({ variables }) {
  if (!variables || variables.length === 0) return null;
  return (
    <div className="prompt-vars-hint">
      <span className="prompt-vars-label">Template variables:</span>
      {variables.map((v) => (
        <code key={v} className="prompt-var-chip">{`{${v}}`}</code>
      ))}
    </div>
  );
}

function PromptMeta({ prompt }) {
  if (!prompt.updated_by_name && !prompt.updated_at) return null;
  return (
    <div className="prompt-meta">
      {prompt.updated_by_name && <span>Last edited by {prompt.updated_by_name}</span>}
      {prompt.updated_at && (
        <span>
          {prompt.updated_by_name ? " · " : ""}
          {new Date(prompt.updated_at).toLocaleString([], {
            month: "short", day: "numeric", year: "numeric",
            hour: "2-digit", minute: "2-digit",
          })}
        </span>
      )}
    </div>
  );
}

export default function AgentPromptsPage() {
  const [prompts, setPrompts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);   // key string
  const [editorValue, setEditorValue] = useState("");
  const [savedValue, setSavedValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      try {
        const data = await apiFetch("/agent-logs/prompts/");
        const list = Array.isArray(data) ? data : (data.results || []);
        setPrompts(list);
        if (list.length > 0 && !selected) {
          selectPrompt(list[0]);
        }
      } catch (e) {
        setError(e.message || "Failed to load prompts.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function selectPrompt(p) {
    setSelected(p.key);
    setEditorValue(p.content);
    setSavedValue(p.content);
    setSaveMsg("");
  }

  function updateLocalPrompt(key, newContent) {
    setPrompts((prev) =>
      prev.map((p) => (p.key === key ? { ...p, content: newContent } : p))
    );
  }

  async function handleSave() {
    if (!selected || editorValue === savedValue) return;
    setSaving(true);
    setSaveMsg("");
    try {
      const updated = await apiFetch(`/agent-logs/prompts/${selected}/`, {
        method: "PATCH",
        body: JSON.stringify({ content: editorValue }),
      });
      setSavedValue(updated.content);
      setEditorValue(updated.content);
      updateLocalPrompt(selected, updated.content);
      setPrompts((prev) => prev.map((p) => (p.key === selected ? updated : p)));
      setSaveMsg("Saved");
      setTimeout(() => setSaveMsg(""), 2500);
    } catch (e) {
      setSaveMsg(`Error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (!selected) return;
    setResetting(true);
    setSaveMsg("");
    try {
      const updated = await apiFetch(`/agent-logs/prompts/${selected}/reset/`, {
        method: "POST",
      });
      setSavedValue(updated.content);
      setEditorValue(updated.content);
      updateLocalPrompt(selected, updated.content);
      setPrompts((prev) => prev.map((p) => (p.key === selected ? updated : p)));
      setSaveMsg("Reset to default");
      setTimeout(() => setSaveMsg(""), 2500);
    } catch (e) {
      setSaveMsg(`Error: ${e.message}`);
    } finally {
      setResetting(false);
    }
  }

  const groups = groupByAgent(prompts);
  const currentPrompt = prompts.find((p) => p.key === selected);
  const isDirty = editorValue !== savedValue;

  if (loading) return <div className="page"><div className="empty-state-full">Loading prompts…</div></div>;
  if (error) return <div className="page"><div className="settings-error">{error}</div></div>;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Agent Prompts</h1>
          <p className="subtitle">
            Edit the AI prompts used by each agent. Changes take effect immediately — no deploy needed.
          </p>
        </div>
      </div>

      <div className="prompts-layout">
        {/* ── Left sidebar: prompt list ── */}
        <div className="prompts-sidebar">
          {AGENT_ORDER.filter((a) => groups[a]).map((agentName) => (
            <div key={agentName} className="prompts-group">
              <div className="prompts-group-label">{agentName}</div>
              {groups[agentName].map((p) => (
                <button
                  key={p.key}
                  className={`prompts-item ${selected === p.key ? "active" : ""}`}
                  onClick={() => selectPrompt(p)}
                >
                  <span className="prompts-item-name">{p.name.replace(`${agentName} — `, "")}</span>
                  {p.is_template && <span className="prompts-item-badge">T</span>}
                  {selected === p.key && <ChevronRight size={13} className="prompts-item-arrow" />}
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* ── Right panel: editor ── */}
        <div className="prompts-editor-panel">
          {currentPrompt ? (
            <>
              <div className="prompts-editor-header">
                <div>
                  <div className="prompts-editor-title">{currentPrompt.name}</div>
                  {currentPrompt.description && (
                    <div className="prompts-editor-desc">{currentPrompt.description}</div>
                  )}
                </div>
              </div>

              {currentPrompt.is_template && (
                <VariableHints variables={currentPrompt.variables} />
              )}

              <div data-color-mode="dark" className="prompts-md-wrap">
                <MDEditor
                  value={editorValue}
                  onChange={(val) => setEditorValue(val || "")}
                  height={420}
                  preview="edit"
                  visibleDragbar={false}
                />
              </div>

              <PromptMeta prompt={currentPrompt} />

              <div className="prompts-actions">
                <button
                  className="btn btn-ghost"
                  onClick={handleReset}
                  disabled={resetting || saving}
                  title="Revert to the original hardcoded default"
                >
                  <RotateCcw size={14} />
                  {resetting ? "Resetting…" : "Reset to Default"}
                </button>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {saveMsg && (
                    <span
                      className={saveMsg.startsWith("Error") ? "settings-error" : "settings-muted"}
                      style={{ fontSize: "0.85rem" }}
                    >
                      {saveMsg}
                    </span>
                  )}
                  <button
                    className="btn btn-primary"
                    onClick={handleSave}
                    disabled={!isDirty || saving || resetting}
                  >
                    <Save size={14} />
                    {saving ? "Saving…" : "Save Changes"}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="empty-state-full">Select a prompt from the list.</div>
          )}
        </div>
      </div>
    </div>
  );
}
