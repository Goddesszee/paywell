/**
 * ReferralPage — full-screen referral page
 * Gateway-style card · referral code + copy · full link + copy · earnings · list · Share button
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { ArrowLeft, Copy, Check, Users, Link2, Gift } from 'lucide-react'
import { useAccount } from 'wagmi'
import { useAppStore } from '../../store/appStore'
import { useNanTheme } from '../../hooks/useNanTheme'

const F    = "'Inter', -apple-system, sans-serif"
const MONO = "'JetBrains Mono', Menlo, monospace"

// Gateway-matching palette
const BLUE      = '#0866F5'
const BLUE_DIM  = 'rgba(8,102,245,0.10)'
const BLUE_BD   = 'rgba(8,102,245,0.20)'

interface ReferralEntry { handle: string; joinedAt: number; firstTransfer: boolean }
interface ReferralData {
  code: string
  uses: number
  createdAt: number
  referrals?: ReferralEntry[]
}

/** Build best available identity key */
function buildKey(auth: Record<string,string> | null | undefined, wagmiAddress?: string): string | null {
  // Priority: wagmi wallet → Circle wallet → NAN wallet → email → session token
  if (wagmiAddress) return wagmiAddress
  const ca = auth?.circleWalletAddress ?? ''; if (ca) return ca
  const wa = auth?.walletAddress ?? '';       if (wa) return wa
  const em = auth?.email ?? '';               if (em) return encodeURIComponent(em)
  const st = auth?.sessionToken ?? '';        if (st) return `tok:${st.slice(0, 20)}`
  return null
}

export function ReferralPage() {
  const C = useNanTheme()
  const { address: wagmiAddress } = useAccount()
  const { auth, nanHandle, setActiveView, previousView } = useAppStore()

  const [data, setData]       = useState<ReferralData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(false)
  const [copied, setCopied]   = useState<'code' | 'link' | null>(null)

  const fetchedRef  = useRef(false)
  const retryTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)

  const doFetch = useCallback((key: string) => {
    fetchedRef.current = true
    setLoading(true); setError(false)
    fetch(`/api/referral?wallet=${encodeURIComponent(key)}`)
      .then(r => { if (!r.ok) throw new Error('http'); return r.json() })
      .then((d: Partial<ReferralData> & { success?: boolean }) => {
        if (d.code) {
          setData({ code: d.code, uses: d.uses ?? 0, createdAt: d.createdAt ?? Date.now(), referrals: d.referrals })
        } else { fetchedRef.current = false; setError(true) }
      })
      .catch(() => { fetchedRef.current = false; setError(true) })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchedRef.current = false
    if (retryTimer.current) clearTimeout(retryTimer.current)
    let attempts = 0

    const tryLoad = () => {
      // If NAN handle is known, use it as an additional prefix but still need wallet key for server
      const key = buildKey(auth as Record<string,string> | null, wagmiAddress)
        ?? (nanHandle ? `nan:${nanHandle}` : null)

      if (key) { doFetch(key); return }

      attempts++
      if (attempts < 12) {
        retryTimer.current = setTimeout(tryLoad, 500)
      } else {
        // absolute fallback — session fingerprint
        const fb = `fb:${Date.now().toString(36).slice(-8)}`
        doFetch(fb)
      }
    }
    tryLoad()
    return () => { if (retryTimer.current) clearTimeout(retryTimer.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nanHandle, wagmiAddress, auth])

  const referralLink = data?.code ? `https://nanarc.xyz/join?ref=${data.code}` : null
  const totalEarned  = (data?.uses ?? 0) * 1

  const doCopy = useCallback((text: string, which: 'code' | 'link') => {
    const done = () => { setCopied(which); setTimeout(() => setCopied(null), 2500) }
    const fallback = () => {
      try {
        const ta = document.createElement('textarea')
        ta.value = text
        ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0'
        document.body.appendChild(ta); ta.focus(); ta.select()
        document.execCommand('copy'); document.body.removeChild(ta); done()
      } catch { /* silent */ }
    }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(fallback)
    } else {
      fallback()
    }
  }, [])

  const doShare = useCallback(() => {
    if (!referralLink) return
    if (navigator.share) {
      navigator.share({ title: 'Join NAN', text: 'Join NAN — we both earn $1 USDC!', url: referralLink }).catch(() => doCopy(referralLink, 'link'))
    } else {
      doCopy(referralLink, 'link')
    }
  }, [referralLink, doCopy])

  const back = () => setActiveView(previousView && previousView !== 'referral' ? previousView : 'profile')

  const referrals: ReferralEntry[] = data?.referrals?.length
    ? data.referrals
    : Array.from({ length: data?.uses ?? 0 }, (_, i) => ({
        handle: `Friend #${i + 1}`,
        joinedAt: (data?.createdAt ?? Date.now()) + i * 86400000,
        firstTransfer: true,
      }))

  return (
    <div style={{ maxWidth: 480, width: '100%', margin: '0 auto', fontFamily: F, paddingBottom: 120 }}>

      {/* Back */}
      <button onClick={back} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 36, height: 36, borderRadius: 10,
        background: BLUE_DIM, border: `1px solid ${BLUE_BD}`,
        cursor: 'pointer', marginBottom: 20,
        WebkitTapHighlightColor: 'transparent',
      }}>
        <ArrowLeft size={18} color={BLUE} />
      </button>

      {/* Hero card — Gateway palette */}
      <div style={{
        borderRadius: 20, marginBottom: 16, position: 'relative', overflow: 'hidden',
        background: 'var(--nan-surface)',
        border: `1px solid ${BLUE_BD}`,
        padding: '28px 24px 24px',
      }}>
        {/* Blue accent top strip */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${BLUE}, #7B61FF)` }} />
        {/* Subtle glow blob */}
        <div style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: '50%', background: BLUE_DIM, filter: 'blur(40px)', pointerEvents: 'none' }} />

        {/* Icon + heading */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 14 }}>
          <div style={{
            width: 46, height: 46, borderRadius: 14, flexShrink: 0,
            background: BLUE_DIM, border: `1px solid ${BLUE_BD}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Gift size={22} color={BLUE} />
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--nan-text)', letterSpacing: '-0.03em', lineHeight: 1.2 }}>
              Refer a friend<br />and earn $1
            </div>
            <div style={{ fontSize: 12, color: 'var(--nan-text3)', lineHeight: 1.55, marginTop: 6 }}>
              Get $1 USDC when your friend signs up and makes their first transfer.
            </div>
          </div>
        </div>

        {/* Referral CODE */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--nan-text3)', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 8 }}>
            Referral Code
          </div>
          {loading ? (
            <div style={{ height: 38, width: 150, borderRadius: 10, background: BLUE_DIM }} />
          ) : error ? (
            <button
              onClick={() => { fetchedRef.current = false; const k = buildKey(auth as Record<string,string>|null, wagmiAddress) ?? (nanHandle ? `nan:${nanHandle}` : null); if (k) doFetch(k) }}
              style={{ background: 'none', border: 'none', color: '#ff6b6b', fontSize: 13, cursor: 'pointer', padding: 0 }}
            >
              Could not load — tap to retry
            </button>
          ) : data?.code ? (
            <button
              onClick={() => doCopy(data.code, 'code')}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: BLUE_DIM, border: `1.5px solid ${BLUE_BD}`,
                borderRadius: 10, padding: '9px 14px',
                cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
              }}
            >
              <span style={{ fontSize: 16, fontWeight: 800, color: BLUE, fontFamily: MONO, letterSpacing: '0.06em' }}>
                {data.code}
              </span>
              {copied === 'code'
                ? <Check size={15} color="#00C853" strokeWidth={2.5} />
                : <Copy size={15} color={BLUE} />}
            </button>
          ) : null}
        </div>

        {/* Full referral LINK */}
        {referralLink && (
          <div>
            <div style={{ fontSize: 11, color: 'var(--nan-text3)', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 8 }}>
              Referral Link
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: BLUE_DIM, border: `1px solid ${BLUE_BD}`,
              borderRadius: 10, padding: '8px 12px',
            }}>
              <Link2 size={13} color={BLUE} style={{ flexShrink: 0 }} />
              <span style={{
                flex: 1, fontSize: 12, color: 'var(--nan-text2)',
                fontFamily: MONO, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {referralLink}
              </span>
              <button
                onClick={() => doCopy(referralLink, 'link')}
                style={{
                  flexShrink: 0,
                  background: copied === 'link' ? 'rgba(0,200,83,0.15)' : BLUE,
                  border: 'none',
                  borderRadius: 7, padding: '5px 12px',
                  cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                  display: 'flex', alignItems: 'center', gap: 5,
                  transition: 'background 0.2s',
                }}
              >
                {copied === 'link'
                  ? <Check size={13} color="#00C853" strokeWidth={2.5} />
                  : <Copy size={13} color="#fff" />}
                <span style={{ fontSize: 11, fontWeight: 600, color: copied === 'link' ? '#00C853' : '#fff' }}>
                  {copied === 'link' ? 'Copied!' : 'Copy'}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Total earnings — Gateway style */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14,
        background: 'var(--nan-surface)', border: `1px solid ${BLUE_BD}`,
        borderRadius: 16, padding: '16px 18px', marginBottom: 20,
      }}>
        <div style={{
          width: 42, height: 42, borderRadius: 13, flexShrink: 0,
          background: BLUE_DIM, border: `1px solid ${BLUE_BD}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: 20 }}>💵</span>
        </div>
        <div>
          <div style={{ fontSize: 13, color: 'var(--nan-text3)', fontWeight: 500, marginBottom: 2 }}>Total Earnings</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--nan-text)', letterSpacing: '-0.02em', fontFamily: MONO }}>
            ${totalEarned.toFixed(2)} <span style={{ fontSize: 14, color: BLUE }}>USDC</span>
          </div>
        </div>
      </div>

      {/* MY REFERRALS */}
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--nan-text3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>
        My Referrals
      </div>

      <div style={{
        background: 'var(--nan-surface)', border: `1px solid ${BLUE_BD}`,
        borderRadius: 16, overflow: 'hidden', marginBottom: 100,
      }}>
        {referrals.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '36px 20px' }}>
            <Users size={44} color={C.t3} strokeWidth={1.2} style={{ marginBottom: 12 }} />
            <div style={{ fontSize: 14, fontWeight: 600, color: C.t2, marginBottom: 4 }}>You have no referrals yet</div>
            <div style={{ fontSize: 12, color: C.t3 }}>Share your link to start earning</div>
          </div>
        ) : referrals.map((r, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px 18px',
            borderBottom: i < referrals.length - 1 ? `1px solid ${BLUE_BD}` : 'none',
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
              background: BLUE_DIM, border: `1px solid ${BLUE_BD}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
            }}>👤</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--nan-text)' }}>{r.handle}</div>
              <div style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>
                {new Date(r.joinedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                {' · '}{r.firstTransfer ? 'First transfer done ✓' : 'Pending first transfer'}
              </div>
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: r.firstTransfer ? '#00C853' : C.t3 }}>
              {r.firstTransfer ? '+$1.00' : 'Pending'}
            </div>
          </div>
        ))}
      </div>

      {/* Share link — sticky, above nav */}
      <button
        onClick={doShare}
        disabled={!referralLink}
        style={{
          position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
          width: 'calc(100% - 48px)', maxWidth: 432,
          padding: '16px', borderRadius: 16,
          background: referralLink ? BLUE : C.surf2,
          border: 'none', color: '#fff',
          fontSize: 16, fontWeight: 700,
          cursor: referralLink ? 'pointer' : 'not-allowed',
          fontFamily: F, letterSpacing: '-0.01em',
          boxShadow: referralLink ? `0 6px 24px rgba(8,102,245,0.45)` : 'none',
          WebkitTapHighlightColor: 'transparent',
          opacity: referralLink ? 1 : 0.5,
          transition: 'opacity 0.2s',
        }}
      >
        {copied === 'link' ? '✓ Link Copied!' : 'Share link'}
      </button>

    </div>
  )
}
