import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from './api.js';
import { buildLabelManifest } from './labelDefs.js';

const MetaCtx = createContext(null);
const LABEL_DEFAULTS = Object.fromEntries(buildLabelManifest().map((d) => [d.key, d.default]));

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
  const [labels, setLabels] = useState({});

  const reloadStates = useCallback(() => api.get('/workflow').then((r) => setStates(r.data)).catch(() => {}), []);
  const reloadTheme = useCallback(() => api.get('/settings/theme').then((t) => { setTheme(t); applyTheme(t); }).catch(() => {}), []);
  const reloadLabels = useCallback(() => api.get('/settings/labels').then((l) => setLabels(l || {})).catch(() => {}), []);

  useEffect(() => { reloadStates(); reloadTheme(); reloadLabels(); }, [reloadStates, reloadTheme, reloadLabels]);

  const byCode = useCallback((code) => states.find((s) => s.code === code) || { name: code, color: '#64748b' }, [states]);
  // Tra nhãn hiển thị tuỳ chỉnh: ưu tiên bảng settings.ui_labels -> fallback truyền vào -> manifest mặc định -> chính key.
  const L = useCallback((key, fallback) => {
    const v = labels[key];
    if (v != null && v !== '') return v;
    return fallback ?? LABEL_DEFAULTS[key] ?? key;
  }, [labels]);

  return (
    <MetaCtx.Provider value={{ states, byCode, theme, setTheme, applyTheme, reloadStates, reloadTheme, labels, setLabels, reloadLabels, L }}>
      {children}
    </MetaCtx.Provider>
  );
}

export const useMeta = () => useContext(MetaCtx);
