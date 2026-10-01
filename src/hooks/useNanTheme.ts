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
  bg:      '#08090B',
  surf:    '#111318',
  surf2:   '#181B22',
  surf3:   '#1E2230',
  bdr:     'rgba(255,255,255,0.07)',
  bdr2:    'rgba(255,255,255,0.12)',
  text:    '#F2F3F5',
  t2:      '#8A8F9E',
  t3:      '#50556A',
  blue:    '#0066FF',
  blueDim: 'rgba(0,102,255,0.12)',
  blueBd:  'rgba(0,102,255,0.22)',
  green:   '#00C853',
  red:     '#FF3B3B',
  gold:    '#F0A500',
  isDark:  true,
}

// light palette
const LIGHT: NanTheme = {
  bg:      '#F4F6FA',
  surf:    '#FFFFFF',
  surf2:   '#F0F2F7',
  surf3:   '#E8EBF2',
  bdr:     'rgba(0,0,0,0.07)',
  bdr2:    'rgba(0,0,0,0.13)',
  text:    '#0A0C14',
  t2:      '#4A5068',
  t3:      '#8A8FA8',
  blue:    '#0066FF',
  blueDim: 'rgba(0,102,255,0.08)',
  blueBd:  'rgba(0,102,255,0.18)',
  green:   '#00A844',
  red:     '#E53535',
  gold:    '#C87800',
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
