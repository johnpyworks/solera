/**
 * Shared API fetch wrapper.
 * Stores access token in module memory (not localStorage).
 * Auto-refreshes on 401; redirects to /login on refresh failure.
 */

const BASE = '/api/v1';

let _accessToken = null;

export function setAccessToken(token) {
  _accessToken = token;
}

export function getAccessToken() {
  return _accessToken;
}

export function clearTokens() {
  _accessToken = null;
  sessionStorage.removeItem('refresh_token');
}

async function refreshAccessToken() {
  const refresh = sessionStorage.getItem('refresh_token');
  if (!refresh) return false;

  const resp = await fetch(`${BASE}/auth/refresh/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh }),
  });

  if (!resp.ok) {
    clearTokens();
    return false;
  }

  const data = await resp.json();
  setAccessToken(data.access);
  if (data.refresh) {
    sessionStorage.setItem('refresh_token', data.refresh);
  }
  return true;
}

export async function apiFetch(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (_accessToken) {
    headers['Authorization'] = `Bearer ${_accessToken}`;
  }

  let resp = await fetch(`${BASE}${path}`, { ...options, headers });

  // Auto-refresh on 401
  if (resp.status === 401 && _accessToken) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      headers['Authorization'] = `Bearer ${_accessToken}`;
      resp = await fetch(`${BASE}${path}`, { ...options, headers });
    } else {
      window.location.href = '/login';
      return null;
    }
  }

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: resp.statusText }));
    throw Object.assign(new Error(err.detail || 'API error'), { status: resp.status, data: err });
  }

  if (resp.status === 204) return null;
  return resp.json();
}

/** POST multipart/form-data (for file uploads — skips Content-Type so browser sets boundary). */
export async function apiUpload(path, formData) {
  const headers = {};
  if (_accessToken) {
    headers['Authorization'] = `Bearer ${_accessToken}`;
  }

  const resp = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: resp.statusText }));
    throw Object.assign(new Error(err.detail || 'Upload error'), { status: resp.status, data: err });
  }

  return resp.json();
}

/** Auth helpers */
export async function login(username, password) {
  const resp = await fetch(`${BASE}/auth/login/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.detail || 'Invalid credentials');
  }

  const data = await resp.json();
  setAccessToken(data.access);
  sessionStorage.setItem('refresh_token', data.refresh);
  return data;
}

export async function logout(refreshToken) {
  try {
    await apiFetch('/auth/logout/', {
      method: 'POST',
      body: JSON.stringify({ refresh: refreshToken || sessionStorage.getItem('refresh_token') }),
    });
  } catch (_) {
    // Best effort
  }
  clearTokens();
}
