/**
 * ReferralPage
 * - Uses NAN handle as the referral code (e.g. @aunty → code "aunty")
 * - No NAN name → prompt to get one, navigate to nan-name page
 * - Gateway-style dark cards, blue copy button, blue Share button
 */
import { useState, useCallback } from 'react'
import { ArrowLeft, Copy, Check, Users, Link2, Gift, AtSign } from 'lucide-react'
import { useAppStore } from '../../store/appStore'

const F    = "'Inter', -apple-system, sans-serif"
const MONO = "'JetBrains Mono', Menlo, monospace"

// Hard-coded dark palette matching GatewayPage — does NOT rely on CSS vars
// (CSS vars fail when the page renders before the theme class is applied)
const BG    = '#0d0f14'
const SURF  = '#131720'
const SURF2 = '#1a1f2e'
const BDR   = 'rgba(8,102,245,0.22)'
const BLUE  = '#0866F5'
const BDIM  = 'rgba(8,102,245,0.12)'
const TEXT  = '#ffffff'
const T2    = 'rgba(255,255,255,0.75)'
const T3    = 'rgba(255,255,255,0.40)'
const GREEN = '#00C853'

function doCopy(text: string, onDone: () => void) {
  const fallback = () => {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0'
      document.body.appendChild(ta); ta.focus(); ta.select()
      document.execCommand('copy'); document.body.removeChild(ta); onDone()
    } catch { /* silent */ }
  }
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(onDone).catch(fallback)
  } else { fallback() }
}

export function ReferralPage() {
  const { nanHandle, setActiveView, previousView } = useAppStore()

  const [copiedCode, setCopiedCode] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)

  const back = () => setActiveView(
    previousView && previousView !== 'referral' ? previousView : 'profile'
  )

  // NAN handle is the referral code — simple and unique
  const code         = nanHandle ? nanHandle.replace(/^@/, '') : null
  const referralLink = code ? `https://nanarc.xyz/join?ref=${code}` : null

  const handleCopyCode = useCallback(() => {
    if (!code) return
    doCopy(code, () => { setCopiedCode(true); setTimeout(() => setCopiedCode(false), 2500) })
  }, [code])

  const handleCopyLink = useCallback(() => {
    if (!referralLink) return
    doCopy(referralLink, () => { setCopiedLink(true); setTimeout(() => setCopiedLink(false), 2500) })
  }, [referralLink])

  const handleShare = useCallback(() => {
    if (!referralLink) return
    if (navigator.share) {
      navigator.share({
        title: 'Join NAN',
        text: 'Join NAN — we both earn $1 USDC when you make your first transfer!',
        url: referralLink,
      }).catch(() => handleCopyLink())
    } else {
      handleCopyLink()
    }
  }, [referralLink, handleCopyLink])

  // ── No NAN name → gate screen ─────────────────────────────────────────────
  if (!code) {
    return (
      <div style={{ maxWidth: 480, width: '100%', margin: '0 auto', fontFamily: F, minHeight: '100vh', background: BG, padding: '0 0 80px' }}>
        <button onClick={back} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 36, height: 36, borderRadius: 10,
          background: BDIM, border: `1px solid ${BDR}`,
          cursor: 'pointer', marginBottom: 24,
          WebkitTapHighlightColor: 'transparent',
        }}>
          <ArrowLeft size={18} color={BLUE} />
        </button>

        <div style={{
          background: SURF, border: `1px solid ${BDR}`,
          borderRadius: 20, padding: '40px 24px', textAlign: 'center',
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${BLUE}, #7B61FF)` }} />
          <div style={{
            width: 64, height: 64, borderRadius: 20, background: BDIM,
            border: `1px solid ${BDR}`, display: 'flex', alignItems: 'center',
            justifyContent: 'center', margin: '0 auto 20px',
          }}>
            <AtSign size={28} color={BLUE} />
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: TEXT, marginBottom: 10, letterSpacing: '-0.02em' }}>
            Get a NAN name first
          </div>
          <div style={{ fontSize: 13, color: T2, lineHeight: 1.6, marginBottom: 28 }}>
            Your NAN name is your unique referral code. Claim yours to start earning $1 USDC for every friend you invite.
          </div>
          <button
            onClick={() => setActiveView('nan-name')}
            style={{
              width: '100%', padding: '15px', borderRadius: 14,
              background: BLUE, border: 'none', color: '#fff',
              fontSize: 15, fontWeight: 700, cursor: 'pointer',
              fontFamily: F, letterSpacing: '-0.01em',
              boxShadow: `0 6px 24px rgba(8,102,245,0.45)`,
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            Get my NAN name →
          </button>
        </div>
      </div>
    )
  }

  // ── Has NAN name → full referral page ────────────────────────────────────
  return (
    <div style={{ maxWidth: 480, width: '100%', margin: '0 auto', fontFamily: F, background: BG, minHeight: '100vh', padding: '0 0 140px' }}>

      {/* Back */}
      <button onClick={back} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 36, height: 36, borderRadius: 10,
        background: BDIM, border: `1px solid ${BDR}`,
        cursor: 'pointer', marginBottom: 20,
        WebkitTapHighlightColor: 'transparent',
      }}>
        <ArrowLeft size={18} color={BLUE} />
      </button>

      {/* Hero card */}
      <div style={{
        borderRadius: 20, marginBottom: 16, position: 'relative', overflow: 'hidden',
        background: SURF, border: `1px solid ${BDR}`, padding: '28px 24px 24px',
      }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${BLUE}, #7B61FF)` }} />
        <div style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: '50%', background: BDIM, filter: 'blur(40px)', pointerEvents: 'none' }} />

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 18 }}>
          <div style={{
            width: 46, height: 46, borderRadius: 14, flexShrink: 0,
            background: BDIM, border: `1px solid ${BDR}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Gift size={22} color={BLUE} />
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: TEXT, letterSpacing: '-0.03em', lineHeight: 1.2 }}>
              Refer a friend<br />and earn $1
            </div>
            <div style={{ fontSize: 12, color: T3, lineHeight: 1.55, marginTop: 6 }}>
              Get $1 USDC when your friend signs up and makes their first transfer.
            </div>
          </div>
        </div>

        {/* Referral CODE = NAN handle */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: T3, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 8 }}>
            Your Referral Code
          </div>
          <button
            onClick={handleCopyCode}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: BDIM, border: `1.5px solid ${BDR}`,
              borderRadius: 10, padding: '9px 14px',
              cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
            }}
          >
            <span style={{ fontSize: 16, fontWeight: 800, color: BLUE, fontFamily: MONO, letterSpacing: '0.06em' }}>
              {code}
            </span>
            {copiedCode
              ? <Check size={15} color={GREEN} strokeWidth={2.5} />
              : <Copy size={15} color={BLUE} />}
          </button>
        </div>

        {/* Full LINK row */}
        <div>
          <div style={{ fontSize: 11, color: T3, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 8 }}>
            Referral Link
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: BDIM, border: `1px solid ${BDR}`,
            borderRadius: 10, padding: '8px 8px 8px 12px',
          }}>
            <Link2 size={13} color={BLUE} style={{ flexShrink: 0 }} />
            <span style={{
              flex: 1, fontSize: 12, color: T2,
              fontFamily: MONO, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {referralLink}
            </span>
            <button
              onClick={handleCopyLink}
              style={{
                flexShrink: 0,
                background: copiedLink ? 'rgba(0,200,83,0.18)' : BLUE,
                border: 'none', borderRadius: 8,
                padding: '7px 14px', cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
                display: 'flex', alignItems: 'center', gap: 6,
                transition: 'background 0.2s',
              }}
            >
              {copiedLink
                ? <Check size={13} color={GREEN} strokeWidth={2.5} />
                : <Copy size={13} color="#fff" />}
              <span style={{ fontSize: 12, fontWeight: 700, color: copiedLink ? GREEN : '#fff' }}>
                {copiedLink ? 'Copied!' : 'Copy'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Total earnings */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14,
        background: SURF, border: `1px solid ${BDR}`,
        borderRadius: 16, padding: '16px 18px', marginBottom: 20,
      }}>
        <div style={{
          width: 42, height: 42, borderRadius: 13, flexShrink: 0,
          background: BDIM, border: `1px solid ${BDR}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: 20 }}>💵</span>
        </div>
        <div>
          <div style={{ fontSize: 13, color: T3, fontWeight: 500, marginBottom: 2 }}>Total Earnings</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: TEXT, letterSpacing: '-0.02em', fontFamily: MONO }}>
            $0.00 <span style={{ fontSize: 14, color: BLUE }}>USDC</span>
          </div>
        </div>
      </div>

      {/* MY REFERRALS */}
      <div style={{ fontSize: 11, fontWeight: 700, color: T3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>
        My Referrals
      </div>
      <div style={{ background: SURF, border: `1px solid ${BDR}`, borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ textAlign: 'center', padding: '36px 20px' }}>
          <Users size={44} color={T3} strokeWidth={1.2} style={{ marginBottom: 12 }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: T2, marginBottom: 4 }}>You have no referrals yet</div>
          <div style={{ fontSize: 12, color: T3 }}>Share your link to start earning</div>
        </div>
      </div>

      {/* Share link — sticky, above bottom nav */}
      <button
        onClick={handleShare}
        style={{
          position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
          width: 'calc(100% - 48px)', maxWidth: 432,
          padding: '16px', borderRadius: 16,
          background: BLUE, border: 'none', color: '#fff',
          fontSize: 16, fontWeight: 700, cursor: 'pointer',
          fontFamily: F, letterSpacing: '-0.01em',
          boxShadow: `0 6px 24px rgba(8,102,245,0.45)`,
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        {copiedLink ? '✓ Link Copied!' : 'Share link'}
      </button>

    </div>
  )
}
