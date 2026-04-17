import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Info } from "lucide-react";
import { upcomingMeetings, weekStats } from "../data/mockData";

const MEETING_COLORS = {
  Discovery: "#6366f1",
  "LEAP Process": "#8b5cf6",
  Implementation: "#06b6d4",
  "Solera Heartbeat": "#10b981",
  CheckIn: "#f59e0b",
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function getCalendarDays(year, month) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  return cells;
}

function isMondayBlocked(day, month, year) {
  const d = new Date(year, month, day);
  return d.getDay() === 1; // Monday
}

function isEveryOtherFriday(day, month, year) {
  const d = new Date(year, month, day);
  if (d.getDay() !== 5) return false;
  // Using March 27, 2026 as a known "off Friday"
  const ref = new Date(2026, 2, 27);
  const diffWeeks = Math.round((d - ref) / (7 * 24 * 60 * 60 * 1000));
  return diffWeeks % 2 === 0;
}

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date(2026, 3, 1)); // April 2026
  const [selectedDay, setSelectedDay] = useState(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const cells = getCalendarDays(year, month);

  const meetingsThisMonth = upcomingMeetings.filter((m) => {
    const d = new Date(m.date);
    return d.getFullYear() === year && d.getMonth() === month;
  });

  function getMeetingsForDay(day) {
    return meetingsThisMonth.filter((m) => new Date(m.date).getDate() === day);
  }

  function prevMonth() {
    setCurrentDate(new Date(year, month - 1, 1));
    setSelectedDay(null);
  }
  function nextMonth() {
    setCurrentDate(new Date(year, month + 1, 1));
    setSelectedDay(null);
  }

  const selectedMeetings = selectedDay ? getMeetingsForDay(selectedDay) : [];
  const pct = Math.round((weekStats.meetings_scheduled / weekStats.capacity) * 100);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Calendar</h1>
          <p className="subtitle">
            Phase 1: Mock calendar — Outlook sync available in Phase 2
          </p>
        </div>
        <div className="capacity-summary">
          <span>{weekStats.meetings_scheduled} / {weekStats.capacity} meetings this week</span>
          <div className="capacity-bar mini">
            <div className="capacity-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      <div className="calendar-layout">
        <div className="calendar-main">
          <div className="cal-nav">
            <button className="icon-btn" onClick={prevMonth}><ChevronLeft size={18} /></button>
            <h2>{MONTHS[month]} {year}</h2>
            <button className="icon-btn" onClick={nextMonth}><ChevronRight size={18} /></button>
          </div>

          <div className="legend">
            {Object.entries(MEETING_COLORS).map(([type, color]) => (
              <div key={type} className="legend-item">
                <div className="legend-dot" style={{ background: color }} />
                <span>{type}</span>
              </div>
            ))}
          </div>

          <div className="cal-grid">
            {DAYS.map((d) => (
              <div key={d} className="cal-day-header">{d}</div>
            ))}
            {cells.map((day, i) => {
              if (!day) return <div key={`empty-${i}`} className="cal-cell empty" />;
              const dayMeetings = getMeetingsForDay(day);
              const isMonday = isMondayBlocked(day, month, year);
              const isFridayOff = isEveryOtherFriday(day, month, year);
              const isBlocked = isMonday || isFridayOff;
              const isSelected = selectedDay === day;

              return (
                <div
                  key={day}
                  className={`cal-cell ${isBlocked ? "blocked" : ""} ${isSelected ? "selected" : ""}`}
                  onClick={() => setSelectedDay(day === selectedDay ? null : day)}
                >
                  <div className="cal-day-num">
                    {day}
                    {isMonday && <span className="block-label">Internal</span>}
                    {isFridayOff && <span className="block-label">Off</span>}
                  </div>
                  <div className="cal-dots">
                    {dayMeetings.slice(0, 3).map((m) => (
                      <div
                        key={m.id}
                        className="cal-dot"
                        style={{ background: MEETING_COLORS[m.meeting_type] || "#94a3b8" }}
                        title={`${m.client_name} — ${m.meeting_type}`}
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
              {selectedMeetings.length === 0 ? (
                <p className="empty-state">No meetings on this day.</p>
              ) : (
                selectedMeetings.map((m) => (
                  <div key={m.id} className="cal-meeting-detail">
                    <div
                      className="meeting-type-bar"
                      style={{ background: MEETING_COLORS[m.meeting_type] }}
                    />
                    <div>
                      <Link to={`/clients/${m.client_id}`} className="meeting-client-link">
                        {m.client_name}
                      </Link>
                      <div className="meeting-meta">
                        {m.meeting_type}
                      </div>
                      <div className="meeting-meta">
                        {new Date(m.date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        {" · "}{m.duration_min} min · {m.location}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </>
          ) : (
            <div className="cal-hint">
              <Info size={16} />
              <span>Click a day to see meetings</span>
            </div>
          )}

          <div className="cal-rules">
            <h4>Schedule Rules</h4>
            <ul>
              <li>Monday — Internal team day (blocked)</li>
              <li>Every other Friday — Off</li>
              <li>Max 15 meetings / week</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
