import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [state, setState] = useState('loading');

  const refresh = async () => {
    try {
      const response = await api.get('/auth/me');
      setUser(response.data.data.user);
      setState('authenticated');
      return response.data.data.user;
    } catch {
      setUser(null);
      setState('anonymous');
      return null;
    }
  };

  useEffect(() => { refresh(); }, []);
  const value = useMemo(() => ({ user, state, refresh, async signIn(credentials) { const response = await api.post('/auth/login', credentials); if (response.data.data.mfaRequired) { setUser(null); setState('mfa_pending'); return response.data.data; } setUser(response.data.data.user); setState('authenticated'); return response.data.data.user; }, async completeMfa(path, payload) { const response = await api.post(path, payload); setUser(response.data.data.user); setState('authenticated'); return response.data.data; }, async signOut() { await api.post('/auth/logout'); setUser(null); setState('anonymous'); } }), [user, state]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
