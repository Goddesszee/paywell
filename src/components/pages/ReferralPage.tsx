/**
 * ReferralPage — full-screen referral page
 * Hero banner · referral code + copy · total earnings · MY REFERRALS list · Share button
 */
import { useState, useEffect, useMemo, useCallback } from 'react'
import { ArrowLeft, Copy, Check, Users } from 'lucide-react'
import { useAccount } from 'wagmi'
import { useAppStore } from '../../store/appStore'
import { useNanTheme } from '../../hooks/useNanTheme'

const F    = "'Inter', -apple-system, sans-serif"
const MONO = "'JetBrains Mono', Menlo, monospace"

interface ReferralData {
  code: string
  uses: number
  createdAt: number
}

export function ReferralPage() {
  const C = useNanTheme()
  const { address: wagmiAddress } = useAccount()
  const { auth, nanHandle, setActiveView, previousView } = useAppStore()

  const [data, setData]       = useState<ReferralData | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied]   = useState(false)

  // Stable identity key — same priority chain as useReferral hook
  const key = useMemo<string | null>(() => {
    if (nanHandle) return `nan:${nanHandle}`
    if (wagmiAddress) return wagmiAddress
    const ca = (auth?.circleWalletAddress ?? '')
    if (ca) return ca
    if (auth?.email) return encodeURIComponent(auth.email)
    if (auth?.sessionToken) return `tok:${auth.sessionToken.slice(0, 16)}`
    return null
  }, [nanHandle, wagmiAddress, auth])

  useEffect(() => {
    if (!key) return
    let cancelled = false
    // eslint-disable-next-line react/set-state-in-effect
    setLoading(true)
    fetch(`/api/referral?wallet=${key}`)
      .then(r => r.json())
      .then((d: { success?: boolean } & Partial<ReferralData>) => {
        // eslint-disable-next-line react/set-state-in-effect
        if (!cancelled && d.code) setData({ code: d.code, uses: d.uses ?? 0, createdAt: d.createdAt ?? Date.now() })
      })
      .catch(() => {})
      // eslint-disable-next-line react/set-state-in-effect
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [key])

  const referralLink = data?.code ? `https://nanarc.xyz/join?ref=${data.code}` : null
  const totalEarned  = (data?.uses ?? 0) * 1   // $1 per referral

  const doCopy = useCallback((text: string) => {
    const fallback = () => {
      try {
        const ta = document.createElement('textarea')
        ta.value = text
        ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0'
        document.body.appendChild(ta)
        ta.focus(); ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
        setCopied(true); setTimeout(() => setCopied(false), 2500)
      } catch { /* silent */ }
    }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500) })
        .catch(fallback)
    } else {
      fallback()
    }
  }, [])

  const doShare = useCallback(() => {
    if (!referralLink) return
    if (navigator.share) {
      navigator.share({ title: 'Join NAN', text: 'Join NAN and we both earn $1 USDC!', url: referralLink }).catch(() => {})
    } else {
      doCopy(referralLink)
    }
  }, [referralLink, doCopy])

  const back = () => setActiveView(previousView && previousView !== 'referral' ? previousView : 'profile')

  return (
    <div style={{ maxWidth: 480, width: '100%', margin: '0 auto', fontFamily: F, paddingBottom: 100 }}>

      {/* Back button */}
      <button onClick={back} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 36, height: 36, borderRadius: 10,
        background: C.surf2, border: `1px solid ${C.bdr}`,
        cursor: 'pointer', marginBottom: 20,
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
        {/* Decorative blobs */}
        <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: '50%', background: 'rgba(0,102,255,0.15)', filter: 'blur(30px)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -20, right: 40, width: 80, height: 80, borderRadius: '50%', background: 'rgba(100,0,255,0.12)', filter: 'blur(20px)', pointerEvents: 'none' }} />

        <div style={{ fontSize: 26, fontWeight: 800, color: '#fff', letterSpacing: '-0.03em', lineHeight: 1.2, marginBottom: 10, maxWidth: '65%' }}>
          Refer a friend<br />and earn $1
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 1.55, marginBottom: 20, maxWidth: '70%' }}>
          Share your referral code and get $1 USDC when whoever you refer signs up and makes their first transfer.
        </div>

        {/* Referral code box */}
        <div style={{ marginTop: 4 }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 600, letterSpacing: '0.06em', marginBottom: 8 }}>
            REFERRAL CODE
          </div>
          {loading ? (
            <div style={{ height: 40, width: 140, borderRadius: 10, background: 'rgba(255,255,255,0.08)', animation: 'nan-shimmer 1.4s ease infinite' }} />
          ) : data?.code ? (
            <button
              onClick={() => doCopy(data.code)}
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
              {copied
                ? <Check size={15} color="#00C853" strokeWidth={2.5} />
                : <Copy size={15} color="rgba(255,255,255,0.7)" />}
            </button>
          ) : (
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>Could not load code — try again</div>
          )}
        </div>
      </div>

      {/* Total earnings row */}
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
            ${totalEarned.toFixed(2)}
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
            <div style={{ marginBottom: 10 }}>
              <Users size={44} color={C.t3} strokeWidth={1.2} />
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.t2, marginBottom: 4 }}>You have no referrals yet</div>
            <div style={{ fontSize: 12, color: C.t3 }}>Share your link to start earning</div>
          </div>
        ) : (
          Array.from({ length: data.uses }).map((_, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 18px',
              borderBottom: i < data.uses - 1 ? `1px solid ${C.bdr}` : 'none',
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                background: C.blueDim, border: `1px solid ${C.blueBd}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ fontSize: 16 }}>👤</span>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Friend #{i + 1}</div>
                <div style={{ fontSize: 11, color: C.green, marginTop: 2 }}>+$1.00 USDC earned</div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Share link button — sticky bottom */}
      <button
        onClick={doShare}
        disabled={!referralLink}
        style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          width: 'calc(100% - 48px)', maxWidth: 432,
          padding: '16px', borderRadius: 16,
          background: referralLink ? '#0066FF' : C.surf2,
          border: 'none', color: '#fff',
          fontSize: 16, fontWeight: 700, cursor: referralLink ? 'pointer' : 'not-allowed',
          fontFamily: F, letterSpacing: '-0.01em',
          boxShadow: referralLink ? '0 6px 24px rgba(0,102,255,0.40)' : 'none',
          WebkitTapHighlightColor: 'transparent',
          opacity: referralLink ? 1 : 0.5,
        }}
      >
        {copied ? '✓ Copied!' : 'Share link'}
      </button>

    </div>
  )
}
