/**
 * Mobile Home Dashboard — NAN
 *
 * MOBILE ONLY. This component renders when activeView === 'home'.
 * On desktop, AppShell immediately redirects 'home' → 'dashboard',
 * so this file never needs desktop layout.
 *
 * Priority order (top → bottom):
 *   1. NAN Agent entry
 *   2. Agent Wallet summary (real store balance, no fabricated data)
 *   3. Quick actions
 *   4. Recent agent activity (real data only — no fake transactions)
 */

import React, { useState, useEffect, useCallback } from 'react'
import {
  Bot, Wallet, ArrowUpRight, Zap,
  RefreshCw, ChevronRight, AlertTriangle,
  CheckCircle2, Clock, ArrowDownLeft,
  ShoppingBag, Repeat, Search,
} from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { useNanTheme } from '../../hooks/useNanTheme'
import { NanLogo } from '../NanLogo'
import { NotificationBell } from '../ui/NotificationBell'

const BODY  = "'DM Sans', 'Inter', -apple-system, sans-serif"
const MONO  = "'JetBrains Mono', Menlo, monospace"

// ── Agent Wallet balance refresh ──────────────────────────────────────────────
// Reuses the same /api/agent-wallet endpoint that AgentWalletExperience uses.
// Only calls it when the wallet is provisioned and tokens are present.
function useAgentWalletRefresh(
  userToken: string | undefined,
  walletId:  string | undefined,
) {
  const { agentWallet, setAgentWallet } = useAppStore()
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!userToken || !walletId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/agent-wallet', {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify({ action: 'balance', userToken, walletId }),
      })
      if (!res.ok) { setError('Unable to load Agent Wallet right now.'); return }
      const data = await res.json() as { balance_usdc?: string; walletState?: string }
      setAgentWallet({
        balance_usdc:  data.balance_usdc  ?? agentWallet.balance_usdc,
        walletState:   data.walletState,
        lastRefreshed: new Date().toISOString(),
      })
    } catch {
      setError('Unable to load Agent Wallet right now.')
    } finally {
      setLoading(false)
    }
  }, [userToken, walletId, agentWallet.balance_usdc, setAgentWallet])

  // Refresh once on mount when provisioned
  useEffect(() => {
    if (agentWallet.provisioned && userToken && walletId) {
      void refresh()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { loading, error, refresh }
}

// ── Skeleton shimmer ──────────────────────────────────────────────────────────
function Skeleton({ w, h = 14, r = 6 }: { w: number | string; h?: number; r?: number }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: r,
      background: 'rgba(255,255,255,0.07)',
      animation: 'home-pulse 1.4s ease-in-out infinite',
    }} />
  )
}

// ── Activity icon helpers ─────────────────────────────────────────────────────
function activityIcon(type: string, sign: '+' | '-') {
  if (type === 'received')     return { Icon: ArrowDownLeft,  color: '#00C853' }
  if (type === 'agent_purchase' || type === 'purchase') return { Icon: ShoppingBag, color: '#F0A500' }
  if (type === 'bridge')       return { Icon: RefreshCw,      color: '#0066FF' }
  if (type === 'swap')         return { Icon: Repeat,         color: '#8B5CF6' }
  if (sign === '+')            return { Icon: ArrowDownLeft,  color: '#00C853' }
  return                              { Icon: ArrowUpRight,   color: '#FF3B3B' }
}

function StatusDot({ status }: { status: string }) {
  if (status === 'confirmed' || status === 'completed')
    return <CheckCircle2 size={11} color="#00C853" />
  if (status === 'failed')
    return <AlertTriangle size={11} color="#FF3B3B" />
  return <Clock size={11} color="#F0A500" />
}

// ── Section label ─────────────────────────────────────────────────────────────
function SectionLabel({
  text, action, onAction,
}: { text: string; action?: string; onAction?: () => void }) {
  const C = useNanTheme()
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
      <span style={{
        fontSize: 11, fontWeight: 700, color: C.t3,
        textTransform: 'uppercase', letterSpacing: '0.09em',
      }}>{text}</span>
      {action && onAction && (
        <button onClick={onAction} style={{
          display: 'flex', alignItems: 'center', gap: 2,
          background: 'none', border: 'none', cursor: 'pointer',
          color: C.blue, fontSize: 12, fontWeight: 600,
          fontFamily: BODY, padding: 0,
        }}>
          {action}<ChevronRight size={12} color={C.blue} />
        </button>
      )}
    </div>
  )
}

// ── Quick action tile ─────────────────────────────────────────────────────────
function QAction({
  Icon, label, accent, onPress, C,
}: {
  Icon: React.ElementType; label: string; accent: string
  onPress: () => void; C: ReturnType<typeof useNanTheme>
}) {
  return (
    <button onClick={onPress} style={{
      flex: 1, minWidth: 0,
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
      padding: '14px 6px',
      background: C.surf, border: `1px solid ${C.bdr}`,
      borderRadius: 16, cursor: 'pointer',
      WebkitTapHighlightColor: 'transparent',
      fontFamily: BODY,
    }}>
      <div style={{
        width: 42, height: 42, borderRadius: 12,
        background: `${accent}18`, border: `1px solid ${accent}28`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={18} color={accent} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 600, color: C.t2, lineHeight: 1.25, textAlign: 'center' }}>{label}</span>
    </button>
  )
}

// ── HomePage ──────────────────────────────────────────────────────────────────
export function HomePage() {
  const C = useNanTheme()
  const {
    setActiveView,
    agentWallet,
    agentSpendLog,
    activity,
    auth,
    profile,
    mainWalletBalance,
  } = useAppStore()

  const userToken = agentWallet.userToken ?? auth?.userToken
  const walletId  = agentWallet.walletId

  const { loading: awLoading, error: awError, refresh: awRefresh } =
    useAgentWalletRefresh(userToken, walletId)

  // Agent activity = agent-initiated sends + service payments, newest first, max 5
  const agentActivity = [
    ...activity
      .filter(a => a.agentInitiated)
      .map(a => ({
        id:          a.id,
        type:        a.type as string,
        description: a.description,
        amount:      a.amount,
        sign:        a.sign,
        timestamp:   new Date(a.timestamp),
        status:      a.status,
      })),
    ...agentSpendLog.map(e => ({
      id:          e.id,
      type:        'agent_purchase',
      description: e.service_name,
      amount:      e.amount_usdc,
      sign:        '-' as const,
      timestamp:   new Date(e.timestamp),
      status:      (e.paid ? 'confirmed' : 'pending') as 'confirmed' | 'pending' | 'failed',
    })),
  ]
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, 5)

  // Greeting
  const displayName = profile.displayName || auth?.email?.split('@')[0] || 'there'
  const hr = new Date().getHours()
  const greeting = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div style={{ width: '100%', fontFamily: BODY, paddingBottom: 16, boxSizing: 'border-box' }}>

      {/* Keyframes */}
      <style>{`
        @keyframes home-pulse { 0%,100%{opacity:.45} 50%{opacity:1} }
        @keyframes home-spin  { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>

      {/* ── Top bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 18 }}>
        <NanLogo height={24} />
        <NotificationBell color={C.t2} />
      </div>

      {/* ── Greeting + main wallet balance ── */}
      <div style={{ marginBottom: 22 }}>
        <div style={{
          fontSize: 22, fontWeight: 700, color: C.text,
          letterSpacing: '-0.025em', lineHeight: 1.25,
        }}>
          {greeting}, {displayName}
        </div>
        <div style={{ fontSize: 13, color: C.t3, marginTop: 4 }}>
          Main wallet
          {mainWalletBalance && mainWalletBalance !== '0' ? (
            <span style={{ fontFamily: MONO, fontWeight: 700, color: C.text, marginLeft: 6 }}>
              ${mainWalletBalance}
            </span>
          ) : (
            <span style={{ color: C.t3, marginLeft: 6 }}>—</span>
          )}{' '}
          USDC
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════
          1. NAN AGENT — primary entry point
      ════════════════════════════════════════════════════════════ */}
      <div style={{ marginBottom: 14 }}>
        <SectionLabel text="NAN Agent" />
        <button
          onClick={() => setActiveView('agent')}
          style={{
            width: '100%', textAlign: 'left', boxSizing: 'border-box',
            display: 'flex', alignItems: 'center', gap: 14,
            padding: '18px 16px',
            background: 'linear-gradient(135deg,#060C1E 0%,#0D1A48 100%)',
            border: '1px solid rgba(0,102,255,0.22)',
            borderRadius: 20,
            cursor: 'pointer',
            WebkitTapHighlightColor: 'transparent',
            boxShadow: '0 6px 32px rgba(0,102,255,0.10)',
          }}
        >
          {/* Icon */}
          <div style={{
            width: 52, height: 52, borderRadius: 15, flexShrink: 0,
            background: 'rgba(0,102,255,0.16)',
            border: '1px solid rgba(0,102,255,0.32)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Bot size={24} color="#4D94FF" />
          </div>
          {/* Copy */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#F2F3F5', marginBottom: 4 }}>NAN Agent</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.40)', lineHeight: 1.45 }}>
              Check balances · Send USDC · Find &amp; pay for services
            </div>
          </div>
          {/* Chevron */}
          <div style={{
            width: 30, height: 30, borderRadius: 9, flexShrink: 0,
            background: 'rgba(255,255,255,0.06)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <ChevronRight size={14} color="rgba(255,255,255,0.35)" />
          </div>
        </button>
      </div>

      {/* ════════════════════════════════════════════════════════════
          2. AGENT WALLET SUMMARY
      ════════════════════════════════════════════════════════════ */}
      <div style={{ marginBottom: 14 }}>
        <SectionLabel
          text="Agent Wallet"
          action={agentWallet.provisioned ? 'Open' : undefined}
          onAction={() => setActiveView('agent-wallet')}
        />

        {!agentWallet.provisioned ? (
          /* Not provisioned yet */
          <button
            onClick={() => setActiveView('agent-wallet')}
            style={{
              width: '100%', textAlign: 'left', boxSizing: 'border-box',
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '16px',
              background: C.surf, border: `1px solid ${C.bdr}`,
              borderRadius: 18,
              cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <div style={{
              width: 46, height: 46, borderRadius: 13, flexShrink: 0,
              background: C.surf2, border: `1px solid ${C.bdr}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Wallet size={20} color={C.t3} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 3 }}>
                Set up Agent Wallet
              </div>
              <div style={{ fontSize: 12, color: C.t3 }}>
                Enable autonomous USDC payments for your agent
              </div>
            </div>
            <ChevronRight size={14} color={C.t3} />
          </button>

        ) : (
          /* Provisioned — real balance card */
          <button
            onClick={() => setActiveView('agent-wallet')}
            style={{
              width: '100%', textAlign: 'left', boxSizing: 'border-box',
              padding: '18px',
              background: C.surf, border: `1px solid ${C.bdr}`,
              borderRadius: 20,
              cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {/* Card header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 10,
                  background: 'rgba(0,102,255,0.10)',
                  border: '1px solid rgba(0,102,255,0.20)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Wallet size={15} color={C.blue} />
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Agent Wallet</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                    <div style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: agentWallet.walletState === 'LIVE' ? C.green : C.gold,
                    }} />
                    <span style={{ fontSize: 10, color: C.t3 }}>
                      {agentWallet.walletState === 'LIVE' ? 'Active · Arc Testnet' : (agentWallet.walletState ?? 'Circle UCW')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Refresh button — stopPropagation so it doesn't navigate */}
              <button
                onClick={e => { e.stopPropagation(); void awRefresh() }}
                style={{
                  width: 32, height: 32, borderRadius: 9, flexShrink: 0,
                  background: C.surf2, border: `1px solid ${C.bdr}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <RefreshCw
                  size={13} color={C.t3}
                  style={{ animation: awLoading ? 'home-spin 0.8s linear infinite' : 'none' }}
                />
              </button>
            </div>

            {/* Balance area */}
            {awError ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 4 }}>
                <AlertTriangle size={14} color={C.gold} />
                <span style={{ fontSize: 13, color: C.t2 }}>{awError}</span>
                <button
                  onClick={e => { e.stopPropagation(); void awRefresh() }}
                  style={{ marginLeft: 'auto', background: 'none', border: 'none', color: C.blue, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: BODY }}
                >
                  Retry
                </button>
              </div>
            ) : awLoading && agentWallet.balance_usdc === '0' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 4 }}>
                <Skeleton w={110} h={30} r={8} />
                <Skeleton w={70}  h={12} r={5} />
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                  <span style={{
                    fontSize: 30, fontWeight: 800,
                    color: C.text, fontFamily: MONO,
                    letterSpacing: '-0.03em',
                  }}>
                    {parseFloat(agentWallet.balance_usdc || '0').toFixed(2)}
                  </span>
                  <span style={{ fontSize: 14, color: C.t3, fontWeight: 600 }}>USDC</span>
                </div>
                {agentWallet.lastRefreshed && (
                  <div style={{ fontSize: 10, color: C.t3, marginTop: 3 }}>
                    Updated {new Date(agentWallet.lastRefreshed).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                )}
              </div>
            )}

            {/* Footer */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginTop: 14, paddingTop: 12,
              borderTop: `1px solid ${C.bdr}`,
            }}>
              <span style={{ fontSize: 11, color: C.t3 }}>Tap to open full Agent Wallet</span>
              <ChevronRight size={13} color={C.t3} />
            </div>
          </button>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════
          3. QUICK ACTIONS
      ════════════════════════════════════════════════════════════ */}
      <div style={{ marginBottom: 20 }}>
        <SectionLabel text="Quick Actions" />
        <div style={{ display: 'flex', gap: 10 }}>
          <QAction Icon={ArrowUpRight} label="Payment"   accent={C.blue}    C={C} onPress={() => setActiveView('send')} />
          <QAction Icon={Search}       label="Services"  accent="#8B5CF6"   C={C} onPress={() => setActiveView('agent')} />
          <QAction Icon={Zap}          label="Agent"     accent={C.gold}    C={C} onPress={() => setActiveView('agent-wallet')} />
          <QAction Icon={Repeat}       label="Recurring" accent={C.green}   C={C} onPress={() => setActiveView('recurring')} />
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════
          4. RECENT AGENT ACTIVITY (real data only)
      ════════════════════════════════════════════════════════════ */}
      <div>
        <SectionLabel
          text="Recent Agent Activity"
          action={agentActivity.length > 0 ? 'See all' : undefined}
          onAction={() => setActiveView('activity')}
        />

        {agentActivity.length === 0 ? (
          /* ── Empty state — exact copy matches spec ── */
          <div style={{
            background: C.surf, border: `1px solid ${C.bdr}`,
            borderRadius: 18, padding: '36px 20px', textAlign: 'center',
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: 14,
              background: C.surf2, border: `1px solid ${C.bdr}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 12px',
            }}>
              <Bot size={20} color={C.t3} />
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 6 }}>
              No agent activity yet
            </div>
            <div style={{ fontSize: 13, color: C.t3, lineHeight: 1.55 }}>
              Your NAN Agent activity will appear here.
            </div>
          </div>

        ) : (
          <div style={{
            background: C.surf, border: `1px solid ${C.bdr}`,
            borderRadius: 18, overflow: 'hidden',
          }}>
            {agentActivity.map((item, i) => {
              const { Icon, color } = activityIcon(item.type, item.sign)
              const isLast = i === agentActivity.length - 1
              const ts = item.timestamp
              const timeStr = ts.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })
              const dateStr = ts.toLocaleDateString('en', { month: 'short', day: 'numeric' })

              return (
                <div
                  key={item.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '13px 16px',
                    borderBottom: isLast ? 'none' : `1px solid ${C.bdr}`,
                  }}
                >
                  {/* Icon */}
                  <div style={{
                    width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                    background: `${color}14`, border: `1px solid ${color}22`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Icon size={15} color={color} />
                  </div>

                  {/* Text */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13, fontWeight: 600, color: C.text,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {item.description}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                      <StatusDot status={item.status} />
                      <span style={{ fontSize: 11, color: C.t3 }}>{dateStr} · {timeStr}</span>
                    </div>
                  </div>

                  {/* Amount */}
                  <div style={{
                    fontSize: 13, fontWeight: 700, flexShrink: 0, fontFamily: MONO,
                    color: item.sign === '+' ? C.green : C.red,
                  }}>
                    {item.sign}
                    {typeof item.amount === 'number'
                      ? item.amount.toFixed(item.amount < 1 ? 4 : 2)
                      : item.amount}{' '}
                    USDC
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
