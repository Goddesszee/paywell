/**
 * useNanTheme — reactive color palette for dark/light mode.
 * Updated palette aligns with nan-theme.css v5.0:
 *   - Slightly softer text (#EDF0F7 vs #F5F7FB) — less harsh contrast
 *   - Muted secondary text (#8C94A6) — cleaner hierarchy
 *   - Deeper tertiary text (#4E5567) — clear visual quiet
 *   - Tighter border opacities (0.06 / 0.10) — less visual noise
 *   - Same brand blue #0866F5 — unchanged
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

// dark palette — v5.0
const DARK: NanTheme = {
  bg:      '#0B0D12',
  surf:    '#151820',
  surf2:   '#1A1E27',
  surf3:   '#20242E',
  bdr:     'rgba(255,255,255,0.06)',
  bdr2:    'rgba(255,255,255,0.10)',
  text:    '#EDF0F7',
  t2:      '#8C94A6',
  t3:      '#4E5567',
  blue:    '#0866F5',
  blueDim: 'rgba(8,102,245,0.10)',
  blueBd:  'rgba(8,102,245,0.22)',
  green:   '#10B981',
  red:     '#EF4444',
  gold:    '#F59E0B',
  isDark:  true,
}

// light palette — v5.0
const LIGHT: NanTheme = {
  bg:      '#F3F5FA',
  surf:    '#FFFFFF',
  surf2:   '#EEF1F7',
  surf3:   '#E4E8F2',
  bdr:     'rgba(0,0,0,0.07)',
  bdr2:    'rgba(0,0,0,0.12)',
  text:    '#090C17',
  t2:      '#444B62',
  t3:      '#7D849A',
  blue:    '#0866F5',
  blueDim: 'rgba(8,102,245,0.07)',
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
