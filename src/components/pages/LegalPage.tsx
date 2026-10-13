import React from 'react'
import { ArrowLeft } from 'lucide-react'
import { useNanTheme } from '../../hooks/useNanTheme'
import { useAppStore } from '../../store/appStore'

const F = "'Inter', -apple-system, sans-serif"

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const C = useNanTheme()
  return (
    <div style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 8, margin: '0 0 8px' }}>{title}</h2>
      <div style={{ fontSize: 13, color: C.t2, lineHeight: 1.7 }}>{children}</div>
    </div>
  )
}

export function TermsPage() {
  const C = useNanTheme()
  const setActiveView = useAppStore(s => s.setActiveView)
  return (
    <div style={{ fontFamily: F, maxWidth: 680, margin: '0 auto', padding: '0 0 80px' }}>
      <button onClick={() => setActiveView('about')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', marginBottom: 24, color: C.t2, fontFamily: F, WebkitTapHighlightColor: 'transparent' }}>
        <ArrowLeft size={16} /> Back
      </button>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: C.text, letterSpacing: '-0.025em', marginBottom: 6 }}>Terms of Service</h1>
      <p style={{ fontSize: 13, color: C.t3, marginBottom: 32 }}>Last updated: October 2026</p>

      <Section title="1. Acceptance">
        By accessing or using NAN ("the App"), you agree to be bound by these Terms of Service. If you do not agree, do not use the App.
      </Section>
      <Section title="2. Description of Service">
        NAN is a non-custodial USDC payment application built on Arc (a blockchain network). NAN enables users to send, receive, bridge, and swap USDC and other digital assets. NAN also provides an AI Agent feature that can execute payments on your behalf within limits you configure.
      </Section>
      <Section title="3. Eligibility">
        You must be at least 18 years old and legally permitted to use digital asset services in your jurisdiction. You are responsible for complying with all applicable laws.
      </Section>
      <Section title="4. Self-Custody and User Responsibility">
        NAN is non-custodial. You control your private keys and wallet. NAN never has access to your funds. You are solely responsible for: (a) safeguarding your wallet credentials and recovery phrases; (b) all transactions you initiate or authorise; (c) any losses arising from lost credentials, sending to incorrect addresses, or smart contract interactions.
      </Section>
      <Section title="5. Agent Wallet">
        The Agent Wallet feature allows an AI agent to submit payment transactions within limits you set. You acknowledge that: (a) you authorise all Agent Wallet transactions within the limits you configure; (b) NAN is not liable for agent-initiated transactions that fall within your configured permissions; (c) you should set conservative spending limits.
      </Section>
      <Section title="6. Fees">
        NAN charges a 0.30% fee on token swaps and a 0.50% fee on bridge transactions. These fees are deducted at the time of the transaction. All other NAN features are currently free. Fee rates may change with 30 days' notice.
      </Section>
      <Section title="7. Prohibited Activities">
        You may not use NAN for: money laundering, terrorist financing, sanctions evasion, fraud, or any activity prohibited under applicable law.
      </Section>
      <Section title="8. No Financial Advice">
        Nothing in the App constitutes financial, investment, legal, or tax advice. Digital assets are volatile and risky. You should consult a qualified professional before making financial decisions.
      </Section>
      <Section title="9. Limitation of Liability">
        To the maximum extent permitted by law, NAN and its operators are not liable for any indirect, incidental, or consequential damages, including loss of funds due to user error, network failures, smart contract bugs, or third-party service outages.
      </Section>
      <Section title="10. Governing Law">
        These Terms are governed by applicable law. Disputes shall be resolved by binding arbitration where permitted, or in courts of competent jurisdiction.
      </Section>
      <Section title="11. Changes">
        We may update these Terms. Continued use of the App after changes constitutes acceptance. We will notify users of material changes via the in-app notifications system.
      </Section>
      <Section title="12. Contact">
        For questions about these Terms, contact us at <a href="mailto:support@nanarc.xyz" style={{ color: '#0866F5' }}>support@nanarc.xyz</a>.
      </Section>
    </div>
  )
}

export function PrivacyPage() {
  const C = useNanTheme()
  const setActiveView = useAppStore(s => s.setActiveView)
  return (
    <div style={{ fontFamily: F, maxWidth: 680, margin: '0 auto', padding: '0 0 80px' }}>
      <button onClick={() => setActiveView('about')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', marginBottom: 24, color: C.t2, fontFamily: F, WebkitTapHighlightColor: 'transparent' }}>
        <ArrowLeft size={16} /> Back
      </button>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: C.text, letterSpacing: '-0.025em', marginBottom: 6 }}>Privacy Policy</h1>
      <p style={{ fontSize: 13, color: C.t3, marginBottom: 32 }}>Last updated: October 2026</p>

      <Section title="1. Information We Collect">
        <strong>Account information:</strong> email address (for Circle OTP login only — stored by Circle, not NAN).<br />
        <strong>Wallet data:</strong> public wallet addresses and on-chain transaction data (public by nature of the blockchain).<br />
        <strong>Usage data:</strong> app activity, feedback, support messages you submit through the App.<br />
        <strong>Device data:</strong> browser type, approximate location (for FX rate display), push notification tokens if you opt in.<br />
        NAN does not collect passwords, private keys, seed phrases, or payment card details.
      </Section>
      <Section title="2. How We Use Your Information">
        We use your information to: operate and improve the App; process support requests; send transactional notifications (payment received, OTP codes); detect fraud; comply with legal obligations.
      </Section>
      <Section title="3. Third-Party Services">
        NAN uses the following third-party services:<br />
        • <strong>Circle</strong> — wallet infrastructure and OTP login (circle.com/legal/privacy-policy)<br />
        • <strong>Vercel</strong> — hosting and serverless functions<br />
        • <strong>Upstash Redis</strong> — session and data storage<br />
        • <strong>Resend</strong> — transactional email delivery<br />
        • <strong>OpenAI / Groq</strong> — AI agent responses (no personal data is sent; only wallet balances and explicit queries)<br />
        Each provider has their own privacy policy governing their data handling.
      </Section>
      <Section title="4. Data Storage and Retention">
        Your app data (invoices, payment requests, contacts, activity) is stored in your browser's local storage on your device and in our Redis store keyed to your wallet address. We retain Redis data for 90 days of inactivity. You can request deletion by contacting support.
      </Section>
      <Section title="5. Data Sharing">
        We do not sell your personal data. We share data only with the service providers listed in Section 3, or as required by law (e.g. in response to a valid legal process).
      </Section>
      <Section title="6. Your Rights">
        You have the right to: access the data we hold about you; request correction or deletion; opt out of non-essential communications. To exercise these rights, contact <a href="mailto:support@nanarc.xyz" style={{ color: '#0866F5' }}>support@nanarc.xyz</a>.
      </Section>
      <Section title="7. Security">
        We use industry-standard security measures. However, no system is completely secure. You are responsible for keeping your wallet credentials safe.
      </Section>
      <Section title="8. Children">
        NAN is not directed at children under 18. We do not knowingly collect data from minors.
      </Section>
      <Section title="9. Changes">
        We may update this Policy. We will notify users of material changes via in-app notifications. Continued use constitutes acceptance.
      </Section>
      <Section title="10. Contact">
        Privacy questions: <a href="mailto:support@nanarc.xyz" style={{ color: '#0866F5' }}>support@nanarc.xyz</a>
      </Section>
    </div>
  )
}
