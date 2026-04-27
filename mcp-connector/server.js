const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const CREDENTIALS_DIR = path.join(os.homedir(), '.mcp-connector');
const CREDENTIALS_FILE = path.join(CREDENTIALS_DIR, 'credentials.json');
const PORT = process.env.PORT || 4000;
const ZOOM_REDIRECT_URI = `http://localhost:${PORT}/auth/zoom/callback`;
const ZOOM_SCOPES = 'meeting:write:meeting calendar:write:event calendar:delete:event meeting:read:meeting_audio meeting:read:meeting_transcript cloud_recording:read:meeting_transcript cloud_recording:read:list_user_recordings cloud_recording:read:list_recording_files user:read:user';

const TEAMS_REDIRECT_URI = `http://localhost:${PORT}/auth/teams/callback`;
const TEAMS_SCOPES = 'https://graph.microsoft.com/.default offline_access';

const OUTLOOK_REDIRECT_URI = `http://localhost:${PORT}/auth/outlook/callback`;
const OUTLOOK_SCOPES = 'Calendars.ReadWrite Mail.Send User.Read offline_access';

const TELNYX_API_HOST = 'api.telnyx.com';

// ── Credential helpers ────────────────────────────────────────
function ensureCredentialsDir() {
  if (!fs.existsSync(CREDENTIALS_DIR)) fs.mkdirSync(CREDENTIALS_DIR, { recursive: true });
}

function loadCredentials() {
  ensureCredentialsDir();
  if (!fs.existsSync(CREDENTIALS_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf8')); } catch { return {}; }
}

function saveCredentials(data) {
  ensureCredentialsDir();
  fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
}

function maskValue(val) {
  if (!val || val.length <= 4) return '****';
  return '****' + val.slice(-4);
}

// ── In-memory OAuth state store (CSRF protection) ─────────────
const oauthStates = new Map(); // state -> { expires, clientId, clientSecret }

// ── Static file server ────────────────────────────────────────
const MIME = {
  '.html': 'text/html',
  '.css':  'text/css',
  '.js':   'text/javascript',
  '.json': 'application/json',
  '.ico':  'image/x-icon',
};

function serveStatic(req, res, pathname) {
  const filePath = path.join(__dirname, 'public', pathname === '/' ? 'index.html' : pathname);
  const ext = path.extname(filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(data);
  });
}

// ── Request body reader ───────────────────────────────────────
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

// ── JSON response helper ──────────────────────────────────────
function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

// ── HTTPS POST helper ─────────────────────────────────────────
function httpsPost(hostname, path, headers, postData) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname, path, method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(postData) },
    };
    const req = https.request(options, (r) => {
      let body = '';
      r.on('data', c => { body += c; });
      r.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve(body); } });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// ── Graph API POST helper (returns {status, body}) ────────────
function graphPost(path, token, bodyObj) {
  const postData = JSON.stringify(bodyObj);
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'graph.microsoft.com', path, method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    }, (r) => {
      let body = '';
      r.on('data', c => { body += c; });
      r.on('end', () => resolve({ status: r.statusCode, body }));
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// ── Zoom: Server-to-Server test ───────────────────────────────
function testZoomS2S(res) {
  const creds = loadCredentials()['zoom'] || {};
  const { ZOOM_API_KEY, ZOOM_API_SECRET, ZOOM_ACCOUNT_ID } = creds;

  if (!ZOOM_API_KEY || !ZOOM_API_SECRET || !ZOOM_ACCOUNT_ID) {
    return json(res, 200, { ok: false, message: 'Missing credentials. Please save all three fields first.' });
  }

  const encoded = Buffer.from(`${ZOOM_API_KEY}:${ZOOM_API_SECRET}`).toString('base64');
  const postData = `grant_type=account_credentials&account_id=${encodeURIComponent(ZOOM_ACCOUNT_ID)}`;

  httpsPost('zoom.us', '/oauth/token',
    { 'Authorization': `Basic ${encoded}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    postData
  ).then(parsed => {
    if (parsed.access_token) {
      json(res, 200, { ok: true, message: 'Connection successful — Zoom token obtained.' });
    } else {
      const reason = parsed.reason || parsed.error_description || parsed.error || 'Unknown error';
      json(res, 200, { ok: false, message: `Zoom auth failed: ${reason}` });
    }
  }).catch(err => json(res, 200, { ok: false, message: `Network error: ${err.message}` }));
}

// ── Zoom: General App — initiate OAuth flow ───────────────────
function initiateZoomOAuth(res) {
  const creds = loadCredentials()['zoom'] || {};
  const { ZOOM_API_KEY, ZOOM_API_SECRET } = creds;

  if (!ZOOM_API_KEY || !ZOOM_API_SECRET) {
    return json(res, 200, { ok: false, message: 'Save your Client ID and Client Secret first.' });
  }

  // Clean up expired states
  const now = Date.now();
  for (const [k, v] of oauthStates) { if (v.expires < now) oauthStates.delete(k); }

  const state = crypto.randomBytes(16).toString('hex');
  oauthStates.set(state, { expires: now + 10 * 60 * 1000, clientId: ZOOM_API_KEY, clientSecret: ZOOM_API_SECRET });

  const authUrl = `https://zoom.us/oauth/authorize?response_type=code` +
    `&client_id=${encodeURIComponent(ZOOM_API_KEY)}` +
    `&redirect_uri=${encodeURIComponent(ZOOM_REDIRECT_URI)}` +
    `&scope=${encodeURIComponent(ZOOM_SCOPES)}` +
    `&state=${state}` +
    `&prompt=consent`;

  json(res, 200, { ok: true, authUrl });
}

// ── Zoom: General App — OAuth callback ───────────────────────
async function handleZoomCallback(req, res) {
  const parsed = new URL(req.url, `http://localhost:${PORT}`);
  const code  = parsed.searchParams.get('code');
  const state = parsed.searchParams.get('state');
  const error = parsed.searchParams.get('error');

  const htmlPage = (title, body, isError = false) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<!DOCTYPE html><html><head><title>${title}</title>
    <style>
      body { font-family: -apple-system, sans-serif; background: #0f1117; color: #e2e8f0;
             display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
      .box { background: #1a1d27; border: 1px solid #2e3250; border-radius: 12px;
             padding: 2rem 2.5rem; max-width: 420px; text-align: center; }
      h2 { margin: 0 0 0.75rem; color: ${isError ? '#ef4444' : '#22c55e'}; }
      p { color: #94a3b8; margin: 0 0 1.5rem; }
      a { display: inline-block; background: #4f6ef7; color: #fff; padding: 0.55rem 1.2rem;
          border-radius: 8px; text-decoration: none; font-size: 0.9rem; }
    </style></head><body><div class="box">${body}</div></body></html>`);
  };

  if (error) {
    return htmlPage('Access Denied',
      `<h2>Access Denied</h2><p>Zoom returned: <strong>${error}</strong></p><a href="/">Back to Dashboard</a>`,
      true);
  }

  if (!state || !oauthStates.has(state)) {
    return htmlPage('Invalid State',
      `<h2>Invalid or Expired Link</h2><p>The authorization link has expired. Please try connecting again.</p><a href="/">Back to Dashboard</a>`,
      true);
  }

  const { clientId, clientSecret } = oauthStates.get(state);
  oauthStates.delete(state);

  const encoded = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const postData = `grant_type=authorization_code&code=${encodeURIComponent(code)}&redirect_uri=${encodeURIComponent(ZOOM_REDIRECT_URI)}`;

  try {
    const tokenData = await httpsPost('zoom.us', '/oauth/token',
      { 'Authorization': `Basic ${encoded}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      postData
    );

    if (!tokenData.access_token) {
      const reason = tokenData.reason || tokenData.error_description || tokenData.error || 'Unknown error';
      return htmlPage('Auth Failed',
        `<h2>Authentication Failed</h2><p>${reason}</p><a href="/">Back to Dashboard</a>`,
        true);
    }

    // Persist tokens alongside existing zoom credentials
    const all = loadCredentials();
    all['zoom'] = {
      ...all['zoom'],
      ZOOM_OAUTH_TYPE: 'general',
      ZOOM_ACCESS_TOKEN: tokenData.access_token,
      ZOOM_REFRESH_TOKEN: tokenData.refresh_token || '',
      ZOOM_TOKEN_EXPIRY: String(Date.now() + (tokenData.expires_in || 3600) * 1000),
    };
    saveCredentials(all);

    return htmlPage('Connected!',
      `<h2>Connected!</h2><p>Zoom account linked successfully. You can close this tab.</p><a href="/">Back to Dashboard</a>`);
  } catch (err) {
    return htmlPage('Error',
      `<h2>Error</h2><p>${err.message}</p><a href="/">Back to Dashboard</a>`,
      true);
  }
}

// ── Zoom: General App — verify stored token ───────────────────
async function testZoomGeneral(res) {
  try {
    await getValidZoomToken(); // refreshes automatically if needed
    json(res, 200, { ok: true, message: 'Zoom token is valid and active. Click "Load Recordings" to fetch your recordings.' });
  } catch (e) {
    json(res, 200, { ok: false, message: 'No valid token. Click "Connect with Zoom" to authorize.' });
  }
}

// ── HTTPS GET helper ──────────────────────────────────────────
function httpsGet(hostname, path, headers) {
  return new Promise((resolve, reject) => {
    const options = { hostname, path, method: 'GET', headers };
    const req = https.request(options, (r) => {
      // Follow redirects (Zoom transcript downloads redirect)
      if (r.statusCode === 301 || r.statusCode === 302) {
        const loc = new URL(r.headers.location);
        return httpsGet(loc.hostname, loc.pathname + (loc.search || ''), headers)
          .then(resolve).catch(reject);
      }
      let body = '';
      r.on('data', c => { body += c; });
      r.on('end', () => resolve({ status: r.statusCode, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

// ── Zoom: auto-refresh access token using refresh token ───────
async function getValidZoomToken(force = false) {
  const all   = loadCredentials();
  const creds = all['zoom'] || {};
  const { ZOOM_ACCESS_TOKEN, ZOOM_REFRESH_TOKEN, ZOOM_TOKEN_EXPIRY, ZOOM_API_KEY, ZOOM_API_SECRET } = creds;

  if (!ZOOM_ACCESS_TOKEN) throw new Error('NOT_CONNECTED');

  const expired = force || !ZOOM_TOKEN_EXPIRY || Date.now() > Number(ZOOM_TOKEN_EXPIRY) - 60_000;
  if (!expired) return ZOOM_ACCESS_TOKEN;

  if (!ZOOM_REFRESH_TOKEN) throw new Error('TOKEN_EXPIRED_NO_REFRESH');
  if (!ZOOM_API_KEY || !ZOOM_API_SECRET) throw new Error('MISSING_CLIENT_CREDENTIALS');

  const encoded  = Buffer.from(`${ZOOM_API_KEY}:${ZOOM_API_SECRET}`).toString('base64');
  const postData = `grant_type=refresh_token&refresh_token=${encodeURIComponent(ZOOM_REFRESH_TOKEN)}`;

  console.log('[Zoom] Refreshing access token…');
  const tokenData = await httpsPost('zoom.us', '/oauth/token',
    { 'Authorization': `Basic ${encoded}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    postData
  );

  if (!tokenData.access_token) {
    console.log('[Zoom] Refresh failed:', JSON.stringify(tokenData));
    throw new Error(`REFRESH_FAILED: ${tokenData.reason || tokenData.error || JSON.stringify(tokenData)}`);
  }

  all['zoom'] = {
    ...creds,
    ZOOM_ACCESS_TOKEN:  tokenData.access_token,
    ZOOM_REFRESH_TOKEN: tokenData.refresh_token || ZOOM_REFRESH_TOKEN,
    ZOOM_TOKEN_EXPIRY:  String(Date.now() + (tokenData.expires_in || 3600) * 1000),
  };
  saveCredentials(all);
  console.log('[Zoom] Token refreshed successfully.');
  return tokenData.access_token;
}

function getDateRange(req, defaults = {}) {
  const reqUrl = new URL(req.url, `http://localhost:${PORT}`);
  const start = reqUrl.searchParams.get('start');
  const end = reqUrl.searchParams.get('end');
  const daysAhead = Number(reqUrl.searchParams.get('daysAhead') || defaults.daysAhead || 0);

  let from = start ? new Date(start) : new Date();
  let to = end ? new Date(end) : new Date(from);

  if (!start && !end && daysAhead > 0) {
    to.setDate(to.getDate() + daysAhead);
  }

  if (!start && defaults.pastDays) {
    from = new Date();
    from.setDate(from.getDate() - defaults.pastDays);
  }

  if (!end && defaults.futureDays) {
    to = new Date();
    to.setDate(to.getDate() + defaults.futureDays);
  }

  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) {
    throw new Error('Invalid date range.');
  }

  return { from, to };
}

// ── Zoom: create a test meeting ──────────────────────────────
async function testCreateZoomMeeting(req, res) {
  let token;
  try { token = await getValidZoomToken(); }
  catch (e) { return json(res, 200, { ok: false, message: `Zoom not connected: ${e.message}` }); }

  const body = await readBody(req);
  const topic = body.topic || 'MCP Connector Test Meeting';
  const startTime = new Date(Date.now() + 5 * 60 * 1000); // 5 min from now
  const payload = JSON.stringify({
    topic, type: 2,
    start_time: startTime.toISOString(),
    duration: 30,
    timezone: 'America/Los_Angeles',
  });

  try {
    const result = await new Promise((resolve, reject) => {
      const r = https.request({
        hostname: 'api.zoom.us', path: '/v2/users/me/meetings', method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json',
                   'Content-Length': Buffer.byteLength(payload) },
      }, (rr) => {
        let buf = '';
        rr.on('data', c => { buf += c; });
        rr.on('end', () => { try { resolve({ status: rr.statusCode, data: JSON.parse(buf) }); } catch { resolve({ status: rr.statusCode, data: buf }); } });
      });
      r.on('error', reject);
      r.write(payload);
      r.end();
    });
    if (result.data && result.data.join_url) {
      json(res, 200, { ok: true, meetingId: result.data.id, topic: result.data.topic,
        startTime: result.data.start_time, joinUrl: result.data.join_url,
        message: `Meeting created: "${result.data.topic}" — starts ${result.data.start_time}` });
    } else {
      json(res, 200, { ok: false,
        message: `Zoom error ${result.data.code || result.status}: ${result.data.message || JSON.stringify(result.data)}` });
    }
  } catch (err) {
    json(res, 200, { ok: false, message: `Request failed: ${err.message}` });
  }
}

// ── Zoom: delete a meeting by ID ─────────────────────────────
async function deleteZoomMeeting(req, res) {
  let token;
  try { token = await getValidZoomToken(); }
  catch (e) { return json(res, 200, { ok: false, message: 'Zoom not connected.' }); }

  const parsed = new URL(req.url, `http://localhost:${PORT}`);
  const meetingId = parsed.pathname.split('/').pop();
  try {
    const result = await new Promise((resolve, reject) => {
      const r = https.request({
        hostname: 'api.zoom.us', path: `/v2/meetings/${meetingId}`, method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      }, (rr) => {
        let buf = '';
        rr.on('data', c => { buf += c; });
        rr.on('end', () => resolve({ status: rr.statusCode, body: buf }));
      });
      r.on('error', reject);
      r.end();
    });
    if (result.status === 204) {
      json(res, 200, { ok: true, message: `Meeting ${meetingId} deleted.` });
    } else {
      const d = result.body ? JSON.parse(result.body) : {};
      json(res, 200, { ok: false, message: `Zoom error ${result.status}: ${d.message || result.body}` });
    }
  } catch (err) {
    json(res, 200, { ok: false, message: `Request failed: ${err.message}` });
  }
}

// ── Outlook: create a test calendar event ────────────────────
async function testCreateOutlookEvent(req, res) {
  let token;
  try { token = await getValidOutlookToken(); }
  catch (e) { return json(res, 200, { ok: false, message: `Outlook not connected: ${e.message}` }); }

  const body = await readBody(req);
  const subject = body.subject || 'MCP Connector Test Event';
  const attendeeEmail = body.attendeeEmail || null;

  const startTime = new Date(Date.now() + 5 * 60 * 1000);
  const endTime   = new Date(startTime.getTime() + 30 * 60 * 1000);

  const eventBody = {
    subject,
    start: { dateTime: startTime.toISOString(), timeZone: 'UTC' },
    end:   { dateTime: endTime.toISOString(),   timeZone: 'UTC' },
    body:  { contentType: 'HTML', content: '<p>Test event created by MCP Connector test suite.</p>' },
    attendees: attendeeEmail
      ? [{ emailAddress: { address: attendeeEmail, name: attendeeEmail }, type: 'required' }]
      : [],
  };

  try {
    const r = await graphPost('/v1.0/me/events', token, eventBody);
    const data = JSON.parse(r.body);
    if (data.error) {
      return json(res, 200, { ok: false, message: `Graph error: ${data.error.message} (code: ${data.error.code})` });
    }
    json(res, 200, {
      ok: true, eventId: data.id, subject: data.subject,
      startTime: data.start && data.start.dateTime, webLink: data.webLink,
      message: attendeeEmail
        ? `Event created — invite sent to ${attendeeEmail}`
        : `Event created (no attendees — add an email to test invite sending)`,
    });
  } catch (err) {
    json(res, 200, { ok: false, message: `Request failed: ${err.message}` });
  }
}

// ── Outlook: decode stored token and return granted scopes ───
function outlookTokenScopes(req, res) {
  const creds = loadCredentials()['outlook'] || {};
  const token = creds.OUTLOOK_ACCESS_TOKEN;
  if (!token) return json(res, 200, { ok: false, message: 'No Outlook token stored. Connect first.' });

  try {
    const parts = token.split('.');
    if (parts.length !== 3) return json(res, 200, { ok: false, message: 'Token is not a JWT — cannot decode.' });

    // base64url → base64 → JSON
    const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/').padEnd(
      parts[1].length + (4 - parts[1].length % 4) % 4, '='
    );
    const payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));

    const scopes = (payload.scp || payload.scope || '').split(' ').filter(Boolean).sort();
    const expiry = payload.exp ? new Date(payload.exp * 1000).toISOString() : '(unknown)';
    const audience = payload.aud || '(unknown)';

    return json(res, 200, {
      ok: true,
      scopes,
      expiry,
      audience,
      raw_scp: payload.scp || payload.scope || '(no scp claim)',
    });
  } catch (e) {
    return json(res, 200, { ok: false, message: `Decode failed: ${e.message}` });
  }
}

// ── Outlook: delete a calendar event ─────────────────────────
async function deleteOutlookEvent(req, res) {
  let token;
  try { token = await getValidOutlookToken(); }
  catch { return json(res, 200, { ok: false, message: 'Outlook not connected.' }); }

  const body = await readBody(req);
  const eventId = body.eventId;
  if (!eventId) return json(res, 400, { ok: false, message: 'eventId required.' });

  try {
    const result = await new Promise((resolve, reject) => {
      const r = https.request({
        hostname: 'graph.microsoft.com',
        path: `/v1.0/me/events/${encodeURIComponent(eventId)}`,
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      }, (rr) => {
        let buf = '';
        rr.on('data', c => { buf += c; });
        rr.on('end', () => resolve({ status: rr.statusCode, body: buf }));
      });
      r.on('error', reject);
      r.end();
    });
    if (result.status === 204) {
      json(res, 200, { ok: true, message: 'Event deleted from Outlook calendar.' });
    } else {
      const d = result.body ? JSON.parse(result.body) : {};
      json(res, 200, { ok: false, message: `Graph error ${result.status}: ${d.error?.message || result.body}` });
    }
  } catch (err) {
    json(res, 200, { ok: false, message: `Request failed: ${err.message}` });
  }
}

// ── Zoom: list cloud recordings ───────────────────────────────
async function listRecordings(req, res) {
  let token;
  try {
    token = await getValidZoomToken();
  } catch (e) {
    const msg = e.message.startsWith('NOT_CONNECTED')
      ? 'Not connected. Please connect with Zoom first.'
      : 'Session expired and could not be refreshed. Please reconnect with Zoom.';
    return json(res, 200, { ok: false, message: msg });
  }

  try {
    // Fetch up to 12 months back — Zoom API requires explicit from/to dates
    const { from, to } = getDateRange(req, {});
    const fmt  = d => d.toISOString().split('T')[0]; // YYYY-MM-DD

    const qs = new URLSearchParams({
      page_size: '100',
      from: fmt(from),
      to:   fmt(to),
    });

    const result = await httpsGet(
      'api.zoom.us',
      `/v2/users/me/recordings?${qs}`,
      { 'Authorization': `Bearer ${token}` }
    );

    console.log('[Zoom recordings] HTTP', result.status, result.body.slice(0, 300));

    let data = JSON.parse(result.body);

    // Scope error — refresh token won't help, need a fresh OAuth connect
    if (data.code === 4711 && data.message && data.message.includes('scopes')) {
      console.log('[Zoom] Scope mismatch — fresh OAuth needed:', data.message);
      return json(res, 200, {
        ok: false,
        reauth: true,
        message: 'Your token is missing required scopes. Click "Connect with Zoom" again to re-authorize with the updated scope list.',
      });
    }

    // Expired token — force a refresh and retry once
    if (data.code === 124 || data.code === 4711 || result.status === 401) {
      console.log('[Zoom] Token expired (code', data.code, '), forcing refresh…');
      try {
        token = await getValidZoomToken(true);
        const retry = await httpsGet('api.zoom.us', `/v2/users/me/recordings?${qs}`,
          { 'Authorization': `Bearer ${token}` });
        console.log('[Zoom recordings retry] HTTP', retry.status, retry.body.slice(0, 200));
        data = JSON.parse(retry.body);
      } catch (e) {
        return json(res, 200, { ok: false, message: 'Token could not be refreshed. Please reconnect with Zoom.' });
      }
    }

    if (data.code) {
      return json(res, 200, { ok: false, message: `Zoom error ${data.code}: ${data.message || JSON.stringify(data)}` });
    }

    const meetings = (data.meetings || []).map(m => {
      const files = m.recording_files || [];
      const transcriptFile = files.find(
        f => f.file_type === 'TRANSCRIPT' || f.file_extension === 'VTT' || f.file_type === 'CC'
      );
      return {
        uuid:          m.uuid,
        id:            m.id,
        topic:         m.topic,
        start_time:    m.start_time,
        duration:      m.duration,
        hasTranscript: !!transcriptFile,
        transcriptUrl: transcriptFile ? transcriptFile.download_url : null,
        // Pass both so the client can prefer UUID for detail lookups
        lookupId:      m.uuid || String(m.id),
      };
    });

    json(res, 200, { ok: true, total: data.total_records || meetings.length, meetings });
  } catch (err) {
    json(res, 200, { ok: false, message: `Error fetching recordings: ${err.message}` });
  }
}

// ── Zoom: calendar meetings — recordings for the month ───────────
// Note: listing scheduled meetings requires meeting:read:list_meetings scope.
// We use the recordings API (already-granted scope) for past meetings.
// Upcoming portal-created meetings are visible in the Portal tab.
async function listZoomMeetings(req, res) {
  let token;
  try { token = await getValidZoomToken(); }
  catch { return json(res, 200, { ok: false, message: 'Zoom not connected.' }); }

  const urlObj = new URL(`http://localhost${req.url}`);
  const rangeStart = urlObj.searchParams.get('start');
  const rangeEnd   = urlObj.searchParams.get('end');

  // Default to current month if no range provided
  const now   = new Date();
  const from  = rangeStart ? rangeStart.split('T')[0] : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const to    = rangeEnd   ? rangeEnd.split('T')[0]   : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()}`;

  try {
    const recData = await new Promise((resolve, reject) => {
      const r = https.request({
        hostname: 'api.zoom.us',
        path: `/v2/users/me/recordings?from=${from}&to=${to}&page_size=50`,
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` },
      }, (resp) => {
        let buf = '';
        resp.on('data', c => { buf += c; });
        resp.on('end', () => { try { resolve(JSON.parse(buf)); } catch { resolve({}); } });
      });
      r.on('error', reject);
      r.end();
    });

    const meetings = (recData.meetings || []).map(m => {
      const hasVtt = (m.recording_files || []).some(f => f.file_type === 'TRANSCRIPT');
      return {
        id: String(m.id),
        topic: m.topic,
        start_time: m.start_time,
        duration: m.duration,
        join_url: null,
        timezone: m.timezone,
        hasTranscript: hasVtt,
        lookupId: hasVtt ? String(m.id) : null,
      };
    });

    console.log(`[Zoom] Calendar recordings ${from}→${to}: ${meetings.length} meetings`);
    json(res, 200, meetings);
  } catch (err) {
    console.error('[Zoom] listZoomMeetings error:', err.message);
    json(res, 200, { ok: false, message: `Error fetching meetings: ${err.message}` });
  }
}

// ── Zoom: fetch transcript for a meeting (by ID or direct URL) ─
async function fetchTranscript(req, res) {
  let token;
  try {
    token = await getValidZoomToken();
  } catch (e) {
    return json(res, 401, { ok: false, message: 'Not connected.' });
  }

  const reqUrl     = new URL(req.url, `http://localhost:${PORT}`);
  const downloadUrl = reqUrl.searchParams.get('url');
  const meetingId  = reqUrl.searchParams.get('meetingId');

  try {
    let vttUrl = downloadUrl;

    // No direct URL — look up the meeting's recording files to find the transcript
    if (!vttUrl && meetingId) {
      // Zoom requires UUIDs to be double-encoded in the path
      const encodedId = encodeURIComponent(encodeURIComponent(meetingId));
      const detail = await httpsGet('api.zoom.us', `/v2/meetings/${encodedId}/recordings`,
        { 'Authorization': `Bearer ${token}` });
      console.log(`[Zoom transcript] Meeting ${meetingId} response:`, detail.body);
      const detailData = JSON.parse(detail.body);
      const files = detailData.recording_files || [];
      console.log(`[Zoom transcript] All file types:`, files.map(f => `type=${f.file_type} ext=${f.file_extension} status=${f.status}`));
      const tf = files.find(f =>
        f.file_type === 'TRANSCRIPT' || f.file_type === 'CC' || f.file_extension === 'VTT'
      );
      if (!tf) {
        const fileList = files.length
          ? files.map(f => f.file_type).join(', ')
          : 'none';
        return json(res, 200, {
          ok: false,
          message: `This recording has no transcript file. Audio transcription must be enabled in your Zoom cloud recording settings before the meeting starts.\n\nFiles available for this recording: ${fileList}`
        });
      }
      vttUrl = tf.download_url;
    }

    if (!vttUrl) return json(res, 400, { ok: false, message: 'Missing url or meetingId param.' });

    const target = new URL(vttUrl);
    const result = await httpsGet(target.hostname, target.pathname + target.search,
      { 'Authorization': `Bearer ${token}` });

    // Parse VTT into plain readable lines
    const lines = result.body.split('\n');
    const text  = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === 'WEBVTT' || trimmed.includes('-->') || /^\d+$/.test(trimmed)) continue;
      text.push(trimmed);
    }

    if (text.length === 0) {
      return json(res, 200, { ok: false, message: 'Transcript file is empty or could not be parsed.' });
    }

    json(res, 200, { ok: true, lines: text });
  } catch (err) {
    json(res, 200, { ok: false, message: `Error fetching transcript: ${err.message}` });
  }
}

// ── Debug: show token state + raw Zoom response ───────────────
async function debugZoom(res) {
  const creds = loadCredentials()['zoom'] || {};
  const { ZOOM_ACCESS_TOKEN, ZOOM_REFRESH_TOKEN, ZOOM_TOKEN_EXPIRY, ZOOM_API_KEY, ZOOM_API_SECRET } = creds;

  const info = {
    scopesBeingRequested: ZOOM_SCOPES,
    hasAccessToken:  !!ZOOM_ACCESS_TOKEN,
    hasRefreshToken: !!ZOOM_REFRESH_TOKEN,
    hasClientId:     !!ZOOM_API_KEY,
    hasClientSecret: !!ZOOM_API_SECRET,
    tokenExpiresAt:  ZOOM_TOKEN_EXPIRY ? new Date(Number(ZOOM_TOKEN_EXPIRY)).toISOString() : null,
    tokenExpired:    !ZOOM_TOKEN_EXPIRY || Date.now() > Number(ZOOM_TOKEN_EXPIRY),
  };

  if (!ZOOM_ACCESS_TOKEN) {
    return json(res, 200, { info, rawResponse: null, error: 'No access token stored' });
  }

  try {
    // Hit recordings with the raw token — no refresh, no retry
    const to   = new Date();
    const from = new Date(); from.setMonth(from.getMonth() - 1);
    const fmt  = d => d.toISOString().split('T')[0];
    const qs   = new URLSearchParams({ page_size: '5', from: fmt(from), to: fmt(to) });

    const result = await httpsGet('api.zoom.us', `/v2/users/me/recordings?${qs}`,
      { 'Authorization': `Bearer ${ZOOM_ACCESS_TOKEN}` });

    json(res, 200, { info, httpStatus: result.status, rawResponse: JSON.parse(result.body) });
  } catch (err) {
    json(res, 200, { info, error: err.message });
  }
}

// ── Zoom: explore transcript endpoints ───────────────────────
async function exploreTranscripts(res) {
  let token;
  try { token = await getValidZoomToken(); }
  catch (e) { return json(res, 200, { ok: false, message: 'Not connected.' }); }

  const results = {};
  const endpoints = [
    '/v2/users/me/transcripts',
    '/v2/users/me/meeting_transcripts',
  ];

  for (const ep of endpoints) {
    try {
      const r = await httpsGet('api.zoom.us', ep, { 'Authorization': `Bearer ${token}` });
      console.log(`[explore] ${ep} →`, r.status, r.body.slice(0, 300));
      results[ep] = { status: r.status, body: JSON.parse(r.body) };
    } catch (e) {
      results[ep] = { error: e.message };
    }
  }

  json(res, 200, results);
}

// ── Outlook validation + token test ──────────────────────────
function testOutlook(res) {
  const creds = loadCredentials()['outlook'] || {};
  const { MS_CLIENT_ID, MS_CLIENT_SECRET, MS_TENANT_ID, OUTLOOK_ACCESS_TOKEN } = creds;

  // If OAuth token exists, test it against the real API
  if (OUTLOOK_ACCESS_TOKEN) return testOutlookToken(res);

  if (!MS_CLIENT_ID || !MS_CLIENT_SECRET || !MS_TENANT_ID) {
    return json(res, 200, { ok: false, message: 'Missing credentials. Please save all three fields first.' });
  }
  const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!guidRegex.test(MS_CLIENT_ID)) {
    return json(res, 200, { ok: false, message: 'Application (Client) ID does not look like a valid GUID.' });
  }
  if (!guidRegex.test(MS_TENANT_ID)) {
    return json(res, 200, { ok: false, message: 'Tenant ID does not look like a valid GUID.' });
  }
  json(res, 200, { ok: true, message: 'Credentials saved and format looks valid. Click "Connect with Microsoft" to authorise.' });
}

// ── Outlook: auto-refresh access token ───────────────────────
async function getValidOutlookToken(force = false) {
  const all   = loadCredentials();
  const creds = all['outlook'] || {};
  const { OUTLOOK_ACCESS_TOKEN, OUTLOOK_REFRESH_TOKEN, OUTLOOK_TOKEN_EXPIRY, MS_CLIENT_ID, MS_CLIENT_SECRET, MS_TENANT_ID } = creds;

  if (!OUTLOOK_ACCESS_TOKEN) throw new Error('NOT_CONNECTED');

  const expired = force || !OUTLOOK_TOKEN_EXPIRY || Date.now() > Number(OUTLOOK_TOKEN_EXPIRY) - 60_000;
  if (!expired) return OUTLOOK_ACCESS_TOKEN;

  if (!OUTLOOK_REFRESH_TOKEN) throw new Error('TOKEN_EXPIRED_NO_REFRESH');
  if (!MS_CLIENT_ID || !MS_CLIENT_SECRET || !MS_TENANT_ID) throw new Error('MISSING_CLIENT_CREDENTIALS');

  const postData = new URLSearchParams({
    grant_type:    'refresh_token',
    refresh_token: OUTLOOK_REFRESH_TOKEN,
    client_id:     MS_CLIENT_ID,
    client_secret: MS_CLIENT_SECRET,
    scope:         OUTLOOK_SCOPES,
  }).toString();

  console.log('[Outlook] Refreshing access token…');
  const tokenData = await httpsPost('login.microsoftonline.com', `/${MS_TENANT_ID}/oauth2/v2.0/token`,
    { 'Content-Type': 'application/x-www-form-urlencoded' }, postData);

  if (!tokenData.access_token) throw new Error(`REFRESH_FAILED: ${tokenData.error_description || tokenData.error}`);

  all['outlook'] = {
    ...creds,
    OUTLOOK_ACCESS_TOKEN:  tokenData.access_token,
    OUTLOOK_REFRESH_TOKEN: tokenData.refresh_token || OUTLOOK_REFRESH_TOKEN,
    OUTLOOK_TOKEN_EXPIRY:  String(Date.now() + (tokenData.expires_in || 3600) * 1000),
  };
  saveCredentials(all);
  console.log('[Outlook] Token refreshed.');
  return tokenData.access_token;
}

// ── Outlook: initiate OAuth flow ──────────────────────────────
function initiateOutlookOAuth(res) {
  const creds = loadCredentials()['outlook'] || {};
  const { MS_CLIENT_ID, MS_CLIENT_SECRET, MS_TENANT_ID } = creds;

  if (!MS_CLIENT_ID || !MS_CLIENT_SECRET || !MS_TENANT_ID) {
    return json(res, 200, { ok: false, message: 'Save your Client ID, Client Secret, and Tenant ID first.' });
  }

  const now = Date.now();
  for (const [k, v] of oauthStates) { if (v.expires < now) oauthStates.delete(k); }

  const state = crypto.randomBytes(16).toString('hex');
  oauthStates.set(state, {
    expires: now + 10 * 60 * 1000,
    service: 'outlook',
    clientId: MS_CLIENT_ID, clientSecret: MS_CLIENT_SECRET, tenantId: MS_TENANT_ID,
  });

  const authUrl = `https://login.microsoftonline.com/${encodeURIComponent(MS_TENANT_ID)}/oauth2/v2.0/authorize` +
    `?response_type=code` +
    `&client_id=${encodeURIComponent(MS_CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(OUTLOOK_REDIRECT_URI)}` +
    `&scope=${encodeURIComponent(OUTLOOK_SCOPES)}` +
    `&state=${state}`;

  json(res, 200, { ok: true, authUrl });
}

// ── Outlook: OAuth callback ───────────────────────────────────
async function handleOutlookCallback(req, res) {
  const parsed = new URL(req.url, `http://localhost:${PORT}`);
  const code  = parsed.searchParams.get('code');
  const state = parsed.searchParams.get('state');
  const error = parsed.searchParams.get('error');

  const htmlPage = (title, body, isError = false) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<!DOCTYPE html><html><head><title>${title}</title>
    <style>body{font-family:-apple-system,sans-serif;background:#0f1117;color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
    .box{background:#1a1d27;border:1px solid #2e3250;border-radius:12px;padding:2rem 2.5rem;max-width:420px;text-align:center}
    h2{margin:0 0 0.75rem;color:${isError ? '#ef4444' : '#22c55e'}}p{color:#94a3b8;margin:0 0 1.5rem}
    a{display:inline-block;background:#4f6ef7;color:#fff;padding:.55rem 1.2rem;border-radius:8px;text-decoration:none;font-size:.9rem}
    </style></head><body><div class="box">${body}</div></body></html>`);
  };

  if (error) return htmlPage('Access Denied', `<h2>Access Denied</h2><p>${error}</p><a href="/">Back to Dashboard</a>`, true);
  if (!state || !oauthStates.has(state)) return htmlPage('Invalid State',
    `<h2>Expired Link</h2><p>Please try connecting again.</p><a href="/">Back to Dashboard</a>`, true);

  const { clientId, clientSecret, tenantId } = oauthStates.get(state);
  oauthStates.delete(state);

  const postData = new URLSearchParams({
    grant_type: 'authorization_code', code,
    redirect_uri: OUTLOOK_REDIRECT_URI,
    client_id: clientId, client_secret: clientSecret, scope: OUTLOOK_SCOPES,
  }).toString();

  try {
    const tokenData = await httpsPost('login.microsoftonline.com', `/${tenantId}/oauth2/v2.0/token`,
      { 'Content-Type': 'application/x-www-form-urlencoded' }, postData);

    if (!tokenData.access_token) {
      return htmlPage('Auth Failed', `<h2>Failed</h2><p>${tokenData.error_description || tokenData.error}</p><a href="/">Back</a>`, true);
    }

    const all = loadCredentials();
    all['outlook'] = {
      ...all['outlook'],
      OUTLOOK_ACCESS_TOKEN:  tokenData.access_token,
      OUTLOOK_REFRESH_TOKEN: tokenData.refresh_token || '',
      OUTLOOK_TOKEN_EXPIRY:  String(Date.now() + (tokenData.expires_in || 3600) * 1000),
    };
    saveCredentials(all);
    return htmlPage('Connected!', `<h2>Connected!</h2><p>Outlook linked successfully. You can close this tab.</p><a href="/">Back to Dashboard</a>`);
  } catch (err) {
    return htmlPage('Error', `<h2>Error</h2><p>${err.message}</p><a href="/">Back</a>`, true);
  }
}

// ── Outlook: test stored token ────────────────────────────────
async function testOutlookToken(res) {
  try {
    const token = await getValidOutlookToken();
    const r = await httpsGet('graph.microsoft.com', '/v1.0/me?$select=displayName,mail',
      { 'Authorization': `Bearer ${token}` });
    const data = JSON.parse(r.body);
    if (data.error) throw new Error(data.error.message);
    json(res, 200, { ok: true, message: `Connected as ${data.displayName} (${data.mail}). Token is valid.` });
  } catch (e) {
    json(res, 200, { ok: false, message: `Connection test failed: ${e.message}` });
  }
}

// ── Outlook: send test email to self ─────────────────────────
async function sendOutlookTestEmail(res) {
  let token;
  try { token = await getValidOutlookToken(); }
  catch { return json(res, 200, { ok: false, message: 'Not connected. Please connect with Microsoft first.' }); }

  try {
    const profileRes = await httpsGet('graph.microsoft.com', '/v1.0/me?$select=displayName,mail',
      { 'Authorization': `Bearer ${token}` });
    const profile = JSON.parse(profileRes.body);
    if (!profile.mail) return json(res, 200, { ok: false, message: 'Could not determine your email address.' });

    const result = await graphPost('/v1.0/me/sendMail', token, {
      message: {
        subject: 'Test email from MCP Connector Dashboard',
        body: {
          contentType: 'HTML',
          content: `<p>Hi ${profile.displayName || ''},</p><p>This test email from your <strong>MCP Connector Dashboard</strong> confirms your Outlook connection is working.</p>`,
        },
        toRecipients: [{ emailAddress: { address: profile.mail } }],
      },
      saveToSentItems: true,
    });

    if (result.status === 202) {
      json(res, 200, { ok: true, message: `Test email sent to ${profile.mail}. Check your inbox.` });
    } else {
      const err = result.body ? JSON.parse(result.body) : {};
      json(res, 200, { ok: false, message: `Send failed (${result.status}): ${err.error?.message || result.body}` });
    }
  } catch (err) {
    json(res, 200, { ok: false, message: `Error: ${err.message}` });
  }
}

// ── Outlook: send email (used by Django approval flow) ───────
async function sendOutlookEmail(req, res) {
  let token;
  try { token = await getValidOutlookToken(); }
  catch { return json(res, 200, { ok: false, message: 'Outlook not connected.' }); }

  let body;
  try { body = await readBody(req); } catch { return json(res, 200, { ok: false, message: 'Invalid request body.' }); }

  const { to, subject, body: emailBody, replyTo } = body;
  if (!to || !subject) return json(res, 200, { ok: false, message: 'Missing required fields: to, subject.' });

  try {
    const message = {
      subject,
      body: { contentType: 'HTML', content: (emailBody || '').replace(/\n/g, '<br>') },
      toRecipients: to.split(',').map(addr => ({ emailAddress: { address: addr.trim() } })),
    };
    if (replyTo) message.replyTo = [{ emailAddress: { address: replyTo } }];

    // saveToSentItems must be top-level in the sendMail body, not inside message
    const result = await graphPost('/v1.0/me/sendMail', token, { message, saveToSentItems: true });
    if (result.status === 202) {
      console.log(`[Outlook] Email sent to ${to} — subject: ${subject}`);
      return json(res, 200, { ok: true, messageId: '' });
    }
    const err = result.body ? JSON.parse(result.body) : {};
    return json(res, 200, { ok: false, message: err.error?.message || `Send failed (${result.status})` });
  } catch (err) {
    return json(res, 200, { ok: false, message: `Error: ${err.message}` });
  }
}

// ── Outlook: list upcoming calendar events ────────────────────
async function listOutlookEvents(req, res) {
  let token;
  try { token = await getValidOutlookToken(); }
  catch { return json(res, 200, { ok: false, message: 'Not connected. Please connect with Microsoft first.' }); }

  try {
    const { from, to } = getDateRange(req, { daysAhead: 7 });
    const fmt = d => d.toISOString();

    const qs = new URLSearchParams({
      startDateTime: fmt(from),
      endDateTime:   fmt(to),
      '$select':     'subject,start,end,location,isOnlineMeeting,organizer',
      '$top':        '20',
    });

    const r = await httpsGet('graph.microsoft.com', `/v1.0/me/calendarView?${qs}`,
      { 'Authorization': `Bearer ${token}` });
    const data = JSON.parse(r.body);

    if (data.error) return json(res, 200, { ok: false, message: `Graph error: ${data.error.message}` });

    const events = (data.value || []).map(ev => ({
      subject:         ev.subject || 'No title',
      start:           ev.start && ev.start.dateTime ? ev.start.dateTime : null,
      end:             ev.end   && ev.end.dateTime   ? ev.end.dateTime   : null,
      location:        ev.location && ev.location.displayName ? ev.location.displayName : null,
      isOnlineMeeting: ev.isOnlineMeeting || false,
      organizer:       ev.organizer && ev.organizer.emailAddress ? ev.organizer.emailAddress.name : null,
    }));

    json(res, 200, { ok: true, total: events.length, events });
  } catch (err) {
    json(res, 200, { ok: false, message: `Error fetching events: ${err.message}` });
  }
}

// ── Outlook: create calendar event (with optional Zoom/Teams link) ───────────
async function createOutlookEvent(req, res) {
  let outlookToken;
  try { outlookToken = await getValidOutlookToken(); }
  catch { return json(res, 200, { ok: false, message: 'Outlook not connected.' }); }

  const body = await readBody(req);
  const {
    subject,
    start,
    end,
    attendees = [],
    location = '',
    htmlBody = '',
    platform = 'teams',
    durationMin = 60,
  } = body;

  let joinUrl = null;
  let zoomMeetingId = null;

  // Zoom path: create Zoom meeting first, get join URL
  if (platform === 'zoom') {
    try {
      const zoomToken = await getValidZoomToken();
      const zoomPayload = JSON.stringify({
        topic: subject,
        type: 2,
        start_time: start,
        duration: durationMin,
        timezone: 'America/Los_Angeles',
      });
      const zoomResult = await new Promise((resolve, reject) => {
        const zoomReq = https.request({
          hostname: 'api.zoom.us',
          path: '/v2/users/me/meetings',
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${zoomToken}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(zoomPayload),
          },
        }, (r) => {
          let buf = '';
          r.on('data', c => { buf += c; });
          r.on('end', () => { try { resolve(JSON.parse(buf)); } catch { resolve(buf); } });
        });
        zoomReq.on('error', reject);
        zoomReq.write(zoomPayload);
        zoomReq.end();
      });
      if (zoomResult && zoomResult.join_url) {
        joinUrl = zoomResult.join_url;
        zoomMeetingId = zoomResult.id;
        console.log('[Zoom] Meeting created:', zoomMeetingId, joinUrl);
      } else {
        const zoomErrMsg = zoomResult && zoomResult.message
          ? `Zoom error ${zoomResult.code}: ${zoomResult.message}`
          : JSON.stringify(zoomResult);
        console.error('[Zoom] Meeting creation failed:', zoomErrMsg);
        return json(res, 200, { ok: false, message: zoomErrMsg });
      }
    } catch (zoomErr) {
      console.error('Zoom meeting creation failed:', zoomErr.message);
      return json(res, 200, { ok: false, message: `Zoom error: ${zoomErr.message}` });
    }
  }

  // Build the Outlook event body
  const locationDisplay = joinUrl ? `Zoom: ${joinUrl}` : location;
  const bodyContent = joinUrl
    ? `${htmlBody}<br><br><strong>Join Zoom:</strong> <a href="${joinUrl}">${joinUrl}</a>`
    : htmlBody;

  const eventBody = {
    subject,
    start: { dateTime: start, timeZone: 'America/Los_Angeles' },
    end:   { dateTime: end,   timeZone: 'America/Los_Angeles' },
    location: { displayName: locationDisplay },
    body: { contentType: 'HTML', content: bodyContent },
    attendees: attendees.map(a => ({
      emailAddress: { address: a.email, name: a.name || a.email },
      type: 'required',
    })),
    ...(platform === 'teams' ? { isOnlineMeeting: true, onlineMeetingProvider: 'teamsForBusiness' } : {}),
  };

  // Try Outlook calendar event — best-effort for Zoom platform, required for Teams
  let outlookCreated = false;
  let outlookEventId = null;
  let outlookWebLink = null;
  let teamsJoinUrl = null;
  let outlookError = null;

  try {
    const r = await graphPost('/v1.0/me/events', outlookToken, eventBody);
    const data = JSON.parse(r.body);
    if (data.error) {
      outlookError = data.error.message;
      console.error('[Outlook] Calendar event failed:', outlookError);
    } else {
      outlookCreated = true;
      outlookEventId = data.id;
      outlookWebLink = data.webLink;
      teamsJoinUrl = data.onlineMeeting?.joinUrl || null;
      console.log('[Outlook] Calendar event created:', outlookEventId);
    }
  } catch (err) {
    outlookError = err.message;
    console.error('[Outlook] Calendar event exception:', err.message);
  }

  // For Teams, Outlook IS the meeting — real failure if it didn't work
  if (platform === 'teams' && !outlookCreated) {
    return json(res, 200, { ok: false, message: outlookError || 'Failed to create Teams meeting' });
  }

  // Send email invites to all attendees via Mail.Send (works independently of Calendars.ReadWrite)
  let emailsSent = 0;
  if (attendees.length > 0) {
    const meetingLink = joinUrl || teamsJoinUrl || '';
    const startLabel = new Date(start).toLocaleString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZone: 'America/Los_Angeles',
    });
    for (const att of attendees) {
      if (!att.email) continue;
      try {
        const inviteHtml = [
          `<p>Hi ${att.name || att.email},</p>`,
          `<p>You have a meeting scheduled: <strong>${subject}</strong></p>`,
          `<p><strong>When:</strong> ${startLabel} (${durationMin} min)</p>`,
          meetingLink ? `<p><strong>Join:</strong> <a href="${meetingLink}">${meetingLink}</a></p>` : '',
          htmlBody ? `<hr><p>${htmlBody}</p>` : '',
        ].join('');
        const mailResult = await graphPost('/v1.0/me/sendMail', outlookToken, {
          message: {
            subject,
            body: { contentType: 'HTML', content: inviteHtml },
            toRecipients: [{ emailAddress: { address: att.email, name: att.name || att.email } }],
          },
          saveToSentItems: true,
        });
        if (mailResult.status === 202) {
          emailsSent++;
          console.log(`[Mail] Invite sent to ${att.email}`);
        } else {
          const errBody = mailResult.body ? JSON.parse(mailResult.body) : {};
          console.error(`[Mail] Failed to send to ${att.email}:`, errBody.error?.message || mailResult.status);
        }
      } catch (mailErr) {
        console.error(`[Mail] Exception sending to ${att.email}:`, mailErr.message);
      }
    }
  }

  json(res, 200, {
    ok: true,
    eventId: outlookEventId,
    webLink: outlookWebLink,
    joinUrl: joinUrl || teamsJoinUrl,
    zoomMeetingId,
    platform,
    outlookCreated,
    outlookError: outlookError || undefined,
    emailsSent,
  });
}

// ── Teams: auto-refresh access token ─────────────────────────
async function getValidTeamsToken(force = false) {
  const all   = loadCredentials();
  const creds = all['teams'] || {};
  const { TEAMS_ACCESS_TOKEN, TEAMS_REFRESH_TOKEN, TEAMS_TOKEN_EXPIRY, TEAMS_CLIENT_ID, TEAMS_CLIENT_SECRET, TEAMS_TENANT_ID } = creds;

  if (!TEAMS_ACCESS_TOKEN) throw new Error('NOT_CONNECTED');

  const expired = force || !TEAMS_TOKEN_EXPIRY || Date.now() > Number(TEAMS_TOKEN_EXPIRY) - 60_000;
  if (!expired) return TEAMS_ACCESS_TOKEN;

  if (!TEAMS_REFRESH_TOKEN) throw new Error('TOKEN_EXPIRED_NO_REFRESH');
  if (!TEAMS_CLIENT_ID || !TEAMS_CLIENT_SECRET || !TEAMS_TENANT_ID) throw new Error('MISSING_CLIENT_CREDENTIALS');

  const postData = new URLSearchParams({
    grant_type:    'refresh_token',
    refresh_token: TEAMS_REFRESH_TOKEN,
    client_id:     TEAMS_CLIENT_ID,
    client_secret: TEAMS_CLIENT_SECRET,
    scope:         TEAMS_SCOPES,
  }).toString();

  console.log('[Teams] Refreshing access token…');
  const tokenData = await httpsPost(
    'login.microsoftonline.com',
    `/${TEAMS_TENANT_ID}/oauth2/v2.0/token`,
    { 'Content-Type': 'application/x-www-form-urlencoded' },
    postData
  );

  if (!tokenData.access_token) {
    console.log('[Teams] Refresh failed:', JSON.stringify(tokenData));
    throw new Error(`REFRESH_FAILED: ${tokenData.error_description || tokenData.error || JSON.stringify(tokenData)}`);
  }

  all['teams'] = {
    ...creds,
    TEAMS_ACCESS_TOKEN:  tokenData.access_token,
    TEAMS_REFRESH_TOKEN: tokenData.refresh_token || TEAMS_REFRESH_TOKEN,
    TEAMS_TOKEN_EXPIRY:  String(Date.now() + (tokenData.expires_in || 3600) * 1000),
  };
  saveCredentials(all);
  console.log('[Teams] Token refreshed successfully.');
  return tokenData.access_token;
}

// ── Teams: initiate OAuth flow ────────────────────────────────
function initiateTeamsOAuth(res) {
  const creds = loadCredentials()['teams'] || {};
  const { TEAMS_CLIENT_ID, TEAMS_CLIENT_SECRET, TEAMS_TENANT_ID } = creds;

  if (!TEAMS_CLIENT_ID || !TEAMS_CLIENT_SECRET || !TEAMS_TENANT_ID) {
    return json(res, 200, { ok: false, message: 'Save your Client ID, Client Secret, and Tenant ID first.' });
  }

  const now = Date.now();
  for (const [k, v] of oauthStates) { if (v.expires < now) oauthStates.delete(k); }

  const state = crypto.randomBytes(16).toString('hex');
  oauthStates.set(state, {
    expires: now + 10 * 60 * 1000,
    service: 'teams',
    clientId: TEAMS_CLIENT_ID,
    clientSecret: TEAMS_CLIENT_SECRET,
    tenantId: TEAMS_TENANT_ID,
  });

  const authUrl = `https://login.microsoftonline.com/${encodeURIComponent(TEAMS_TENANT_ID)}/oauth2/v2.0/authorize` +
    `?response_type=code` +
    `&client_id=${encodeURIComponent(TEAMS_CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(TEAMS_REDIRECT_URI)}` +
    `&scope=${encodeURIComponent(TEAMS_SCOPES)}` +
    `&state=${state}` +
    `&prompt=select_account`;

  json(res, 200, { ok: true, authUrl });
}

// ── Teams: OAuth callback ─────────────────────────────────────
async function handleTeamsCallback(req, res) {
  const parsed = new URL(req.url, `http://localhost:${PORT}`);
  const code  = parsed.searchParams.get('code');
  const state = parsed.searchParams.get('state');
  const error = parsed.searchParams.get('error');

  const htmlPage = (title, body, isError = false) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<!DOCTYPE html><html><head><title>${title}</title>
    <style>
      body { font-family: -apple-system, sans-serif; background: #0f1117; color: #e2e8f0;
             display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
      .box { background: #1a1d27; border: 1px solid #2e3250; border-radius: 12px;
             padding: 2rem 2.5rem; max-width: 420px; text-align: center; }
      h2 { margin: 0 0 0.75rem; color: ${isError ? '#ef4444' : '#22c55e'}; }
      p { color: #94a3b8; margin: 0 0 1.5rem; }
      a { display: inline-block; background: #4f6ef7; color: #fff; padding: 0.55rem 1.2rem;
          border-radius: 8px; text-decoration: none; font-size: 0.9rem; }
    </style></head><body><div class="box">${body}</div></body></html>`);
  };

  if (error) {
    return htmlPage('Access Denied',
      `<h2>Access Denied</h2><p>Microsoft returned: <strong>${error}</strong></p><a href="/">Back to Dashboard</a>`,
      true);
  }

  if (!state || !oauthStates.has(state)) {
    return htmlPage('Invalid State',
      `<h2>Invalid or Expired Link</h2><p>The authorization link has expired. Please try connecting again.</p><a href="/">Back to Dashboard</a>`,
      true);
  }

  const { clientId, clientSecret, tenantId } = oauthStates.get(state);
  oauthStates.delete(state);

  const postData = new URLSearchParams({
    grant_type:    'authorization_code',
    code,
    redirect_uri:  TEAMS_REDIRECT_URI,
    client_id:     clientId,
    client_secret: clientSecret,
    scope:         TEAMS_SCOPES,
  }).toString();

  try {
    const tokenData = await httpsPost(
      'login.microsoftonline.com',
      `/${tenantId}/oauth2/v2.0/token`,
      { 'Content-Type': 'application/x-www-form-urlencoded' },
      postData
    );

    if (!tokenData.access_token) {
      const reason = tokenData.error_description || tokenData.error || 'Unknown error';
      return htmlPage('Auth Failed',
        `<h2>Authentication Failed</h2><p>${reason}</p><a href="/">Back to Dashboard</a>`,
        true);
    }

    const all = loadCredentials();
    all['teams'] = {
      ...all['teams'],
      TEAMS_ACCESS_TOKEN:  tokenData.access_token,
      TEAMS_REFRESH_TOKEN: tokenData.refresh_token || '',
      TEAMS_TOKEN_EXPIRY:  String(Date.now() + (tokenData.expires_in || 3600) * 1000),
    };
    saveCredentials(all);

    return htmlPage('Connected!',
      `<h2>Connected!</h2><p>Microsoft Teams account linked successfully. You can close this tab.</p><a href="/">Back to Dashboard</a>`);
  } catch (err) {
    return htmlPage('Error',
      `<h2>Error</h2><p>${err.message}</p><a href="/">Back to Dashboard</a>`,
      true);
  }
}

// ── Teams: verify stored token ────────────────────────────────
async function testTeams(res) {
  try {
    await getValidTeamsToken();
    json(res, 200, { ok: true, message: 'Teams token is valid and active. Click "Load Meetings" to fetch your recent meetings.' });
  } catch (e) {
    json(res, 200, { ok: false, message: 'No valid token. Click "Connect with Microsoft" to authorize.' });
  }
}

// ── Teams: list recent meetings that are online meetings ──────
async function listTeamsMeetings(req, res) {
  let token;
  try {
    token = await getValidTeamsToken();
  } catch (e) {
    const msg = e.message.startsWith('NOT_CONNECTED')
      ? 'Not connected. Please connect with Microsoft first.'
      : 'Session expired and could not be refreshed. Please reconnect.';
    return json(res, 200, { ok: false, message: msg });
  }

  try {
    const { from, to } = getDateRange(req, { pastDays: 90 });
    const fmt  = d => d.toISOString();

    // Fetch calendar events — include isOnlineMeeting and onlineMeetingUrl for resilient filtering
    const calQs = new URLSearchParams({
      startDateTime: fmt(from),
      endDateTime:   fmt(to),
      '$select':     'subject,start,end,isOnlineMeeting,onlineMeeting,onlineMeetingUrl,onlineMeetingProvider',
      '$top':        '100',
    });

    let calBody = await httpsGet(
      'graph.microsoft.com',
      `/v1.0/me/calendarView?${calQs}`,
      { 'Authorization': `Bearer ${token}` }
    );

    console.log('[Teams meetings] Calendar HTTP', calBody.status, calBody.body.slice(0, 300));

    if (calBody.status === 401) {
      try { token = await getValidTeamsToken(true); } catch { /* fall through */ }
      calBody = await httpsGet('graph.microsoft.com', `/v1.0/me/calendarView?${calQs}`,
        { 'Authorization': `Bearer ${token}` });
      if (calBody.status === 401) {
        return json(res, 200, { ok: false, message: 'Token rejected. Please reconnect with Microsoft.' });
      }
    }

    const calData = JSON.parse(calBody.body);
    if (calData.error) {
      return json(res, 200, { ok: false, message: `Graph error: ${calData.error.message || JSON.stringify(calData.error)}` });
    }

    console.log('[Teams meetings] Total calendar events:', (calData.value || []).length);

    // Filter client-side using isOnlineMeeting flag; fall back to checking onlineMeeting/onlineMeetingUrl
    const events = (calData.value || [])
      .filter(ev => ev.isOnlineMeeting === true || (ev.onlineMeeting && ev.onlineMeeting.joinUrl) || ev.onlineMeetingUrl)
      .sort((a, b) => new Date(b.start.dateTime) - new Date(a.start.dateTime));

    console.log(`[Teams meetings] ${events.length} online meeting events — resolving IDs + transcripts in parallel…`);

    // Run all lookups in parallel: meetingId resolve → transcript check → include only if both pass
    const settled = await Promise.all(events.map(async (ev) => {
      const baseMeeting = {
        topic: ev.subject || 'Untitled Meeting',
        start_time: ev.start && ev.start.dateTime ? ev.start.dateTime : null,
        end_time: ev.end && ev.end.dateTime ? ev.end.dateTime : null,
        meetingId: null,
        transcriptCount: 0,
        hasTranscript: false,
      };
      const joinUrl = (ev.onlineMeeting && ev.onlineMeeting.joinUrl) || ev.onlineMeetingUrl;
      if (!joinUrl) return baseMeeting;

      try {
        // Double-encode % signs so Graph's single URL-decode leaves them intact for comparison
        const doubleEncodedUrl = joinUrl.replace(/%/g, '%25');
        const escapedUrl = doubleEncodedUrl.replace(/'/g, "''");
        const mtgResult = await httpsGet('graph.microsoft.com',
          `/v1.0/me/onlineMeetings?$filter=joinWebUrl%20eq%20'${escapedUrl}'`,
          { 'Authorization': `Bearer ${token}` });

        // 404 / empty = user is attendee, not organizer — skip
        if (mtgResult.status !== 200) return baseMeeting;
        const mtgData = JSON.parse(mtgResult.body);
        if (!mtgData.value || mtgData.value.length === 0) return baseMeeting;

        const meetingId = mtgData.value[0].id;

        // Check whether this meeting has any transcripts
        const txResult = await httpsGet('graph.microsoft.com',
          `/v1.0/me/onlineMeetings/${encodeURIComponent(meetingId)}/transcripts`,
          { 'Authorization': `Bearer ${token}` });
        if (txResult.status !== 200) return baseMeeting;
        const txData = JSON.parse(txResult.body);
        const transcriptCount = txData.value ? txData.value.length : 0;

        return {
          ...baseMeeting,
          meetingId,
          transcriptCount,
          hasTranscript: transcriptCount > 0,
        };
      } catch { return baseMeeting; }
    }));

    const meetings = settled.filter(Boolean);
    console.log(`[Teams meetings] ${meetings.length} meetings found`);
    json(res, 200, { ok: true, total: meetings.length, meetings });
  } catch (err) {
    json(res, 200, { ok: false, message: `Error fetching meetings: ${err.message}` });
  }
}

// ── Teams: fetch transcript for a meeting ─────────────────────
async function fetchTeamsTranscript(req, res) {
  let token;
  try {
    token = await getValidTeamsToken();
  } catch (e) {
    return json(res, 401, { ok: false, message: 'Not connected.' });
  }

  const reqUrl    = new URL(req.url, `http://localhost:${PORT}`);
  const meetingId = reqUrl.searchParams.get('meetingId');

  if (!meetingId) return json(res, 400, { ok: false, message: 'Missing meetingId param.' });

  try {
    // List available transcripts for the meeting
    const listResult = await httpsGet(
      'graph.microsoft.com',
      `/v1.0/me/onlineMeetings/${encodeURIComponent(meetingId)}/transcripts`,
      { 'Authorization': `Bearer ${token}` }
    );

    console.log('[Teams transcript] List HTTP', listResult.status, listResult.body.slice(0, 300));
    const listData = JSON.parse(listResult.body);

    if (listData.error) {
      return json(res, 200, { ok: false, message: `Graph error: ${listData.error.message || JSON.stringify(listData.error)}` });
    }

    if (!listData.value || listData.value.length === 0) {
      return json(res, 200, {
        ok: false,
        message: 'No transcript found for this meeting. Make sure transcription was enabled before the meeting started.',
      });
    }

    const transcriptId = listData.value[0].id;

    // Fetch VTT transcript content
    const contentResult = await httpsGet(
      'graph.microsoft.com',
      `/v1.0/me/onlineMeetings/${encodeURIComponent(meetingId)}/transcripts/${encodeURIComponent(transcriptId)}/content?$format=text/vtt`,
      { 'Authorization': `Bearer ${token}` }
    );

    console.log('[Teams transcript] Content HTTP', contentResult.status, contentResult.body.slice(0, 200));

    if (contentResult.status !== 200) {
      return json(res, 200, { ok: false, message: `Could not fetch transcript content (HTTP ${contentResult.status}).` });
    }

    // Parse VTT: extract timestamps + strip <v Speaker>text</v> voice span tags
    const lines = contentResult.body.split('\n');
    const text  = [];
    let currentTimestamp = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === 'WEBVTT' || /^\d+$/.test(trimmed)) continue;

      if (trimmed.includes('-->')) {
        // "00:01:23.456 --> 00:01:25.789" — keep start time, drop milliseconds
        currentTimestamp = trimmed.split('-->')[0].trim().replace(/\.\d+$/, '');
        continue;
      }

      // Strip voice span tags: <v Speaker Name>text</v> → "Speaker Name: text"
      // Empty speaker <v >text</v> → just "text"
      const cleaned = trimmed
        .replace(/<v ([^>]*)>/g, (_, speaker) => {
          const s = speaker.trim();
          return s ? `${s}: ` : '';
        })
        .replace(/<\/v>/g, '')
        .trim();

      if (cleaned) {
        const ts = currentTimestamp ? `[${currentTimestamp}]  ` : '';
        text.push(`${ts}${cleaned}`);
      }
    }

    if (text.length === 0) {
      return json(res, 200, { ok: false, message: 'Transcript file is empty or could not be parsed.' });
    }

    json(res, 200, { ok: true, lines: text });
  } catch (err) {
    json(res, 200, { ok: false, message: `Error fetching transcript: ${err.message}` });
  }
}

// ── Teams: debug raw Graph responses ─────────────────────────
async function debugTeams(res) {
  let token;
  try { token = await getValidTeamsToken(); }
  catch (e) { return json(res, 200, { ok: false, message: 'Not connected.' }); }

  const results = {};

  // 1. Raw calendarView (last 30 days, no filter, first 5 events)
  try {
    const to = new Date(), from = new Date();
    from.setDate(from.getDate() - 30);
    const qs = new URLSearchParams({
      startDateTime: from.toISOString(), endDateTime: to.toISOString(), '$top': '5',
    });
    const r = await httpsGet('graph.microsoft.com', `/v1.0/me/calendarView?${qs}`,
      { 'Authorization': `Bearer ${token}` });
    const d = JSON.parse(r.body);
    results.calendarView = {
      status: r.status,
      totalReturned: d.value ? d.value.length : 0,
      error: d.error || null,
      sample: (d.value || []).map(ev => ({
        subject:               ev.subject,
        start:                 ev.start,
        isOnlineMeeting:       ev.isOnlineMeeting,
        onlineMeetingProvider: ev.onlineMeetingProvider,
        onlineMeeting:         ev.onlineMeeting,
        onlineMeetingUrl:      ev.onlineMeetingUrl,
      })),
    };
  } catch (e) { results.calendarView = { error: e.message }; }

  // 2. /me/onlineMeetings (no $top — not supported on this endpoint)
  try {
    const r = await httpsGet('graph.microsoft.com', `/v1.0/me/onlineMeetings`,
      { 'Authorization': `Bearer ${token}` });
    const d = JSON.parse(r.body);
    results.onlineMeetings = {
      status: r.status,
      totalReturned: d.value ? d.value.length : 0,
      error: d.error || null,
      sample: (d.value || []).map(m => ({
        id: m.id, subject: m.subject, startDateTime: m.startDateTime, joinWebUrl: m.joinWebUrl,
      })),
    };
  } catch (e) { results.onlineMeetings = { error: e.message }; }

  // 3. /me/profile (sanity check)
  try {
    const r = await httpsGet('graph.microsoft.com', `/v1.0/me?$select=displayName,mail`,
      { 'Authorization': `Bearer ${token}` });
    results.profile = JSON.parse(r.body);
  } catch (e) { results.profile = { error: e.message }; }

  json(res, 200, results);
}

// ── 3CX / Telnyx SMS ──────────────────────────────────────────

async function testTelnyx(res) {
  const creds = loadCredentials()['3cx'] || {};
  const { TELNYX_API_KEY } = creds;
  if (!TELNYX_API_KEY) return json(res, 200, { ok: false, message: 'Save your Telnyx API key first.' });

  try {
    const r = await httpsGet(TELNYX_API_HOST, '/v2/messaging_profiles',
      { 'Authorization': `Bearer ${TELNYX_API_KEY}`, 'Accept': 'application/json' });
    if (r.status === 401) return json(res, 200, { ok: false, message: 'Invalid API key — check your Telnyx API key.' });
    const data = JSON.parse(r.body);
    if (data.errors) return json(res, 200, { ok: false, message: data.errors[0]?.detail || 'Telnyx API error.' });
    const count = (data.data || []).length;
    json(res, 200, { ok: true, message: `Telnyx connection verified. ${count} messaging profile(s) found.` });
  } catch (err) {
    json(res, 200, { ok: false, message: `Network error: ${err.message}` });
  }
}

async function sendSms(req, res) {
  const creds = loadCredentials()['3cx'] || {};
  const { TELNYX_API_KEY, TELNYX_FROM_NUMBER } = creds;
  if (!TELNYX_API_KEY) return json(res, 200, { ok: false, message: 'Save your Telnyx API key first.' });
  if (!TELNYX_FROM_NUMBER) return json(res, 200, { ok: false, message: 'Save your Telnyx phone number first.' });

  let body;
  try { body = await readBody(req); } catch { return json(res, 400, { ok: false, message: 'Invalid request body.' }); }

  const { to, text } = body;
  if (!to || !text) return json(res, 200, { ok: false, message: 'Both "to" and "text" are required.' });

  try {
    const postData = JSON.stringify({ from: TELNYX_FROM_NUMBER, to, text });
    const result = await new Promise((resolve, reject) => {
      const req2 = https.request({
        hostname: TELNYX_API_HOST,
        path: '/v2/messages',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${TELNYX_API_KEY}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
      }, (r) => {
        let raw = '';
        r.on('data', c => { raw += c; });
        r.on('end', () => resolve({ status: r.statusCode, body: raw }));
      });
      req2.on('error', reject);
      req2.write(postData);
      req2.end();
    });

    const data = JSON.parse(result.body);
    if (result.status === 200 || result.status === 201) {
      json(res, 200, { ok: true, message: `SMS sent to ${to}.`, id: data.data?.id });
    } else {
      const errMsg = data.errors?.[0]?.detail || data.errors?.[0]?.title || `HTTP ${result.status}`;
      json(res, 200, { ok: false, message: `Send failed: ${errMsg}` });
    }
  } catch (err) {
    json(res, 200, { ok: false, message: `Network error: ${err.message}` });
  }
}

async function listSmsMessages(res) {
  const creds = loadCredentials()['3cx'] || {};
  const { TELNYX_API_KEY } = creds;
  if (!TELNYX_API_KEY) return json(res, 200, { ok: false, message: 'Not configured.' });

  try {
    const r = await httpsGet(TELNYX_API_HOST,
      '/v2/messages?filter%5Bdirection%5D%5B%5D=inbound&page%5Bsize%5D=25',
      { 'Authorization': `Bearer ${TELNYX_API_KEY}`, 'Accept': 'application/json' });

    const data = JSON.parse(r.body);
    if (data.errors) return json(res, 200, { ok: false, message: data.errors[0]?.detail || 'API error.' });

    const messages = (data.data || []).map(m => ({
      id:         m.id,
      from:       m.from?.phone_number || '',
      to:         (m.to?.[0]?.phone_number) || '',
      text:       m.text || '',
      direction:  m.direction || 'inbound',
      created_at: m.created_at || '',
    }));

    json(res, 200, { ok: true, total: messages.length, messages });
  } catch (err) {
    json(res, 200, { ok: false, message: `Error: ${err.message}` });
  }
}

async function getSmsThread(req, res) {
  const creds = loadCredentials()['3cx'] || {};
  const { TELNYX_API_KEY } = creds;
  if (!TELNYX_API_KEY) return json(res, 200, { ok: false, message: 'Not configured.' });

  const reqUrl = new URL(req.url, `http://localhost:${PORT}`);
  const number = reqUrl.searchParams.get('number');
  if (!number) return json(res, 400, { ok: false, message: 'Missing number param.' });

  const enc = n => encodeURIComponent(n);

  try {
    const [inboundResult, outboundResult] = await Promise.all([
      httpsGet(TELNYX_API_HOST,
        `/v2/messages?filter%5Bfrom%5D%5Bphone_number%5D=${enc(number)}&page%5Bsize%5D=50`,
        { 'Authorization': `Bearer ${TELNYX_API_KEY}`, 'Accept': 'application/json' }),
      httpsGet(TELNYX_API_HOST,
        `/v2/messages?filter%5Bto%5D%5B0%5D%5Bphone_number%5D=${enc(number)}&page%5Bsize%5D=50`,
        { 'Authorization': `Bearer ${TELNYX_API_KEY}`, 'Accept': 'application/json' }),
    ]);

    const inbound  = JSON.parse(inboundResult.body).data  || [];
    const outbound = JSON.parse(outboundResult.body).data || [];

    const all = [...inbound, ...outbound].map(m => ({
      id:         m.id,
      direction:  m.direction || (inbound.includes(m) ? 'inbound' : 'outbound'),
      from:       m.from?.phone_number || '',
      to:         (m.to?.[0]?.phone_number) || '',
      text:       m.text || '',
      created_at: m.created_at || '',
    }));

    // Deduplicate by id and sort oldest first
    const seen = new Set();
    const unique = all.filter(m => { if (seen.has(m.id)) return false; seen.add(m.id); return true; });
    unique.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    json(res, 200, { ok: true, number, messages: unique });
  } catch (err) {
    json(res, 200, { ok: false, message: `Error: ${err.message}` });
  }
}

// ── Router ────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const parsed = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = parsed.pathname;
  const method = req.method;

  // Zoom OAuth callback
  if (pathname === '/auth/zoom/callback' && method === 'GET') return handleZoomCallback(req, res);

  // Teams OAuth callback
  if (pathname === '/auth/teams/callback' && method === 'GET') return handleTeamsCallback(req, res);

  // Outlook OAuth callback
  if (pathname === '/auth/outlook/callback' && method === 'GET') return handleOutlookCallback(req, res);

  // GET /api/credentials/:service
  const credsMatch = pathname.match(/^\/api\/credentials\/([a-z]+)$/);
  if (credsMatch && method === 'GET') {
    const service = credsMatch[1];
    const all = loadCredentials();
    const creds = all[service] || {};
    const masked = {};
    for (const [k, v] of Object.entries(creds)) masked[k] = maskValue(v);
    const oauthConnected = service === 'teams'
      ? !!(creds.TEAMS_ACCESS_TOKEN)
      : service === 'outlook'
      ? !!(creds.OUTLOOK_ACCESS_TOKEN)
      : !!(creds.ZOOM_ACCESS_TOKEN);
    return json(res, 200, { configured: Object.keys(creds).length > 0, credentials: masked, oauthConnected });
  }

  // POST /api/credentials/:service
  if (credsMatch && method === 'POST') {
    const service = credsMatch[1];
    try {
      const incoming = await readBody(req);
      const all = loadCredentials();
      // Preserve existing OAuth tokens if just updating client ID/secret
      const existing = all[service] || {};
      all[service] = { ...existing, ...incoming };
      saveCredentials(all);
      return json(res, 200, { ok: true });
    } catch {
      return json(res, 400, { error: 'Invalid body' });
    }
  }

  // DELETE /api/credentials/:service
  if (credsMatch && method === 'DELETE') {
    const service = credsMatch[1];
    const all = loadCredentials();
    delete all[service];
    saveCredentials(all);
    return json(res, 200, { ok: true });
  }

  // POST /api/test/zoom/s2s
  if (pathname === '/api/test/zoom/s2s' && method === 'POST') return testZoomS2S(res);

  // POST /api/test/zoom/general
  if (pathname === '/api/test/zoom/general' && method === 'POST') return testZoomGeneral(res);

  // POST /api/test/zoom/create-meeting
  if (pathname === '/api/test/zoom/create-meeting' && method === 'POST') return testCreateZoomMeeting(req, res);

  // DELETE /api/zoom/meetings/:id
  const zoomMeetingMatch = pathname.match(/^\/api\/zoom\/meetings\/(\d+)$/);
  if (zoomMeetingMatch && method === 'DELETE') return deleteZoomMeeting(req, res);

  // GET /api/outlook/token-scopes
  if (pathname === '/api/outlook/token-scopes' && method === 'GET') return outlookTokenScopes(req, res);

  // POST /api/test/outlook/create-event
  if (pathname === '/api/test/outlook/create-event' && method === 'POST') return testCreateOutlookEvent(req, res);

  // POST /api/test/outlook/delete-event
  if (pathname === '/api/test/outlook/delete-event' && method === 'POST') return deleteOutlookEvent(req, res);

  // POST /api/zoom/oauth/start
  if (pathname === '/api/zoom/oauth/start' && method === 'POST') return initiateZoomOAuth(res);

  // POST /api/test/outlook
  if (pathname === '/api/test/outlook' && method === 'POST') return testOutlook(res);

  // POST /api/outlook/oauth/start
  if (pathname === '/api/outlook/oauth/start' && method === 'POST') return initiateOutlookOAuth(res);

  // POST /api/outlook/send-test-email
  if (pathname === '/api/outlook/send-test-email' && method === 'POST') return sendOutlookTestEmail(res);

  // POST /api/outlook/send-email  (production send — accepts to/subject/body)
  if (pathname === '/api/outlook/send-email' && method === 'POST') return sendOutlookEmail(req, res);

  // GET /api/outlook/events
  if (pathname === '/api/outlook/events' && method === 'GET') return listOutlookEvents(req, res);

  // POST /api/outlook/events/create
  if (pathname === '/api/outlook/events/create' && method === 'POST') return createOutlookEvent(req, res);

  // POST /api/teams/oauth/start
  if (pathname === '/api/teams/oauth/start' && method === 'POST') return initiateTeamsOAuth(res);

  // POST /api/test/teams
  if (pathname === '/api/test/teams' && method === 'POST') return testTeams(res);

  // GET /api/teams/meetings
  if (pathname === '/api/teams/meetings' && method === 'GET') return listTeamsMeetings(req, res);

  // GET /api/teams/transcript?meetingId=...
  if (pathname === '/api/teams/transcript' && method === 'GET') return fetchTeamsTranscript(req, res);

  // GET /api/teams/debug
  if (pathname === '/api/teams/debug' && method === 'GET') return debugTeams(res);

  // POST /api/test/3cx
  if (pathname === '/api/test/3cx' && method === 'POST') return testTelnyx(res);

  // POST /api/3cx/send
  if (pathname === '/api/3cx/send' && method === 'POST') return sendSms(req, res);

  // GET /api/3cx/messages
  if (pathname === '/api/3cx/messages' && method === 'GET') return listSmsMessages(res);

  // GET /api/3cx/thread?number=...
  if (pathname === '/api/3cx/thread' && method === 'GET') return getSmsThread(req, res);

  // GET /api/zoom/recordings
  if (pathname === '/api/zoom/recordings' && method === 'GET') return listRecordings(req, res);
  // GET /api/zoom/meetings  (upcoming scheduled meetings)
  if (pathname === '/api/zoom/meetings' && method === 'GET') return listZoomMeetings(req, res);

  // GET /api/zoom/debug
  if (pathname === '/api/zoom/debug' && method === 'GET') return debugZoom(res);

  // GET /api/zoom/explore-transcripts
  if (pathname === '/api/zoom/explore-transcripts' && method === 'GET') return exploreTranscripts(res);

  // GET /api/zoom/transcript?url=...
  if (pathname === '/api/zoom/transcript' && method === 'GET') return fetchTranscript(req, res);

  // Static files
  serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
  console.log(`MCP Connector Dashboard running at http://localhost:${PORT}`);
});

