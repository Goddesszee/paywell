import React, { useState, useEffect } from 'react'
import { useAccount, useReadContract } from 'wagmi'
import { erc20Abi } from 'viem'
import { Eye, EyeOff, ArrowUpRight, ArrowDownLeft, X, Copy, Check, Share2 } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { toast } from 'sonner'
import { useAppStore } from '../../store/appStore'
import { getUsdc } from '../../onchain-facts'
import { Amount, usdcDecimalsFor } from '../../onchain-money'
import { useNanTheme } from '../../hooks/useNanTheme'

const F    = "'Inter', -apple-system, sans-serif"
const MONO = "'JetBrains Mono', 'SF Mono', Menlo, monospace"
const ARC  = 5042002
const BLUE = '#0066FF'

type PerfPeriod = '24H' | '7D' | '1M' | '3M' | '1Y'

// ── tiny sparkline SVG ────────────────────────────────────────────────────────
function Sparkline({ points, color, height = 80 }: { points: number[]; color: string; height?: number }) {
  if (points.length < 2) return (
    <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', fontFamily: F }}>
        No balance history recorded yet — this starts tracking real changes from today.
      </span>
    </div>
  )
  const W = 560
  const H = height
  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max - min || 1
  const xs = points.map((_, i) => (i / (points.length - 1)) * W)
  const ys = points.map(v => H - ((v - min) / range) * (H * 0.8) - H * 0.1)
  const d = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x},${ys[i]}`).join(' ')
  const fill = `${d} L${W},${H} L0,${H} Z`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height }} preserveAspectRatio="none">
      <defs>
        <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fill} fill="url(#sg)" />
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

// ── donut chart ───────────────────────────────────────────────────────────────
function Donut({ value, label, color = BLUE }: { value: string; label: string; color?: string }) {
  const R = 70
  const cx = 90
  const cy = 90
  const stroke = 18
  const circ = 2 * Math.PI * R
  return (
    <svg width={180} height={180}>
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
      <circle
        cx={cx} cy={cy} r={R} fill="none"
        stroke={color} strokeWidth={stroke}
        strokeDasharray={`${circ * 0.92} ${circ * 0.08}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: 'stroke-dasharray 0.6s ease' }}
      />
      <text x={cx} y={cy - 8} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="11" fontFamily={F}>{label}</text>
      <text x={cx} y={cy + 12} textAnchor="middle" fill="#fff" fontSize="18" fontWeight="800" fontFamily={MONO}>{value}</text>
    </svg>
  )
}

// ── main ──────────────────────────────────────────────────────────────────────
// ── Live NGN/USD exchange rate ─────────────────────────────────────────────────
interface ErApiResponse { rates?: Record<string, number> }
function useNgnRate() {
  const [rate, setRate] = useState<number>(1630) // sensible fallback
  useEffect(() => {
    void fetch('https://open.er-api.com/v6/latest/USD')
      .then(r => r.json() as Promise<ErApiResponse>)
      .then(d => { if (d?.rates?.NGN) setRate(Number(d.rates.NGN)) })
      .catch(() => {}) // keep fallback silently
  }, [])
  return rate
}

export function DashboardPage() {
  const C = useNanTheme()
  const { address: wagmiAddress } = useAccount()
  const { setActiveView, activity, auth } = useAppStore()
  // Circle wallet users don't connect a browser wallet — fall back to their Circle wallet address
  const address = wagmiAddress ?? (auth?.circleWalletAddress as `0x${string}` | undefined)
  const [hidden, setHidden] = useState(false)
  const [period, setPeriod] = useState<PerfPeriod>('24H')
  const [showReceive, setShowReceive] = useState(false)
  const [copied, setCopied] = useState(false)
  const ngnRate = useNgnRate()

  const copyAddress = () => {
    if (!address) return
    void navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success('Address copied')
  }

  const usdcFact = getUsdc(ARC)
  const { data: rawBalance, isLoading } = useReadContract({
    address: usdcFact?.address as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: ARC,
    query: { enabled: !!address && !!usdcFact },
  })

  const formatted = rawBalance !== undefined
    ? Amount.fromRaw(rawBalance, usdcDecimalsFor(ARC)).toFixed(2)
    : '0.00'
  const numVal = parseFloat(formatted)

  // Sync live balance into the global store so AgentChat can read it
  const setMainWalletBalance = useAppStore(s => s.setMainWalletBalance)
  useEffect(() => {
    if (rawBalance !== undefined && address) {
      setMainWalletBalance(formatted, address)
    }
  }, [formatted, address, rawBalance, setMainWalletBalance])

  // Build sparkline from activity history (fallback: empty → shows placeholder)
  const [sparkPoints, setSparkPoints] = useState<number[]>([])
  /* eslint-disable react/set-state-in-effect */
  useEffect(() => {
    if (activity.length === 0) { setSparkPoints([]); return }
    let running = numVal
    const pts = [running]
    const sorted = [...activity].sort((a, b) => Number(b.timestamp) - Number(a.timestamp)).slice(0, 20)
    sorted.forEach(tx => {
      const amt = typeof tx.amount === 'number' ? tx.amount : parseFloat(String(tx.amount))
      running = running - (tx.sign === '+' ? amt : -amt)
      pts.unshift(running)
    })
    setSparkPoints(pts)
  }, [activity, numVal])
  /* eslint-enable react/set-state-in-effect */

  const PERIODS: PerfPeriod[] = ['24H', '7D', '1M', '3M', '1Y']

  // Holdings breakdown (USDC only for now, others at 0)
  const holdings = [
    { label: 'USDC',    value: numVal,  color: BLUE,      pct: 100 },
    { label: 'EURC',    value: 0,       color: '#0099CC', pct: 0 },
    { label: 'NGN',     value: 0,       color: '#00A651', pct: 0 },
  ]

  const card: React.CSSProperties = {
    background: C.isDark ? '#111318' : '#fff',
    border: `1px solid ${C.bdr}`,
    borderRadius: 16,
    padding: '20px 24px',
  }

  return (
    <div style={{ fontFamily: F, padding: '28px 32px 48px', minHeight: '100%' }}>

      {/* ── Header row ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, gap: 16 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: C.text, letterSpacing: '-0.04em', margin: 0 }}>Dashboard</h1>
        <button
          onClick={() => setActiveView('onramp')}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '11px 22px', borderRadius: 50,
            background: BLUE, border: 'none',
            color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: F,
            boxShadow: '0 4px 18px rgba(0,102,255,0.35)',
            letterSpacing: '-0.01em',
          }}
        >
          <span style={{ fontSize: 18, lineHeight: 1 }}>+</span> Add Money
        </button>
      </div>

      {/* ── Total portfolio balance card ── */}
      <div style={{ ...card, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.t3, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                Total Portfolio Balance
              </span>
              <button
                onClick={() => setHidden(h => !h)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex' }}
              >
                {hidden ? <EyeOff size={14} color={C.t3} /> : <Eye size={14} color={C.t3} />}
              </button>
            </div>
            {isLoading ? (
              <div style={{ height: 44, width: 180, background: C.surf2, borderRadius: 8 }} />
            ) : (
              <div style={{ fontSize: 40, fontWeight: 800, color: C.text, letterSpacing: '-0.04em', fontFamily: MONO, lineHeight: 1 }}>
                {hidden ? '••••••' : `$${formatted}`}
              </div>
            )}
            <div style={{ fontSize: 13, color: C.t3, marginTop: 6 }}>
              ≈ NGN {hidden ? '•••••' : (numVal * ngnRate).toLocaleString('en', { maximumFractionDigits: 0 })}
            </div>
          </div>

          {/* Deposit / Withdraw */}
          <div style={{ display: 'flex', gap: 10, flexShrink: 0, alignItems: 'center', marginTop: 8 }}>
            <button
              onClick={() => setShowReceive(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '10px 22px', borderRadius: 10,
                background: BLUE, border: 'none',
                color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: F,
                boxShadow: '0 4px 16px rgba(0,102,255,0.35)',
              }}
            >
              <ArrowDownLeft size={15} /> Deposit
            </button>
            <button
              onClick={() => setActiveView('send')}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '10px 22px', borderRadius: 10,
                background: 'transparent',
                border: `1.5px solid ${BLUE}`,
                color: BLUE, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: F,
              }}
            >
              <ArrowUpRight size={15} /> Withdraw
            </button>
          </div>
        </div>
      </div>

      {/* ── Two column row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16 }}>

        {/* Portfolio Performance */}
        <div style={{ ...card }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Portfolio Performance</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {PERIODS.map(p => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  style={{
                    padding: '4px 10px', borderRadius: 7, fontSize: 11, fontWeight: 700,
                    border: 'none', cursor: 'pointer', fontFamily: F,
                    background: period === p ? BLUE : 'transparent',
                    color: period === p ? '#fff' : C.t3,
                    transition: 'all 0.15s',
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <Sparkline points={sparkPoints} color={BLUE} height={120} />
        </div>

        {/* Portfolio Holdings */}
        <div style={{ ...card, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: C.text, alignSelf: 'flex-start', marginBottom: 12 }}>Portfolio Holdings</span>
          <Donut value={hidden ? '••••' : `$${formatted}`} label="Total" color={BLUE} />
          {/* Legend */}
          <div style={{ width: '100%', marginTop: 12 }}>
            {holdings.map(h => (
              <div key={h.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', borderTop: `1px solid ${C.bdr}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: h.color, display: 'inline-block' }} />
                  <span style={{ fontSize: 12, color: C.t2 }}>{h.label}</span>
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: C.text, fontFamily: MONO }}>
                  {hidden ? '••••' : `$${h.value.toFixed(2)}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Recent transactions ── */}
      <div style={{ ...card, marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Recent Transactions</span>
          <button
            onClick={() => setActiveView('activity')}
            style={{ fontSize: 12, color: BLUE, background: 'none', border: 'none', cursor: 'pointer', fontFamily: F, fontWeight: 600 }}
          >
            View all →
          </button>
        </div>
        {activity.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '28px 0', color: C.t3, fontSize: 13 }}>
            No transactions yet — send or receive USDC to get started.
          </div>
        ) : (
          activity.slice(0, 6).map((tx, i) => {
            const isIn = tx.sign === '+'
            return (
              <div key={tx.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 0',
                borderBottom: i < Math.min(activity.length, 6) - 1 ? `1px solid ${C.bdr}` : 'none',
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  background: isIn ? 'rgba(0,200,83,0.1)' : 'rgba(255,59,59,0.1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {isIn
                    ? <ArrowDownLeft size={16} color="#00C853" />
                    : <ArrowUpRight size={16} color="#FF3B3B" />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.description}</div>
                  <div style={{ fontSize: 11, color: C.t3, marginTop: 1 }}>
                    {tx.counterparty || new Date(tx.timestamp).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                </div>
                <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: isIn ? '#00C853' : '#FF3B3B', flexShrink: 0 }}>
                  {tx.sign}{tx.amount} USDC
                </span>
              </div>
            )
          })
        )}
      </div>

      {/* ── Receive / Deposit modal ── */}
      {showReceive && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24,
        }} onClick={() => setShowReceive(false)}>
          <div style={{
            background: C.isDark ? '#0E1014' : '#fff',
            borderRadius: 24, padding: '32px 28px',
            width: '100%', maxWidth: 420,
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
            position: 'relative',
          }} onClick={e => e.stopPropagation()}>

            {/* Close */}
            <button onClick={() => setShowReceive(false)} style={{
              position: 'absolute', top: 16, right: 16,
              background: C.surf2, border: 'none', cursor: 'pointer',
              width: 32, height: 32, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <X size={16} color={C.t2} />
            </button>

            {/* Title */}
            <h2 style={{ fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: '-0.03em', marginBottom: 28, alignSelf: 'flex-start' }}>
              Receive
            </h2>

            {/* QR */}
            <div style={{
              width: 240, height: 240,
              background: C.surf2, borderRadius: 20, padding: 16,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
              marginBottom: 24,
            }}>
              {address ? (
                <QRCodeSVG
                  value={address}
                  size={208}
                  bgColor="transparent"
                  fgColor={C.isDark ? '#ffffff' : '#000000'}
                  level="M"
                />
              ) : (
                <div style={{ fontSize: 13, color: C.t3, textAlign: 'center' }}>Connect wallet to show QR</div>
              )}
            </div>

            {/* Network + address */}
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Arc Testnet</span>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: C.t3, display: 'inline-block' }} />
                <span style={{ fontSize: 14, color: C.t3, fontFamily: MONO }}>
                  {address ? `${address.slice(0,8)}...${address.slice(-6)}` : '—'}
                </span>
              </div>
              <p style={{ fontSize: 12, color: C.t3 }}>Only send USDC on Arc Testnet to this address</p>
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
              <button onClick={copyAddress} style={{
                width: '100%', height: 52, borderRadius: 100,
                background: copied ? '#00C853' : BLUE,
                border: 'none', cursor: 'pointer',
                fontSize: 15, fontWeight: 700, color: '#fff', fontFamily: F,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'background 0.2s',
              }}>
                {copied ? <Check size={17} /> : <Copy size={17} />}
                {copied ? 'Copied!' : 'Copy Address'}
              </button>
              <button onClick={() => { void navigator.share?.({ title: 'My NAN Wallet', text: `Send me USDC: ${address}`, url: window.location.href }) }} style={{
                width: '100%', height: 52, borderRadius: 100,
                background: C.surf2, border: `1px solid ${C.bdr}`,
                cursor: 'pointer', fontSize: 15, fontWeight: 700, color: C.text, fontFamily: F,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}>
                <Share2 size={17} /> Share
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
