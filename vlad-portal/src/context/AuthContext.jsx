import { createContext, useContext, useState, useEffect } from 'react';
import { setAccessToken, clearTokens } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // null = not loaded yet; false = not logged in; object = logged in user
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // On mount, try to restore session from refresh token
  useEffect(() => {
    async function restoreSession() {
      const refresh = sessionStorage.getItem('refresh_token');
      if (!refresh) {
        setUser(false);
        setLoading(false);
        return;
      }
      try {
        // Refresh the access token
        const resp = await fetch('/api/v1/auth/refresh/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh }),
        });
        if (!resp.ok) throw new Error('refresh failed');
        const data = await resp.json();
        setAccessToken(data.access);
        if (data.refresh) sessionStorage.setItem('refresh_token', data.refresh);

        // Fetch user info
        const meResp = await fetch('/api/v1/auth/me/', {
          headers: { Authorization: `Bearer ${data.access}` },
        });
        if (!meResp.ok) throw new Error('me failed');
        const me = await meResp.json();
        setUser(me);
      } catch (_) {
        clearTokens();
        setUser(false);
      } finally {
        setLoading(false);
      }
    }
    restoreSession();
  }, []);

  function logout() {
    clearTokens();
    setUser(false);
  }

  return (
    <AuthContext.Provider value={{ user, setUser, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
