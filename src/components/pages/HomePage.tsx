/**
 * Mobile Home Dashboard — NAN Agent-First Redesign
 *
 * MOBILE ONLY. AppShell redirects 'home' → 'dashboard' on desktop,
 * so this file never needs desktop layout.
 *
 * Hierarchy:
 *   Greeting
 *   NAN Agent   ← primary emphasis
 *   Agent Wallet ← infrastructure that powers the agent
 *   Quick Actions
 *   Recent Agent Activity
 */

import React, { useEffect, useCallback, useState } from 'react'
import {
  Bot, Wallet, ArrowUpRight, Repeat,
  ChevronRight, AlertTriangle, CheckCircle2,
  Clock, ArrowDownLeft, ShoppingBag,
  RefreshCw, Shield, Zap,
} from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { useNanTheme } from '../../hooks/useNanTheme'
import { NanLogo } from '../NanLogo'
import { NotificationBell } from '../ui/NotificationBell'

const BODY = "'DM Sans','Inter',-apple-system,sans-serif"
const MONO = "'JetBrains Mono',Menlo,monospace"
const BLUE = '#0066FF'

// ── Agent Wallet balance refresh (reuses existing /api/agent-wallet endpoint) ─
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
      if (!res.ok) { setError('Balance unavailable'); return }
      const data = await res.json() as { balance_usdc?: string; walletState?: string }
      setAgentWallet({
        balance_usdc:  data.balance_usdc  ?? agentWallet.balance_usdc,
        walletState:   data.walletState,
        lastRefreshed: new Date().toISOString(),
      })
    } catch {
      setError('Balance unavailable')
    } finally {
      setLoading(false)
    }
  }, [userToken, walletId, agentWallet.balance_usdc, setAgentWallet])

  useEffect(() => {
    if (agentWallet.provisioned && userToken && walletId) void refresh()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { loading, error, refresh }
}

// ── Shimmer skeleton ──────────────────────────────────────────────────────────
function Skel({ w, h = 14, r = 7 }: { w: number | string; h?: number; r?: number }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: r,
      background: 'rgba(255,255,255,0.08)',
      animation: 'hp-pulse 1.5s ease-in-out infinite',
    }} />
  )
}

// ── Activity icon map ─────────────────────────────────────────────────────────
function actIcon(type: string, sign: '+' | '-') {
  if (type === 'received')                              return { Icon: ArrowDownLeft,  col: '#00C853' }
  if (type === 'agent_purchase' || type === 'purchase') return { Icon: ShoppingBag,    col: '#F0A500' }
  if (type === 'bridge')                                return { Icon: RefreshCw,       col: BLUE      }
  if (type === 'swap')                                  return { Icon: Repeat,          col: '#8B5CF6' }
  if (sign === '+')                                     return { Icon: ArrowDownLeft,  col: '#00C853' }
  return                                                       { Icon: ArrowUpRight,   col: '#FF3B3B' }
}

function StatusPip({ status }: { status: string }) {
  if (status === 'confirmed' || status === 'completed') return <CheckCircle2 size={10} color="#00C853" />
  if (status === 'failed')                              return <AlertTriangle  size={10} color="#FF3B3B" />
  return <Clock size={10} color="#F0A500" />
}

// ── Row divider ───────────────────────────────────────────────────────────────
function Divider({ C }: { C: ReturnType<typeof useNanTheme> }) {
  return <div style={{ height: 1, background: C.bdr, margin: '0 16px' }} />
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

  // Real agent activity only — no fabricated rows
  const agentActivity = [
    ...activity
      .filter(a => a.agentInitiated)
      .map(a => ({
        id:     a.id,
        type:   a.type as string,
        desc:   a.description,
        amount: a.amount,
        sign:   a.sign,
        ts:     new Date(a.timestamp),
        status: a.status,
      })),
    ...agentSpendLog.map(e => ({
      id:     e.id,
      type:   'agent_purchase',
      desc:   e.service_name,
      amount: e.amount_usdc,
      sign:   '-' as const,
      ts:     new Date(e.timestamp),
      status: (e.paid ? 'confirmed' : 'pending') as 'confirmed' | 'pending' | 'failed',
    })),
  ]
    .sort((a, b) => b.ts.getTime() - a.ts.getTime())
    .slice(0, 5)

  const name     = profile.displayName || auth?.email?.split('@')[0] || 'there'
  const hr       = new Date().getHours()
  const greeting = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening'
  const hasBalance = mainWalletBalance && mainWalletBalance !== '0' && mainWalletBalance !== ''

  // card shared style
  const card = (extra?: React.CSSProperties): React.CSSProperties => ({
    background: C.surf,
    border: `1px solid ${C.bdr}`,
    borderRadius: 20,
    overflow: 'hidden',
    ...extra,
  })

  return (
    <div style={{ width: '100%', fontFamily: BODY, boxSizing: 'border-box', paddingBottom: 20 }}>

      {/* ── keyframes ── */}
      <style>{`
        @keyframes hp-pulse { 0%,100%{opacity:.4} 50%{opacity:1} }
        @keyframes hp-spin   { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes hp-glow   { 0%,100%{opacity:.55} 50%{opacity:1} }
      `}</style>

      {/* ════════════════════════════════════════
          TOP BAR
      ════════════════════════════════════════ */}
      <div style={{
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between',
        paddingBottom: 22,
      }}>
        <NanLogo height={22} />
        <NotificationBell color={C.t2} />
      </div>

      {/* ════════════════════════════════════════
          GREETING
      ════════════════════════════════════════ */}
      <div style={{ marginBottom: 24 }}>
        <div style={{
          fontSize: 24, fontWeight: 700, color: C.text,
          letterSpacing: '-0.03em', lineHeight: 1.2,
        }}>
          {greeting}, {name}
        </div>
        <div style={{ fontSize: 13, color: C.t3, marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
          Your financial assistant
          {hasBalance && (
            <span style={{
              background: C.surf2,
              border: `1px solid ${C.bdr}`,
              borderRadius: 20, padding: '2px 9px',
              fontSize: 11, fontWeight: 700,
              color: C.text, fontFamily: MONO,
            }}>
              ${mainWalletBalance} USDC
            </span>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════
          1. NAN AGENT — PRIMARY
      ════════════════════════════════════════ */}
      <button
        onClick={() => setActiveView('agent')}
        style={{
          width: '100%', display: 'block', textAlign: 'left',
          boxSizing: 'border-box', marginBottom: 12,
          padding: '22px 20px',
          background: C.isDark
            ? 'linear-gradient(140deg,#060D22 0%,#0A1840 55%,#071030 100%)'
            : 'linear-gradient(140deg,#0052CC 0%,#0066FF 100%)',
          border: '1px solid rgba(0,102,255,0.28)',
          borderRadius: 22,
          cursor: 'pointer',
          WebkitTapHighlightColor: 'transparent',
          boxShadow: '0 8px 40px rgba(0,102,255,0.14)',
        }}
      >
        {/* icon + title row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
          {/* pulsing glow orb */}
          <div style={{ position: 'relative', width: 52, height: 52, flexShrink: 0 }}>
            <div style={{
              position: 'absolute', inset: -4,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(0,102,255,0.35) 0%, transparent 70%)',
              animation: 'hp-glow 2.4s ease-in-out infinite',
            }} />
            <div style={{
              width: 52, height: 52, borderRadius: 15,
              background: 'rgba(255,255,255,0.10)',
              border: '1px solid rgba(255,255,255,0.20)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              position: 'relative',
            }}>
              <Bot size={24} color="#FFFFFF" />
            </div>
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.02em' }}>
              NAN Agent
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>
              Your AI financial assistant
            </div>
          </div>

          <div style={{
            width: 32, height: 32, borderRadius: 10, flexShrink: 0,
            background: 'rgba(255,255,255,0.10)',
            border: '1px solid rgba(255,255,255,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <ChevronRight size={16} color="rgba(255,255,255,0.6)" />
          </div>
        </div>

        {/* capability chips */}
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          {['Check balances', 'Send USDC', 'Find services', 'Pay for services'].map(cap => (
            <span key={cap} style={{
              padding: '5px 11px',
              background: 'rgba(255,255,255,0.09)',
              border: '1px solid rgba(255,255,255,0.14)',
              borderRadius: 20,
              fontSize: 11, fontWeight: 600,
              color: 'rgba(255,255,255,0.70)',
            }}>
              {cap}
            </span>
          ))}
        </div>
      </button>

      {/* ════════════════════════════════════════
          2. AGENT WALLET — SECONDARY
      ════════════════════════════════════════ */}
      <div style={{ marginBottom: 12 }}>
        {!agentWallet.provisioned ? (
          /* ── Not provisioned ── */
          <button
            onClick={() => setActiveView('agent-wallet')}
            style={{
              width: '100%', textAlign: 'left', boxSizing: 'border-box',
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '16px 18px',
              ...card(),
              cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <div style={{
              width: 44, height: 44, borderRadius: 13, flexShrink: 0,
              background: C.surf2, border: `1px solid ${C.bdr}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Wallet size={19} color={C.t3} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 2 }}>
                Set up Agent Wallet
              </div>
              <div style={{ fontSize: 12, color: C.t3 }}>
                Enables NAN to act on your behalf
              </div>
            </div>
            <ChevronRight size={14} color={C.t3} />
          </button>

        ) : (
          /* ── Provisioned ── */
          <div style={card()}>
            {/* header */}
            <div style={{
              display: 'flex', alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 18px 12px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 10,
                  background: `${BLUE}14`, border: `1px solid ${BLUE}28`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Wallet size={15} color={BLUE} />
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.text, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                    Agent Wallet
                  </div>
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

              {/* refresh */}
              <button
                onClick={() => void awRefresh()}
                style={{
                  width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                  background: C.surf2, border: `1px solid ${C.bdr}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                }}
              >
                <RefreshCw
                  size={12} color={C.t3}
                  style={{ animation: awLoading ? 'hp-spin 0.8s linear infinite' : 'none' }}
                />
              </button>
            </div>

            <Divider C={C} />

            {/* balance */}
            <div style={{ padding: '14px 18px' }}>
              {awError ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AlertTriangle size={14} color={C.gold} />
                  <span style={{ fontSize: 13, color: C.t2, flex: 1 }}>Balance unavailable</span>
                  <button
                    onClick={() => void awRefresh()}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: BLUE, fontSize: 12, fontWeight: 600, fontFamily: BODY, padding: 0,
                    }}
                  >
                    Retry
                  </button>
                </div>
              ) : awLoading && agentWallet.balance_usdc === '0' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <Skel w={100} h={32} r={9} />
                  <Skel w={64}  h={11} r={5} />
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                    <span style={{
                      fontSize: 32, fontWeight: 800,
                      color: C.text, fontFamily: MONO,
                      letterSpacing: '-0.03em', lineHeight: 1,
                    }}>
                      {parseFloat(agentWallet.balance_usdc || '0').toFixed(2)}
                    </span>
                    <span style={{ fontSize: 14, color: C.t3, fontWeight: 600 }}>USDC</span>
                  </div>
                  {agentWallet.lastRefreshed && (
                    <div style={{ fontSize: 10, color: C.t3, marginTop: 4 }}>
                      Updated {new Date(agentWallet.lastRefreshed).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}
                </>
              )}
            </div>

            <Divider C={C} />

            {/* open button */}
            <button
              onClick={() => setActiveView('agent-wallet')}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 18px',
                background: 'none', border: 'none', cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent', fontFamily: BODY,
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 600, color: BLUE }}>Open Agent Wallet</span>
              <ChevronRight size={14} color={BLUE} />
            </button>
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════
          3. QUICK ACTIONS
      ════════════════════════════════════════ */}
      <div style={{ marginBottom: 20 }}>
        {/* label */}
        <div style={{
          fontSize: 11, fontWeight: 700, color: C.t3,
          textTransform: 'uppercase', letterSpacing: '0.09em',
          marginBottom: 10,
        }}>
          Quick Actions
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {[
            { Icon: ArrowUpRight, label: 'Pay',       accent: BLUE,      view: 'send'         },
            { Icon: Zap,          label: 'Services',  accent: '#8B5CF6', view: 'agent'        },
            { Icon: Shield,       label: 'Spending',  accent: '#F0A500', view: 'agent-wallet' },
            { Icon: Repeat,       label: 'Recurring', accent: C.green,   view: 'recurring'    },
          ].map(({ Icon, label, accent, view }) => (
            <button
              key={label}
              onClick={() => setActiveView(view)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                padding: '14px 6px',
                background: C.surf, border: `1px solid ${C.bdr}`,
                borderRadius: 16, cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
                fontFamily: BODY,
              }}
            >
              <div style={{
                width: 40, height: 40, borderRadius: 12,
                background: `${accent}18`, border: `1px solid ${accent}28`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon size={17} color={accent} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: C.t2, lineHeight: 1.2, textAlign: 'center' }}>
                {label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ════════════════════════════════════════
          4. RECENT AGENT ACTIVITY
      ════════════════════════════════════════ */}
      <div>
        {/* section header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 10,
        }}>
          <span style={{
            fontSize: 11, fontWeight: 700, color: C.t3,
            textTransform: 'uppercase', letterSpacing: '0.09em',
          }}>
            Recent Agent Activity
          </span>
          {agentActivity.length > 0 && (
            <button
              onClick={() => setActiveView('activity')}
              style={{
                display: 'flex', alignItems: 'center', gap: 2,
                background: 'none', border: 'none', cursor: 'pointer',
                color: BLUE, fontSize: 12, fontWeight: 600, fontFamily: BODY, padding: 0,
              }}
            >
              See all <ChevronRight size={12} color={BLUE} />
            </button>
          )}
        </div>

        {agentActivity.length === 0 ? (
          /* ── Empty state ── */
          <div style={{
            ...card(),
            padding: '36px 20px',
            textAlign: 'center',
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: 14,
              background: C.surf2, border: `1px solid ${C.bdr}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 14px',
            }}>
              <Bot size={20} color={C.t3} />
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 6 }}>
              No agent activity yet
            </div>
            <div style={{ fontSize: 13, color: C.t3, lineHeight: 1.55, maxWidth: 240, margin: '0 auto' }}>
              Your NAN Agent activity will appear here.
            </div>
          </div>

        ) : (
          /* ── Activity list ── */
          <div style={card()}>
            {agentActivity.map((item, i) => {
              const { Icon, col } = actIcon(item.type, item.sign)
              const isLast = i === agentActivity.length - 1
              const timeStr = item.ts.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })
              const dateStr = item.ts.toLocaleDateString('en', { month: 'short', day: 'numeric' })
              const amtStr = typeof item.amount === 'number'
                ? item.amount.toFixed(item.amount < 1 ? 4 : 2)
                : String(item.amount)

              return (
                <React.Fragment key={item.id}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '13px 16px',
                  }}>
                    {/* icon */}
                    <div style={{
                      width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                      background: `${col}14`, border: `1px solid ${col}22`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Icon size={15} color={col} />
                    </div>

                    {/* text */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 13, fontWeight: 600, color: C.text,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {item.desc}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                        <StatusPip status={item.status} />
                        <span style={{ fontSize: 11, color: C.t3 }}>{dateStr} · {timeStr}</span>
                      </div>
                    </div>

                    {/* amount */}
                    <div style={{
                      fontSize: 13, fontWeight: 700, flexShrink: 0,
                      color: item.sign === '+' ? C.green : C.red,
                      fontFamily: MONO,
                    }}>
                      {item.sign}{amtStr} USDC
                    </div>
                  </div>
                  {!isLast && <Divider C={C} />}
                </React.Fragment>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
