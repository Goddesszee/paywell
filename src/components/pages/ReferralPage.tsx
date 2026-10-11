/**
 * ReferralPage
 * - Uses NAN handle as the referral code (e.g. @aunty → code "aunty")
 * - No NAN name → prompt to get one, navigate to nan-name page
 * - Uses the app theme tokens (works in light AND dark mode) and the same page layout as the other
 *   pages: no fixed width / full-screen min-height / pinned button, so the page fits the screen and
 *   only the content area scrolls.
 */
import { useState, useCallback } from 'react'
import { ArrowLeft, Copy, Check, Users, Link2, Gift, AtSign } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { useNanTheme } from '../../hooks/useNanTheme'

const F    = "'Inter', -apple-system, sans-serif"
const MONO = "'JetBrains Mono', Menlo, monospace"

const BLUE  = '#0866F5'
const BDIM  = 'rgba(8,102,245,0.10)'
const BBDR  = 'rgba(8,102,245,0.25)'
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
  const C = useNanTheme()
  const { nanHandle, setActiveView, previousView } = useAppStore()
  const SURF = C.surf
  const BDR  = C.bdr
  const TEXT = C.text
  const T2   = C.t2
  const T3   = C.t3

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
      <div style={{ width: '100%', fontFamily: F, paddingBottom: 24 }}>
        <button onClick={back} aria-label="Back" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 36, height: 36, borderRadius: 10,
          background: SURF, border: `1px solid ${BDR}`,
          cursor: 'pointer', marginBottom: 16,
          WebkitTapHighlightColor: 'transparent',
        }}>
          <ArrowLeft size={18} color={T2} />
        </button>

        <div style={{
          background: SURF, border: `1px solid ${BDR}`,
          borderRadius: 20, padding: '32px 22px', textAlign: 'center',
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${BLUE}, #7B61FF)` }} />
          <div style={{
            width: 60, height: 60, borderRadius: 18, background: BDIM,
            border: `1px solid ${BBDR}`, display: 'flex', alignItems: 'center',
            justifyContent: 'center', margin: '0 auto 16px',
          }}>
            <AtSign size={26} color={BLUE} />
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: TEXT, marginBottom: 8, letterSpacing: '-0.02em' }}>
            Get a NAN name first
          </div>
          <div style={{ fontSize: 13, color: T2, lineHeight: 1.55, marginBottom: 22 }}>
            Your NAN name is your unique referral code. Claim yours to start earning $1 USDC for every friend you invite.
          </div>
          <button
            onClick={() => setActiveView('nan-name')}
            style={{
              width: '100%', padding: '14px', borderRadius: 14,
              background: BLUE, border: 'none', color: '#fff',
              fontSize: 15, fontWeight: 700, cursor: 'pointer',
              fontFamily: F, letterSpacing: '-0.01em',
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
  const label: React.CSSProperties = { fontSize: 11, color: T3, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 6 }

  return (
    <div style={{ width: '100%', fontFamily: F, paddingBottom: 24 }}>

      {/* Back */}
      <button onClick={back} aria-label="Back" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 36, height: 36, borderRadius: 10,
        background: SURF, border: `1px solid ${BDR}`,
        cursor: 'pointer', marginBottom: 14,
        WebkitTapHighlightColor: 'transparent',
      }}>
        <ArrowLeft size={18} color={T2} />
      </button>

      {/* Hero card */}
      <div style={{
        borderRadius: 20, marginBottom: 12, position: 'relative', overflow: 'hidden',
        background: SURF, border: `1px solid ${BDR}`, padding: '20px 18px 18px',
      }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${BLUE}, #7B61FF)` }} />

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 13, flexShrink: 0,
            background: BDIM, border: `1px solid ${BBDR}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Gift size={20} color={BLUE} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: TEXT, letterSpacing: '-0.03em', lineHeight: 1.2 }}>
              Refer a friend and earn $1
            </div>
            <div style={{ fontSize: 12, color: T3, lineHeight: 1.5, marginTop: 4 }}>
              Get $1 USDC when your friend signs up and makes their first transfer.
            </div>
          </div>
        </div>

        {/* Referral CODE = NAN handle */}
        <div style={{ marginBottom: 12 }}>
          <div style={label}>Your Referral Code</div>
          <button
            onClick={handleCopyCode}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: BDIM, border: `1.5px solid ${BBDR}`,
              borderRadius: 10, padding: '8px 12px',
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
        <div style={{ marginBottom: 14 }}>
          <div style={label}>Referral Link</div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: BDIM, border: `1px solid ${BBDR}`,
            borderRadius: 10, padding: '7px 7px 7px 12px',
          }}>
            <Link2 size={13} color={BLUE} style={{ flexShrink: 0 }} />
            <span style={{
              flex: 1, minWidth: 0, fontSize: 12, color: T2,
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
                padding: '7px 12px', cursor: 'pointer',
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

        {/* Share — inside the card, in normal flow (no pinned button over the nav) */}
        <button
          onClick={handleShare}
          style={{
            width: '100%', padding: '14px', borderRadius: 14,
            background: BLUE, border: 'none', color: '#fff',
            fontSize: 15, fontWeight: 700, cursor: 'pointer',
            fontFamily: F, letterSpacing: '-0.01em',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          {copiedLink ? '✓ Link Copied!' : 'Share link'}
        </button>
      </div>

      {/* Stats: earnings + referrals */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
        <div style={{ flex: 1, minWidth: 0, background: SURF, border: `1px solid ${BDR}`, borderRadius: 16, padding: '14px 14px' }}>
          <div style={{ fontSize: 12, color: T3, fontWeight: 500, marginBottom: 4 }}>Total Earnings</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: TEXT, letterSpacing: '-0.02em', fontFamily: MONO }}>
            $0.00 <span style={{ fontSize: 12, color: BLUE }}>USDC</span>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0, background: SURF, border: `1px solid ${BDR}`, borderRadius: 16, padding: '14px 14px' }}>
          <div style={{ fontSize: 12, color: T3, fontWeight: 500, marginBottom: 4 }}>My Referrals</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: TEXT, letterSpacing: '-0.02em', fontFamily: MONO }}>0</div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 12, color: T3, padding: '4px 0' }}>
        <Users size={14} color={T3} strokeWidth={1.6} />
        No referrals yet — share your link to start earning
      </div>

    </div>
  )
}
