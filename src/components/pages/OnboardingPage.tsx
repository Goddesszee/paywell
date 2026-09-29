import React, { useState } from 'react'
import { ConnectKitButton } from 'connectkit'
import { useAccount } from 'wagmi'
import { useAppStore } from '../../store/appStore'

import { Button } from '../ui/Button'
import { CircleEmailLogin } from '../CircleEmailLogin'

const SANS = "'Inter', -apple-system, sans-serif"
const BG   = '#111111'
const CARD = '#1a1a1a'
const BLUE = '#2563EB'
const TEXT = '#111111'
const TEXT2 = '#a0a0a0'
const TEXT3 = '#555555'
const BORDER = 'rgba(255,255,255,0.07)'
const BORDER2 = 'rgba(255,255,255,0.12)'

const USE_CASES = [
  { id: 'payments',  label: 'Send & Receive',  icon: '↕', desc: 'Wallet for everyday USDC payments' },
  { id: 'shopping',  label: 'Shop',             icon: '◻', desc: 'Browse and buy from merchants' },
  { id: 'agent',     label: 'AI Agent',         icon: '◈', desc: 'Let my agent shop for me' },
  { id: 'receiving', label: 'Accept Payments',  icon: '↓', desc: 'Receive USDC from others' },
  { id: 'merchant',  label: 'Sell as Merchant', icon: '⊞', desc: 'List products and accept USDC' },
]

function formatAddr(addr?: string) {
  if (!addr) return ''
  return addr.slice(0, 6) + '...' + addr.slice(-4)
}

export function OnboardingPage() {
  const { address, isConnected } = useAccount()
  const { setOnboarding, agentPermissions, setAgentPermissions, setActiveView } = useAppStore()
  const [step, setStep] = useState<'connect' | 'usecases' | 'agent' | 'limits'>('connect')
  const [selected, setSelected] = useState<string[]>([])
  const [dailyLimit, setDailyLimit] = useState(String(agentPermissions.dailyLimit))
  const [perTxLimit, setPerTxLimit] = useState(String(agentPermissions.perTxLimit))

  const toggleCase = (id: string) =>
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])

  const finish = () => {
    setOnboarding({ completed: true, useCases: selected, agentConfigured: step === 'limits' })
    setActiveView('home')
  }

  const prevConnected = React.useRef(false)
  React.useLayoutEffect(() => {
    if (isConnected && !prevConnected.current && step === 'connect') {
      prevConnected.current = true
      setTimeout(() => setStep('usecases'), 0)
    }
    if (!isConnected) prevConnected.current = false
  })

  const stepNum = step === 'connect' ? 1 : step === 'usecases' ? 2 : step === 'agent' ? 3 : 4

  return (
    <div style={{
      minHeight: '100vh', background: BG, color: TEXT,
      fontFamily: SANS, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'flex-start',
      padding: '40px 20px 60px', overflowY: 'auto',
    }}>
      <div style={{
        width: '100%', maxWidth: 440,
        background: CARD,
        border: `1px solid ${BORDER2}`,
        borderRadius: 18,
        padding: '36px 32px',
        boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 32 }}>
          {/* NAN logo mark */}
          <div style={{ width: 48, height: 48, borderRadius: 14, background: BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12, boxShadow: '0 4px 20px rgba(37,99,235,0.45)' }}>
            <svg width="28" height="20" viewBox="0 0 28 20" fill="none">
              <path d="M0 20V0h5l7 12V0h5v20h-5L5 8v12H0zm13 0V0h5l7 12V0h3v20h-5L16 8v12h-3z" fill="white"/>
            </svg>
          </div>
          <span style={{ fontWeight: 800, fontSize: 22, letterSpacing: '-0.03em', color: TEXT, fontFamily: SANS }}>NAN</span>
          <p style={{ color: TEXT2, fontSize: 13, marginTop: 6, textAlign: 'center', lineHeight: 1.5 }}>
            The intelligent payment layer
          </p>
          {/* Step dots */}
          <div style={{ display: 'flex', gap: 6, marginTop: 20 }}>
            {[1,2,3,4].map(n => (
              <div key={n} style={{
                width: n === stepNum ? 20 : 6, height: 6, borderRadius: 3,
                background: n <= stepNum ? BLUE : 'rgba(255,255,255,0.1)',
                transition: 'all 0.3s ease',
              }} />
            ))}
          </div>
        </div>

        {/* ── Step 1: Connect ── */}
        {step === 'connect' && (
          <div>
            <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: TEXT3, marginBottom: 10, fontWeight: 600 }}>Step 01</div>
            <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 8, color: TEXT }}>Welcome to NAN</h2>
            <p style={{ color: TEXT2, fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
              Sign in with your email — a Circle wallet is created automatically on Arc Testnet.
            </p>

            <CircleEmailLogin onSuccess={(_addr, _token) => setStep('usecases')} />

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0' }}>
              <div style={{ flex: 1, height: 1, background: BORDER }} />
              <span style={{ fontSize: 12, color: TEXT3 }}>or connect a wallet</span>
              <div style={{ flex: 1, height: 1, background: BORDER }} />
            </div>

            <ConnectKitButton.Custom>
              {({ isConnected: ckConnected, show, truncatedAddress }) => (
                <button
                  onClick={show}
                  style={{
                    width: '100%', padding: '13px 20px',
                    background: 'rgba(255,255,255,0.04)', color: TEXT,
                    border: `1.5px solid ${BORDER2}`, borderRadius: 10,
                    fontSize: 14, fontWeight: 600, cursor: 'pointer',
                    fontFamily: SANS,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  }}
                >
                  {ckConnected ? (
                    <>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22C55E' }} />
                      {truncatedAddress}
                    </>
                  ) : 'Connect MetaMask / WalletConnect'}
                </button>
              )}
            </ConnectKitButton.Custom>
            {isConnected && (
              <p style={{ color: '#22C55E', fontSize: 13, textAlign: 'center', marginTop: 12 }}>
                ✓ Wallet connected · {formatAddr(address)}
              </p>
            )}
          </div>
        )}

        {/* ── Step 2: Use cases ── */}
        {step === 'usecases' && (
          <div>
            <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: TEXT3, marginBottom: 10, fontWeight: 600 }}>Step 02</div>
            <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 6, color: TEXT }}>What will you use NAN for?</h2>
            <p style={{ color: TEXT2, fontSize: 13, marginBottom: 22 }}>Select all that apply.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 28 }}>
              {USE_CASES.map(({ id, label, icon, desc }) => {
                const on = selected.includes(id)
                return (
                  <button
                    key={id}
                    onClick={() => toggleCase(id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      padding: '13px 16px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                      background: on ? 'rgba(37,99,235,0.12)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${on ? BLUE : BORDER}`,
                      transition: 'all 0.18s', color: TEXT, fontFamily: SANS,
                    }}
                  >
                    <span style={{ fontSize: 18, flexShrink: 0, color: on ? '#3B82F6' : TEXT2 }}>{icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2, color: TEXT }}>{label}</div>
                      <div style={{ fontSize: 12, color: TEXT2 }}>{desc}</div>
                    </div>
                    {on && (
                      <span style={{
                        width: 20, height: 20, borderRadius: '50%', background: BLUE,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, color: '#fff', flexShrink: 0,
                      }}>✓</span>
                    )}
                  </button>
                )
              })}
            </div>
            <Button fullWidth onClick={() => setStep('agent')} disabled={selected.length === 0}>
              Continue →
            </Button>
          </div>
        )}

        {/* ── Step 3: Agent opt-in ── */}
        {step === 'agent' && (
          <div>
            <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: TEXT3, marginBottom: 10, fontWeight: 600 }}>Step 03</div>
            <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 6, color: TEXT }}>Set up your AI Agent?</h2>
            <p style={{ color: TEXT2, fontSize: 14, lineHeight: 1.6, marginBottom: 28 }}>
              NAN's AI agent can find products, execute recurring payments, and purchase items within limits you control.
            </p>
            <div style={{ display: 'flex', gap: 10, flexDirection: 'column' }}>
              <Button fullWidth onClick={() => setStep('limits')}>Yes, set up my agent</Button>
              <Button fullWidth variant="ghost" onClick={finish}>Later</Button>
            </div>
          </div>
        )}

        {/* ── Step 4: Limits ── */}
        {step === 'limits' && (
          <div>
            <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: TEXT3, marginBottom: 10, fontWeight: 600 }}>Step 04</div>
            <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 6, color: TEXT }}>Configure spending limits</h2>
            <p style={{ color: TEXT2, fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
              Your agent will never exceed these limits. You can change them at any time in Settings.
            </p>

            {/* Daily limit */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: TEXT3, marginBottom: 8, fontWeight: 600 }}>Daily limit (USDC)</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                {[10, 20, 50, 100].map(v => (
                  <button key={v} onClick={() => setDailyLimit(String(v))} style={{
                    flex: 1, padding: '10px 0', borderRadius: 9, cursor: 'pointer',
                    background: dailyLimit === String(v) ? BLUE : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${dailyLimit === String(v) ? BLUE : BORDER}`,
                    color: dailyLimit === String(v) ? '#fff' : TEXT2,
                    fontSize: 14, fontWeight: 700, fontFamily: SANS, transition: 'all 0.18s',
                  }}>{v}</button>
                ))}
              </div>
              <input type="number" min="1" placeholder="Or enter custom amount..."
                value={![10,20,50,100].map(String).includes(dailyLimit) ? dailyLimit : ''}
                onChange={e => setDailyLimit(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 9, fontSize: 14, fontFamily: SANS,
                  border: `1px solid rgba(37,99,235,0.25)`, background: '#0d0d0d', color: TEXT, outline: 'none', boxSizing: 'border-box' as const }}
              />
            </div>

            {/* Per-tx limit */}
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: TEXT3, marginBottom: 8, fontWeight: 600 }}>Per-transaction limit (USDC)</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                {[5, 10, 25, 50].map(v => (
                  <button key={v} onClick={() => setPerTxLimit(String(v))} style={{
                    flex: 1, padding: '10px 0', borderRadius: 9, cursor: 'pointer',
                    background: perTxLimit === String(v) ? BLUE : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${perTxLimit === String(v) ? BLUE : BORDER}`,
                    color: perTxLimit === String(v) ? '#fff' : TEXT2,
                    fontSize: 14, fontWeight: 700, fontFamily: SANS, transition: 'all 0.18s',
                  }}>{v}</button>
                ))}
              </div>
              <input type="number" min="1" placeholder="Or enter custom amount..."
                value={![5,10,25,50].map(String).includes(perTxLimit) ? perTxLimit : ''}
                onChange={e => setPerTxLimit(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 9, fontSize: 14, fontFamily: SANS,
                  border: `1px solid rgba(37,99,235,0.25)`, background: '#0d0d0d', color: TEXT, outline: 'none', boxSizing: 'border-box' as const }}
              />
            </div>

            {/* Summary */}
            <div style={{ background: 'rgba(37,99,235,0.06)', border: `1px solid rgba(37,99,235,0.18)`, borderRadius: 12, padding: '14px 16px', marginBottom: 24 }}>
              {[
                { label: 'Daily limit', val: `${dailyLimit} USDC` },
                { label: 'Per transaction', val: `${perTxLimit} USDC` },
                { label: 'Approval mode', val: 'Ask before each purchase' },
              ].map(({ label, val }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${BORDER}`, fontSize: 13 }}>
                  <span style={{ color: TEXT2 }}>{label}</span>
                  <span style={{ fontWeight: 600, color: TEXT }}>{val}</span>
                </div>
              ))}
            </div>

            <Button fullWidth onClick={() => {
              setAgentPermissions({ dailyLimit: parseFloat(dailyLimit) || 20, perTxLimit: parseFloat(perTxLimit) || 10 })
              finish()
            }}>
              Launch NAN →
            </Button>
          </div>
        )}
      </div>

      <p style={{ marginTop: 24, fontSize: 12, color: TEXT3, letterSpacing: '0.04em' }}>
        Powered by Arc · Circle USDC · Testnet
      </p>
    </div>
  )
}
