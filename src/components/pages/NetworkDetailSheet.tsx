/**
 * NetworkDetailSheet
 *
 * A slide-up sheet showing per-chain token balances, native asset info,
 * recent activity, and available actions for a given network.
 */
import React from 'react'
import {
  X, ExternalLink, ArrowUpRight, ArrowDownLeft,
  ArrowLeftRight, CheckCircle2, Clock, AlertCircle,
  Zap, Activity,
} from 'lucide-react'
import { useNanTheme } from '../../hooks/useNanTheme'
import { useAppStore } from '../../store/appStore'
import type { NetworkSummary, TokenPosition } from '../../hooks/usePortfolioBalances'

const F    = "'Inter', -apple-system, sans-serif"
const MONO = "'JetBrains Mono', Menlo, monospace"

const TOKEN_COLORS: Record<string, string> = {
  USDC: '#2775CA',
  EURC: '#0099CC',
  USDT: '#26A17B',
}

function StatusBadge({ status }: { status: TokenPosition['status'] }) {
  const C = useNanTheme()
  if (status === 'confirmed') return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 600, color: C.green }}>
      <CheckCircle2 size={10} color={C.green} />Confirmed
    </span>
  )
  if (status === 'pending') return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 600, color: C.gold }}>
      <Clock size={10} color={C.gold} />Pending
    </span>
  )
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 600, color: C.t3 }}>
      <AlertCircle size={10} color={C.t3} />Unavailable
    </span>
  )
}

interface Props {
  network: NetworkSummary
  onClose: () => void
}

export function NetworkDetailSheet({ network, onClose }: Props) {
  const C = useNanTheme()
  const { setActiveView, activity } = useAppStore()

  // Recent txs touching this chain
  const recentTxs = [...activity]
    .filter(tx => !tx.chain || tx.chain === network.chainName || network.chainName === 'Arc Testnet')
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 5)

  const hasTokens = network.positions.some(p => parseFloat(p.quantity) > 0)

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(4px)',
        }}
      />

      {/* Sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 201,
        background: C.surf,
        borderRadius: '24px 24px 0 0',
        border: `1px solid ${C.bdr}`,
        borderBottom: 'none',
        maxHeight: '90vh',
        overflowY: 'auto',
        fontFamily: F,
        maxWidth: 480,
        margin: '0 auto',
      }}>
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, paddingBottom: 2 }}>
          <div style={{ width: 40, height: 4, borderRadius: 4, background: C.bdr2 }} />
        </div>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 20px 16px',
        }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.text, letterSpacing: '-0.02em' }}>
              {network.chainName}
            </div>
            <div style={{ fontSize: 13, color: C.t3, marginTop: 2 }}>
              Total: <span style={{ color: C.text, fontFamily: MONO, fontWeight: 700 }}>${network.totalUsd}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 34, height: 34, borderRadius: 10,
              background: C.surf2, border: `1px solid ${C.bdr}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <X size={16} color={C.t2} />
          </button>
        </div>

        <div style={{ padding: '0 20px 32px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Token balances */}
          <section>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.t3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
              Token Balances
            </div>
            {network.positions.length === 0 ? (
              <div style={{ fontSize: 13, color: C.t3, padding: '12px 0' }}>No tokens tracked on this chain.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {network.positions.map((pos) => (
                  <div
                    key={`${pos.symbol}-${pos.chainId}`}
                    style={{
                      display: 'flex', alignItems: 'center',
                      justifyContent: 'space-between',
                      background: C.surf2, borderRadius: 14,
                      padding: '12px 14px',
                      border: `1px solid ${C.bdr}`,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                        background: `${TOKEN_COLORS[pos.symbol]}22`,
                        border: `1.5px solid ${TOKEN_COLORS[pos.symbol]}55`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 800,
                        color: TOKEN_COLORS[pos.symbol],
                      }}>
                        {pos.symbol.slice(0, 2)}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{pos.symbol}</div>
                        <StatusBadge status={pos.status} />
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 800, color: C.text }}>
                        {pos.symbol === 'EURC' ? '€' : '$'}{pos.quantity}
                      </div>
                      <div style={{ fontSize: 11, color: C.t3 }}>≈ ${pos.usdValue}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Actions */}
          <section>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.t3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
              Actions
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { icon: ArrowUpRight,  label: 'Send',    view: 'send',    disabled: !hasTokens },
                { icon: ArrowDownLeft, label: 'Receive', view: 'receive', disabled: false },
                { icon: ArrowLeftRight,label: 'Bridge',  view: 'bridge',  disabled: false },
                { icon: Zap,           label: 'Gateway', view: 'gateway', disabled: false },
              ].map(({ icon: Icon, label, view, disabled }) => (
                <button
                  key={label}
                  onClick={() => { if (!disabled) { setActiveView(view); onClose() } }}
                  disabled={disabled}
                  style={{
                    flex: 1, padding: '10px 4px',
                    borderRadius: 12, border: `1px solid ${C.bdr}`,
                    background: disabled ? C.surf2 : C.surf2,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', gap: 5,
                    fontFamily: F, opacity: disabled ? 0.4 : 1,
                  }}
                >
                  <Icon size={16} color={disabled ? C.t3 : C.blue} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: disabled ? C.t3 : C.t2 }}>{label}</span>
                </button>
              ))}
            </div>
          </section>

          {/* Recent Activity */}
          <section>
            <div style={{
              display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', marginBottom: 10,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.t3, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                Recent Activity
              </div>
              <button
                onClick={() => { setActiveView('activity'); onClose() }}
                style={{ fontSize: 11, color: C.blue, background: 'none', border: 'none', cursor: 'pointer', fontFamily: F, fontWeight: 600 }}
              >
                View all
              </button>
            </div>
            {recentTxs.length === 0 ? (
              <div style={{
                padding: '20px 16px', textAlign: 'center',
                background: C.surf2, borderRadius: 14, border: `1px solid ${C.bdr}`,
              }}>
                <Activity size={18} color={C.t3} style={{ marginBottom: 8 }} />
                <div style={{ fontSize: 12, color: C.t3 }}>No activity on this network yet</div>
              </div>
            ) : (
              <div style={{ background: C.surf2, borderRadius: 14, border: `1px solid ${C.bdr}`, overflow: 'hidden' }}>
                {recentTxs.map((tx, idx) => {
                  const isIn = tx.sign === '+'
                  return (
                    <div
                      key={tx.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '11px 14px',
                        borderBottom: idx < recentTxs.length - 1 ? `1px solid ${C.bdr}` : 'none',
                      }}
                    >
                      <div style={{
                        width: 30, height: 30, borderRadius: 9, flexShrink: 0,
                        background: isIn ? 'rgba(0,200,83,0.1)' : 'rgba(255,59,59,0.1)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {isIn
                          ? <ArrowDownLeft size={14} color={C.green} />
                          : <ArrowUpRight  size={14} color={C.red} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {tx.description}
                        </div>
                        <div style={{ fontSize: 10, color: C.t3, marginTop: 2 }}>
                          {new Date(tx.timestamp).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                          {tx.status === 'pending' && <span style={{ color: C.gold, marginLeft: 6 }}>● Pending</span>}
                        </div>
                      </div>
                      <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: isIn ? C.green : C.red, flexShrink: 0 }}>
                        {tx.sign}{typeof tx.amount === 'number' ? tx.amount.toFixed(2) : tx.amount}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* Explorer link */}
          <a
            href={network.explorerBase}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '12px 0', borderRadius: 12,
              background: C.surf2, border: `1px solid ${C.bdr}`,
              fontSize: 13, fontWeight: 600, color: C.t2,
              textDecoration: 'none', fontFamily: F,
            }}
          >
            <ExternalLink size={14} color={C.t2} />
            View on Explorer
          </a>
        </div>
      </div>
    </>
  )
}
