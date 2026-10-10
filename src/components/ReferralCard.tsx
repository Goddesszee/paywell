/**
 * ReferralCard — shows the user's referral code and copy/share actions.
 * Rendered on the Home page below recent activity.
 */
import { useState } from 'react'
import { Gift, Copy, Check, Share2 } from 'lucide-react'
import { useReferral } from '../hooks/useReferral'
import { useNanTheme } from '../hooks/useNanTheme'
import { toast } from 'sonner'

const F = "'Inter', -apple-system, sans-serif"
const BLUE = '#0066FF'

export function ReferralCard() {
  const C = useNanTheme()
  const { data, loading } = useReferral()
  const [copied, setCopied] = useState(false)

  if (loading || !data) return null

  const referralLink = `${window.location.origin}?ref=${data.code}`

  const handleCopy = () => {
    void navigator.clipboard.writeText(referralLink)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
    toast.success('Referral link copied!')
  }

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join me on NAN',
          text: 'Send and receive USDC instantly with NAN — The Intelligent Payment Layer',
          url: referralLink,
        })
        return
      } catch { /* dismissed */ }
    }
    handleCopy()
  }

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(0,102,255,0.10) 0%, rgba(0,102,255,0.03) 100%)',
      border: '1px solid rgba(0,102,255,0.20)',
      borderRadius: 16, padding: '16px 18px', marginBottom: 16, fontFamily: F,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(0,102,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Gift size={18} color={BLUE} />
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 1 }}>Invite friends to NAN</div>
          <div style={{ fontSize: 12, color: C.t3 }}>
            {data.uses === 0 ? 'Share your code — no invites yet' : `${data.uses} friend${data.uses === 1 ? '' : 's'} joined with your code`}
          </div>
        </div>
      </div>

      <div style={{ background: C.surf2, border: `1px dashed rgba(0,102,255,0.30)`, borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 10, color: C.t3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Your code</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: BLUE, letterSpacing: '0.12em', fontFamily: "'JetBrains Mono', monospace" }}>{data.code}</div>
        </div>
        <button onClick={handleCopy} style={{ width: 34, height: 34, borderRadius: 9, background: C.surf, border: `1px solid ${C.bdr}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          {copied ? <Check size={14} color="#00C853" /> : <Copy size={14} color={C.t3} />}
        </button>
      </div>

      <button onClick={() => { void handleShare() }} style={{ width: '100%', padding: '11px', borderRadius: 10, background: BLUE, border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: F, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
        <Share2 size={14} /> Share invite link
      </button>
    </div>
  )
}
