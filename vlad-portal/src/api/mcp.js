import { apiFetch } from "./client";

export const MCP_PROVIDER_ORDER = ["outlook", "zoom"];

export const MCP_PROVIDER_LABELS = {
  outlook: "Outlook",
  teams: "Teams",
  zoom: "Zoom",
};

export const MCP_PROVIDER_ACCENTS = {
  outlook: "#06b6d4",
  teams: "#8b5cf6",
  zoom: "#6366f1",
};

function unwrapPayload(data, fallbackMessage) {
  if (Array.isArray(data)) return data;
  if (data?.ok === false) {
    throw new Error(data.message || fallbackMessage);
  }
  return data;
}

export function normalizeConnectorStatus(data) {
  const providers = Object.fromEntries(
    MCP_PROVIDER_ORDER.map((provider) => [
      provider,
      {
        provider,
        configured: false,
        connected: false,
        message: "",
        ...(data?.providers?.[provider] || {}),
      },
    ])
  );

  return {
    providers,
    embedUrl: data?.embed_url || "",
  };
}

export async function fetchConnectorStatus() {
  const data = await apiFetch("/mcp/connector/status/");
  return normalizeConnectorStatus(data);
}

export async function fetchConnectorEmbedUrl() {
  const data = await apiFetch("/mcp/connector/embed-url/");
  return data?.embed_url || "";
}

export async function fetchCredentials(service) {
  return apiFetch(`/mcp/connector/credentials/${service}/`);
}

export async function saveCredentials(service, fields) {
  return apiFetch(`/mcp/connector/credentials/${service}/`, {
    method: "POST",
    body: JSON.stringify(fields),
  });
}

export async function testConnection(service) {
  return apiFetch(`/mcp/connector/test/${service}/`, { method: "POST" });
}

function buildRangeQuery(start, end, days = null) {
  if (start && end) {
    return `start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
  }
  return `days=${days ?? 14}`;
}

export async function fetchOutlookEvents({ days = 14, start = null, end = null } = {}) {
  const data = unwrapPayload(
    await apiFetch(`/mcp/outlook/events/?${buildRangeQuery(start, end, days)}`),
    "Could not load Outlook events."
  );
  return Array.isArray(data) ? data : data.events || [];
}

export async function fetchTeamsMeetings({ start = null, end = null } = {}) {
  const data = unwrapPayload(
    await apiFetch(`/mcp/teams/meetings/${start && end ? `?${buildRangeQuery(start, end)}` : ""}`),
    "Could not load Teams meetings."
  );
  return Array.isArray(data) ? data : data.meetings || [];
}

export async function fetchZoomRecordings({ start = null, end = null } = {}) {
  const data = unwrapPayload(
    await apiFetch(`/mcp/zoom/recordings/${start && end ? `?${buildRangeQuery(start, end)}` : ""}`),
    "Could not load Zoom recordings."
  );
  return Array.isArray(data) ? data : data.meetings || [];
}

export async function fetchZoomMeetings({ start = null, end = null } = {}) {
  const qs = start && end ? `?${buildRangeQuery(start, end)}` : "";
  const data = unwrapPayload(
    await apiFetch(`/mcp/zoom/meetings/${qs}`),
    "Could not load Zoom meetings."
  );
  return Array.isArray(data) ? data : data.meetings || [];
}

export async function fetchTranscript(provider, meetingId) {
  const data = await apiFetch(`/mcp/${provider}/transcript/?meetingId=${encodeURIComponent(meetingId)}`);
  return data?.transcript || "";
}

export function getConnectedProviders(providerMap) {
  return MCP_PROVIDER_ORDER.filter((provider) => providerMap?.[provider]?.connected);
}

export function getDefaultProvider(providerMap, preferred = null) {
  const connected = getConnectedProviders(providerMap);
  if (preferred && connected.includes(preferred)) return preferred;
  return connected[0] || "outlook";
}

export function persistPreferredProvider(provider) {
  window.localStorage.setItem("solera.mcp.provider", provider);
}

export function loadPreferredProvider() {
  return window.localStorage.getItem("solera.mcp.provider");
}
