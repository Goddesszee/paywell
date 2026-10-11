/**
 * ReferralPage — full-screen referral page
 * Hero · unique code + copy · full link + copy · total earnings · MY REFERRALS list · Share button
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { ArrowLeft, Copy, Check, Users, Link2 } from 'lucide-react'
import { useAccount } from 'wagmi'
import { useAppStore } from '../../store/appStore'
import { useNanTheme } from '../../hooks/useNanTheme'

const F    = "'Inter', -apple-system, sans-serif"
const MONO = "'JetBrains Mono', Menlo, monospace"

interface ReferralEntry { handle: string; joinedAt: number; firstTransfer: boolean }
interface ReferralData {
  code: string
  uses: number
  createdAt: number
  referrals?: ReferralEntry[]
}

/** Build best available identity key from all possible sources */
function buildKey(
  nanHandle: string,
  wagmiAddress: string | undefined,
  auth: Record<string, unknown> | null | undefined,
): string | null {
  if (nanHandle) return `nan:${nanHandle}`
  if (wagmiAddress) return wagmiAddress
  const ca = (auth as Record<string, string> | null)?.circleWalletAddress ?? ''
  if (ca) return ca
  const wa = (auth as Record<string, string> | null)?.walletAddress ?? ''
  if (wa) return wa
  const em = (auth as Record<string, string> | null)?.email ?? ''
  if (em) return encodeURIComponent(em)
  const tok = (auth as Record<string, string> | null)?.sessionToken ?? ''
  if (tok) return `tok:${tok.slice(0, 16)}`
  return null
}

export function ReferralPage() {
  const C = useNanTheme()
  const { address: wagmiAddress } = useAccount()
  const { auth, nanHandle, setActiveView, previousView } = useAppStore()

  const [data, setData]         = useState<ReferralData | null>(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(false)
  const [copied, setCopied]     = useState<'code' | 'link' | null>(null)

  // Retry logic — poll until we have a key (auth may hydrate after mount)
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fetchedRef = useRef(false)

  const doFetch = useCallback((key: string) => {
    fetchedRef.current = true
    setLoading(true)
    setError(false)
    fetch(`/api/referral?wallet=${encodeURIComponent(key)}`)
      .then(r => { if (!r.ok) throw new Error('bad'); return r.json() })
      .then((d: { success?: boolean } & Partial<ReferralData>) => {
        if (d.code) {
          setData({ code: d.code, uses: d.uses ?? 0, createdAt: d.createdAt ?? Date.now(), referrals: (d as ReferralData).referrals })
          setError(false)
        } else {
          fetchedRef.current = false  // allow retry
          setError(true)
        }
      })
      .catch(() => { fetchedRef.current = false; setError(true) })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    // Reset so a new auth value always triggers a fresh fetch
    fetchedRef.current = false
    if (retryTimer.current) clearTimeout(retryTimer.current)
    let attempts = 0
    const tryLoad = () => {
      const key = buildKey(nanHandle, wagmiAddress, auth as Record<string, unknown> | null)
      if (key) {
        doFetch(key)
        return
      }
      attempts++
      if (attempts < 10) {
        retryTimer.current = setTimeout(tryLoad, 500)
      } else {
        // Last resort — use a session-stable anonymous key
        const fallbackKey = `anon:${(auth as Record<string,string>|null)?.sessionToken?.slice(0,12) ?? Date.now().toString(36)}`
        doFetch(fallbackKey)
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
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => {
        try {
          const ta = Object.assign(document.createElement('textarea'), {
            value: text, style: 'position:fixed;top:-9999px;left:-9999px;opacity:0',
          })
          document.body.appendChild(ta); ta.focus(); ta.select()
          document.execCommand('copy')
          document.body.removeChild(ta)
          done()
        } catch { /* silent */ }
      })
    } else {
      try {
        const ta = Object.assign(document.createElement('textarea'), {
          value: text, style: 'position:fixed;top:-9999px;left:-9999px;opacity:0',
        })
        document.body.appendChild(ta); ta.focus(); ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
        done()
      } catch { /* silent */ }
    }
  }, [])

  const doShare = useCallback(() => {
    if (!referralLink) return
    if (navigator.share) {
      navigator.share({ title: 'Join NAN', text: 'Join NAN and we both earn $1 USDC!', url: referralLink }).catch(() => {})
    } else {
      doCopy(referralLink, 'link')
    }
  }, [referralLink, doCopy])

  const back = () => setActiveView(previousView && previousView !== 'referral' ? previousView : 'profile')

  return (
    <div style={{ maxWidth: 480, width: '100%', margin: '0 auto', fontFamily: F, paddingBottom: 110 }}>

      {/* Back button */}
      <button onClick={back} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 36, height: 36, borderRadius: 10,
        background: C.surf2, border: `1px solid ${C.bdr}`,
        cursor: 'pointer', marginBottom: 20,
        WebkitTapHighlightColor: 'transparent',
      }}>
        <ArrowLeft size={18} color={C.text} />
      </button>

      {/* Hero card */}
      <div style={{
        borderRadius: 20, overflow: 'hidden', marginBottom: 16,
        background: 'linear-gradient(135deg, #0a1628 0%, #0d2040 60%, #0a2060 100%)',
        border: '1px solid rgba(0,102,255,0.25)',
        padding: '28px 24px 24px', position: 'relative',
      }}>
        <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: '50%', background: 'rgba(0,102,255,0.15)', filter: 'blur(30px)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -20, right: 40, width: 80, height: 80, borderRadius: '50%', background: 'rgba(100,0,255,0.12)', filter: 'blur(20px)', pointerEvents: 'none' }} />

        <div style={{ fontSize: 26, fontWeight: 800, color: '#fff', letterSpacing: '-0.03em', lineHeight: 1.2, marginBottom: 10, maxWidth: '65%' }}>
          Refer a friend<br />and earn $1
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 1.55, marginBottom: 20, maxWidth: '80%' }}>
          Share your referral code and get $1 USDC when whoever you refer signs up and makes their first transfer.
        </div>

        {/* Referral CODE box */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 600, letterSpacing: '0.06em', marginBottom: 8 }}>
            REFERRAL CODE
          </div>
          {loading ? (
            <div style={{ height: 40, width: 140, borderRadius: 10, background: 'rgba(255,255,255,0.08)' }} />
          ) : error ? (
            <button onClick={() => { fetchedRef.current = false; const k = buildKey(nanHandle, wagmiAddress, auth as Record<string,unknown>|null); if (k) doFetch(k) }}
              style={{ background: 'none', border: 'none', color: '#ff6b6b', fontSize: 13, cursor: 'pointer', padding: 0 }}>
              Could not load — tap to retry
            </button>
          ) : data?.code ? (
            <button
              onClick={() => doCopy(data.code, 'code')}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: 'rgba(0,102,255,0.20)', border: '1.5px solid rgba(0,102,255,0.40)',
                borderRadius: 10, padding: '9px 14px',
                cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
              }}
            >
              <span style={{ fontSize: 16, fontWeight: 800, color: '#fff', fontFamily: MONO, letterSpacing: '0.06em' }}>
                {data.code}
              </span>
              {copied === 'code'
                ? <Check size={15} color="#00C853" strokeWidth={2.5} />
                : <Copy size={15} color="rgba(255,255,255,0.7)" />}
            </button>
          ) : null}
        </div>

        {/* Full referral LINK row */}
        {referralLink && (
          <div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 600, letterSpacing: '0.06em', marginBottom: 8 }}>
              REFERRAL LINK
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 10, padding: '8px 12px',
            }}>
              <Link2 size={13} color="rgba(255,255,255,0.45)" style={{ flexShrink: 0 }} />
              <span style={{
                flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.75)',
                fontFamily: MONO, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {referralLink}
              </span>
              <button
                onClick={() => doCopy(referralLink, 'link')}
                style={{
                  flexShrink: 0, background: 'rgba(0,102,255,0.25)',
                  border: '1px solid rgba(0,102,255,0.4)',
                  borderRadius: 7, padding: '5px 10px',
                  cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                  display: 'flex', alignItems: 'center', gap: 5,
                }}
              >
                {copied === 'link'
                  ? <Check size={13} color="#00C853" strokeWidth={2.5} />
                  : <Copy size={13} color="#fff" />}
                <span style={{ fontSize: 11, fontWeight: 600, color: '#fff' }}>
                  {copied === 'link' ? 'Copied' : 'Copy'}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Total earnings */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14,
        background: C.surf, border: `1px solid ${C.bdr}`,
        borderRadius: 16, padding: '16px 18px', marginBottom: 20,
      }}>
        <div style={{
          width: 42, height: 42, borderRadius: 13, flexShrink: 0,
          background: 'rgba(0,102,255,0.12)', border: '1px solid rgba(0,102,255,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: 20 }}>💵</span>
        </div>
        <div>
          <div style={{ fontSize: 13, color: C.t3, fontWeight: 500, marginBottom: 2 }}>Total Earnings</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: '-0.02em', fontFamily: MONO }}>
            ${totalEarned.toFixed(2)} USDC
          </div>
        </div>
      </div>

      {/* MY REFERRALS */}
      <div style={{ fontSize: 11, fontWeight: 700, color: C.t3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>
        My Referrals
      </div>

      <div style={{
        background: C.surf, border: `1px solid ${C.bdr}`,
        borderRadius: 16, padding: '8px 0', marginBottom: 28,
      }}>
        {!data || data.uses === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 20px' }}>
            <Users size={44} color={C.t3} strokeWidth={1.2} style={{ marginBottom: 10 }} />
            <div style={{ fontSize: 14, fontWeight: 600, color: C.t2, marginBottom: 4 }}>You have no referrals yet</div>
            <div style={{ fontSize: 12, color: C.t3 }}>Share your link to start earning</div>
          </div>
        ) : (
          (data.referrals && data.referrals.length > 0
            ? data.referrals
            : Array.from({ length: data.uses }, (_, i) => ({
                handle: `Friend #${i + 1}`,
                joinedAt: data.createdAt + i * 86400000,
                firstTransfer: true,
              }))
          ).map((r, i, arr) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 18px',
              borderBottom: i < arr.length - 1 ? `1px solid ${C.bdr}` : 'none',
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                background: C.blueDim, border: `1px solid ${C.blueBd}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16,
              }}>👤</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{r.handle}</div>
                <div style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>
                  Joined {new Date(r.joinedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  {r.firstTransfer ? ' · First transfer done ✓' : ' · Pending first transfer'}
                </div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: r.firstTransfer ? C.green : C.t3 }}>
                {r.firstTransfer ? '+$1.00' : 'Pending'}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Share link — sticky bottom */}
      <button
        onClick={doShare}
        disabled={!referralLink}
        style={{
          position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
          width: 'calc(100% - 48px)', maxWidth: 432,
          padding: '16px', borderRadius: 16,
          background: referralLink ? '#0066FF' : C.surf2,
          border: 'none', color: '#fff',
          fontSize: 16, fontWeight: 700, cursor: referralLink ? 'pointer' : 'not-allowed',
          fontFamily: F, letterSpacing: '-0.01em',
          boxShadow: referralLink ? '0 6px 24px rgba(0,102,255,0.40)' : 'none',
          WebkitTapHighlightColor: 'transparent',
          opacity: referralLink ? 1 : 0.6,
        }}
      >
        {copied === 'link' ? '✓ Link Copied!' : 'Share link'}
      </button>

    </div>
  )
}
