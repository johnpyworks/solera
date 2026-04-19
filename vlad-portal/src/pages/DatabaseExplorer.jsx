import { useState, useEffect, useCallback } from "react";
import { ChevronRight, ChevronDown, Play, Database } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../api/client";

// ── Table Browser (left panel) ────────────────────────────────

function TableBrowser({ tables, loading, onSelectTable }) {
  const [expanded, setExpanded] = useState({});

  function toggle(name) {
    setExpanded((prev) => ({ ...prev, [name]: !prev[name] }));
  }

  if (loading) return <div className="db-browser-loading">Loading tables…</div>;

  return (
    <div className="db-table-browser">
      <div className="db-browser-header">Tables ({tables.length})</div>
      {tables.map((t) => (
        <div key={t.name} className="db-table-item">
          <div
            className="db-table-name"
            onClick={() => toggle(t.name)}
          >
            {expanded[t.name] ? (
              <ChevronDown size={13} />
            ) : (
              <ChevronRight size={13} />
            )}
            <span
              className="db-table-label"
              onClick={(e) => {
                e.stopPropagation();
                onSelectTable(t.name);
              }}
              title={`SELECT * FROM ${t.name} LIMIT 50`}
            >
              {t.name}
            </span>
          </div>
          {expanded[t.name] && (
            <div className="db-column-list">
              {t.columns.map((col) => (
                <div key={col.name} className="db-column-row">
                  <span className="db-col-name">{col.name}</span>
                  <span className="db-col-type">{col.type ?? "—"}</span>
                  {col.null && <span className="db-col-null">NULL</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Results Panel (right panel bottom) ───────────────────────

function ResultsPanel({ result }) {
  if (!result) {
    return (
      <div className="db-results-empty">
        Run a query to see results.
      </div>
    );
  }

  if (result.error) {
    return <div className="db-error">{result.error}</div>;
  }

  const { columns, rows, row_count, execution_time_ms, message } = result;

  return (
    <div className="db-results-wrap">
      <div className="db-meta">
        {message
          ? message
          : `${row_count} row${row_count !== 1 ? "s" : ""} · ${execution_time_ms} ms`}
        {row_count === 500 && (
          <span className="db-meta-cap"> (capped at 500 rows)</span>
        )}
      </div>
      {columns.length > 0 && (
        <div className="db-results-scroll">
          <table className="db-results-table">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j}>
                      {cell === null ? (
                        <span className="db-null">NULL</span>
                      ) : (
                        String(cell)
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────

export default function DatabaseExplorer() {
  const { user } = useAuth();

  const [tables, setTables] = useState([]);
  const [tablesLoading, setTablesLoading] = useState(true);
  const [sql, setSql] = useState("SELECT * FROM clients_client LIMIT 50;");
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);

  // Super admin gate
  if (!user || user.role !== "super_admin") {
    return (
      <div className="db-forbidden">
        <Database size={40} />
        <h2>403 — Super admin access only.</h2>
        <p>This tool is restricted to the super_admin role.</p>
      </div>
    );
  }

  // Load table list on mount
  useEffect(() => {
    apiFetch("/db/tables/")
      .then((data) => setTables(data))
      .catch((err) => console.error("Table list error:", err))
      .finally(() => setTablesLoading(false));
  }, []);

  function handleSelectTable(tableName) {
    setSql(`SELECT * FROM ${tableName} LIMIT 50;`);
  }

  const runQuery = useCallback(async () => {
    if (!sql.trim() || running) return;
    setRunning(true);
    setResult(null);
    try {
      const data = await apiFetch("/db/execute/", {
        method: "POST",
        body: JSON.stringify({ sql }),
      });
      setResult(data);
    } catch (err) {
      setResult({ error: err.message || "Request failed." });
    } finally {
      setRunning(false);
    }
  }, [sql, running]);

  function handleKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      runQuery();
    }
  }

  return (
    <div className="db-explorer">
      {/* Left — Table Browser */}
      <TableBrowser
        tables={tables}
        loading={tablesLoading}
        onSelectTable={handleSelectTable}
      />

      {/* Right — Query + Results */}
      <div className="db-query-panel">
        <div className="db-editor-wrap">
          <textarea
            className="db-editor"
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            placeholder="Enter SQL query…"
            rows={10}
          />
          <div className="db-editor-bar">
            <span className="db-shortcut">Ctrl + Enter to run</span>
            <button
              className="btn-primary db-run-btn"
              onClick={runQuery}
              disabled={running}
            >
              <Play size={14} />
              {running ? "Running…" : "Run Query"}
            </button>
          </div>
        </div>

        <ResultsPanel result={result} />
      </div>
    </div>
  );
}
