import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from './api.js';

const MetaCtx = createContext(null);

// Áp theme (CSS variables) lên :root.
function applyTheme(t) {
  if (!t) return;
  const r = document.documentElement.style;
  if (t.primary) { r.setProperty('--primary', t.primary); r.setProperty('--primary-dark', t.primary); }
  if (t.sidebar) r.setProperty('--sidebar', t.sidebar);
  if (t.bg) r.setProperty('--bg', t.bg);
  if (t.accent) r.setProperty('--blue', t.accent);
  if (t.radius) r.setProperty('--radius', t.radius);
}

export function MetaProvider({ children }) {
  const [states, setStates] = useState([]);
  const [theme, setTheme] = useState({});

  const reloadStates = useCallback(() => api.get('/workflow').then((r) => setStates(r.data)).catch(() => {}), []);
  const reloadTheme = useCallback(() => api.get('/settings/theme').then((t) => { setTheme(t); applyTheme(t); }).catch(() => {}), []);

  useEffect(() => { reloadStates(); reloadTheme(); }, [reloadStates, reloadTheme]);

  const byCode = useCallback((code) => states.find((s) => s.code === code) || { name: code, color: '#64748b' }, [states]);

  return (
    <MetaCtx.Provider value={{ states, byCode, theme, setTheme, applyTheme, reloadStates, reloadTheme }}>
      {children}
    </MetaCtx.Provider>
  );
}

export const useMeta = () => useContext(MetaCtx);
