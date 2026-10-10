/**
 * TokenNetworkSheet
 *
 * Slide-up sheet that opens when the user taps a token card (USDC / EURC / USDT).
 * Shows "Balances by Network" for that specific token: per-chain quantity, USD value,
 * confirmed / pending / unavailable status, and quick actions.
 */
import React, { useState } from 'react'
import {
  X, ExternalLink, ArrowUpRight, ArrowDownLeft,
  ArrowLeftRight, CheckCircle2, Clock, AlertCircle,
  Zap, Globe, Info,
} from 'lucide-react'
import { useNanTheme } from '../../hooks/useNanTheme'
import { useAppStore } from '../../store/appStore'
import type { TokenPosition } from '../../hooks/usePortfolioBalances'

// ── Chain logo map — keyed by chainId ─────────────────────────────────────────
const CHAIN_LOGOS: Record<number, string> = {
  5042002:  'https://s2.coinmarketcap.com/static/img/coins/64x64/3408.png', // Arc (USDC)
  11155111: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png', // Ethereum Sepolia
  84532:    'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/info/logo.png',     // Base Sepolia
  421614:   'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/arbitrum/info/logo.png', // Arbitrum Sepolia
  11155420: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/optimism/info/logo.png', // OP Sepolia
  80002:    'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/polygon/info/logo.png',  // Polygon Amoy
  43113:    'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/avalanchec/info/logo.png', // Avalanche Fuji
  1301:     'https://s2.coinmarketcap.com/static/img/coins/64x64/34413.png', // Unichain Sepolia
  1328:     'https://s2.coinmarketcap.com/static/img/coins/64x64/23149.png', // Sei Testnet
  4801:     'https://s2.coinmarketcap.com/static/img/coins/64x64/13502.png', // World Chain
  59141:    'https://s2.coinmarketcap.com/static/img/coins/64x64/27657.png', // Linea Sepolia
}

function ChainLogo({ chainId, size = 34, hasQty, C }: {
  chainId: number; size?: number; hasQty: boolean
  C: { blue: string; blueDim: string; blueBd: string; surf: string; bdr: string; t3: string }
}) {
  const [err, setErr] = useState(false)
  const logo = CHAIN_LOGOS[chainId]
  return (
    <div style={{
      width: size, height: size, borderRadius: 10, flexShrink: 0,
      background: hasQty ? C.blueDim : C.surf,
      border: hasQty ? `1px solid ${C.blueBd}` : `1px solid ${C.bdr}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden',
    }}>
      {logo && !err
        ? <img src={logo} alt="" onError={() => setErr(true)} style={{ width: size - 8, height: size - 8, objectFit: 'contain', borderRadius: 6 }} />
        : <Globe size={size * 0.44} color={hasQty ? C.blue : C.t3} />
      }
    </div>
  )
}

const F    = "'Inter', -apple-system, sans-serif"
const MONO = "'JetBrains Mono', Menlo, monospace"

const TOKEN_COLOR: Record<string, string> = {
  USDC: '#2775CA',
  EURC: '#0099CC',
  USDT: '#26A17B',
}

function StatusDot({ status }: { status: TokenPosition['status'] }) {
  const C = useNanTheme()
  if (status === 'confirmed') return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 600, color: C.green }}>
      <CheckCircle2 size={10} color={C.green} /> Confirmed
    </span>
  )
  if (status === 'pending') return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 600, color: C.gold }}>
      <Clock size={10} color={C.gold} /> Pending
    </span>
  )
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 600, color: C.t3 }}>
      <AlertCircle size={10} color={C.t3} /> Unavailable
    </span>
  )
}

interface Props {
  symbol: 'USDC' | 'EURC' | 'USDT'
  /** All positions for this token across all chains */
  positions: TokenPosition[]
  totalQuantity: string
  totalUsdValue: string
  /** Gateway available USDC (only shown for USDC) */
  gatewayAvailable: string
  gatewayPending: string
  eurUsdRate: number
  hidden: boolean
  onClose: () => void
}

export function TokenNetworkSheet({
  symbol, positions, totalQuantity, totalUsdValue,
  gatewayAvailable, gatewayPending,
  hidden, onClose,
}: Props) {
  const C = useNanTheme()
  const { setActiveView } = useAppStore()

  const color = TOKEN_COLOR[symbol] ?? '#2775CA'
  const isEurc = symbol === 'EURC'
  const gwAvail = parseFloat(gatewayAvailable)
  const gwPend  = parseFloat(gatewayPending)
  const showGateway = symbol === 'USDC' && (gwAvail > 0 || gwPend > 0)

  // All chains: positions with balance first, then rest
  const sorted = [...positions].sort((a, b) => {
    const aHas = parseFloat(a.quantity) > 0
    const bHas = parseFloat(b.quantity) > 0
    if (aHas && !bHas) return -1
    if (!aHas && bHas) return 1
    return a.chainName.localeCompare(b.chainName)
  })

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(0,0,0,0.6)',
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
        maxHeight: '92vh',
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
          padding: '12px 20px 14px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Token dot */}
            <div style={{
              width: 40, height: 40, borderRadius: 13, flexShrink: 0,
              background: `${color}22`, border: `1.5px solid ${color}55`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 800, color,
            }}>
              {symbol.slice(0, 2)}
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: C.text, letterSpacing: '-0.03em' }}>
                {symbol}
              </div>
              <div style={{ fontSize: 12, color: C.t3, marginTop: 1 }}>
                {hidden ? '••••' : `${isEurc ? '€' : '$'}${totalQuantity}`}
                {!hidden && (
                  <span style={{ color: C.t3 }}>
                    {isEurc ? ` ≈ $${totalUsdValue}` : ''} · all chains
                  </span>
                )}
              </div>
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

        <div style={{ padding: '0 20px 40px', display: 'flex', flexDirection: 'column', gap: 22 }}>

          {/* ── Quick actions ── */}
          <div style={{ display: 'flex', gap: 8 }}>
            {[
              { icon: ArrowUpRight,   label: 'Send',    view: 'send',    ok: parseFloat(totalQuantity) > 0 },
              { icon: ArrowDownLeft,  label: 'Receive', view: 'receive', ok: true },
              { icon: ArrowLeftRight, label: 'Bridge',  view: 'bridge',  ok: true },
              { icon: Zap,            label: 'Gateway', view: 'gateway', ok: true },
            ].map(({ icon: Icon, label, view, ok }) => (
              <button
                key={label}
                onClick={() => { if (ok) { setActiveView(view); onClose() } }}
                disabled={!ok}
                style={{
                  flex: 1, padding: '10px 4px',
                  borderRadius: 12, border: `1px solid ${C.bdr}`,
                  background: C.surf2,
                  cursor: ok ? 'pointer' : 'not-allowed',
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', gap: 5,
                  fontFamily: F, opacity: ok ? 1 : 0.4,
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <Icon size={16} color={ok ? C.blue : C.t3} />
                <span style={{ fontSize: 11, fontWeight: 600, color: ok ? C.t2 : C.t3 }}>{label}</span>
              </button>
            ))}
          </div>

          {/* ── Gateway row (USDC only) ── */}
          {showGateway && (
            <div style={{
              padding: '14px 16px', borderRadius: 16,
              background: 'linear-gradient(135deg, rgba(0,102,255,0.08) 0%, rgba(0,102,255,0.03) 100%)',
              border: '1px solid rgba(0,102,255,0.18)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Zap size={13} color={C.blue} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Gateway Liquidity</span>
                  <button
                    title="USDC deposited into Circle Gateway for instant cross-chain transfers. Excluded from portfolio total — same underlying funds."
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}
                  >
                    <Info size={11} color={C.t3} />
                  </button>
                </div>
                <button
                  onClick={() => { setActiveView('gateway'); onClose() }}
                  style={{ fontSize: 11, fontWeight: 700, color: C.blue, background: 'none', border: 'none', cursor: 'pointer', fontFamily: F }}
                >
                  Manage
                </button>
              </div>
              <div style={{ display: 'flex', gap: 20 }}>
                <div>
                  <div style={{ fontSize: 10, color: C.t3, marginBottom: 3 }}>Available</div>
                  <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 800, color: C.text }}>
                    {hidden ? '••••' : `$${gwAvail.toFixed(2)}`}
                  </div>
                </div>
                {gwPend > 0 && (
                  <div>
                    <div style={{ fontSize: 10, color: C.t3, marginBottom: 3 }}>Pending</div>
                    <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 800, color: C.gold }}>
                      {hidden ? '••••' : `$${gwPend.toFixed(2)}`}
                    </div>
                  </div>
                )}
              </div>
              <div style={{ fontSize: 10, color: C.t3, marginTop: 6 }}>
                Excluded from portfolio total — same underlying USDC
              </div>
            </div>
          )}

          {/* ── Balances by Network ── */}
          <section>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.t3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
              Balances by Network
            </div>

            {sorted.length === 0 ? (
              <div style={{ fontSize: 13, color: C.t3 }}>No network data available.</div>
            ) : (
              <div style={{ background: C.surf2, borderRadius: 16, border: `1px solid ${C.bdr}`, overflow: 'hidden' }}>
                {sorted.map((pos, idx) => {
                  const hasQty   = parseFloat(pos.quantity) > 0
                  const isLast   = idx === sorted.length - 1
                  const shortNet = pos.chainName.replace(' Testnet','').replace(' Sepolia','').replace(' Fuji','').replace(' Amoy','')
                  return (
                    <div
                      key={`${pos.symbol}-${pos.chainId}`}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '13px 14px',
                        borderBottom: isLast ? 'none' : `1px solid ${C.bdr}`,
                        opacity: hasQty ? 1 : 0.55,
                      }}
                    >
                      {/* Network icon */}
                      <ChainLogo chainId={pos.chainId} hasQty={hasQty} C={C} />

                      {/* Chain name + status */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 3 }}>
                          {shortNet}
                        </div>
                        <StatusDot status={pos.status} />
                      </div>

                      {/* Amount */}
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: hasQty ? C.text : C.t3 }}>
                          {hidden ? '••••' : `${isEurc ? '€' : '$'}${pos.quantity}`}
                        </div>
                        {!hidden && hasQty && isEurc && (
                          <div style={{ fontSize: 10, color: C.t3 }}>≈ ${pos.usdValue}</div>
                        )}
                        {!hidden && hasQty && !isEurc && (
                          <div style={{ fontSize: 10, color: C.t3 }}>USD</div>
                        )}
                        {!hasQty && (
                          <a
                            href={pos.chainId ? `${sorted.find(p => p.chainId === pos.chainId)?.chainName ?? ''}` : '#'}
                            style={{ fontSize: 10, color: C.t3, textDecoration: 'none' }}
                          >
                            Empty
                          </a>
                        )}
                      </div>

                      {/* Explorer link */}
                      <a
                        href={`https://explorer.testnet.arc.io`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        style={{ padding: 4, opacity: hasQty ? 0.6 : 0.3 }}
                        title={`View on ${pos.chainName} explorer`}
                      >
                        <ExternalLink size={13} color={C.t3} />
                      </a>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

        </div>
      </div>
    </>
  )
}
