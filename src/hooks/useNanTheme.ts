/**
 * useNanTheme — returns a reactive color palette that flips between
 * dark and light mode by reading the CSS custom properties set on
 * <html data-theme="dark|light">.
 *
 * Every component that previously hard-coded hex strings should import
 * this hook and destructure what it needs. When the user toggles the
 * theme in Settings the store calls setTheme(), which updates
 * data-theme on <html>, which triggers a re-render here, which
 * propagates the new values down.
 */
import { useSyncExternalStore } from 'react'


export interface NanTheme {
  bg:      string
  surf:    string
  surf2:   string
  surf3:   string
  bdr:     string
  bdr2:    string
  text:    string
  t2:      string
  t3:      string
  blue:    string
  blueDim: string
  blueBd:  string
  green:   string
  red:     string
  gold:    string
  isDark:  boolean
}

// dark palette
const DARK: NanTheme = {
  bg:      '#0B0D12',
  surf:    '#171A21',
  surf2:   '#1D2029',
  surf3:   '#232731',
  bdr:     'rgba(255,255,255,0.07)',
  bdr2:    'rgba(255,255,255,0.12)',
  text:    '#F5F7FB',
  t2:      '#A0A7B5',
  t3:      '#5A6175',
  blue:    '#0866F5',
  blueDim: 'rgba(8,102,245,0.12)',
  blueBd:  'rgba(8,102,245,0.24)',
  green:   '#10B981',
  red:     '#EF4444',
  gold:    '#F59E0B',
  isDark:  true,
}

// light palette
const LIGHT: NanTheme = {
  bg:      '#F4F6FA',
  surf:    '#FFFFFF',
  surf2:   '#EEF1F7',
  surf3:   '#E5E9F2',
  bdr:     'rgba(0,0,0,0.07)',
  bdr2:    'rgba(0,0,0,0.13)',
  text:    '#0A0C14',
  t2:      '#4A5068',
  t3:      '#8A8FA8',
  blue:    '#0866F5',
  blueDim: 'rgba(8,102,245,0.08)',
  blueBd:  'rgba(8,102,245,0.18)',
  green:   '#059669',
  red:     '#DC2626',
  gold:    '#D97706',
  isDark:  false,
}

// subscribe to data-theme mutations on <html>
let listeners: Array<() => void> = []
if (typeof document !== 'undefined') {
  const obs = new MutationObserver(() => listeners.forEach(l => l()))
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
}

function subscribe(cb: () => void) {
  listeners.push(cb)
  return () => { listeners = listeners.filter(l => l !== cb) }
}

function getSnapshot() {
  return typeof document !== 'undefined'
    ? document.documentElement.getAttribute('data-theme') ?? 'dark'
    : 'dark'
}

export function useNanTheme(): NanTheme {
  const raw = useSyncExternalStore(subscribe, getSnapshot, () => 'dark')
  return raw === 'light' ? LIGHT : DARK
}
