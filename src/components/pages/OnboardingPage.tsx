import React, { useState } from 'react'
import { ConnectKitButton } from 'connectkit'
import { useAccount } from 'wagmi'
import { useAppStore } from '../../store/appStore'
import { NanLogo } from '../ui/Logo'
import { Button } from '../ui/Button'

const PW_BG = '#FFFFFF'
const PW_SURFACE = '#F7F7F8'
const PW_BORDER = 'rgba(0,0,0,0.08)'
const PW_TEXT = '#0D0D0D'
const PW_TEXT_2 = '#6B6B6B'
const PW_TEXT_3 = '#A0A0A0'
const PW_BLUE = '#0D0D0D'
const PW_BLUE_LIGHT = '#0D0D0D'
const MONO = 'JetBrains Mono, monospace'
const SANS = 'Space Grotesk, sans-serif'

const USE_CASES = [
  { id: 'payments',  label: 'Send & Receive',  icon: '💸', desc: 'Wallet for everyday USDC payments' },
  { id: 'shopping',  label: 'Shop',             icon: '🛍️', desc: 'Browse and buy from merchants' },
  { id: 'agent',     label: 'AI Agent',         icon: '🤖', desc: 'Let my agent shop for me' },
  { id: 'receiving', label: 'Accept Payments',  icon: '📥', desc: 'Receive USDC from others' },
  { id: 'merchant',  label: 'Sell as Merchant', icon: '🏪', desc: 'List products and accept USDC' },
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

  // Auto-advance when wallet connects
  /* eslint-disable react/set-state-in-effect */
  React.useEffect(() => {
    if (isConnected && step === 'connect') setStep('usecases')
  }, [isConnected, step])
  /* eslint-enable react/set-state-in-effect */

  const stepNum = step === 'connect' ? 1 : step === 'usecases' ? 2 : step === 'agent' ? 3 : 4

  return (
    <div style={{
      minHeight: '100vh', background: PW_BG, color: PW_TEXT,
      fontFamily: SANS, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: '24px 20px',
    }}>
      <div style={{
        width: '100%', maxWidth: 440,
        background: PW_SURFACE,
        border: `1px solid ${PW_BORDER}`,
        borderRadius: 18,
        padding: '36px 32px',
        boxShadow: '0 32px 80px rgba(0,0,0,0.5)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 32 }}>
          <NanLogo size="lg" />
          <p style={{ color: PW_TEXT_2, fontSize: 13, marginTop: 10, textAlign: 'center', lineHeight: 1.5 }}>
            The intelligent payment layer
          </p>
          {/* Step dots */}
          <div style={{ display: 'flex', gap: 6, marginTop: 20 }}>
            {[1,2,3,4].map(n => (
              <div key={n} style={{
                width: n === stepNum ? 20 : 6, height: 6, borderRadius: 3,
                background: n <= stepNum ? PW_BLUE : 'rgba(0,0,0,0.08)',
                transition: 'all 0.3s ease',
              }} />
            ))}
          </div>
        </div>

        {/* ── Step 1: Connect ── */}
        {step === 'connect' && (
          <div>
            <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: PW_BLUE_LIGHT, marginBottom: 10 }}>Step 01</div>
            <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 8 }}>Welcome to Paywell</h2>
            <p style={{ color: PW_TEXT_2, fontSize: 14, lineHeight: 1.6, marginBottom: 28 }}>
              Connect your wallet to get started. Nan uses Circle-powered wallets on Arc Testnet — no private keys exposed.
            </p>
            <ConnectKitButton.Custom>
              {({ isConnected, show, truncatedAddress }) => (
                <button
                  onClick={show}
                  style={{
                    width: '100%', padding: '14px 20px',
                    background: PW_BLUE, color: '#fff',
                    border: 'none', borderRadius: 10,
                    fontSize: 15, fontWeight: 700, cursor: 'pointer',
                    fontFamily: SANS, letterSpacing: '-0.01em',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                    boxShadow: '0 6px 20px rgba(0,0,0,0.15)',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {isConnected ? (
                    <>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22C55E', boxShadow: '0 0 6px #22C55E' }} />
                      {truncatedAddress}
                    </>
                  ) : (
                    'Connect Wallet'
                  )}
                </button>
              )}
            </ConnectKitButton.Custom>
            {isConnected && (
              <p style={{ color: '#22C55E', fontSize: 13, textAlign: 'center', marginTop: 14, fontFamily: MONO }}>
                ✓ Connected · {formatAddr(address)}
              </p>
            )}
          </div>
        )}

        {/* ── Step 2: Use cases ── */}
        {step === 'usecases' && (
          <div>
            <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: PW_BLUE_LIGHT, marginBottom: 10 }}>Step 02</div>
            <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 6 }}>What will you use Paywell for?</h2>
            <p style={{ color: PW_TEXT_2, fontSize: 13, marginBottom: 22 }}>Select all that apply.</p>
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
                      background: on ? 'rgba(0,0,0,0.05)' : '#F7F7F8',
                      border: `1px solid ${on ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.06)'}`,
                      transition: 'all 0.18s', color: PW_TEXT, fontFamily: SANS,
                      boxShadow: on ? '0 0 0 1px rgba(0,0,0,0.08)' : 'none',
                    }}
                  >
                    <span style={{ fontSize: 20, flexShrink: 0 }}>{icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>{label}</div>
                      <div style={{ fontSize: 12, color: PW_TEXT_3 }}>{desc}</div>
                    </div>
                    {on && <span style={{ width: 20, height: 20, borderRadius: '50%', background: PW_BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#fff', flexShrink: 0 }}>✓</span>}
                  </button>
                )
              })}
            </div>
            <Button
              fullWidth
              onClick={() => setStep('agent')}
              disabled={selected.length === 0}
            >
              Continue →
            </Button>
          </div>
        )}

        {/* ── Step 3: Agent opt-in ── */}
        {step === 'agent' && (
          <div>
            <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: PW_BLUE_LIGHT, marginBottom: 10 }}>Step 03</div>
            <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 6 }}>Set up your Shopping Agent?</h2>
            <p style={{ color: PW_TEXT_2, fontSize: 14, lineHeight: 1.6, marginBottom: 28 }}>
              Paywell's AI agent can find products and purchase them within limits you control. You approve every action.
            </p>
            <div style={{ display: 'flex', gap: 10, flexDirection: 'column' }}>
              <Button fullWidth onClick={() => setStep('limits')}>
                Yes, set up my agent
              </Button>
              <Button fullWidth variant="ghost" onClick={finish}>
                Later
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 4: Limits ── */}
        {step === 'limits' && (
          <div>
            <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: PW_BLUE_LIGHT, marginBottom: 10 }}>Step 04</div>
            <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 6 }}>Configure spending limits</h2>
            <p style={{ color: PW_TEXT_2, fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
              Your agent will never exceed these limits. You can change them at any time in Settings.
            </p>

            {/* Daily limit */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: PW_TEXT_3, marginBottom: 8 }}>Daily limit (USDC)</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                {[10, 20, 50, 100].map(v => (
                  <button
                    key={v}
                    onClick={() => setDailyLimit(String(v))}
                    style={{
                      flex: 1, padding: '10px 0', borderRadius: 9, cursor: 'pointer',
                      background: dailyLimit === String(v) ? '#0D0D0D' : '#EFEFEF',
                      border: `1px solid ${dailyLimit === String(v) ? '#0D0D0D' : 'rgba(0,0,0,0.06)'}`,
                      color: dailyLimit === String(v) ? '#fff' : PW_TEXT_2,
                      fontSize: 14, fontWeight: 700, fontFamily: MONO,
                      transition: 'all 0.18s',
                    }}
                  >{v}</button>
                ))}
              </div>
              <input
                type="number"
                min="1"
                placeholder="Or enter custom amount..."
                value={![10,20,50,100].map(String).includes(dailyLimit) ? dailyLimit : ''}
                onChange={e => setDailyLimit(e.target.value)}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 9, fontSize: 14,
                  fontFamily: MONO, border: '1px solid rgba(0,0,0,0.12)',
                  background: '#fff', color: PW_TEXT, outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Per-tx limit */}
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: PW_TEXT_3, marginBottom: 8 }}>Per-transaction limit (USDC)</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                {[5, 10, 25, 50].map(v => (
                  <button
                    key={v}
                    onClick={() => setPerTxLimit(String(v))}
                    style={{
                      flex: 1, padding: '10px 0', borderRadius: 9, cursor: 'pointer',
                      background: perTxLimit === String(v) ? '#0D0D0D' : '#EFEFEF',
                      border: `1px solid ${perTxLimit === String(v) ? '#0D0D0D' : 'rgba(0,0,0,0.06)'}`,
                      color: perTxLimit === String(v) ? '#fff' : PW_TEXT_2,
                      fontSize: 14, fontWeight: 700, fontFamily: MONO,
                      transition: 'all 0.18s',
                    }}
                  >{v}</button>
                ))}
              </div>
              <input
                type="number"
                min="1"
                placeholder="Or enter custom amount..."
                value={![5,10,25,50].map(String).includes(perTxLimit) ? perTxLimit : ''}
                onChange={e => setPerTxLimit(e.target.value)}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 9, fontSize: 14,
                  fontFamily: MONO, border: '1px solid rgba(0,0,0,0.12)',
                  background: '#fff', color: PW_TEXT, outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Summary */}
            <div style={{ background: 'rgba(0,0,0,0.03)', border: `1px solid rgba(0,0,0,0.08)`, borderRadius: 12, padding: '14px 16px', marginBottom: 24 }}>
              {[
                { label: 'Daily limit', val: `${dailyLimit} USDC` },
                { label: 'Per transaction', val: `${perTxLimit} USDC` },
                { label: 'Approval mode', val: 'Ask before each purchase' },
              ].map(({ label, val }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(0,0,0,0.05)', fontSize: 13 }}>
                  <span style={{ color: PW_TEXT_3 }}>{label}</span>
                  <span style={{ fontWeight: 600, color: PW_TEXT, fontFamily: MONO }}>{val}</span>
                </div>
              ))}
            </div>

            <Button
              fullWidth
              onClick={() => {
                setAgentPermissions({
                  dailyLimit: parseFloat(dailyLimit) || 20,
                  perTxLimit: parseFloat(perTxLimit) || 10,
                })
                finish()
              }}
            >
              Launch Paywell →
            </Button>
          </div>
        )}
      </div>

      {/* Footer */}
      <p style={{ marginTop: 24, fontSize: 12, color: PW_TEXT_3, fontFamily: MONO, letterSpacing: '0.04em' }}>
        Powered by Arc · Circle USDC · Testnet
      </p>
    </div>
  )
}
