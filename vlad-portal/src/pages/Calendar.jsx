import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, Info, X } from "lucide-react";
import {
  fetchConnectorStatus,
  fetchOutlookEvents,
  fetchTranscript,
  fetchZoomMeetings,
  getConnectedProviders,
  getDefaultProvider,
  loadPreferredProvider,
  MCP_PROVIDER_LABELS,
  persistPreferredProvider,
} from "../api/mcp";

const CALENDAR_PROVIDERS = ["outlook", "zoom"];
import { apiFetch } from "../api/client";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function getCalendarDays(year, month) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(day);
  return cells;
}

function getMonthRange(date) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

function getDayTone(year, month, day) {
  const cellDate = new Date(year, month, day);
  const today = new Date();
  const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (cellDate.getTime() === todayOnly.getTime()) return "today";
  if (cellDate.getTime() < todayOnly.getTime()) return "past";
  return "future";
}

function formatDateTime(value) {
  if (!value) return "Unknown time";
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function safeStr(v) {
  if (!v) return "";
  if (typeof v === "object") return v.displayName || v.emailAddress?.name || "";
  return String(v);
}

function normalizeCalendarItems(provider, items) {
  return items.map((item) => {
    if (provider === "portal") {
      return {
        id: `portal-${item.id}`,
        provider: "portal",
        title: item.meeting_type && item.client_name
          ? `${item.meeting_type} — ${item.client_name}`
          : item.client_name || "Meeting",
        start: item.scheduled_at,
        end: null,
        location: item.location || "",
        organizer: "",
        isOnlineMeeting: Boolean(item.zoom_meeting_id || item.teams_meeting_id),
        canOpenTranscript: false,
        transcriptId: null,
        meta: item.duration_min ? `Duration: ${item.duration_min} min` : "Portal meeting",
      };
    }

    if (provider === "outlook") {
      const startStr = item.start?.dateTime || item.start || "";
      const endStr = item.end?.dateTime || item.end || null;
      const locationStr = safeStr(item.location);
      const organizerStr = item.organizer?.emailAddress?.name || safeStr(item.organizer);
      const online = Boolean(item.onlineMeeting || item.isOnlineMeeting);
      return {
        id: `${provider}-${item.subject || "event"}-${startStr}`,
        provider,
        title: item.subject || "Untitled",
        start: startStr,
        end: endStr,
        location: locationStr,
        organizer: organizerStr,
        isOnlineMeeting: online,
        canOpenTranscript: false,
        transcriptId: null,
        meta: online ? "Online meeting" : "Calendar event",
      };
    }

    if (provider === "teams") {
      return {
        id: `${provider}-${item.meetingId || item.start_time || item.topic || "meeting"}`,
        provider,
        title: item.topic || "Untitled Meeting",
        start: item.start_time,
        end: null,
        location: "Microsoft Teams",
        organizer: "",
        isOnlineMeeting: true,
        canOpenTranscript: Boolean(item.meetingId),
        transcriptId: item.meetingId || null,
        meta: `Transcripts found: ${item.transcriptCount || 0}`,
      };
    }

    // Zoom meeting (upcoming with join_url, or past with transcript)
    return {
      id: `zoom-${item.id || item.start_time || item.topic}`,
      provider: "zoom",
      title: item.topic || "Zoom Meeting",
      start: item.start_time,
      end: null,
      location: item.join_url ? `Join: ${item.join_url}` : "Zoom",
      organizer: "",
      isOnlineMeeting: true,
      canOpenTranscript: Boolean(item.hasTranscript && item.lookupId),
      transcriptId: item.lookupId || null,
      joinUrl: item.join_url || null,
      meta: item.duration ? `${item.duration} min` : "Meeting",
    };
  });
}

function TranscriptModal({ state, onClose }) {
  if (!state.open) return null;

  return (
    <div className="transcript-modal-overlay" onClick={onClose}>
      <div className="transcript-modal" onClick={(event) => event.stopPropagation()}>
        <div className="transcript-modal-header">
          <div>
            <h3>{state.title}</h3>
            <p className="subtitle">{state.provider ? `${MCP_PROVIDER_LABELS[state.provider]} transcript` : "Transcript"}</p>
          </div>
          <button className="icon-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        {state.loading ? (
          <div className="settings-muted">Loading transcript...</div>
        ) : state.error ? (
          <div className="settings-error">{state.error}</div>
        ) : (
          <pre className="transcript-body">{state.content || "No transcript returned."}</pre>
        )}
      </div>
    </div>
  );
}

function ProviderSelector({ providers, selected, onSelect }) {
  return (
    <div className="filter-tabs">
      <button
        className={`filter-tab ${selected === "all" ? "active" : ""}`}
        onClick={() => onSelect("all")}
        title="All sources combined"
      >
        All
        <span className="tab-count">↗</span>
      </button>
      <button
        className={`filter-tab ${selected === "portal" ? "active" : ""}`}
        onClick={() => onSelect("portal")}
        title="Approved meetings from the portal (always available)"
      >
        Portal
        <span className="tab-count">DB</span>
      </button>
      {CALENDAR_PROVIDERS.map((p) => {
        const connected = providers[p]?.connected;
        const pLabel = MCP_PROVIDER_LABELS[p];
        return (
          <button
            key={p}
            className={`filter-tab ${selected === p ? "active" : ""}`}
            disabled={!connected}
            onClick={() => connected && onSelect(p)}
            title={connected ? `View ${pLabel}` : `${pLabel} not connected`}
          >
            {pLabel}
            <span className="tab-count">{connected ? "Live" : "Off"}</span>
          </button>
        );
      })}
    </div>
  );
}

function ProviderCalendar({ provider, label, items, currentDate, onMonthChange, onOpenTranscript, activeTab }) {
  const [selectedDay, setSelectedDay] = useState(null);
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const cells = useMemo(() => getCalendarDays(year, month), [month, year]);
  const meetingsThisMonth = items.filter((event) => {
    const date = new Date(event.start);
    return date.getFullYear() === year && date.getMonth() === month;
  });

  function getEventsForDay(day) {
    return meetingsThisMonth.filter((event) => new Date(event.start).getDate() === day);
  }

  const selectedEvents = selectedDay ? getEventsForDay(selectedDay) : [];

  return (
    <div className="calendar-layout">
      <div className="calendar-main">
        <div className="cal-nav">
          <button className="icon-btn" onClick={() => onMonthChange(new Date(year, month - 1, 1))}>
            <ChevronLeft size={18} />
          </button>
          <h2>{MONTHS[month]} {year}</h2>
          <button className="icon-btn" onClick={() => onMonthChange(new Date(year, month + 1, 1))}>
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="legend">
          {provider === "all" ? (
            <>
              <div className="legend-item"><div className="legend-dot" style={{ background: "#10b981" }} /><span>Portal</span></div>
              <div className="legend-item"><div className="legend-dot" style={{ background: "#06b6d4" }} /><span>Outlook</span></div>
              <div className="legend-item"><div className="legend-dot" style={{ background: "#6366f1" }} /><span>Zoom</span></div>
            </>
          ) : (
            <>
              <div className="legend-item"><div className="legend-dot" style={{ background: "#06b6d4" }} /><span>{label} item</span></div>
              <div className="legend-item"><div className="legend-dot" style={{ background: "#8b5cf6" }} /><span>Online meeting</span></div>
            </>
          )}
        </div>

        <div className="cal-grid">
          {DAYS.map((day) => (
            <div key={day} className="cal-day-header">{day}</div>
          ))}
          {cells.map((day, index) => {
            if (!day) return <div key={`empty-${index}`} className="cal-cell empty" />;
            const dayEvents = getEventsForDay(day);
            const tone = getDayTone(year, month, day);
            return (
              <div
                key={day}
                className={`cal-cell cal-cell-${tone} ${selectedDay === day ? "selected" : ""}`}
                onClick={() => setSelectedDay(day === selectedDay ? null : day)}
              >
                <div className={`cal-day-num cal-day-num-${tone}`}>{day}</div>
                <div className="cal-dots">
                  {dayEvents.slice(0, 4).map((event) => (
                    <div
                      key={`${event.title}-${event.start}`}
                      className="cal-dot"
                      style={{
                        background: provider === "all"
                          ? (event.provider === "portal" ? "#10b981" : event.provider === "outlook" ? "#06b6d4" : "#6366f1")
                          : (event.isOnlineMeeting ? "#8b5cf6" : "#06b6d4"),
                      }}
                      title={`${event.title}${provider === "all" ? ` (${event.provider})` : ""}`}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="cal-sidebar">
        {selectedDay ? (
          <>
            <h3>{MONTHS[month]} {selectedDay}</h3>
            {selectedEvents.length === 0 ? (
              <p className="empty-state">No events on this day.</p>
            ) : (
              selectedEvents.map((event) => (
                <div key={event.id} className="cal-meeting-detail">
                  <div
                    className="meeting-type-bar"
                    style={{ background: event.isOnlineMeeting ? "#8b5cf6" : "#06b6d4" }}
                  />
                  <div>
                    <div className="meeting-client">{event.title}</div>
                    <div className="meeting-meta">{formatDateTime(event.start)}</div>
                    <div className="meeting-meta">{event.location || "No location"}</div>
                    {event.organizer && <div className="meeting-meta">Organizer: {event.organizer}</div>}
                    {event.meta && <div className="meeting-meta">{event.meta}</div>}
                    {event.canOpenTranscript && (
                      <div style={{ marginTop: 8 }}>
                        <button
                          className="btn btn-ghost"
                          onClick={() => onOpenTranscript(provider, event.transcriptId, event.title)}
                        >
                          View Transcript
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </>
        ) : (
          <div className="cal-hint">
            <Info size={16} />
            <span>Click a day to inspect {label} items</span>
          </div>
        )}

        <div className="cal-rules">
          <h4>{label} Feed</h4>
          <ul>
            <li>Shows upcoming items on a month calendar</li>
            <li>Online items are marked separately</li>
            <li>Use Settings to reconnect this provider if the calendar is empty</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default function CalendarPage() {
  const [providers, setProviders] = useState({});
  const [provider, setProvider] = useState("all");
  const [portalMeetings, setPortalMeetings] = useState([]);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState("");
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState("");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [outlookEvents, setOutlookEvents] = useState([]);
  const [zoomMeetings, setZoomMeetings] = useState([]);
  const [transcriptState, setTranscriptState] = useState({
    open: false,
    loading: false,
    title: "",
    provider: "",
    content: "",
    error: "",
  });

  useEffect(() => {
    async function loadStatus() {
      setStatusLoading(true);
      setStatusError("");
      try {
        const status = await fetchConnectorStatus();
        setProviders(status.providers);
        const preferred = loadPreferredProvider();
        if (preferred && preferred !== "portal" && CALENDAR_PROVIDERS.includes(preferred)) {
          const nextProvider = getDefaultProvider(status.providers, preferred);
          if (nextProvider && CALENDAR_PROVIDERS.includes(nextProvider) && status.providers[nextProvider]?.connected) {
            setProvider(nextProvider);
          }
        }
      } catch (error) {
        setStatusError(error.message);
      } finally {
        setStatusLoading(false);
      }
    }

    loadStatus();
  }, []);

  useEffect(() => {
    async function loadProviderData() {
      setDataLoading(true);
      setDataError("");
      try {
        const { start, end } = getMonthRange(currentDate);

        if (provider === "all") {
          const [portalRes, outlookRes, zoomRes] = await Promise.allSettled([
            apiFetch(`/meetings/?start=${start}&end=${end}`),
            providers["outlook"]?.connected ? fetchOutlookEvents({ start, end }) : Promise.resolve([]),
            providers["zoom"]?.connected ? fetchZoomMeetings({ start, end }) : Promise.resolve([]),
          ]);
          setPortalMeetings(portalRes.status === "fulfilled" ? (portalRes.value?.results || portalRes.value || []) : []);
          setOutlookEvents(outlookRes.status === "fulfilled" ? (outlookRes.value || []) : []);
          setZoomMeetings(zoomRes.status === "fulfilled" ? (zoomRes.value || []) : []);
        } else if (provider === "portal") {
          const data = await apiFetch(`/meetings/?start=${start}&end=${end}`);
          setPortalMeetings(data.results || data);
        } else if (provider === "outlook" && providers["outlook"]?.connected) {
          setOutlookEvents(await fetchOutlookEvents({ start, end }));
          persistPreferredProvider(provider);
        } else if (provider === "zoom" && providers["zoom"]?.connected) {
          const [zoomRes, portalRes] = await Promise.allSettled([
            fetchZoomMeetings({ start, end }),
            apiFetch(`/meetings/?start=${start}&end=${end}`),
          ]);
          const recordings = zoomRes.status === "fulfilled" ? zoomRes.value : [];
          const recordingIds = new Set(recordings.map(r => String(r.id)));
          const portalZoom = (
            portalRes.status === "fulfilled"
              ? (portalRes.value?.results || portalRes.value || [])
              : []
          )
            .filter(m => m.zoom_meeting_id && !recordingIds.has(String(m.zoom_meeting_id)))
            .map(m => ({
              id: m.zoom_meeting_id,
              topic: `${m.meeting_type} — ${m.client_name}`,
              start_time: m.scheduled_at,
              duration: m.duration_min,
              join_url: null,
              timezone: null,
              hasTranscript: false,
              lookupId: null,
            }));
          setZoomMeetings([...recordings, ...portalZoom]);
          persistPreferredProvider(provider);
        }
      } catch (error) {
        setDataError(error.message);
      } finally {
        setDataLoading(false);
      }
    }

    loadProviderData();
  }, [provider, providers, currentDate]);

  const connectedProviders = getConnectedProviders(providers);
  const currentItems = provider === "all"
    ? [
        ...normalizeCalendarItems("portal", portalMeetings),
        ...normalizeCalendarItems("outlook", outlookEvents),
        ...normalizeCalendarItems("zoom", zoomMeetings),
      ]
    : provider === "portal"
      ? normalizeCalendarItems("portal", portalMeetings)
      : provider === "outlook"
        ? normalizeCalendarItems("outlook", outlookEvents)
        : normalizeCalendarItems("zoom", zoomMeetings);
  const currentLabel = provider === "all" ? "All Sources" : provider === "portal" ? "Portal" : (MCP_PROVIDER_LABELS[provider] || provider);

  async function openTranscript(nextProvider, meetingId, title) {
    setTranscriptState({
      open: true,
      loading: true,
      title,
      provider: nextProvider,
      content: "",
      error: "",
    });
    try {
      const content = await fetchTranscript(nextProvider, meetingId);
      setTranscriptState({
        open: true,
        loading: false,
        title,
        provider: nextProvider,
        content,
        error: "",
      });
    } catch (error) {
      setTranscriptState({
        open: true,
        loading: false,
        title,
        provider: nextProvider,
        content: "",
        error: error.message,
      });
    }
  }

  function closeTranscript() {
    setTranscriptState({
      open: false,
      loading: false,
      title: "",
      provider: "",
      content: "",
      error: "",
    });
  }

  let content;
  const needsMcp = provider !== "portal" && provider !== "all";
  if (needsMcp && statusLoading) {
    content = <div className="empty-state-full">Loading MCP providers...</div>;
  } else if (needsMcp && statusError) {
    content = <div className="settings-error">{statusError}</div>;
  } else if (needsMcp && !connectedProviders.includes(provider)) {
    content = (
      <div className="empty-state-full">
        {MCP_PROVIDER_LABELS[provider] || provider} is not connected. Open Settings to connect it.
      </div>
    );
  } else if (dataLoading) {
    content = <div className="empty-state-full">Loading {currentLabel} data...</div>;
  } else if (dataError) {
    content = <div className="settings-error">{dataError}</div>;
  } else {
    content = (
      <ProviderCalendar
        provider={provider}
        label={currentLabel}
        items={currentItems}
        currentDate={currentDate}
        onMonthChange={setCurrentDate}
        onOpenTranscript={openTranscript}
        activeTab={provider}
      />
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Calendar</h1>
          <p className="subtitle">
            All tab merges Portal + Outlook + Zoom. Individual tabs show each source separately.
          </p>
        </div>
        <div className="page-header-actions">
          <a className="btn btn-ghost" href="/settings">
            <ExternalLink size={15} /> Manage Connections
          </a>
        </div>
      </div>

      <ProviderSelector providers={providers} selected={provider} onSelect={setProvider} />

      <div className="calendar-source-note">
        {connectedProviders.length
          ? `Connected: Portal · ${connectedProviders.map((p) => MCP_PROVIDER_LABELS[p]).join(" · ")}`
          : "Portal (always available) · No live MCP sources connected."}
      </div>

      {content}

      <TranscriptModal state={transcriptState} onClose={closeTranscript} />
    </div>
  );
}
