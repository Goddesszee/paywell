import { useState, useEffect, useMemo } from 'react'
import { HelpCircle, Search, ChevronDown, ChevronUp } from 'lucide-react'

const SANS = "var(--nan-font, 'Inter', sans-serif)"

interface FaqItem {
  id: string
  category: string
  question: string
  answer: string
  order: number
}

export function FAQPage() {
  const [faqs, setFaqs] = useState<FaqItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const FALLBACK_FAQS: FaqItem[] = [
    { id: 'gs1', category: 'Getting Started', order: 1, question: 'What is NAN?', answer: 'NAN is an AI-powered financial platform built on Arc. It gives you a smart USDC wallet with an AI agent that can make payments, automate transfers, and manage your money — all within limits you control.' },
    { id: 'gs2', category: 'Getting Started', order: 2, question: 'How do I create an account?', answer: 'Tap "Sign up" on the landing page and log in with your email using a one-time passcode (OTP). No password required. Your wallet is created automatically after you verify your email.' },
    { id: 'gs3', category: 'Getting Started', order: 3, question: 'What blockchain does NAN use?', answer: 'NAN is built on Arc — a blockchain by Circle where USDC is the native gas token. You pay transaction fees in USDC, not ETH. NAN also supports Ethereum, Base, Arbitrum, Optimism, Polygon, and Avalanche via bridging.' },
    { id: 'gs4', category: 'Getting Started', order: 4, question: 'Is NAN on testnet or mainnet?', answer: 'NAN currently runs on Arc Testnet. Testnet USDC has no real monetary value. You can get free testnet USDC from the Faucet page in the app.' },
    { id: 'gs5', category: 'Getting Started', order: 5, question: 'What currency does NAN use?', answer: 'NAN uses USDC — a regulated, dollar-backed stablecoin issued by Circle. 1 USDC = $1 USD. On Arc, USDC is also the native gas token used to pay transaction fees.' },
    { id: 'wb1', category: 'Wallet & Balances', order: 1, question: 'What types of wallets does NAN have?', answer: 'NAN gives you two wallets: (1) a Main Wallet for your everyday USDC — sending, receiving, and bridging; and (2) an Agent Wallet — a dedicated wallet your AI agent uses for automated payments. They are separate balances.' },
    { id: 'wb2', category: 'Wallet & Balances', order: 2, question: 'How do I add money to my wallet?', answer: 'You can add USDC three ways: (1) use the Faucet page for free testnet USDC; (2) use the Onramp page to buy USDC with a card or bank transfer; or (3) have someone send USDC to your wallet address.' },
    { id: 'wb3', category: 'Wallet & Balances', order: 3, question: 'Can I connect MetaMask or another wallet?', answer: 'Yes. NAN supports wagmi-compatible wallets (MetaMask, WalletConnect, Coinbase Wallet) via ConnectKit. Connect your existing wallet to view balances and send USDC directly.' },
    { id: 'sr1', category: 'Sending & Receiving', order: 1, question: 'How do I send USDC?', answer: 'From the Home screen, tap "Send". Enter the recipient wallet address and amount, then confirm. For Circle email wallet users, a Circle PIN popup will appear to authorise the transaction.' },
    { id: 'sr2', category: 'Sending & Receiving', order: 2, question: 'How do I receive USDC?', answer: 'Tap "Receive" on the Home screen to see your wallet address and QR code. Share your address with the sender.' },
    { id: 'sr3', category: 'Sending & Receiving', order: 3, question: 'How do I request money from someone?', answer: 'Go to Payment Requests and tap "New Request". Enter the amount and description. NAN generates a shareable payment link the recipient can use to pay directly.' },
    { id: 'sr4', category: 'Sending & Receiving', order: 4, question: 'Can I set up recurring payments?', answer: 'Yes. Go to Recurring from the side drawer. Schedule automatic USDC payments — daily, weekly, or monthly — to any address. The AI agent can also manage recurring payments from the Agent Wallet.' },
    { id: 'ag1', category: 'NAN Agent', order: 1, question: 'What is the NAN Agent?', answer: 'The NAN Agent is an AI assistant powered by OpenAI GPT-4o. It knows your wallet balances, transaction history, recurring payments, and payment requests. Ask it questions, request transfers, and manage finances using natural language.' },
    { id: 'ag2', category: 'NAN Agent', order: 2, question: 'What can I ask the NAN Agent?', answer: 'Ask: "What\'s my balance?", "Show my recent transactions", "Do I have pending payment requests?", "Send 10 USDC to 0x...", "Set up a recurring payment", "What services are on the agent stack?" and more.' },
    { id: 'ag3', category: 'NAN Agent', order: 3, question: 'What is the Agent Wallet?', answer: 'A separate Circle wallet dedicated to your AI agent. You fund it with USDC and the agent uses it to pay for services and execute automated payments within the spending limits you set.' },
    { id: 'ag4', category: 'NAN Agent', order: 4, question: 'Can the agent spend money without my approval?', answer: 'Only from the Agent Wallet, and only within spending limits you set. The agent cannot touch your main NAN wallet. Every agent transaction is visible in your Activity feed.' },
    { id: 'bs1', category: 'Bridge & Swap', order: 1, question: 'What is the Bridge?', answer: 'The Bridge moves USDC from one blockchain to another — e.g. Arc Testnet to Ethereum Sepolia. NAN uses Circle\'s CCTP v2 for fast, secure cross-chain transfers that typically complete in under 2 minutes.' },
    { id: 'bs2', category: 'Bridge & Swap', order: 2, question: 'What is Gateway?', answer: 'Gateway is Circle\'s cross-chain liquidity layer. Depositing USDC into Gateway lets you move funds across chains in under 500ms — faster than a full bridge transfer.' },
    { id: 'bs3', category: 'Bridge & Swap', order: 3, question: 'What is the Swap page?', answer: 'Swap lets you exchange one token for another on the same chain — e.g. USDT to USDC. NAN uses Circle\'s Swap Kit for on-chain swaps with real-time rate estimates.' },
    { id: 'of1', category: 'Onramp & Faucet', order: 1, question: 'How do I buy USDC with real money?', answer: 'Go to the Onramp page (Buy USDC). Select an amount and tap "Buy". The Circle Onramp widget opens — pay with card, Apple Pay, Google Pay, or bank transfer. Circle handles KYC and compliance.' },
    { id: 'of2', category: 'Onramp & Faucet', order: 2, question: 'What is the Faucet?', answer: 'The Faucet gives you free testnet USDC for development and testing. Go to Faucet, enter your wallet address, and tap "Request USDC". Testnet funds have no real monetary value.' },
    { id: 'sp1', category: 'Security & Privacy', order: 1, question: 'Who controls my wallet keys?', answer: 'For Circle email wallet users, keys are managed by Circle\'s MPC system — no single party holds the full key. For MetaMask/wagmi users, you control your own keys entirely.' },
    { id: 'sp2', category: 'Security & Privacy', order: 2, question: 'Is NAN custodial or non-custodial?', answer: 'NAN offers both. Circle email login creates a Circle-managed wallet. Connecting MetaMask or another external wallet is fully non-custodial — you keep your own keys.' },
    { id: 'tr1', category: 'Troubleshooting', order: 1, question: 'My transaction is stuck — what do I do?', answer: 'Check the Activity page for the transaction status. Arc Testnet normally confirms in under 2 seconds. If it stays pending over a minute, refresh your balance and try again. Contact Support if the issue persists.' },
    { id: 'tr2', category: 'Troubleshooting', order: 2, question: 'The Circle PIN popup is not appearing — what do I do?', answer: 'Circle PIN popups can be blocked by browser popup blockers. Allow nanarc.xyz to open popups in your browser settings. On mobile the popup opens as an in-app overlay. If it still does not appear, refresh and retry.' },
    { id: 'tr3', category: 'Troubleshooting', order: 3, question: 'How do I contact support?', answer: 'Go to Support from the side drawer. Submit a ticket with your issue and wallet address. You can also use the Feedback page to report bugs or suggest improvements.' },
  ]

  useEffect(() => {
    fetch('/api/faqs')
      .then(r => r.json())
      .then((d: { faqs: FaqItem[] }) => { if (d.faqs?.length) setFaqs(d.faqs) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allFaqs = faqs.length ? faqs : FALLBACK_FAQS

  const filtered = useMemo(() => {
    if (!search.trim()) return allFaqs
    const q = search.toLowerCase()
    return allFaqs.filter(f => f.question.toLowerCase().includes(q) || f.answer.toLowerCase().includes(q) || f.category.toLowerCase().includes(q))
  }, [allFaqs, search])

  const categories = useMemo(() => {
    const cats = [...new Set(filtered.map(f => f.category))]
    return cats
  }, [filtered])

  return (
    <div style={{ width: '100%', minHeight: '100%', fontFamily: SANS }}>
      {/* Header */}
      <div style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <HelpCircle size={18} color="var(--nan-blue)" />
          <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--nan-text)' }}>FAQ</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--nan-text2)' }}>Answers to common questions about NAN</div>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 24 }}>
        <Search size={15} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--nan-text3)', pointerEvents: 'none' }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search questions…"
          style={{ width: '100%', padding: '11px 14px 11px 38px', borderRadius: 11, background: 'var(--nan-surface)', border: '1px solid var(--nan-bdr)', color: 'var(--nan-text)', fontSize: 14, fontFamily: SANS, boxSizing: 'border-box', outline: 'none' }}
        />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--nan-text2)', fontSize: 13 }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ background: 'var(--nan-surface)', border: '1px solid var(--nan-bdr)', borderRadius: 14, padding: '40px 20px', textAlign: 'center' }}>
          <HelpCircle size={28} style={{ margin: '0 auto 12px', color: 'var(--nan-text3)' }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--nan-text)', marginBottom: 6 }}>No results found</div>
          <div style={{ fontSize: 13, color: 'var(--nan-text2)' }}>
            {search ? `No FAQs match "${search}"` : 'No FAQs available yet.'}
          </div>
        </div>
      ) : (
        categories.map(cat => (
          <div key={cat} style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--nan-text3)', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 10, paddingLeft: 2 }}>{cat}</div>
            <div style={{ background: 'var(--nan-surface)', border: '1px solid var(--nan-bdr)', borderRadius: 14, overflow: 'hidden' }}>
              {filtered.filter(f => f.category === cat).map((f, i, arr) => {
                const isOpen = expanded.has(f.id)
                return (
                  <div key={f.id} style={{ borderBottom: i < arr.length - 1 ? '1px solid var(--nan-bdr)' : 'none' }}>
                    <button
                      onClick={() => toggle(f.id)}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 16px', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: SANS, textAlign: 'left', WebkitTapHighlightColor: 'transparent' }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 600, color: isOpen ? 'var(--nan-blue)' : 'var(--nan-text)', flex: 1, lineHeight: 1.4 }}>
                        {f.question}
                      </span>
                      <span style={{ flexShrink: 0, color: isOpen ? 'var(--nan-blue)' : 'var(--nan-text3)' }}>
                        {isOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                      </span>
                    </button>
                    {isOpen && (
                      <div style={{ padding: '0 16px 16px 16px', fontSize: 13, color: 'var(--nan-text2)', lineHeight: 1.7, borderTop: '1px solid var(--nan-bdr)' }}>
                        <div style={{ paddingTop: 12 }}>{f.answer}</div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
