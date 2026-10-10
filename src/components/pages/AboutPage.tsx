import { Info, MessageSquare, HelpCircle } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { ABOUT as about, ABOUT_FEATURES } from '../../lib/about-faq-content'

const SANS = "var(--nan-font, 'Inter', sans-serif)"

export function AboutPage() {
  const { setActiveView } = useAppStore()
  return (
    <div style={{ width: '100%', minHeight: '100%', fontFamily: SANS }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Info size={18} color="var(--nan-blue)" />
          <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--nan-text)' }}>About NAN</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--nan-text2)' }}>Your AI-powered money app on Arc</div>
      </div>

      {/* Hero card */}
      <div style={{ background: 'linear-gradient(135deg, rgba(0,102,255,0.18) 0%, rgba(0,102,255,0.06) 100%)', border: '1px solid var(--nan-blue-bd)', borderRadius: 18, padding: '28px 24px', marginBottom: 20 }}>
        {/* NAN logo */}
        <div style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--nan-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
          <svg viewBox="0 0 324 480" width="20" height="28" fill="none">
            <path d="M255,0 L84,167 L71,163 L0,97 L0,378 L246,132 L255,110 Z" fill="#fff"/>
            <path d="M69,480 L240,313 L253,317 L324,383 L324,102 L78,348 L69,370 Z" fill="#fff"/>
          </svg>
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--nan-text)', marginBottom: 8, lineHeight: 1.2 }}>{about.headline}</div>
        <div style={{ fontSize: 15, color: 'var(--nan-blue)', fontWeight: 600, marginBottom: 0 }}>{about.tagline}</div>
      </div>

      {/* Body */}
      <div style={{ background: 'var(--nan-surface)', border: '1px solid var(--nan-bdr)', borderRadius: 16, padding: '22px 22px', marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--nan-text3)', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 12 }}>What is NAN</div>
        {about.body.split('\n\n').map((para, i) => (
          <p key={i} style={{ fontSize: 14, color: 'var(--nan-text2)', lineHeight: 1.75, marginBottom: i < about.body.split('\n\n').length - 1 ? 14 : 0, marginTop: 0 }}>
            {para}
          </p>
        ))}
      </div>

      {/* Mission */}
      <div style={{ background: 'var(--nan-surface)', border: '1px solid var(--nan-bdr)', borderRadius: 16, padding: '20px 22px', marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--nan-text3)', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 10 }}>Our mission</div>
        <div style={{ fontSize: 14, color: 'var(--nan-text)', lineHeight: 1.7, fontStyle: 'italic', borderLeft: '3px solid var(--nan-blue)', paddingLeft: 14 }}>
          {about.mission}
        </div>
      </div>

      {/* Key features */}
      <div style={{ background: 'var(--nan-surface)', border: '1px solid var(--nan-bdr)', borderRadius: 16, padding: '20px 22px', marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--nan-text3)', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 14 }}>Platform capabilities</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {ABOUT_FEATURES.map(f => (
            <div key={f.title} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ fontSize: 20, flexShrink: 0, lineHeight: 1 }}>{f.icon}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--nan-text)', marginBottom: 2 }}>{f.title}</div>
                <div style={{ fontSize: 12, color: 'var(--nan-text2)', lineHeight: 1.5 }}>{f.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Contact */}
      <div style={{ background: 'var(--nan-surface)', border: '1px solid var(--nan-bdr)', borderRadius: 16, padding: '20px 22px', marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--nan-text3)', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 10 }}>Contact</div>
        <div style={{ fontSize: 13, color: 'var(--nan-text2)', lineHeight: 1.7 }}>{about.contact}</div>
      </div>

      {/* CTAs */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        <button onClick={() => setActiveView('support')} style={{ padding: '13px', borderRadius: 12, background: 'var(--nan-blue)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: SANS, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
          <MessageSquare size={14} />
          Get support
        </button>
        <button onClick={() => setActiveView('faq')} style={{ padding: '13px', borderRadius: 12, background: 'var(--nan-surface)', border: '1px solid var(--nan-bdr)', color: 'var(--nan-text)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: SANS, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
          <HelpCircle size={14} />
          Browse FAQs
        </button>
      </div>

    </div>
  )
}
