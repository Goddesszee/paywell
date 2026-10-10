/**
 * RewardsSheet — slide-up modal for claiming USDC referral rewards.
 * Shows claimable balance, a Claim button, and balloon confetti on success.
 */
import { useState, useEffect } from 'react'
import { X, Gift, CheckCircle2, ExternalLink } from 'lucide-react'
import { useNanTheme } from '../../hooks/useNanTheme'
import { useAccount } from 'wagmi'
import { useAppStore } from '../../store/appStore'

const F    = "'Inter', -apple-system, sans-serif"
const MONO = "'JetBrains Mono', Menlo, monospace"

// ── Balloon confetti ───────────────────────────────────────────────────────────
const BALLOON_COLORS = ['#FF6B6B','#FFD93D','#6BCB77','#4D96FF','#C77DFF','#FF9F1C','#2EC4B6']
const BALLOON_COUNT = 22

interface Balloon {
  id: number; x: number; color: string; size: number
  duration: number; delay: number; swayAmp: number; swayDir: 1 | -1
}

// Deterministic pseudo-random using a seeded sequence — no Math.random() at module level
function seededRand(seed: number) { return ((seed * 1664525 + 1013904223) & 0x7fffffff) / 0x7fffffff }

// Pre-generated deterministic balloon positions — computed once, no re-render instability
const STATIC_BALLOONS: Balloon[] = Array.from({ length: BALLOON_COUNT }, (_, i) => {
  const r1 = seededRand(i * 7 + 1)
  const r2 = seededRand(i * 7 + 2)
  const r3 = seededRand(i * 7 + 3)
  const r4 = seededRand(i * 7 + 4)
  const r5 = seededRand(i * 7 + 5)
  const r6 = seededRand(i * 7 + 6)
  return {
    id: i,
    x: 4 + r1 * 92,
    color: BALLOON_COLORS[i % BALLOON_COLORS.length],
    size: 28 + r2 * 20,
    duration: 2.4 + r3 * 1.8,
    delay: r4 * 1.2,
    swayAmp: 12 + r5 * 18,
    swayDir: (r6 > 0.5 ? 1 : -1),
  }
})

function BalloonCanvas({ visible }: { visible: boolean }) {
  if (!visible) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9999, overflow: 'hidden',
    }}>
      <style>{`
        @keyframes balloon-rise {
          0%   { transform: translateY(110vh) translateX(0px); opacity: 1; }
          80%  { opacity: 1; }
          100% { transform: translateY(-20vh) translateX(var(--sway)); opacity: 0; }
        }
        @keyframes balloon-sway {
          0%,100% { margin-left: 0; }
          50%     { margin-left: var(--sway-amp); }
        }
      `}</style>
      {STATIC_BALLOONS.map(b => (
        <div key={b.id} style={{
          position: 'absolute',
          left: `${b.x}%`,
          bottom: 0,
          animation: `balloon-rise ${b.duration}s ease-in ${b.delay}s forwards`,
          '--sway': `${b.swayDir * b.swayAmp}px`,
        } as React.CSSProperties}>
          {/* balloon oval */}
          <svg width={b.size} height={b.size * 1.25} viewBox="0 0 40 52" fill="none">
            <ellipse cx="20" cy="20" rx="18" ry="20" fill={b.color} opacity="0.92" />
            <ellipse cx="14" cy="12" rx="5" ry="4" fill="rgba(255,255,255,0.3)" />
            <path d="M20 40 Q22 46 20 52" stroke={b.color} strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
      ))}
    </div>
  )
}

// ── Main sheet ─────────────────────────────────────────────────────────────────
interface RewardsData {
  claimable: string
  totalEarned: string
  claimed: string
  referralCount: number
}

export function RewardsSheet({ onClose }: { onClose: () => void }) {
  const C = useNanTheme()
  const { address: wagmiAddress } = useAccount()
  const { auth } = useAppStore()
  const address = wagmiAddress ?? auth?.circleWalletAddress

  const [data, setData] = useState<RewardsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [claiming, setClaiming] = useState(false)
  const [claimed, setClaimed] = useState<{ amount: string; txHash: string } | null>(null)
  const [error, setError] = useState('')
  const [showBalloons, setShowBalloons] = useState(false)

  useEffect(() => {
    if (!address) {
      // eslint-disable-next-line react/set-state-in-effect
      setLoading(false)
      return
    }
    fetch(`/api/rewards/balance?wallet=${address}`)
      .then(r => r.json())
      .then((d: RewardsData & { success: boolean }) => {
        // eslint-disable-next-line react/set-state-in-effect
        if (d.success) setData(d)
      })
      // eslint-disable-next-line react/set-state-in-effect
      .catch(() => setError('Could not load rewards'))
      // eslint-disable-next-line react/set-state-in-effect
      .finally(() => setLoading(false))
  }, [address])

  const claim = async () => {
    if (!address) return
    setClaiming(true); setError('')
    try {
      const res = await fetch('/api/rewards/claim', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ wallet: address }),
      })
      const d = await res.json() as { success: boolean; amount: string; txHash: string; error?: string }
      if (!d.success) { setError(d.error ?? 'Claim failed'); return }
      setClaimed({ amount: d.amount, txHash: d.txHash })
      setShowBalloons(true)
      setTimeout(() => setShowBalloons(false), 4500)
    } catch {
      setError('Network error — please try again')
    } finally {
      setClaiming(false)
    }
  }

  const claimable = parseFloat(data?.claimable ?? '0')
  const hasReward  = claimable > 0

  return (
    <>
      <BalloonCanvas visible={showBalloons} />

      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
      />

      {/* Sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 610,
        background: C.isDark ? '#0D1017' : '#FFFFFF',
        borderRadius: '20px 20px 0 0',
        border: `1px solid ${C.bdr}`,
        borderBottom: 'none',
        padding: '0 20px 40px',
        fontFamily: F,
        maxHeight: '85dvh',
        overflowY: 'auto',
        boxShadow: C.isDark ? '0 -24px 64px rgba(0,0,0,0.7)' : '0 -24px 64px rgba(0,0,0,0.15)',
      }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, marginBottom: 4 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: C.bdr }} />
        </div>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: C.blue, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Gift size={20} color="#fff" strokeWidth={1.8} />
            </div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: C.text }}>Rewards</div>
              <div style={{ fontSize: 12, color: C.t3 }}>Earn USDC by referring friends</div>
            </div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, background: C.surf2, border: `1px solid ${C.bdr}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <X size={14} color={C.t2} />
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: C.t3, fontSize: 14 }}>Loading…</div>
        ) : claimed ? (
          /* ── SUCCESS STATE ── */
          <div style={{ textAlign: 'center', padding: '20px 0 10px' }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(0,200,83,0.12)', border: '1px solid rgba(0,200,83,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <CheckCircle2 size={36} color="#00C853" />
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: C.text, marginBottom: 6, letterSpacing: '-0.03em' }}>
              ${claimed.amount} USDC claimed!
            </div>
            <div style={{ fontSize: 14, color: C.t2, marginBottom: 24, lineHeight: 1.5 }}>
              Sent to your wallet
            </div>
            <a
              href={`https://explorer.testnet.arc.io/tx/${claimed.txHash}`}
              target="_blank" rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.blue, textDecoration: 'none', fontWeight: 600 }}
            >
              View on explorer <ExternalLink size={12} />
            </a>
            <div style={{ marginTop: 28 }}>
              <button onClick={onClose} style={{ width: '100%', padding: '13px', borderRadius: 12, background: C.blue, border: 'none', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: F }}>
                Done
              </button>
            </div>
          </div>
        ) : (
          /* ── CLAIM STATE ── */
          <>
            {/* Balance card */}
            <div style={{
              background: hasReward
                ? 'linear-gradient(135deg, rgba(0,102,255,0.12) 0%, rgba(80,0,255,0.07) 100%)'
                : C.surf,
              border: `1px solid ${hasReward ? 'rgba(0,102,255,0.25)' : C.bdr}`,
              borderRadius: 16, padding: '20px', marginBottom: 16, textAlign: 'center',
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Claimable Balance</div>
              <div style={{ fontSize: 42, fontWeight: 900, color: hasReward ? C.blue : C.t3, fontFamily: MONO, letterSpacing: '-0.04em', marginBottom: 4 }}>
                ${data?.claimable ?? '0.00'}
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.t3 }}>USDC</div>
            </div>

            {/* Stats row */}
            {data && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                {[
                  { label: 'Friends referred', val: String(data.referralCount) },
                  { label: 'Total earned',     val: `$${data.totalEarned}` },
                  { label: 'Already claimed',  val: `$${data.claimed}` },
                ].map(({ label, val }) => (
                  <div key={label} style={{ flex: 1, background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 12, padding: '10px 8px', textAlign: 'center' }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: C.text, fontFamily: MONO }}>{val}</div>
                    <div style={{ fontSize: 10, color: C.t3, marginTop: 3 }}>{label}</div>
                  </div>
                ))}
              </div>
            )}

            {error && (
              <div style={{ background: 'rgba(255,59,59,0.08)', border: '1px solid rgba(255,59,59,0.20)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#FF3B3B', marginBottom: 16 }}>
                {error}
              </div>
            )}

            {hasReward ? (
              <button
                onClick={() => { void claim() }}
                disabled={claiming}
                style={{
                  width: '100%', padding: '15px', borderRadius: 14,
                  background: claiming ? C.surf2 : C.blue,
                  border: 'none', color: claiming ? C.t2 : '#fff',
                  fontSize: 16, fontWeight: 800, cursor: claiming ? 'not-allowed' : 'pointer',
                  fontFamily: F, letterSpacing: '-0.01em',
                  boxShadow: claiming ? 'none' : '0 6px 20px rgba(0,102,255,0.40)',
                  transition: 'all 0.15s',
                }}
              >
                {claiming ? 'Claiming…' : `Claim $${data?.claimable} USDC`}
              </button>
            ) : (
              <div style={{ textAlign: 'center', padding: '12px 0 4px' }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>😔</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 6 }}>No rewards yet</div>
                <div style={{ fontSize: 13, color: C.t3, lineHeight: 1.5 }}>
                  Share your referral link from your Profile page.<br />
                  You earn $1 USDC for every friend who joins.
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
