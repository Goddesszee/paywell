/**
 * AgentWalletExperience.tsx
 *
 * Agent Wallet onboarding + dashboard.
 * Mirrors the exact Circle flow from CircleEmailLogin:
 *   1. Email → POST /api/wallet (action=request-otp) → Circle sends OTP
 *   2. sdk.updateConfigs(tokens) → sdk.verifyOtp() → Circle popup
 *   3. onLoginComplete(result) → initializeUser(result)
 *   4. POST /api/agent-wallet (action=provision) → returns challengeId
 *   5. sdk.setAuthentication() → sdk.execute(challengeId, cb) → PIN popup
 *   6. cb fires → fetch status → success screen → dashboard
 *
 * Only AgentWalletExperience.tsx and api/agent-wallet.ts are touched.
 * api/otp.ts, api/_redis.ts, and all main-app files are untouched.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { W3SSdk } from '@circle-fin/w3s-pw-web-sdk'
import {
  ArrowLeft, ArrowRight, ArrowLeftRight, ArrowUpDown, Repeat,
  Wallet, Shield, Zap, BarChart3,
  Copy, Check, ChevronDown, ChevronRight,
  RefreshCw, AlertTriangle, Coins, Clock,
  CheckCircle, Wifi, Mail, Loader, Sparkles, X as XIcon,
  Settings, Info,
} from 'lucide-react'
import { useAppStore, AgentSpendEntry } from '../../store/appStore'
import { useNanTheme } from '../../hooks/useNanTheme'
import { AgentServicesTab }   from './AgentServicesTab'
import { AgentRecurringTab } from './AgentRecurringTab'
import { AgentBridgeTab }    from './AgentBridgeTab'
import { AgentSwapTab }      from './AgentSwapTab'

// ── design tokens ─────────────────────────────────────────────────────────────

const F    = "'Inter', -apple-system, sans-serif"
const MONO = "'JetBrains Mono', 'SF Mono', Menlo, monospace"
const BLUE  = '#0066FF'
const GREEN = '#00C853'
const AMBER = '#FF9500'
const RED   = '#FF3B3B'

const CIRCLE_APP_ID = import.meta.env.VITE_CIRCLE_APP_ID as string | undefined

// Agent Wallet SDK — a SEPARATE module-level singleton from the main-app
// CircleEmailLogin SDK. The two must never share an instance: each W3SSdk
// constructor registers one onLoginComplete callback, and if they shared an
// instance the last-registered callback would fire for both OTP flows,
// causing the agent-wallet OTP to trigger the main-app login redirect.
//
// Naming convention: _agentSdk / _agentLoginCb to make the isolation obvious.
let _agentSdk: W3SSdk | null = null
let _agentLoginCb: ((err: unknown, result: unknown) => void) | null = null

function getOrCreateSdk(onLoginComplete: (err: unknown, result: unknown) => void): W3SSdk {
  // Always update the live callback so re-mounts get the fresh closure
  _agentLoginCb = onLoginComplete
  if (!_agentSdk) {
    _agentSdk = new W3SSdk(
      { appSettings: { appId: CIRCLE_APP_ID ?? 'pending-configuration' } },
      (err, result) => { _agentLoginCb?.(err, result) },
    )
  }
  return _agentSdk
}

type Screen =
  | 'detect' | 'email' | 'otp_sent' | 'verifying' | 'wallet_setup'
  | 'edu' | 'setup' | 'creating' | 'success' | 'dashboard' | 'error'

interface LoginResult { userToken: string; encryptionKey: string }
interface OtpTokens   { deviceToken: string; deviceEncryptionKey: string; otpToken: string }

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

function WalletIllustration({ size = 80 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none" aria-hidden="true">
      <circle cx="40" cy="40" r="40" fill="rgba(0,102,255,0.10)" />
      <rect x="16" y="26" width="48" height="32" rx="8" fill="rgba(0,102,255,0.22)" stroke={BLUE} strokeWidth="1.5" />
      <rect x="16" y="26" width="48" height="12" rx="8" fill="rgba(0,102,255,0.35)" />
      <rect x="44" y="38" width="14" height="8" rx="4" fill={BLUE} opacity="0.85" />
      <circle cx="58" cy="24" r="9" fill="rgba(0,102,255,0.15)" />
      <path d="M58 19 L59.2 22.8 L63 24 L59.2 25.2 L58 29 L56.8 25.2 L53 24 L56.8 22.8 Z" fill={BLUE} opacity="0.9" />
    </svg>
  )
}

function FeatureCard({ Icon, title, body, C }: {
  Icon: React.ElementType; title: string; body: string
  C: ReturnType<typeof useNanTheme>
}) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '14px 16px', background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 16 }}>
      <div style={{ width: 38, height: 38, borderRadius: 11, flexShrink: 0, background: 'rgba(0,102,255,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={17} color={BLUE} strokeWidth={1.8} />
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 3 }}>{title}</div>
        <div style={{ fontSize: 12, color: C.t2, lineHeight: 1.5 }}>{body}</div>
      </div>
    </div>
  )
}

function PrimaryBtn({ label, onClick, disabled, loading, C: _C }: {
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
        WebkitTapHighlightColor: 'transparent', transition: 'opacity 0.2s',
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

function ConfigRow({ label, value, C }: { label: string; value: string; C: ReturnType<typeof useNanTheme> }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0', borderBottom: `1px solid ${C.bdr}` }}>
      <span style={{ fontSize: 13, color: C.t2 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{value}</span>
    </div>
  )
}

function SpendRow({ entry, last, C }: { entry: AgentSpendEntry; last: boolean; C: ReturnType<typeof useNanTheme> }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: last ? 'none' : `1px solid ${C.bdr}` }}>
      <div style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0, background: 'rgba(0,102,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Coins size={13} color={BLUE} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.service_name}</div>
        <div style={{ fontSize: 11, color: C.t3, marginTop: 1 }}>{new Date(entry.timestamp).toLocaleString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: BLUE, fontFamily: MONO }}>-{entry.amount_usdc.toFixed(4)}</div>
        <div style={{ fontSize: 10, color: entry.paid ? GREEN : AMBER, marginTop: 1 }}>{entry.paid ? 'settled' : 'pending'}</div>
      </div>
    </div>
  )
}

// ── SCREEN: Email entry ───────────────────────────────────────────────────────

function EmailScreen({ onBack, onSend, C }: {
  onBack: () => void
  onSend: (email: string) => Promise<void>
  C: ReturnType<typeof useNanTheme>
}) {
  const [email, setEmail]     = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const submit = async () => {
    if (!email.trim()) return
    setLoading(true); setError('')
    try {
      await onSend(email.trim())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send code — please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ fontFamily: F }}>
      <BackButton onBack={onBack} C={C} />
      <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em', marginBottom: 6, color: C.text }}>
        Enter your email
      </h2>
      <p style={{ fontSize: 14, color: C.t2, marginBottom: 22, lineHeight: 1.55 }}>
        We'll send a verification code to set up your Agent Wallet.
      </p>

      <div style={{ position: 'relative', marginBottom: 12 }}>
        <Mail size={15} color={C.t3} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
        <input
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && void submit()}
          autoFocus
          style={{
            width: '100%', padding: '13px 16px 13px 40px',
            border: `1px solid ${C.bdr}`,
            borderRadius: 12, fontSize: 16, fontFamily: F,
            color: C.text, background: C.surf, outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {error && <p style={{ fontSize: 13, color: RED, marginBottom: 8, lineHeight: 1.5 }}>{error}</p>}

      <button
        onClick={() => void submit()}
        disabled={loading || !email.trim()}
        style={{
          width: '100%', padding: '13px 20px',
          background: loading || !email.trim() ? C.surf : BLUE,
          color: loading || !email.trim() ? C.t3 : '#fff',
          border: loading || !email.trim() ? `1px solid ${C.bdr}` : 'none',
          borderRadius: 12, fontSize: 15, fontWeight: 600,
          cursor: loading || !email.trim() ? 'not-allowed' : 'pointer',
          fontFamily: F, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          boxShadow: loading || !email.trim() ? 'none' : '0 4px 16px rgba(0,102,255,0.3)',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        {loading
          ? <><Loader size={15} style={{ animation: 'aw-spin 1s linear infinite' }} /> Sending…</>
          : <><ArrowRight size={15} /> Continue</>}
      </button>
    </div>
  )
}

// ── SCREEN: OTP sent ──────────────────────────────────────────────────────────

function OtpSentScreen({ email, onVerify, onResend, onChangeEmail, C }: {
  email: string
  onVerify: () => void
  onResend: () => Promise<void>
  onChangeEmail: () => void
  C: ReturnType<typeof useNanTheme>
}) {
  const [resending, setResending] = useState(false)

  const resend = async () => {
    setResending(true)
    try { await onResend() } finally { setResending(false) }
  }

  return (
    <div style={{ fontFamily: F }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em', marginBottom: 6, color: C.text }}>
        Check your inbox
      </h2>
      <p style={{ fontSize: 14, color: C.t2, marginBottom: 22, lineHeight: 1.55 }}>
        A verification code was sent to <strong style={{ color: C.text }}>{email}</strong>.<br />
        Tap the button below — a popup will open where you enter the code.
      </p>

      <div style={{ background: 'rgba(0,102,255,0.08)', border: '1px solid rgba(0,102,255,0.2)', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: BLUE, lineHeight: 1.5 }}>
        Code sent — check your inbox and spam folder.
      </div>

      <button
        onClick={onVerify}
        style={{ width: '100%', padding: '13px 20px', background: BLUE, color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: F, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 4px 16px rgba(0,102,255,0.3)', WebkitTapHighlightColor: 'transparent' }}
      >
        Enter verification code →
      </button>

      <button
        onClick={() => void resend()}
        disabled={resending}
        style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', color: C.t2, fontSize: 13, marginTop: 14, fontFamily: F, textDecoration: 'underline', WebkitTapHighlightColor: 'transparent' }}
      >
        {resending ? 'Resending…' : 'Resend code'}
      </button>

      <button
        onClick={onChangeEmail}
        style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', color: C.t3, fontSize: 12, marginTop: 8, fontFamily: F, WebkitTapHighlightColor: 'transparent' }}
      >
        ← Use a different email
      </button>
    </div>
  )
}

// ── SCREEN: Verifying / wallet setup spinner ──────────────────────────────────

function VerifyingScreen({ msg, C }: { msg: string; C: ReturnType<typeof useNanTheme> }) {
  return (
    <div style={{ fontFamily: F, textAlign: 'center', padding: '40px 0' }}>
      <Loader size={30} color={BLUE} style={{ animation: 'aw-spin 1s linear infinite', marginBottom: 18 }} />
      <p style={{ fontSize: 15, color: C.t2, lineHeight: 1.6 }}>{msg}</p>
    </div>
  )
}

// ── SCREEN: Educational intro ─────────────────────────────────────────────────

function EduScreen({ onSetup, C }: { onSetup: () => void; C: ReturnType<typeof useNanTheme> }) {
  return (
    <div style={{ fontFamily: F }}>
      <div style={{ textAlign: 'center', marginBottom: 28, paddingTop: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
          <WalletIllustration size={88} />
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: C.text, letterSpacing: '-0.03em', margin: '0 0 10px', fontFamily: F }}>
          Your Agent Wallet
        </h1>
        <p style={{ fontSize: 14, color: C.t2, lineHeight: 1.6, margin: '0 auto', maxWidth: 320 }}>
          A dedicated wallet your NAN Agent can use to make payments on your behalf.
        </p>
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
          What can you do with an Agent Wallet?
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <FeatureCard Icon={Zap}       title="Pay for Services"    body="Let your agent pay for approved services using USDC." C={C} />
          <FeatureCard Icon={Clock}     title="Automate Payments"   body="Allow your agent to make authorized payments without manually approving every transaction." C={C} />
          <FeatureCard Icon={Shield}    title="Set Spending Limits" body="Control how much your agent can spend." C={C} />
          <FeatureCard Icon={BarChart3} title="Track Every Payment" body="See exactly what your agent paid for, when it happened, and how much was spent." C={C} />
        </div>
      </div>

      <div style={{ background: 'rgba(0,200,83,0.06)', border: '1px solid rgba(0,200,83,0.2)', borderRadius: 16, padding: '16px 18px', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Shield size={16} color={GREEN} strokeWidth={2} />
          <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Your money stays under your control</span>
        </div>
        <p style={{ fontSize: 12, color: C.t2, lineHeight: 1.6, margin: 0 }}>
          Your Agent Wallet is separate from your main NAN balance. You decide how much money to provide and what your agent is allowed to spend.
        </p>
      </div>

      <PrimaryBtn label="Set Up Agent Wallet" onClick={onSetup} C={C} />
    </div>
  )
}

// ── SCREEN: Setup confirmation ────────────────────────────────────────────────

function SetupScreen({ onCreate, C }: { onCreate: () => void; C: ReturnType<typeof useNanTheme> }) {
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

      <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 18, padding: '4px 18px', marginBottom: 20 }}>
        <ConfigRow label="Wallet type" value="Agent Wallet" C={C} />
        <ConfigRow label="Currency"    value="USDC"         C={C} />
        <ConfigRow label="Network"     value="Arc"          C={C} />
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 0' }}>
          <span style={{ fontSize: 13, color: C.t2 }}>Wallet security</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.text, maxWidth: 190, textAlign: 'right', lineHeight: 1.4 }}>
            Protected by Circle wallet infrastructure
          </span>
        </div>
      </div>

      <div style={{ background: 'rgba(0,102,255,0.06)', border: '1px solid rgba(0,102,255,0.18)', borderRadius: 14, padding: '14px 16px', marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <Wallet size={16} color={BLUE} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 4 }}>Your main NAN wallet remains separate.</div>
            <div style={{ fontSize: 12, color: C.t2, lineHeight: 1.5 }}>Your Agent Wallet cannot automatically spend from your main NAN balance. You choose when and how much to fund it.</div>
          </div>
        </div>
      </div>

      <PrimaryBtn label="Create Agent Wallet" onClick={onCreate} C={C} />
    </div>
  )
}

// ── SCREEN: Creating (animated progress) ─────────────────────────────────────

function CreatingScreen({ C, statusMsg }: { C: ReturnType<typeof useNanTheme>; statusMsg?: string }) {
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
      <div style={{ width: 88, height: 88, borderRadius: 28, background: 'rgba(0,102,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 28, animation: 'aw-pulse 1.6s ease-in-out infinite' }}>
        <Wallet size={38} color={BLUE} strokeWidth={1.5} />
      </div>
      <h2 style={{ fontSize: 20, fontWeight: 800, color: C.text, letterSpacing: '-0.02em', marginBottom: 6, textAlign: 'center' }}>
        Creating your Agent Wallet…
      </h2>
      <p style={{ fontSize: 13, color: C.t2, marginBottom: 32, textAlign: 'center', margin: '0 0 32px' }}>
        {statusMsg || 'This only takes a moment.'}
      </p>
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {CREATION_STEPS.map((label, i) => {
          const done    = i < step
          const current = i === step
          return (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 9, flexShrink: 0,
                background: done ? 'rgba(0,200,83,0.12)' : current ? 'rgba(0,102,255,0.12)' : C.surf2,
                border: `1.5px solid ${done ? GREEN : current ? BLUE : C.bdr}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.3s',
              }}>
                {done
                  ? <Check size={13} color={GREEN} strokeWidth={2.5} />
                  : current
                    ? <svg width="14" height="14" viewBox="0 0 14 14" style={{ animation: 'aw-spin 0.9s linear infinite' }}><circle cx="7" cy="7" r="5" fill="none" stroke="rgba(0,102,255,0.25)" strokeWidth="2" /><path d="M7 2 A5 5 0 0 1 12 7" fill="none" stroke={BLUE} strokeWidth="2" strokeLinecap="round" /></svg>
                    : <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.t3 }} />}
              </div>
              <span style={{ fontSize: 13, fontWeight: done ? 600 : current ? 700 : 500, color: done ? C.t2 : current ? C.text : C.t3, transition: 'color 0.3s' }}>
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

function SuccessScreen({ address, walletId, onDashboard, C }: {
  address: string; walletId?: string; onDashboard: () => void
  C: ReturnType<typeof useNanTheme>
}) {
  const [copied, setCopied]           = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)

  const copyAddress = () => {
    navigator.clipboard.writeText(address).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ fontFamily: F }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ width: 68, height: 68, borderRadius: 22, margin: '0 auto 16px', background: 'rgba(0,200,83,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid rgba(0,200,83,0.3)' }}>
          <CheckCircle size={32} color={GREEN} strokeWidth={1.8} />
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: '-0.02em', margin: '0 0 8px' }}>
          Your Agent Wallet is ready
        </h1>
        <p style={{ fontSize: 13, color: C.t2, margin: 0 }}>Your NAN Agent now has a dedicated wallet.</p>
      </div>

      <div style={{ background: 'linear-gradient(135deg, rgba(0,102,255,0.18) 0%, rgba(0,102,255,0.06) 100%)', border: '1px solid rgba(0,102,255,0.28)', borderRadius: 22, padding: '20px 20px 16px', marginBottom: 20, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: '50%', background: 'rgba(0,102,255,0.15)', filter: 'blur(40px)', pointerEvents: 'none' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Agent Wallet</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#fff', fontFamily: MONO, letterSpacing: '-0.02em', lineHeight: 1 }}>0.00</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 3 }}>USDC · Available balance</div>
          </div>
          <div style={{ background: 'rgba(0,200,83,0.15)', border: '1px solid rgba(0,200,83,0.3)', borderRadius: 8, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: GREEN }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: GREEN }}>Active</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 14 }}>
          <div style={{ flex: 1, background: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: '8px 12px' }}>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', fontFamily: MONO }}>{shortenAddress(address)}</span>
          </div>
          <button onClick={copyAddress} style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, background: 'rgba(255,255,255,0.12)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', WebkitTapHighlightColor: 'transparent' }} aria-label="Copy address">
            {copied ? <Check size={15} color={GREEN} /> : <Copy size={15} color="rgba(255,255,255,0.7)" />}
          </button>
        </div>
        <div style={{ display: 'flex', gap: 10, fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Wifi size={11} /> Arc</span>
          <span>USDC</span>
        </div>
      </div>

      <button onClick={() => setDetailsOpen(o => !o)} style={{ width: '100%', background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 14, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', fontFamily: F, marginBottom: 20, WebkitTapHighlightColor: 'transparent' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Wallet details</span>
        {detailsOpen ? <ChevronDown size={16} color={C.t3} /> : <ChevronRight size={16} color={C.t3} />}
      </button>

      {detailsOpen && (
        <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 14, padding: '4px 16px', marginBottom: 20, marginTop: -16 }}>
          {[
            { label: 'Wallet address', value: address },
            { label: 'Wallet ID',      value: walletId ?? '—' },
            { label: 'Network',        value: 'Arc' },
            { label: 'Currency',       value: 'USDC' },
            { label: 'Created',        value: new Date().toLocaleDateString('en', { year: 'numeric', month: 'long', day: 'numeric' }) },
            { label: 'Infrastructure', value: 'Circle Agent Wallet' },
          ].map(({ label, value }) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, padding: '10px 0', borderBottom: label === 'Infrastructure' ? 'none' : `1px solid ${C.bdr}` }}>
              <span style={{ fontSize: 12, color: C.t2, flexShrink: 0 }}>{label}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: C.text, textAlign: 'right', wordBreak: 'break-all', fontFamily: ['Wallet address', 'Wallet ID'].includes(label) ? MONO : F }}>{value}</span>
            </div>
          ))}
        </div>
      )}

      <PrimaryBtn label="Go to Agent Wallet" onClick={onDashboard} C={C} />
    </div>
  )
}

// ── SCREEN: Error ─────────────────────────────────────────────────────────────

function ErrorScreen({ message, onRetry, C }: { message: string; onRetry: () => void; C: ReturnType<typeof useNanTheme> }) {
  const { setActiveView } = useAppStore()
  return (
    <div style={{ fontFamily: F, textAlign: 'center', paddingTop: 24 }}>
      <div style={{ width: 68, height: 68, borderRadius: 22, margin: '0 auto 18px', background: 'rgba(255,59,59,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid rgba(255,59,59,0.2)' }}>
        <AlertTriangle size={32} color={RED} strokeWidth={1.8} />
      </div>
      <h2 style={{ fontSize: 20, fontWeight: 800, color: C.text, letterSpacing: '-0.02em', marginBottom: 8 }}>
        Something went wrong
      </h2>
      <p style={{ fontSize: 13, color: C.t2, lineHeight: 1.6, marginBottom: 32, maxWidth: 300, margin: '0 auto 32px' }}>
        {message || 'Could not set up your Agent Wallet. Your main NAN balance has not been affected.'}
      </p>
      <PrimaryBtn label="Try Again" onClick={onRetry} C={C} />
      <button onClick={() => setActiveView('support')} style={{ width: '100%', marginTop: 12, background: 'none', border: `1px solid ${C.bdr}`, borderRadius: 14, height: 48, fontSize: 14, fontWeight: 600, color: C.t2, fontFamily: F, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>
        Contact Support
      </button>
    </div>
  )
}

// ── SCREEN: Dashboard ─────────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: '#50556A', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10, marginTop: 4 }}>
      {label}
    </div>
  )
}

function InfoRow({ label, value, mono, C }: { label: string; value: string; mono?: boolean; C: ReturnType<typeof useNanTheme> }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, padding: '10px 0', borderBottom: `1px solid ${C.bdr}` }}>
      <span style={{ fontSize: 12, color: C.t2, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: C.text, textAlign: 'right', wordBreak: 'break-all', fontFamily: mono ? MONO : F }}>{value}</span>
    </div>
  )
}

// status: 'enabled' | 'not_configured' | 'coming_soon'
function CapabilityRow({ label, status, note, C, noBorder }: {
  label: string
  status: 'enabled' | 'not_configured' | 'coming_soon'
  note?: string
  C: ReturnType<typeof useNanTheme>
  noBorder?: boolean
}) {
  const badge = status === 'enabled'
    ? { bg: 'rgba(0,200,83,0.10)', color: GREEN, border: 'rgba(0,200,83,0.25)', text: 'Enabled' }
    : status === 'not_configured'
    ? { bg: C.surf2, color: C.t3, border: C.bdr, text: 'Not configured in NAN' }
    : { bg: 'rgba(255,149,0,0.08)', color: AMBER, border: 'rgba(255,149,0,0.25)', text: 'Coming soon' }
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '9px 0', borderBottom: noBorder ? 'none' : `1px solid ${C.bdr}` }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 13, color: status === 'enabled' ? C.text : C.t3, fontWeight: status === 'enabled' ? 600 : 400 }}>{label}</span>
        {note && <div style={{ fontSize: 11, color: C.t3, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{note}</div>}
      </div>
      <div style={{
        fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6, whiteSpace: 'nowrap', flexShrink: 0,
        background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`,
      }}>
        {badge.text}
      </div>
    </div>
  )
}

// ── Manage Policy Modal ───────────────────────────────────────────────────────
// Reads live Circle on-chain policy via the backend CLI route.
// Setting policy requires `circle wallet limit set` (interactive OTP —
// mainnet only). We show the exact CLI command to copy/run, then re-read
// policy from Circle once the user confirms they ran it.

interface CirclePolicy {
  per_tx?: string | number
  daily?: string | number
  weekly?: string | number
  monthly?: string | number
  origin?: string
  [k: string]: unknown
}

function ManagePolicyModal({ onClose, C }: { onClose: () => void; C: ReturnType<typeof useNanTheme> }) {
  const { agentWallet } = useAppStore()

  const address   = agentWallet.address   ?? ''
  const blockchain = agentWallet.blockchain ?? ''
  // Circle policies: mainnet only. Testnet = ARC-TESTNET, etc.
  const isTestnet  = /testnet|sepolia|amoy|fuji|devnet/i.test(blockchain) || !blockchain
  const chainKey   = blockchain.replace(/-TESTNET|-SEPOLIA|-AMOY|-FUJI|-DEVNET/i, '').toUpperCase() || 'ARC'

  const [loading,    setLoading]    = useState(true)
  const [policy,     setPolicy]     = useState<CirclePolicy | null>(null)
  const [cliError,   setCliError]   = useState<string | null>(null)
  const [showCmd,    setShowCmd]    = useState(false)

  // Form fields for the "copy CLI command" helper
  const [perTx,    setPerTx]    = useState('100')
  const [daily,    setDaily]    = useState('500')
  const [weekly,   setWeekly]   = useState('2000')
  const [monthly,  setMonthly]  = useState('5000')
  const [cmdCopied, setCmdCopied] = useState(false)

  const validateForm = (): string[] => {
    const errs: string[] = []
    const tx = parseFloat(perTx) || 0
    const d  = parseFloat(daily) || 0
    const w  = parseFloat(weekly) || 0
    const m  = parseFloat(monthly) || 0
    if (tx <= 0) errs.push('Per-transaction limit must be greater than 0.')
    if (d <= 0)  errs.push('Daily limit must be greater than 0.')
    if (w <= 0)  errs.push('Weekly limit must be greater than 0.')
    if (m <= 0)  errs.push('Monthly limit must be greater than 0.')
    if (tx > d)  errs.push('Per-transaction cannot exceed daily.')
    if (d > w)   errs.push('Daily cannot exceed weekly.')
    if (w > m)   errs.push('Weekly cannot exceed monthly.')
    return errs
  }

  const abortRef = useRef<AbortController | null>(null)

  const fetchPolicy = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    if (!address) { setLoading(false); return }
    setLoading(true); setCliError(null)
    try {
      const r = await fetch('/api/agent-wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'policy-read', address, chain: chainKey }),
        signal: ctrl.signal,
      })
      if (ctrl.signal.aborted) return
      const d = await r.json() as {
        mainnet_only?: boolean; message?: string; ok?: boolean
        policy?: CirclePolicy; cli_error?: string
      }
      if (ctrl.signal.aborted) return
      if (d.mainnet_only) {
        setPolicy(null); setCliError(null)
      } else if (d.ok && d.policy) {
        setPolicy(d.policy)
      } else {
        setCliError(d.cli_error ?? 'Could not read policy from Circle.')
      }
    } catch (e) {
      if (!ctrl.signal.aborted) setCliError(e instanceof Error ? e.message : 'Network error')
    } finally {
      if (!ctrl.signal.aborted) setLoading(false)
    }
  }, [address, chainKey])

  const didMountRef = useRef(false)
  useEffect(() => {
    if (!didMountRef.current) { didMountRef.current = true; void fetchPolicy() }
    return () => { abortRef.current?.abort() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cliCmd = address
    ? `circle wallet limit set \\\n  --address ${address} \\\n  --chain ${chainKey} \\\n  --policy-type stablecoin \\\n  --per-tx ${perTx} \\\n  --daily ${daily} \\\n  --weekly ${weekly} \\\n  --monthly ${monthly}`
    : ''

  const copyCmd = () => {
    void navigator.clipboard.writeText(cliCmd)
    setCmdCopied(true)
    setTimeout(() => setCmdCopied(false), 2000)
  }

  const formErrors = showCmd ? validateForm() : []

  const policyRow = (label: string, value: string | number | undefined) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${C.bdr}` }}>
      <span style={{ fontSize: 12, color: C.t2 }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: value ? C.text : C.t3, fontFamily: MONO }}>
        {value ? `${value} USDC` : 'Not set (default)'}
      </span>
    </div>
  )

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ width: '100%', maxWidth: 520, background: C.bg, borderRadius: '22px 22px 0 0', padding: '24px 20px 40px', maxHeight: '92vh', overflowY: 'auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(0,102,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Shield size={17} color={BLUE} strokeWidth={1.8} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: C.text, letterSpacing: '-0.02em' }}>Agent Spending Policy</div>
              <div style={{ fontSize: 11, color: C.t3 }}>Source of truth: Circle Agent Wallet</div>
            </div>
          </div>
          <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 9, background: C.surf2, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', WebkitTapHighlightColor: 'transparent' }}>
            <XIcon size={15} color={C.t2} />
          </button>
        </div>

        {/* Mainnet-only gate */}
        {isTestnet && (
          <div style={{ background: 'rgba(255,149,0,0.06)', border: '1px solid rgba(255,149,0,0.22)', borderRadius: 14, padding: '14px 16px', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Info size={14} color={AMBER} />
              <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Custom spending policies require Mainnet</span>
            </div>
            <div style={{ fontSize: 12, color: C.t2, lineHeight: 1.6 }}>
              Your wallet is on <strong style={{ color: C.text }}>{blockchain || 'Arc Testnet'}</strong>.
              Circle on-chain spending policies (per-tx, daily, weekly, monthly limits and allowlists) are supported for mainnet agent wallets only.
              Move your agent wallet to a supported mainnet to configure Circle-enforced limits.
            </div>
            <div style={{ marginTop: 10, padding: '8px 12px', background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 10, fontSize: 11, color: C.t3 }}>
              Supported mainnet chains: ARC, BASE, ETH, MATIC, ARB, AVAX, OP, UNI
            </div>
          </div>
        )}

        {/* Live policy read */}
        {!isTestnet && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.t2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Current Circle Policy</span>
              <button
                onClick={() => void fetchPolicy()}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: BLUE, fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 7, WebkitTapHighlightColor: 'transparent' }}
              >
                <RefreshCw size={11} /> Refresh
              </button>
            </div>

            <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 16, padding: '0 16px', marginBottom: 16 }}>
              {loading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 0', color: C.t3, fontSize: 13 }}>
                  <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Reading from Circle...
                </div>
              ) : cliError ? (
                <div style={{ padding: '12px 0' }}>
                  <div style={{ fontSize: 12, color: RED, marginBottom: 6 }}>Could not read Circle policy:</div>
                  <div style={{ fontSize: 11, color: C.t3, fontFamily: MONO, wordBreak: 'break-all' }}>{cliError}</div>
                  <div style={{ fontSize: 11, color: C.t3, marginTop: 6 }}>
                    Make sure your Circle CLI session is active: <code style={{ fontFamily: MONO }}>circle login</code>
                  </div>
                </div>
              ) : policy ? (
                <>
                  {policyRow('Per transaction', policy.per_tx)}
                  {policyRow('Daily',  policy.daily)}
                  {policyRow('Weekly', policy.weekly)}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0' }}>
                    <span style={{ fontSize: 12, color: C.t2 }}>Monthly</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: policy.monthly ? C.text : C.t3, fontFamily: MONO }}>
                      {policy.monthly ? `${policy.monthly} USDC` : 'Not set (default)'}
                    </span>
                  </div>
                  {policy.origin && (
                    <div style={{ fontSize: 10, color: C.t3, paddingBottom: 10 }}>Origin: {String(policy.origin)}</div>
                  )}
                </>
              ) : (
                <div style={{ padding: '12px 0', fontSize: 12, color: C.t3 }}>No custom policy set. Circle code defaults apply.</div>
              )}
            </div>
          </>
        )}

        {/* Set Policy section — CLI command helper */}
        <div style={{ marginBottom: 12 }}>
          <button
            onClick={() => setShowCmd(v => !v)}
            style={{ width: '100%', height: 46, background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 14, fontSize: 13, fontWeight: 700, color: BLUE, fontFamily: F, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, WebkitTapHighlightColor: 'transparent' }}
          >
            <Settings size={14} color={BLUE} strokeWidth={2} />
            {showCmd ? 'Hide' : 'Set Policy (via Circle CLI)'}
            <ChevronDown size={13} color={BLUE} style={{ transform: showCmd ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
          </button>
        </div>

        {showCmd && (
          <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 16, padding: '16px', marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: C.t2, lineHeight: 1.6, marginBottom: 14 }}>
              Circle requires a <strong style={{ color: C.text }}>human OTP confirmation</strong> to set spending policies — for security, this cannot be done automatically.
              Enter your desired limits, copy the command, and run it in your terminal. Circle will send an OTP to your agent session email.
            </div>

            {/* Limit inputs */}
            {[
              { label: 'Per transaction (USDC)', hint: 'Max per single transfer or service call', val: perTx, set: setPerTx },
              { label: 'Daily (USDC)',            hint: 'Rolling 24-hour cap',                   val: daily, set: setDaily },
              { label: 'Weekly (USDC)',           hint: 'Rolling 7-day cap',                     val: weekly, set: setWeekly },
              { label: 'Monthly (USDC)',          hint: 'Rolling 30-day cap',                    val: monthly, set: setMonthly },
            ].map(({ label, hint, val, set }) => (
              <div key={label} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: C.t2, marginBottom: 4 }}>{label}</div>
                <input
                  type="number" min="0" step="0.01" value={val}
                  onChange={e => set(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', border: `1px solid ${C.bdr}`, borderRadius: 10, fontFamily: F, fontSize: 13, fontWeight: 600, color: C.text, background: C.surf2, outline: 'none', boxSizing: 'border-box' }}
                />
                <div style={{ fontSize: 10, color: C.t3, marginTop: 2 }}>{hint}</div>
              </div>
            ))}

            {formErrors.length > 0 && (
              <div style={{ background: 'rgba(255,59,59,0.07)', border: '1px solid rgba(255,59,59,0.22)', borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>
                {formErrors.map((e, i) => <div key={i} style={{ fontSize: 11, color: RED, lineHeight: 1.5 }}>• {e}</div>)}
              </div>
            )}

            <div style={{ fontSize: 11, color: C.t3, marginBottom: 8 }}>Rule: per-tx ≤ daily ≤ weekly ≤ monthly</div>

            {/* CLI command block */}
            <div style={{ background: C.surf2, border: `1px solid ${C.bdr}`, borderRadius: 12, padding: '12px 14px', marginBottom: 12, position: 'relative' }}>
              <pre style={{ margin: 0, fontSize: 11, color: C.text, fontFamily: MONO, whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.7 }}>{cliCmd}</pre>
            </div>

            <button
              onClick={formErrors.length === 0 ? copyCmd : undefined}
              disabled={formErrors.length > 0}
              style={{ width: '100%', height: 46, background: formErrors.length > 0 ? C.surf2 : BLUE, border: 'none', borderRadius: 12, fontSize: 13, fontWeight: 700, color: formErrors.length > 0 ? C.t3 : '#fff', fontFamily: F, cursor: formErrors.length > 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'background 0.15s', WebkitTapHighlightColor: 'transparent' }}
            >
              {cmdCopied ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy Command</>}
            </button>

            <div style={{ marginTop: 12, fontSize: 11, color: C.t3, lineHeight: 1.6 }}>
              After running the command and entering the OTP, click Refresh above to read the updated policy from Circle.
            </div>
          </div>
        )}

        {/* Source of truth note */}
        <div style={{ fontSize: 11, color: C.t3, lineHeight: 1.6, textAlign: 'center', padding: '0 4px' }}>
          Circle is the source of truth for all spending policy limits. Policy data is read directly from Circle — NAN never stores or simulates policy values.
        </div>
      </div>
    </div>
  )
}

type DashTab = 'overview' | 'recurring' | 'bridge' | 'swap' | 'services'

const DASH_TABS: { id: DashTab; label: string; Icon: React.ElementType }[] = [
  { id: 'overview',  label: 'Overview',  Icon: Wallet },
  { id: 'recurring', label: 'Recurring', Icon: Repeat },
  { id: 'bridge',    label: 'Bridge',    Icon: ArrowLeftRight },
  { id: 'swap',      label: 'Swap',      Icon: ArrowUpDown },
  { id: 'services',  label: 'Services',  Icon: Sparkles },
]

function DashboardScreen({ C, onDisconnect }: { C: ReturnType<typeof useNanTheme>; onDisconnect: () => void }) {
  const { agentWallet, setAgentWallet, agentSpendLog, auth } = useAppStore()
  const [dashTab, setDashTab]         = useState<DashTab>('overview')
  const [refreshing, setRefreshing]   = useState(false)
  const [copied, setCopied]           = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [policyOpen, setPolicyOpen]   = useState(false)

  const totalSpent = agentSpendLog.reduce((s, e) => s + e.amount_usdc, 0)
  const balance    = parseFloat(agentWallet.balance_usdc || '0')
  const isActive   = agentWallet.walletState === 'LIVE' || !agentWallet.walletState

  const refresh = useCallback(async () => {
    const userToken = agentWallet.userToken
    if (!userToken) { setRefreshing(false); return }
    setRefreshing(true)
    try {
      const r = await fetch('/api/agent-wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-token': userToken },
        body: JSON.stringify({ action: 'status', userToken }),
      })
      const d = await r.json() as {
        provisioned?: boolean; address?: string; walletId?: string; balance_usdc?: string
        blockchain?: string; accountType?: string; custodyType?: string; createDate?: string | null; walletState?: string
      }
      setAgentWallet({
        provisioned: d.provisioned ?? false,
        address: d.address, walletId: d.walletId,
        balance_usdc: d.balance_usdc ?? '0',
        lastRefreshed: new Date().toISOString(),
        blockchain: d.blockchain,
        accountType: d.accountType,
        custodyType: d.custodyType,
        createDate: d.createDate,
        walletState: d.walletState,
      })
    } catch { /* keep stale state */ }
    setRefreshing(false)
  }, [agentWallet.userToken, setAgentWallet])

  // Load balance on mount — deferred so it runs outside the render cycle
  const mountedRef = useRef(false)
  useEffect(() => {
    if (mountedRef.current) return
    mountedRef.current = true
    const t = setTimeout(() => { void refresh() }, 0)
    return () => clearTimeout(t)
  }, [refresh])

  const copyAddress = () => {
    if (!agentWallet.address) return
    navigator.clipboard.writeText(agentWallet.address).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Format blockchain name for display
  const chainLabel = agentWallet.blockchain
    ? agentWallet.blockchain.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    : 'Arc Testnet'

  // Format date
  const createdLabel = agentWallet.createDate
    ? new Date(agentWallet.createDate).toLocaleDateString('en', { year: 'numeric', month: 'short', day: 'numeric' })
    : '—'

  // Build a ThemeColors-compatible object from the NAN theme tokens
  const themeColors = {
    bg:    C.bg   ?? 'var(--nan-bg)',
    surf:  C.surf,
    surf2: C.surf2,
    bdr:   C.bdr,
    text:  C.text,
    t2:    C.t2,
    t3:    C.t3,
  }

  return (
    <div style={{ fontFamily: F, display: 'flex', flexDirection: 'column', gap: 6, width: '100%', maxWidth: '100%', boxSizing: 'border-box', overflowX: 'hidden' }}>

      {/* ── Tab bar: swipeable, never causes page overflow ──────────────────── */}
      <div style={{ display: 'flex', background: C.surf, borderRadius: 12, padding: 3, marginBottom: 8, gap: 2, overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        {DASH_TABS.map(t => {
          const active = dashTab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setDashTab(t.id)}
              style={{
                flexShrink: 0, padding: '8px 12px', border: 'none', borderRadius: 9,
                cursor: 'pointer', fontFamily: F, fontSize: 13, fontWeight: active ? 700 : 500,
                background: active ? BLUE : 'transparent',
                color: active ? '#fff' : C.t2,
                transition: 'all 0.15s', display: 'flex', alignItems: 'center',
                justifyContent: 'center', gap: 5, whiteSpace: 'nowrap',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <t.Icon size={13} color={active ? '#fff' : C.t3} strokeWidth={2} />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* ── Services tab ───────────────────────────────────────────────────── */}
      {dashTab === 'recurring' && <AgentRecurringTab C={themeColors} />}
      {dashTab === 'bridge'    && <AgentBridgeTab    C={themeColors} />}
      {dashTab === 'swap'      && <AgentSwapTab      C={themeColors} />}
      {dashTab === 'services'  && <AgentServicesTab  C={themeColors} />}

      {/* ── Overview tab ───────────────────────────────────────────────────── */}
      {dashTab === 'overview' && <>

      {/* ── Circle Agent Stack identity banner ─────────────────────────────── */}
      <div style={{ background: 'rgba(0,102,255,0.06)', border: '1px solid rgba(0,102,255,0.16)', borderRadius: 14, padding: '12px 16px', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: BLUE, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>
              NAN Agent Wallet
            </div>
            <div style={{ fontSize: 12, color: C.t2 }}>Powered by Circle Agent Stack</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: isActive ? GREEN : AMBER, boxShadow: isActive ? `0 0 6px ${GREEN}` : 'none' }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: isActive ? GREEN : AMBER }}>
              {isActive ? 'Connected' : 'Inactive'}
            </span>
          </div>
        </div>
      </div>

      {/* ── Balance card ───────────────────────────────────────────────────── */}
      <SectionLabel label="Overview" />
      <div style={{ background: 'linear-gradient(135deg, rgba(0,102,255,0.20) 0%, rgba(0,102,255,0.07) 100%)', border: '1px solid rgba(0,102,255,0.28)', borderRadius: 22, padding: '16px 16px 14px', position: 'relative', overflow: 'hidden', marginBottom: 8, width: '100%', boxSizing: 'border-box' }}>
        <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: '50%', background: 'rgba(0,102,255,0.15)', filter: 'blur(40px)', pointerEvents: 'none' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 8 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Available Balance</div>
            <div style={{ fontSize: 'clamp(24px, 7vw, 34px)', fontWeight: 800, color: '#fff', fontFamily: MONO, letterSpacing: '-0.02em', lineHeight: 1 }}>{balance.toFixed(2)}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>USDC · {chainLabel}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
            <div style={{ background: 'rgba(0,200,83,0.15)', border: '1px solid rgba(0,200,83,0.3)', borderRadius: 8, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: GREEN }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: GREEN }}>Active</span>
            </div>
            <button onClick={() => void refresh()} style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(255,255,255,0.08)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }} aria-label="Refresh">
              <RefreshCw size={13} color="rgba(255,255,255,0.6)" style={{ animation: refreshing ? 'aw-spin 1s linear infinite' : 'none' }} />
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ flex: 1, background: 'rgba(0,0,0,0.22)', borderRadius: 10, padding: '8px 12px', overflow: 'hidden' }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', fontFamily: MONO }}>{agentWallet.address ? shortenAddress(agentWallet.address) : '—'}</span>
          </div>
          <button onClick={copyAddress} style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: 'rgba(255,255,255,0.10)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', WebkitTapHighlightColor: 'transparent' }} aria-label="Copy address">
            {copied ? <Check size={14} color={GREEN} /> : <Copy size={14} color="rgba(255,255,255,0.65)" />}
          </button>
        </div>
        {agentWallet.lastRefreshed && (
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', marginTop: 10 }}>
            Updated {new Date(agentWallet.lastRefreshed).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
      </div>

      {/* ── Agent Spending Policy ──────────────────────────────────────────── */}
      <SectionLabel label="Agent Spending Policy" />
      <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 16, padding: '4px 16px', marginBottom: 8, width: '100%', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '10px 0', borderBottom: `1px solid ${C.bdr}` }}>
          <span style={{ fontSize: 12, color: C.t2, flexShrink: 0 }}>Status</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: isActive ? GREEN : AMBER, flexShrink: 0 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: isActive ? GREEN : AMBER, display: 'inline-block' }} />
            {isActive ? 'Active' : 'Inactive'}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '10px 0', borderBottom: `1px solid ${C.bdr}` }}>
          <span style={{ fontSize: 12, color: C.t2, flexShrink: 0 }}>Limits</span>
          <span style={{ fontSize: 12, color: C.t3, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>Tap Manage Policy</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '10px 0' }}>
          <span style={{ fontSize: 12, color: C.t2, flexShrink: 0 }}>Source</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: BLUE, flexShrink: 0 }}>Circle Agent Wallet</span>
        </div>
      </div>
      <button
        onClick={() => setPolicyOpen(true)}
        style={{
          width: '100%', height: 46, background: C.surf, border: `1px solid ${C.bdr}`,
          borderRadius: 14, fontSize: 13, fontWeight: 700, color: BLUE, fontFamily: F,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 8, marginBottom: 8, WebkitTapHighlightColor: 'transparent',
          transition: 'background 0.15s',
        }}
      >
        <Settings size={14} color={BLUE} strokeWidth={2} />
        Manage Spending Policy
      </button>
      <div style={{ background: 'rgba(0,102,255,0.05)', border: '1px solid rgba(0,102,255,0.14)', borderRadius: 12, padding: '11px 14px', marginBottom: 8, fontSize: 12, color: C.t2, lineHeight: 1.6 }}>
        Your Agent Wallet has a separate balance from your NAN Main Wallet. The NAN Agent can only spend funds available in its Agent Wallet according to its configured policy.
      </div>

      {/* ── What NAN Agent Can Do ───────────────────────────────────────────── */}
      <SectionLabel label="What NAN Agent Can Do" />
      <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 16, padding: '4px 16px', marginBottom: 8 }}>
        <CapabilityRow label="Hold USDC"    status="enabled"        C={C} />
        <CapabilityRow label="Receive USDC" status="enabled"        C={C} />
        <CapabilityRow label="Send USDC"    status="enabled"        note="To permitted addresses" C={C} />
        <CapabilityRow label="Agent Payments" status="enabled"      note="Pay for services on your behalf" C={C} />
        <CapabilityRow label="Bridge"                status="enabled"  note="Circle CCTP V2 · use Bridge tab" C={C} />
        <CapabilityRow label="Swap"                  status="enabled"  note="Circle / LiFi · use Swap tab" C={C} />
        <CapabilityRow label="Automated Recurring Pay" status="enabled" note="Scheduled from Agent Wallet · use Recurring tab" C={C} noBorder />
      </div>

      {/* Policy modal */}
      {policyOpen && <ManagePolicyModal onClose={() => setPolicyOpen(false)} C={C} />}

      {/* ── Agent Activity ─────────────────────────────────────────────────── */}
      <SectionLabel label="Agent Activity" />
      <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 16, padding: '14px 16px', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <BarChart3 size={14} color={C.t2} />
            <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Agent Payments</span>
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.text, fontFamily: MONO }}>{totalSpent.toFixed(4)} USDC</span>
        </div>
        {agentSpendLog.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: C.surf2, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px' }}>
              <Clock size={15} color={C.t3} />
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 3 }}>No activity yet</div>
            <div style={{ fontSize: 11, color: C.t3 }}>Agent payments appear here automatically</div>
          </div>
        ) : (
          agentSpendLog.slice(0, 20).map((e, i) => (
            <SpendRow key={e.id} entry={e} last={i === Math.min(agentSpendLog.length, 20) - 1} C={C} />
          ))
        )}
      </div>

      {/* ── Funding ────────────────────────────────────────────────────────── */}
      <SectionLabel label="Funding" />
      <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 16, padding: '14px 16px', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Coins size={14} color={BLUE} />
          <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>How to fund your Agent Wallet</span>
        </div>
        <p style={{ fontSize: 12, color: C.t2, lineHeight: 1.6, margin: '0 0 10px' }}>
          Send USDC to the Agent Wallet address. The agent uses this as its spend budget and never touches your main NAN Wallet balance.
        </p>
        {auth?.walletAddress && (
          <div style={{ paddingTop: 10, borderTop: `1px solid ${C.bdr}`, fontSize: 12, color: C.t3 }}>
            From NAN Wallet → Send → paste Agent Wallet address
          </div>
        )}
      </div>

      {/* ── Circle Agent Stack connection + wallet details ─────────────────── */}
      <SectionLabel label="Circle Agent Stack" />
      <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 16, padding: '14px 16px', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, paddingBottom: 12, borderBottom: `1px solid ${C.bdr}` }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: GREEN, boxShadow: `0 0 6px ${GREEN}` }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Connected</span>
          <span style={{ fontSize: 12, color: C.t3, marginLeft: 'auto' }}>Agent Wallet: Active</span>
        </div>
        <button
          onClick={() => setDetailsOpen(o => !o)}
          style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 0, fontFamily: F, WebkitTapHighlightColor: 'transparent' }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Wallet details</span>
          {detailsOpen ? <ChevronDown size={15} color={C.t3} /> : <ChevronRight size={15} color={C.t3} />}
        </button>
        {detailsOpen && (
          <div style={{ marginTop: 12 }}>
            <InfoRow label="Wallet address" value={agentWallet.address ?? '—'}  mono C={C} />
            <InfoRow label="Wallet ID"      value={agentWallet.walletId ?? '—'} mono C={C} />
            <InfoRow label="Network"        value={chainLabel}                        C={C} />
            <InfoRow label="Asset"          value="USDC"                              C={C} />
            <InfoRow label="Account type"   value={agentWallet.accountType ?? '—'}    C={C} />
            <InfoRow label="Wallet status"  value={agentWallet.walletState ?? 'LIVE'} C={C} />
            <InfoRow label="Infrastructure" value="Circle Agent Stack"                C={C} />
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0' }}>
              <span style={{ fontSize: 12, color: C.t2 }}>Created</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{createdLabel}</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Disconnect button ───────────────────────────────────────────── */}
      <button
        onClick={onDisconnect}
        style={{
          width: '100%', height: 44, background: 'none',
          border: `1px solid ${C.bdr}`, borderRadius: 14,
          fontSize: 13, fontWeight: 600, color: RED,
          fontFamily: F, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
          marginBottom: 8, WebkitTapHighlightColor: 'transparent',
        }}
      >
        <AlertTriangle size={14} color={RED} strokeWidth={2} />
        Disconnect Agent Wallet
      </button>
      <div style={{ fontSize: 11, color: C.t3, textAlign: 'center', marginBottom: 8 }}>
        Your wallet and funds remain safe. Reconnect any time by logging in again.
      </div>

      </> /* end overview tab */}

    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function AgentWalletExperience() {
  const C = useNanTheme()
  const { agentWallet, setAgentWallet, setActiveView } = useAppStore()

  const [screen, setScreen]         = useState<Screen>('detect')
  const [statusMsg, setStatusMsg]   = useState('')
  const [errorMsg, setErrorMsg]     = useState('')
  const [newAddress, setNewAddress] = useState('')
  const [newWalletId, setNewWalletId] = useState('')

  const emailRef    = useRef('')
  // loginRes is also persisted in sessionStorage so a screen re-mount (e.g.
  // navigating away then back during the edu→setup→create flow) does not wipe
  // the userToken and force the user to re-enter their email.
  const loginResRef = useRef<LoginResult | null>(
    (() => { try { const r = sessionStorage.getItem('aw_login_res'); return r ? (JSON.parse(r) as LoginResult) : null } catch { return null } })()
  )

  // ── fetch wallet address after SDK challenge complete ─────────────────────
  // Circle's wallet provisioning is async server-side — the wallet can take
  // 1-5 seconds to appear in listWallets after the PIN challenge completes.
  // We retry up to 10 times with 2s gaps (20s total) before giving up.
  const finishProvision = useCallback(async (loginRes: LoginResult) => {
    setScreen('creating')

    const MAX_ATTEMPTS = 10
    const DELAY_MS     = 2000

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const dots = '.'.repeat(attempt % 4)
      setStatusMsg(`Setting up your wallet${dots}`)

      try {
        const r = await fetch('/api/agent-wallet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-user-token': loginRes.userToken },
          body: JSON.stringify({ action: 'status', userToken: loginRes.userToken }),
        })
        const d = await r.json() as { provisioned?: boolean; address?: string; walletId?: string; error?: string }

        if (d.provisioned && d.address) {
          setAgentWallet({
            provisioned: true,
            address: d.address,
            walletId: d.walletId,
            balance_usdc: '0',
            lastRefreshed: new Date().toISOString(),
            userToken: loginRes.userToken,
          })
          setNewAddress(d.address)
          setNewWalletId(d.walletId ?? '')
          try { sessionStorage.removeItem('aw_login_res') } catch { /* ignore */ }
          setScreen('success')
          return
        }

        // Hard error from the server — no point retrying
        if (d.error && !d.error.toLowerCase().includes('not found')) {
          setErrorMsg(d.error)
          setScreen('error')
          return
        }
      } catch {
        // Network error — keep retrying
      }

      if (attempt < MAX_ATTEMPTS) {
        await new Promise(resolve => setTimeout(resolve, DELAY_MS))
      }
    }

    // All retries exhausted
    setErrorMsg('Your wallet is taking longer than expected. Please go back and try again — it may already be ready.')
    setScreen('error')
  }, [setAgentWallet])

  // ── provision: same pattern as CircleEmailLogin.initializeUser ────────────
  const handleProvision = useCallback(async () => {
    setScreen('wallet_setup')
    setStatusMsg('Setting up your Agent Wallet…')
    const loginRes = loginResRef.current
    if (!loginRes) { setErrorMsg('Session expired. Please start again.'); setScreen('error'); return }
    try {
      const res  = await fetch('/api/agent-wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'provision', userToken: loginRes.userToken }),
      })
      const data = await res.json() as { ok?: boolean; challengeId?: string; alreadyInitialized?: boolean; error?: string }

      // Existing user — just load wallets
      if (data.alreadyInitialized) {
        await finishProvision(loginRes)
        return
      }
      if (!data.ok || !data.challengeId) {
        // Check if the error text means "already initialized"
        if (data.error?.toLowerCase().includes('already') || data.error?.toLowerCase().includes('155106')) {
          await finishProvision(loginRes)
          return
        }
        throw new Error(data.error ?? 'Provisioning failed')
      }

      // New user — open Circle PIN setup popup (same as main app initializeUser)
      setStatusMsg('Complete wallet setup in the popup…')
      if (!_agentSdk) throw new Error('SDK not initialised')
      _agentSdk.setAuthentication({ userToken: loginRes.userToken, encryptionKey: loginRes.encryptionKey })
      _agentSdk.execute(data.challengeId, async (execErr) => {
        if (execErr) {
          const msg = execErr instanceof Error ? execErr.message : String(execErr)
          if (msg.toLowerCase().includes('already') || msg.toLowerCase().includes('155106')) {
            await finishProvision(loginRes)
            return
          }
          setErrorMsg('Wallet setup failed — please try again.')
          setScreen('error')
          return
        }
        await finishProvision(loginRes)
      })
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Setup error — please try again.')
      setScreen('error')
    }
  }, [finishProvision])

  // ── init SDK once per page load ───────────────────────────────────────────
  // getOrCreateSdk returns the module-level _agentSdk, creating it only on the
  // very first call. Re-mounts reuse the same instance so the OTP session
  // (set by verifyOtp()) is never lost.
  useEffect(() => {
    const onLoginComplete = (err: unknown, result: unknown) => {
      if (err) {
        const msg = err instanceof Error ? err.message : JSON.stringify(err)
        if (msg.toLowerCase().includes('already') || msg.toLowerCase().includes('155106')) {
          const res = result as LoginResult | undefined
          if (res?.userToken) {
            loginResRef.current = res
            try { sessionStorage.setItem('aw_login_res', JSON.stringify(res)) } catch { /* ignore */ }
            setTimeout(() => setScreen('edu'), 0)
            return
          }
        }
        setTimeout(() => {
          setErrorMsg('Verification failed — please check your code and try again.')
          setScreen('error')
        }, 0)
        return
      }
      const res = result as LoginResult
      loginResRef.current = res
      try { sessionStorage.setItem('aw_login_res', JSON.stringify(res)) } catch { /* ignore */ }
      setTimeout(() => setScreen('edu'), 0)
    }
    // Only creates the SDK if it doesn't exist yet
    getOrCreateSdk(onLoginComplete)
  }, [])

  // ── on mount: route to the right starting screen ─────────────────────────
  useEffect(() => {
    // Already provisioned in store — go straight to dashboard
    if (agentWallet.provisioned && agentWallet.address) {
      setScreen('dashboard')
      return
    }
    // OTP already verified this session (sessionStorage survived a re-mount) —
    // resume at edu so the user doesn't have to enter their email again
    if (loginResRef.current) {
      setScreen('edu')
      return
    }
    // Fresh start — enter email
    setScreen('email')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Step 1: send OTP (same as CircleEmailLogin.sendOtp) ───────────────────
  const handleSendOtp = useCallback(async (email: string) => {
    emailRef.current = email
    if (!_agentSdk) throw new Error('SDK not ready — please refresh.')
    const deviceId = await _agentSdk.getDeviceId()
    const res  = await fetch('/api/wallet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'request-otp', deviceId, email }),
    })
    const data = await res.json() as OtpTokens & { error?: string }
    if (data.error) throw new Error(data.error)
    _agentSdk.updateConfigs({
      appSettings: { appId: CIRCLE_APP_ID ?? 'pending-configuration' },
      loginConfigs: {
        deviceToken:         data.deviceToken,
        deviceEncryptionKey: data.deviceEncryptionKey,
        otpToken:            data.otpToken,
      },
    })
    setScreen('otp_sent')
  }, [])

  // ── Step 2: open Circle OTP popup ────────────────────────────────────────
  const handleVerify = useCallback(() => {
    setScreen('verifying')
    setStatusMsg('Waiting for verification…')
    _agentSdk?.verifyOtp()
  }, [])

  // ── render ────────────────────────────────────────────────────────────────

  if (screen === 'detect') {
    return (
      <div style={{ width: '100%', minHeight: '100%', padding: 0, fontFamily: F, boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 320 }}>
          <svg width="28" height="28" viewBox="0 0 28 28" style={{ animation: 'aw-spin 0.9s linear infinite' }}>
            <circle cx="14" cy="14" r="11" fill="none" stroke="rgba(0,102,255,0.2)" strokeWidth="3" />
            <path d="M14 3 A11 11 0 0 1 25 14" fill="none" stroke={BLUE} strokeWidth="3" strokeLinecap="round" />
          </svg>
        </div>
      </div>
    )
  }

  const showBack = !['dashboard', 'creating', 'success', 'email', 'otp_sent', 'verifying', 'wallet_setup'].includes(screen)

  return (
    <>
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

      <div style={{ width: '100%', minHeight: '100%', padding: 0, fontFamily: F, boxSizing: 'border-box', overflowX: 'hidden' }}>
        {/* header */}
        {showBack && (
          <BackButton onBack={() => { if (screen === 'setup') setScreen('edu'); else setActiveView('home') }} C={C} />
        )}
        {screen === 'dashboard' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, paddingTop: 4 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(0,102,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Wallet size={17} color={BLUE} strokeWidth={1.8} />
            </div>
            <span style={{ fontSize: 16, fontWeight: 800, color: C.text }}>Agent Wallet</span>
          </div>
        )}

        {screen === 'email'        && <EmailScreen      onBack={() => setActiveView('home')} onSend={handleSendOtp} C={C} />}
        {screen === 'otp_sent'     && <OtpSentScreen    email={emailRef.current} onVerify={handleVerify} onResend={() => handleSendOtp(emailRef.current)} onChangeEmail={() => setScreen('email')} C={C} />}
        {(screen === 'verifying' || screen === 'wallet_setup') && <VerifyingScreen msg={statusMsg || (screen === 'verifying' ? 'Waiting for verification…' : 'Setting up your wallet…')} C={C} />}
        {screen === 'edu'          && <EduScreen         onSetup={() => setScreen('setup')} C={C} />}
        {screen === 'setup'        && <SetupScreen       onCreate={() => { void handleProvision() }} C={C} />}
        {screen === 'creating'     && <CreatingScreen    C={C} statusMsg={statusMsg} />}
        {screen === 'success'      && <SuccessScreen     address={newAddress} walletId={newWalletId} onDashboard={() => setScreen('dashboard')} C={C} />}
        {screen === 'dashboard'    && <DashboardScreen   C={C} onDisconnect={() => {
          if (!window.confirm('Disconnect your Agent Wallet from this device? Your wallet and funds are safe — you can reconnect by logging in again.')) return
          setAgentWallet({ provisioned: false, address: undefined, walletId: undefined, balance_usdc: '0', userToken: undefined, lastRefreshed: undefined })
          try { sessionStorage.removeItem('aw_login_res') } catch { /* ignore */ }
          setScreen('email')
        }} />}
        {screen === 'error'        && <ErrorScreen       message={errorMsg} onRetry={() => { setErrorMsg(''); loginResRef.current = null; try { sessionStorage.removeItem('aw_login_res') } catch { /* ignore */ } setScreen('email') }} C={C} />}
      </div>
    </>
  )
}
