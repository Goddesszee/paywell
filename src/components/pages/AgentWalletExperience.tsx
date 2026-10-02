/**
 * AgentWalletExperience.tsx
 *
 * Full mobile Agent Wallet onboarding + dashboard flow.
 *
 * Screens (controlled by local `screen` state):
 *   'detect'   → silently checks wallet status, then routes
 *   'edu'      → educational intro (first-time only)
 *   'setup'    → creation confirmation
 *   'creating' → animated loading state
 *   'success'  → wallet created celebration + address
 *   'dashboard'→ existing wallet: balance, spend log, fund guide
 *   'error'    → creation failed
 *
 * No developer terminology is surfaced to the user.
 * The existing NAN dark theme, blue accent, and rounded-card language are preserved.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  ArrowLeft, Wallet, Shield, Zap, BarChart3,
  Copy, Check, ChevronDown, ChevronRight,
  RefreshCw, AlertTriangle, Coins, Clock,
  CheckCircle, Wifi,
} from 'lucide-react'
import { useAppStore, AgentSpendEntry } from '../../store/appStore'
import { useNanTheme } from '../../hooks/useNanTheme'

// ── design tokens (match NAN palette) ─────────────────────────────────────────

const F    = "'Inter', -apple-system, sans-serif"
const MONO = "'JetBrains Mono', 'SF Mono', Menlo, monospace"
const BLUE = '#0066FF'
const GREEN = '#00C853'
const AMBER = '#FF9500'
const RED   = '#FF3B3B'

type Screen = 'detect' | 'edu' | 'setup' | 'creating' | 'success' | 'dashboard' | 'error'

// ── creation steps shown during the loading screen ───────────────────────────

const CREATION_STEPS = [
  'Setting up wallet',
  'Connecting wallet infrastructure',
  'Finalizing your wallet',
]

// ── helpers ───────────────────────────────────────────────────────────────────

function shortenAddress(addr: string) {
  if (!addr || addr.length < 12) return addr
  return `${addr.slice(0, 6)}••••••••••••${addr.slice(-4)}`
}

// ── sub-components ────────────────────────────────────────────────────────────

function BackButton({ onBack, C }: { onBack: () => void; C: ReturnType<typeof useNanTheme> }) {
  return (
    <button
      onClick={onBack}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        background: 'none', border: 'none', cursor: 'pointer',
        padding: '4px 0', marginBottom: 20, fontFamily: F,
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <ArrowLeft size={18} color={C.t2} strokeWidth={2} />
      <span style={{ fontSize: 14, color: C.t2, fontWeight: 500 }}>Back</span>
    </button>
  )
}

// ── Wallet illustration SVG ───────────────────────────────────────────────────

function WalletIllustration({ size = 80 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none" aria-hidden="true">
      {/* outer circle */}
      <circle cx="40" cy="40" r="40" fill="rgba(0,102,255,0.10)" />
      {/* wallet body */}
      <rect x="16" y="26" width="48" height="32" rx="8" fill="rgba(0,102,255,0.22)" stroke={BLUE} strokeWidth="1.5" />
      {/* wallet flap */}
      <rect x="16" y="26" width="48" height="12" rx="8" fill="rgba(0,102,255,0.35)" />
      {/* coin slot */}
      <rect x="44" y="38" width="14" height="8" rx="4" fill={BLUE} opacity="0.85" />
      {/* AI spark */}
      <circle cx="58" cy="24" r="9" fill="rgba(0,102,255,0.15)" />
      <path
        d="M58 19 L59.2 22.8 L63 24 L59.2 25.2 L58 29 L56.8 25.2 L53 24 L56.8 22.8 Z"
        fill={BLUE}
        opacity="0.9"
      />
    </svg>
  )
}

// ── feature card ──────────────────────────────────────────────────────────────

function FeatureCard({
  Icon, title, body, C,
}: {
  Icon: React.ElementType; title: string; body: string
  C: ReturnType<typeof useNanTheme>
}) {
  return (
    <div style={{
      display: 'flex', gap: 12, padding: '14px 16px',
      background: C.surf, border: `1px solid ${C.bdr}`,
      borderRadius: 16,
    }}>
      <div style={{
        width: 38, height: 38, borderRadius: 11, flexShrink: 0,
        background: 'rgba(0,102,255,0.10)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={17} color={BLUE} strokeWidth={1.8} />
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 3 }}>{title}</div>
        <div style={{ fontSize: 12, color: C.t2, lineHeight: 1.5 }}>{body}</div>
      </div>
    </div>
  )
}

// ── primary CTA button ────────────────────────────────────────────────────────

function PrimaryBtn({
  label, onClick, disabled, loading, C,
}: {
  label: string; onClick: () => void; disabled?: boolean; loading?: boolean
  C: ReturnType<typeof useNanTheme>
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        width: '100%', height: 54,
        background: disabled || loading ? 'rgba(0,102,255,0.45)' : BLUE,
        border: 'none', borderRadius: 16,
        fontSize: 15, fontWeight: 700, color: '#fff',
        fontFamily: F, cursor: disabled || loading ? 'not-allowed' : 'pointer',
        boxShadow: disabled || loading ? 'none' : '0 6px 22px rgba(0,102,255,0.40)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        WebkitTapHighlightColor: 'transparent',
        transition: 'opacity 0.2s',
      }}
    >
      {loading && (
        <svg width="18" height="18" viewBox="0 0 18 18" style={{ animation: 'aw-spin 0.9s linear infinite' }}>
          <circle cx="9" cy="9" r="7" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2" />
          <path d="M9 2 A7 7 0 0 1 16 9" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )}
      {label}
    </button>
  )
}

// ── config row ────────────────────────────────────────────────────────────────

function ConfigRow({ label, value, C }: { label: string; value: string; C: ReturnType<typeof useNanTheme> }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '11px 0',
      borderBottom: `1px solid ${C.bdr}`,
    }}>
      <span style={{ fontSize: 13, color: C.t2 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{value}</span>
    </div>
  )
}

// ── spend log row ─────────────────────────────────────────────────────────────

function SpendRow({ entry, last, C }: {
  entry: AgentSpendEntry; last: boolean
  C: ReturnType<typeof useNanTheme>
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 0',
      borderBottom: last ? 'none' : `1px solid ${C.bdr}`,
    }}>
      <div style={{
        width: 30, height: 30, borderRadius: 9, flexShrink: 0,
        background: 'rgba(0,102,255,0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Coins size={13} color={BLUE} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {entry.service_name}
        </div>
        <div style={{ fontSize: 11, color: C.t3, marginTop: 1 }}>
          {new Date(entry.timestamp).toLocaleString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: BLUE, fontFamily: MONO }}>
          -{entry.amount_usdc.toFixed(4)}
        </div>
        <div style={{ fontSize: 10, color: entry.paid ? GREEN : AMBER, marginTop: 1 }}>
          {entry.paid ? 'settled' : 'pending'}
        </div>
      </div>
    </div>
  )
}

// ── SCREEN: Educational intro ─────────────────────────────────────────────────

function EduScreen({ onSetup, C }: {
  onSetup: () => void
  C: ReturnType<typeof useNanTheme>
}) {
  return (
    <div style={{ fontFamily: F }}>
      {/* hero */}
      <div style={{ textAlign: 'center', marginBottom: 28, paddingTop: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
          <WalletIllustration size={88} />
        </div>
        <h1 style={{
          fontSize: 26, fontWeight: 800, color: C.text,
          letterSpacing: '-0.03em', margin: '0 0 10px',
          fontFamily: "'Inter', -apple-system, sans-serif",
        }}>
          Your Agent Wallet
        </h1>
        <p style={{ fontSize: 14, color: C.t2, lineHeight: 1.6, margin: '0 auto', maxWidth: 320 }}>
          A dedicated wallet your NAN Agent can use to make payments on your behalf.
        </p>
      </div>

      {/* feature cards */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
          What can you do with an Agent Wallet?
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <FeatureCard Icon={Zap}      title="Pay for Services"      body="Let your agent pay for approved services using USDC." C={C} />
          <FeatureCard Icon={Clock}    title="Automate Payments"     body="Allow your agent to make authorized payments without manually approving every transaction." C={C} />
          <FeatureCard Icon={Shield}   title="Set Spending Limits"   body="Control how much your agent can spend." C={C} />
          <FeatureCard Icon={BarChart3} title="Track Every Payment"  body="See exactly what your agent paid for, when it happened, and how much was spent." C={C} />
        </div>
      </div>

      {/* security reassurance */}
      <div style={{
        background: 'rgba(0,200,83,0.06)',
        border: '1px solid rgba(0,200,83,0.2)',
        borderRadius: 16, padding: '16px 18px',
        marginBottom: 24,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Shield size={16} color={GREEN} strokeWidth={2} />
          <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Your money stays under your control</span>
        </div>
        <p style={{ fontSize: 12, color: C.t2, lineHeight: 1.6, margin: 0 }}>
          Your Agent Wallet is separate from your main NAN balance. You decide how much money to provide and what your agent is allowed to spend.
        </p>
      </div>

      {/* CTAs */}
      <PrimaryBtn label="Set Up Agent Wallet" onClick={onSetup} C={C} />
      <button
        style={{
          width: '100%', marginTop: 14, background: 'none', border: 'none',
          fontSize: 14, color: C.t2, fontFamily: F, cursor: 'pointer',
          padding: '8px 0', WebkitTapHighlightColor: 'transparent',
        }}
        onClick={() => window.open('https://developers.circle.com/agent-stack.md', '_blank')}
      >
        Learn more
      </button>
    </div>
  )
}

// ── SCREEN: Setup confirmation ────────────────────────────────────────────────

function SetupScreen({ onCreate, C }: {
  onCreate: () => void
  C: ReturnType<typeof useNanTheme>
}) {
  return (
    <div style={{ fontFamily: F }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: '-0.02em', marginBottom: 8, margin: '0 0 8px' }}>
          Create your Agent Wallet
        </h1>
        <p style={{ fontSize: 13, color: C.t2, lineHeight: 1.6, margin: 0 }}>
          NAN will create a dedicated wallet for your AI agent. You can fund it later and control its spending permissions.
        </p>
      </div>

      {/* config table */}
      <div style={{
        background: C.surf, border: `1px solid ${C.bdr}`,
        borderRadius: 18, padding: '4px 18px',
        marginBottom: 20,
      }}>
        <ConfigRow label="Wallet type"     value="Agent Wallet"                              C={C} />
        <ConfigRow label="Currency"        value="USDC"                                      C={C} />
        <ConfigRow label="Network"         value="Arc"                                       C={C} />
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 0' }}>
          <span style={{ fontSize: 13, color: C.t2 }}>Wallet security</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.text, maxWidth: 190, textAlign: 'right', lineHeight: 1.4 }}>
            Protected by NAN's configured wallet infrastructure
          </span>
        </div>
      </div>

      {/* separation note */}
      <div style={{
        background: 'rgba(0,102,255,0.06)',
        border: '1px solid rgba(0,102,255,0.18)',
        borderRadius: 14, padding: '14px 16px',
        marginBottom: 28,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <Wallet size={16} color={BLUE} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 4 }}>
              Your main NAN wallet remains separate.
            </div>
            <div style={{ fontSize: 12, color: C.t2, lineHeight: 1.5 }}>
              Your Agent Wallet cannot automatically spend from your main NAN balance. You choose when and how much to fund it.
            </div>
          </div>
        </div>
      </div>

      <PrimaryBtn label="Create Agent Wallet" onClick={onCreate} C={C} />
    </div>
  )
}

// ── SCREEN: Creating (animated progress) ─────────────────────────────────────

function CreatingScreen({ C }: { C: ReturnType<typeof useNanTheme> }) {
  const [step, setStep] = useState(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let current = 0
    const advance = () => {
      current += 1
      if (current < CREATION_STEPS.length) {
        setStep(current)
        timer.current = setTimeout(advance, 900)
      }
    }
    timer.current = setTimeout(advance, 900)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [])

  return (
    <div style={{ fontFamily: F, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 32 }}>
      {/* pulsing wallet */}
      <div style={{
        width: 88, height: 88, borderRadius: 28, background: 'rgba(0,102,255,0.12)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 28,
        animation: 'aw-pulse 1.6s ease-in-out infinite',
      }}>
        <Wallet size={38} color={BLUE} strokeWidth={1.5} />
      </div>

      <h2 style={{ fontSize: 20, fontWeight: 800, color: C.text, letterSpacing: '-0.02em', marginBottom: 6, textAlign: 'center' }}>
        Creating your Agent Wallet…
      </h2>
      <p style={{ fontSize: 13, color: C.t2, marginBottom: 32, textAlign: 'center', margin: '0 0 32px' }}>
        This only takes a moment.
      </p>

      {/* step list */}
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {CREATION_STEPS.map((label, i) => {
          const done    = i < step
          const current = i === step
          return (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 9, flexShrink: 0,
                background: done
                  ? 'rgba(0,200,83,0.12)'
                  : current
                    ? 'rgba(0,102,255,0.12)'
                    : C.surf2,
                border: `1.5px solid ${done ? GREEN : current ? BLUE : C.bdr}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.3s',
              }}>
                {done
                  ? <Check size={13} color={GREEN} strokeWidth={2.5} />
                  : current
                    ? (
                      <svg width="14" height="14" viewBox="0 0 14 14" style={{ animation: 'aw-spin 0.9s linear infinite' }}>
                        <circle cx="7" cy="7" r="5" fill="none" stroke="rgba(0,102,255,0.25)" strokeWidth="2" />
                        <path d="M7 2 A5 5 0 0 1 12 7" fill="none" stroke={BLUE} strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    )
                    : <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.t3 }} />
                }
              </div>
              <span style={{
                fontSize: 13, fontWeight: done ? 600 : current ? 700 : 500,
                color: done ? C.t2 : current ? C.text : C.t3,
                transition: 'color 0.3s',
              }}>
                {label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── SCREEN: Success ───────────────────────────────────────────────────────────

function SuccessScreen({
  address, walletId, onDashboard, C,
}: {
  address: string; walletId?: string; onDashboard: () => void
  C: ReturnType<typeof useNanTheme>
}) {
  const [copied, setCopied] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)

  const copyAddress = () => {
    navigator.clipboard.writeText(address).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ fontFamily: F }}>
      {/* success badge */}
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{
          width: 68, height: 68, borderRadius: 22, margin: '0 auto 16px',
          background: 'rgba(0,200,83,0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '2px solid rgba(0,200,83,0.3)',
        }}>
          <CheckCircle size={32} color={GREEN} strokeWidth={1.8} />
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: '-0.02em', margin: '0 0 8px' }}>
          Your Agent Wallet is ready
        </h1>
        <p style={{ fontSize: 13, color: C.t2, margin: 0 }}>
          Your NAN Agent now has a dedicated wallet.
        </p>
      </div>

      {/* wallet card */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(0,102,255,0.18) 0%, rgba(0,102,255,0.06) 100%)',
        border: '1px solid rgba(0,102,255,0.28)',
        borderRadius: 22, padding: '20px 20px 16px',
        marginBottom: 20,
        position: 'relative', overflow: 'hidden',
      }}>
        {/* glow */}
        <div style={{
          position: 'absolute', top: -30, right: -30, width: 120, height: 120,
          borderRadius: '50%', background: 'rgba(0,102,255,0.15)', filter: 'blur(40px)',
          pointerEvents: 'none',
        }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>
              Agent Wallet
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#fff', fontFamily: MONO, letterSpacing: '-0.02em', lineHeight: 1 }}>
              0.00
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 3 }}>USDC · Available balance</div>
          </div>
          <div style={{
            background: 'rgba(0,200,83,0.15)', border: '1px solid rgba(0,200,83,0.3)',
            borderRadius: 8, padding: '4px 10px',
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: GREEN }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: GREEN }}>Active</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 14 }}>
          <div style={{
            flex: 1, background: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: '8px 12px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', fontFamily: MONO }}>
              {shortenAddress(address)}
            </span>
          </div>
          <button
            onClick={copyAddress}
            style={{
              width: 38, height: 38, borderRadius: 10, flexShrink: 0,
              background: 'rgba(255,255,255,0.12)', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              WebkitTapHighlightColor: 'transparent',
              transition: 'background 0.2s',
            }}
            aria-label="Copy address"
          >
            {copied ? <Check size={15} color={GREEN} /> : <Copy size={15} color="rgba(255,255,255,0.7)" />}
          </button>
        </div>

        <div style={{ display: 'flex', gap: 10, fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Wifi size={11} /> Arc
          </span>
          <span>USDC</span>
        </div>
      </div>

      {/* collapsible details */}
      <button
        onClick={() => setDetailsOpen(o => !o)}
        style={{
          width: '100%', background: C.surf, border: `1px solid ${C.bdr}`,
          borderRadius: 14, padding: '12px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          cursor: 'pointer', fontFamily: F, marginBottom: 20,
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Wallet details</span>
        {detailsOpen
          ? <ChevronDown size={16} color={C.t3} />
          : <ChevronRight size={16} color={C.t3} />}
      </button>

      {detailsOpen && (
        <div style={{
          background: C.surf, border: `1px solid ${C.bdr}`,
          borderRadius: 14, padding: '4px 16px',
          marginBottom: 20, marginTop: -16,
        }}>
          {[
            { label: 'Wallet address', value: address },
            { label: 'Wallet ID',      value: walletId ?? '—' },
            { label: 'Network',        value: 'Arc' },
            { label: 'Currency',       value: 'USDC' },
            { label: 'Created',        value: new Date().toLocaleDateString('en', { year: 'numeric', month: 'long', day: 'numeric' }) },
            { label: 'Infrastructure', value: 'Circle Agent Wallet' },
          ].map(({ label, value }) => (
            <div
              key={label}
              style={{
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'flex-start', gap: 12,
                padding: '10px 0',
                borderBottom: label === 'Infrastructure' ? 'none' : `1px solid ${C.bdr}`,
              }}
            >
              <span style={{ fontSize: 12, color: C.t2, flexShrink: 0 }}>{label}</span>
              <span style={{
                fontSize: 12, fontWeight: 600, color: C.text,
                textAlign: 'right', wordBreak: 'break-all',
                fontFamily: ['Wallet address', 'Wallet ID'].includes(label) ? MONO : F,
              }}>
                {value}
              </span>
            </div>
          ))}
        </div>
      )}

      <PrimaryBtn label="Go to Agent Wallet" onClick={onDashboard} C={C} />
    </div>
  )
}

// ── SCREEN: Error ─────────────────────────────────────────────────────────────

function ErrorScreen({ onRetry, C }: { onRetry: () => void; C: ReturnType<typeof useNanTheme> }) {
  const { setActiveView } = useAppStore()
  return (
    <div style={{ fontFamily: F, textAlign: 'center', paddingTop: 24 }}>
      <div style={{
        width: 68, height: 68, borderRadius: 22, margin: '0 auto 18px',
        background: 'rgba(255,59,59,0.10)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: '2px solid rgba(255,59,59,0.2)',
      }}>
        <AlertTriangle size={32} color={RED} strokeWidth={1.8} />
      </div>
      <h2 style={{ fontSize: 20, fontWeight: 800, color: C.text, letterSpacing: '-0.02em', marginBottom: 8 }}>
        We couldn't create your Agent Wallet
      </h2>
      <p style={{ fontSize: 13, color: C.t2, lineHeight: 1.6, marginBottom: 32, maxWidth: 300, margin: '0 auto 32px' }}>
        Something went wrong while setting up your wallet. Your main NAN balance has not been affected.
      </p>
      <PrimaryBtn label="Try Again" onClick={onRetry} C={C} />
      <button
        onClick={() => setActiveView('support')}
        style={{
          width: '100%', marginTop: 12, background: 'none',
          border: `1px solid ${C.bdr}`, borderRadius: 14,
          height: 48, fontSize: 14, fontWeight: 600,
          color: C.t2, fontFamily: F, cursor: 'pointer',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        Contact Support
      </button>
    </div>
  )
}

// ── SCREEN: Dashboard ─────────────────────────────────────────────────────────

function DashboardScreen({ C }: { C: ReturnType<typeof useNanTheme> }) {
  const { agentWallet, setAgentWallet, agentSpendLog, auth } = useAppStore()
  const [refreshing, setRefreshing] = useState(false)
  const [copied, setCopied] = useState(false)

  const totalSpent = agentSpendLog.reduce((s, e) => s + e.amount_usdc, 0)
  const balance    = parseFloat(agentWallet.balance_usdc || '0')

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const r  = await fetch('/api/agent-wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'status' }),
      })
      const d = await r.json() as {
        provisioned?: boolean; address?: string; walletId?: string; balance_usdc?: string
      }
      setAgentWallet({
        provisioned: d.provisioned ?? false,
        address: d.address,
        walletId: d.walletId,
        balance_usdc: d.balance_usdc ?? '0',
        lastRefreshed: new Date().toISOString(),
      })
    } catch { /* network error — keep stale state */ }
    setRefreshing(false)
  }, [setAgentWallet])

  // auto-refresh on first mount
  // eslint-disable-next-line react/set-state-in-effect
  useEffect(() => { void refresh() }, [refresh])

  const copyAddress = () => {
    if (!agentWallet.address) return
    navigator.clipboard.writeText(agentWallet.address).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ fontFamily: F, display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* balance card */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(0,102,255,0.18) 0%, rgba(0,102,255,0.06) 100%)',
        border: '1px solid rgba(0,102,255,0.28)',
        borderRadius: 22, padding: '20px 20px 16px',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', top: -30, right: -30, width: 120, height: 120,
          borderRadius: '50%', background: 'rgba(0,102,255,0.15)', filter: 'blur(40px)',
          pointerEvents: 'none',
        }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>
              Agent Wallet
            </div>
            <div style={{ fontSize: 32, fontWeight: 800, color: '#fff', fontFamily: MONO, letterSpacing: '-0.02em', lineHeight: 1 }}>
              {balance.toFixed(2)}
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 3 }}>USDC · Available balance</div>
          </div>
          <button
            onClick={() => void refresh()}
            style={{
              width: 34, height: 34, borderRadius: 10,
              background: 'rgba(255,255,255,0.1)', border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
            }}
            aria-label="Refresh balance"
          >
            <RefreshCw
              size={15}
              color="rgba(255,255,255,0.7)"
              style={{ animation: refreshing ? 'aw-spin 1s linear infinite' : 'none' }}
            />
          </button>
        </div>

        {/* status + address row */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{
            background: 'rgba(0,200,83,0.15)', border: '1px solid rgba(0,200,83,0.3)',
            borderRadius: 8, padding: '3px 10px',
            display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: GREEN }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: GREEN }}>Active</span>
          </div>
          <div style={{
            flex: 1, background: 'rgba(0,0,0,0.2)', borderRadius: 10,
            padding: '7px 10px', overflow: 'hidden',
          }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', fontFamily: MONO }}>
              {agentWallet.address ? shortenAddress(agentWallet.address) : '—'}
            </span>
          </div>
          <button
            onClick={copyAddress}
            style={{
              width: 34, height: 34, borderRadius: 10, flexShrink: 0,
              background: 'rgba(255,255,255,0.12)', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              WebkitTapHighlightColor: 'transparent',
            }}
            aria-label="Copy address"
          >
            {copied ? <Check size={14} color={GREEN} /> : <Copy size={14} color="rgba(255,255,255,0.7)" />}
          </button>
        </div>
      </div>

      {/* fund guide */}
      <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 16, padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Coins size={14} color={BLUE} />
          <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>How to fund your Agent Wallet</span>
        </div>
        <p style={{ fontSize: 12, color: C.t2, lineHeight: 1.6, margin: '0 0 10px' }}>
          Send USDC to the address above from your NAN wallet or any external wallet. The agent uses this as its spend budget — it never touches your main balance.
        </p>
        {auth?.walletAddress && (
          <div style={{ paddingTop: 10, borderTop: `1px solid ${C.bdr}`, fontSize: 12, color: C.t3 }}>
            From NAN Wallet → Send → paste Agent Wallet address
          </div>
        )}
      </div>

      {/* spend log */}
      <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 16, padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <BarChart3 size={14} color={C.t2} />
            <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Agent Payments</span>
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.text, fontFamily: MONO }}>
            {totalSpent.toFixed(4)} USDC
          </span>
        </div>

        {agentSpendLog.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: C.surf2, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px' }}>
              <Clock size={15} color={C.t3} />
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 3 }}>No payments yet</div>
            <div style={{ fontSize: 11, color: C.t3 }}>Agent payments appear here automatically</div>
          </div>
        ) : (
          <div>
            {agentSpendLog.slice(0, 20).map((e, i) => (
              <SpendRow
                key={e.id}
                entry={e}
                last={i === Math.min(agentSpendLog.length, 20) - 1}
                C={C}
              />
            ))}
          </div>
        )}
      </div>

    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function AgentWalletExperience() {
  const C = useNanTheme()
  const { agentWallet, setAgentWallet, setActiveView } = useAppStore()

  // Start by detecting wallet state, then route
  const [screen, setScreen] = useState<Screen>('detect')
  const [newAddress, setNewAddress] = useState('')
  const [newWalletId, setNewWalletId] = useState('')

  // On mount: check wallet status and route to correct screen.
  // setState in effect is intentional here — we need async API result to decide initial screen.
  /* eslint-disable react/set-state-in-effect */
  useEffect(() => {
    if (agentWallet.provisioned && agentWallet.address) {
      setScreen('dashboard')
      return
    }
    fetch('/api/agent-wallet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'status' }),
    })
      .then(r => r.json())
      .then((d: { provisioned?: boolean; address?: string; walletId?: string; balance_usdc?: string }) => {
        if (d.provisioned && d.address) {
          setAgentWallet({
            provisioned: true,
            address: d.address,
            walletId: d.walletId,
            balance_usdc: d.balance_usdc ?? '0',
            lastRefreshed: new Date().toISOString(),
          })
          setScreen('dashboard')
        } else {
          setScreen('edu')
        }
      })
      .catch(() => setScreen('edu'))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  /* eslint-enable react/set-state-in-effect */

  // Wallet creation
  const handleCreate = useCallback(async () => {
    setScreen('creating')
    try {
      // Minimum display time so the progress animation completes gracefully
      const [res] = await Promise.all([
        fetch('/api/agent-wallet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'provision' }),
        }),
        new Promise(r => setTimeout(r, 2800)), // let animation run
      ])
      const d = await (res).json() as {
        ok?: boolean; address?: string; walletId?: string; walletSetId?: string
        error?: string; setup_required?: boolean
      }

      if (d.ok && d.address) {
        setAgentWallet({ provisioned: true, address: d.address, walletId: d.walletId, balance_usdc: '0' })
        setNewAddress(d.address)
        setNewWalletId(d.walletId ?? '')
        setScreen('success')
      } else {
        // setup_required means Circle creds not configured on server — still show success
        // with a note; the wallet isn't actually created yet, route to error
        setScreen('error')
      }
    } catch {
      setScreen('error')
    }
  }, [setAgentWallet])

  // ── render ────────────────────────────────────────────────────────────────

  // During detection, show a minimal loader
  if (screen === 'detect') {
    return (
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 18px', fontFamily: F }}>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 320 }}>
          <svg width="28" height="28" viewBox="0 0 28 28" style={{ animation: 'aw-spin 0.9s linear infinite' }}>
            <circle cx="14" cy="14" r="11" fill="none" stroke="rgba(0,102,255,0.2)" strokeWidth="3" />
            <path d="M14 3 A11 11 0 0 1 25 14" fill="none" stroke={BLUE} strokeWidth="3" strokeLinecap="round" />
          </svg>
        </div>
      </div>
    )
  }

  const showBack = screen !== 'dashboard' && screen !== 'creating' && screen !== 'success'

  return (
    <>
      {/* keyframe animations injected once */}
      <style>{`
        @keyframes aw-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes aw-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(0,102,255,0.25); }
          50%       { box-shadow: 0 0 0 16px rgba(0,102,255,0); }
        }
      `}</style>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 18px', fontFamily: F }}>
        {/* header row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, paddingTop: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {showBack ? (
              <BackButton
                onBack={() => {
                  if (screen === 'setup')   setScreen('edu')
                  else                      setActiveView('home')
                }}
                C={C}
              />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 10,
                  background: 'rgba(0,102,255,0.12)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Wallet size={17} color={BLUE} strokeWidth={1.8} />
                </div>
                <span style={{ fontSize: 16, fontWeight: 800, color: C.text }}>Agent Wallet</span>
              </div>
            )}
          </div>
        </div>

        {screen === 'edu'       && <EduScreen      onSetup={() => setScreen('setup')} C={C} />}
        {screen === 'setup'     && <SetupScreen    onCreate={handleCreate}            C={C} />}
        {screen === 'creating'  && <CreatingScreen                                    C={C} />}
        {screen === 'success'   && (
          <SuccessScreen
            address={newAddress}
            walletId={newWalletId}
            onDashboard={() => setScreen('dashboard')}
            C={C}
          />
        )}
        {screen === 'dashboard' && <DashboardScreen C={C} />}
        {screen === 'error'     && <ErrorScreen onRetry={() => setScreen('setup')} C={C} />}
      </div>
    </>
  )
}
