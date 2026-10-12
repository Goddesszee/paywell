/**
 * RewardsSheet — slide-up modal for claiming USDC referral rewards.
 * Shows claimable balance, a Claim button, and balloon confetti on success.
 */
import { useState, useEffect } from 'react'
import { X, Gift, CheckCircle2, ExternalLink, Share2, Copy, Check as CheckIcon, AtSign } from 'lucide-react'
import { useNanTheme } from '../../hooks/useNanTheme'
import { useAccount } from 'wagmi'
import { useAppStore } from '../../store/appStore'
import { useReferral } from '../../hooks/useReferral'

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
  qualifiedCount?: number
  pendingFriends?: number
  requested?: string
  minTxUsd?: number
  rewardUsd?: number
  nextPayout?: string
  claims?: { id: string; amount: string; status: 'pending' | 'approved' | 'rejected' | 'paid'; createdAt: string; txHash?: string }[]
}

export function RewardsSheet({ onClose }: { onClose: () => void }) {
  const C = useNanTheme()
  const { address: wagmiAddress } = useAccount()
  const { auth, nanHandle, setActiveView } = useAppStore()
  const address = wagmiAddress ?? auth?.circleWalletAddress

  // useReferral is kept for trackReferral side-effects; we don't use its code here.
  useReferral()

  // Only show a referral link when the user has a NAN name — the code is tied to the handle.
  // useReferral auto-generates a code from any identity key, but we gate sharing on nanHandle
  // so every link is meaningful and human-readable (nanarc.xyz/join?ref=alice, not a hex string).
  const nanCode = nanHandle ? nanHandle.replace(/^@/, '') : null
  const referralLink = nanCode ? `https://nanarc.xyz/join?ref=${nanCode}` : null

  const [data, setData] = useState<RewardsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [claiming, setClaiming] = useState(false)
  const [claimed, setClaimed] = useState<{ amount: string } | null>(null)
  const [error, setError] = useState('')
  const [showBalloons, setShowBalloons] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)

  const shareLink = async () => {
    if (!referralLink) return
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Join me on NAN', text: 'Send and receive USDC instantly — earn $1 USDC for signing up!', url: referralLink })
        return
      } catch { /* dismissed */ }
    }
    // fallback: copy
    navigator.clipboard.writeText(referralLink).then(() => {
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2500)
    }).catch(() => {})
  }

  useEffect(() => {
    if (!address) {
      // eslint-disable-next-line react/set-state-in-effect
      setLoading(false)
      return
    }
    fetch(`/api/rewards/balance?wallet=${encodeURIComponent(address)}&handle=${encodeURIComponent(nanCode ?? '')}`)
      .then(async r => {
        const d = await r.json().catch(() => null) as (RewardsData & { success?: boolean }) | null
        if (!r.ok || !d?.success) throw new Error('unavailable')
        return d
      })
      .then(d => {
        // eslint-disable-next-line react/set-state-in-effect
        setData(d)
      })
      // eslint-disable-next-line react/set-state-in-effect
      .catch(() => setError('Rewards are temporarily unavailable. Please try again later.'))
      // eslint-disable-next-line react/set-state-in-effect
      .finally(() => setLoading(false))
  }, [address, nanCode])

  const claim = async () => {
    if (!address) return
    setClaiming(true); setError('')
    try {
      const res = await fetch('/api/rewards/claim', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ wallet: address, handle: nanCode ?? '' }),
      })
      const d = await res.json().catch(() => null) as { success?: boolean; amount?: string; error?: string } | null
      if (!d?.success) { setError(d?.error ?? 'Could not request the payout. Please try again.'); return }
      setClaimed({ amount: d.amount ?? '' })
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
        padding: '0 20px 24px',
        fontFamily: F,
        maxHeight: '94dvh',
        overflowY: 'auto',
        boxShadow: C.isDark ? '0 -24px 64px rgba(0,0,0,0.7)' : '0 -24px 64px rgba(0,0,0,0.15)',
      }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, marginBottom: 4 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: C.bdr }} />
        </div>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0 12px' }}>
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
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <CheckCircle2 size={36} color="#10B981" />
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: C.text, marginBottom: 6, letterSpacing: '-0.03em' }}>
              ${claimed.amount} USDC requested
            </div>
            <div style={{ fontSize: 14, color: C.t2, marginBottom: 8, lineHeight: 1.5 }}>
              Your payout is waiting for admin approval.<br />Approved payouts are paid monthly{data?.nextPayout ? ` — next on ${new Date(data.nextPayout).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}.
            </div>
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
                ? 'linear-gradient(135deg, rgba(8,102,245,0.12) 0%, rgba(80,0,255,0.07) 100%)'
                : C.surf,
              border: `1px solid ${hasReward ? 'rgba(8,102,245,0.25)' : C.bdr}`,
              borderRadius: 16, padding: '14px 16px', marginBottom: 12, textAlign: 'center',
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Available to claim</div>
              <div style={{ fontSize: 34, fontWeight: 900, color: hasReward ? C.blue : C.t3, fontFamily: MONO, letterSpacing: '-0.04em', marginBottom: 4 }}>
                ${data?.claimable ?? '0.00'}
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.t3 }}>USDC</div>
            </div>

            {/* Stats row */}
            {data && (
              <>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  {[
                    { label: 'Friends joined', val: String(data.referralCount) },
                    { label: 'Qualified',      val: String(data.qualifiedCount ?? 0) },
                    { label: 'Total earned',   val: `$${data.totalEarned}` },
                    { label: 'Paid out',       val: `$${data.claimed}` },
                  ].map(({ label, val }) => (
                    <div key={label} style={{ flex: 1, background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 12, padding: '9px 4px', textAlign: 'center' }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: C.text, fontFamily: MONO }}>{val}</div>
                      <div style={{ fontSize: 10, color: C.t3, marginTop: 3 }}>{label}</div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 12, color: C.t3, lineHeight: 1.5, marginBottom: 10, textAlign: 'center' }}>
                  {(data.pendingFriends ?? 0) > 0 && <>{data.pendingFriends} friend{data.pendingFriends === 1 ? '' : 's'} joined — you earn ${data.rewardUsd ?? 1} when they make a ${data.minTxUsd ?? 100} transfer.<br /></>}
                  Payouts are approved by an admin and paid monthly{data.nextPayout ? ` (next: ${new Date(data.nextPayout).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })})` : ''}.
                </div>
                {(data.claims ?? []).length > 0 && (
                  <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 12, padding: '4px 12px', marginBottom: 10 }}>
                    {(data.claims ?? []).slice(0, 3).map(c => (
                      <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', fontSize: 12, color: C.t2 }}>
                        <span style={{ fontFamily: MONO, color: C.text, fontWeight: 700 }}>${c.amount}</span>
                        <span style={{ fontWeight: 700, color: c.status === 'paid' ? '#10B981' : c.status === 'rejected' ? '#EF4444' : c.status === 'approved' ? C.blue : C.t3, textTransform: 'capitalize' }}>{c.status === 'pending' ? 'Awaiting approval' : c.status}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {error && (
              <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.20)', borderRadius: 10, padding: '9px 12px', fontSize: 13, color: '#EF4444', marginBottom: 12 }}>
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
                  boxShadow: claiming ? 'none' : '0 6px 20px rgba(8,102,245,0.40)',
                  transition: 'all 0.15s',
                }}
              >
                {claiming ? 'Requesting…' : `Request payout · $${data?.claimable}`}
              </button>
            ) : (
              <div style={{ textAlign: 'center', padding: '0 0 2px' }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 4 }}>No rewards yet</div>
                <div style={{ fontSize: 13, color: C.t3, lineHeight: 1.5, marginBottom: 14 }}>
                  Share your referral link with friends.<br />
                  You earn <strong style={{ color: C.blue }}>$1 USDC</strong> when a friend joins through your link and makes a $100 transfer.
                </div>

                {/* Gate: must have a NAN name to get a referral link */}
                {!nanCode ? (
                  /* ── No NAN name → CTA to claim one ── */
                  <div style={{
                    background: 'rgba(8,102,245,0.06)', border: '1px solid rgba(8,102,245,0.18)',
                    borderRadius: 16, padding: '16px 16px', marginBottom: 4,
                  }}>
                    <div style={{
                      width: 48, height: 48, borderRadius: 14,
                      background: 'rgba(8,102,245,0.12)', border: '1px solid rgba(8,102,245,0.25)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      margin: '0 auto 10px',
                    }}>
                      <AtSign size={22} color={C.blue} />
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 6 }}>
                      Claim your NAN name first
                    </div>
                    <div style={{ fontSize: 12, color: C.t3, lineHeight: 1.55, marginBottom: 16 }}>
                      Your NAN name becomes your unique referral link — easy to share and instantly recognisable.
                    </div>
                    <button
                      onClick={() => { onClose(); setActiveView('nan-name') }}
                      style={{
                        width: '100%', padding: '13px', borderRadius: 12,
                        background: C.blue, border: 'none', color: '#fff',
                        fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: F,
                        letterSpacing: '-0.01em',
                      }}
                    >
                      Get my NAN name →
                    </button>
                  </div>
                ) : (
                  /* ── Has NAN name → show link + share ── */
                  <>
                    <div style={{
                      background: C.surf2, border: `1px dashed rgba(8,102,245,0.30)`,
                      borderRadius: 12, padding: '10px 14px', marginBottom: 14,
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                    }}>
                      <div style={{ textAlign: 'left', minWidth: 0 }}>
                        <div style={{ fontSize: 10, color: C.t3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>Your code</div>
                        <div style={{ fontSize: 18, fontWeight: 900, color: C.blue, letterSpacing: '0.1em', fontFamily: MONO }}>{nanCode}</div>
                      </div>
                      <button
                        onClick={() => {
                          if (!referralLink) return
                          navigator.clipboard.writeText(referralLink).then(() => {
                            setLinkCopied(true)
                            setTimeout(() => setLinkCopied(false), 2500)
                          }).catch(() => {})
                        }}
                        style={{ width: 36, height: 36, borderRadius: 9, background: C.surf, border: `1px solid ${C.bdr}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
                      >
                        {linkCopied ? <CheckIcon size={14} color="#10B981" /> : <Copy size={14} color={C.t3} />}
                      </button>
                    </div>

                    <button
                      onClick={() => { void shareLink() }}
                      style={{
                        width: '100%', padding: '14px', borderRadius: 13,
                        background: C.blue, border: 'none', color: '#fff',
                        fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: F,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        boxShadow: '0 5px 18px rgba(8,102,245,0.38)',
                      }}
                    >
                      <Share2 size={16} /> Share my referral link
                    </button>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
