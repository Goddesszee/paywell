import React from 'react'
import { useAccount, useReadContract } from 'wagmi'
import { erc20Abi } from 'viem'
import { ArrowUpRight, ArrowDownLeft, ShoppingBag, Zap, CreditCard } from 'lucide-react'
import { useAppStore, ActivityItem } from '../../store/appStore'
import { Badge } from '../ui/Badge'
import { getUsdc } from '@/onchain-facts'
import { Amount, usdcDecimalsFor } from '@/onchain-money'

const PW_TEXT = '#0D0D0D'
const PW_TEXT_2 = '#6B6B6B'
const PW_TEXT_3 = '#A0A0A0'
const PW_BLUE = '#0D0D0D'
const PW_BLUE_LIGHT = '#0D0D0D'
const PW_BORDER = 'rgba(0,0,0,0.06)'
const MONO = 'JetBrains Mono, Menlo, monospace'
const SANS = 'Inter, -apple-system, sans-serif'
const ARC_TESTNET_ID = 5042002

function QuickAction({ Icon, label, onClick }: { Icon: React.ElementType, label: string, primary?: boolean, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      style={{
        background: '#F7F7F8',
        border: '1px solid rgba(0,0,0,0.08)',
        borderRadius: 16, padding: '14px 8px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7,
        cursor: 'pointer', transition: 'all 0.2s',
        fontFamily: SANS, minHeight: 72,
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <div style={{
        width: 38, height: 38, borderRadius: 11,
        background: '#ECECEC',
        border: '1px solid rgba(0,0,0,0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={17} color="#0D0D0D" />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color: PW_TEXT_2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
    </button>
  )
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const sign = item.sign === '+' ? '+' : '-'
  const isIn = item.sign === '+'
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '11px 12px', borderRadius: 14, marginBottom: 6,
      background: 'rgba(255,255,255,0.02)', border: `1px solid rgba(0,0,0,0.05)`,
      cursor: 'pointer', transition: 'all 0.18s',
    }}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'rgba(0,0,0,0.03)'
        e.currentTarget.style.borderColor = 'rgba(0,0,0,0.10)'
        e.currentTarget.style.transform = 'translateX(2px)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.02)'
        e.currentTarget.style.borderColor = 'rgba(0,0,0,0.05)'
        e.currentTarget.style.transform = 'translateX(0)'
      }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 11, flexShrink: 0,
        background: isIn ? 'rgba(34,197,94,0.12)' : 'rgba(0,0,0,0.05)',
        border: `1px solid ${isIn ? 'rgba(34,197,94,0.2)' : 'rgba(0,0,0,0.08)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 16,
      }}>
        {item.agentInitiated ? '🤖' : isIn ? '↓' : '↑'}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: PW_TEXT, fontFamily: SANS }}>{item.description}</div>
        <div style={{ fontSize: 12, color: PW_TEXT_3, marginTop: 1, fontFamily: MONO }}>
          {item.counterparty && <span>{item.counterparty} · </span>}
          {new Date(item.timestamp).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
        </div>
      </div>
      <span style={{
        fontFamily: MONO, fontSize: 14, fontWeight: 600,
        color: isIn ? '#22C55E' : PW_TEXT,
      }}>
        {sign}{item.amount} USDC
      </span>
    </div>
  )
}

export function HomePage() {
  const { address, isConnected } = useAccount()
  const { activity, agentPermissions, agentDailyUsed, setActiveView } = useAppStore()
  const usdcFact = getUsdc(ARC_TESTNET_ID)

  const { data: rawBalance, isLoading } = useReadContract({
    address: usdcFact?.address as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: ARC_TESTNET_ID,
    query: { enabled: !!address && !!usdcFact },
  })

  const formattedBalance = rawBalance !== undefined
    ? Amount.fromRaw(rawBalance, usdcDecimalsFor(ARC_TESTNET_ID)).toFixed(2)
    : null

  const totalBalance = formattedBalance ? parseFloat(formattedBalance) : 0
  const agentBal = agentPermissions.dailyLimit
  const available = Math.max(0, totalBalance - agentBal)
  const dailyRemaining = Math.max(0, agentPermissions.dailyLimit - agentDailyUsed)
  const pct = agentPermissions.dailyLimit > 0 ? (agentDailyUsed / agentPermissions.dailyLimit) * 100 : 0

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  const recent = activity.slice(0, 4)

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', paddingTop: 4, fontFamily: SANS }}>

      {/* Greeting */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: PW_TEXT_3, fontWeight: 500, marginBottom: 2 }}>{greeting}</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: PW_TEXT, letterSpacing: '-0.5px' }}>
          {address ? address.slice(0, 6) + '...' + address.slice(-4) : 'Welcome to Paywell'}
        </div>
      </div>

      {/* Balance card — Nan's exact style */}
      <div style={{
        background: 'linear-gradient(145deg,#1a1a1a 0%,#111111 50%,#1a1a1a 100%)',
        border: '1px solid rgba(0,0,0,0.07)',
        borderRadius: 14, padding: 20, marginBottom: 10,
        position: 'relative', overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      }}>
        {/* Glow orb */}
        <div style={{ position: 'absolute', top: -20, right: -20, width: 140, height: 140, borderRadius: '50%', background: 'radial-gradient(circle,rgba(0,0,0,0.10),transparent 70%)', pointerEvents: 'none' }} />

        <div style={{ fontFamily: MONO, fontSize: 10, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 6 }}>Total Balance</div>
        {isLoading ? (
          <div style={{ fontSize: 38, fontWeight: 700, color: 'rgba(255,255,255,0.35)', marginBottom: 4, letterSpacing: '-1.5px', fontFamily: MONO }}>
            — USDC
          </div>
        ) : (
          <div style={{ fontSize: 38, fontWeight: 700, color: '#FFFFFF', marginBottom: 4, letterSpacing: '-1.5px', fontFamily: MONO }}>
            {formattedBalance ?? '0.00'} <span style={{ fontSize: 18, color: 'rgba(255,255,255,0.6)' }}>USDC</span>
          </div>
        )}
        {!isConnected && (
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 12, fontFamily: MONO }}>Connect wallet to see balance</div>
        )}

        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          {[{ label: 'Available', val: `${available.toFixed(2)} USDC` }, { label: 'Agent', val: `${agentBal} USDC` }].map(({ label, val }) => (
            <div key={label} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.18)',
              borderRadius: 100, padding: '4px 10px',
              fontFamily: MONO, fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.85)',
            }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#fff', flexShrink: 0 }} />
              <span style={{ color: 'rgba(255,255,255,0.55)' }}>{label}: </span>{val}
            </div>
          ))}
        </div>
      </div>

      {/* Quick actions — 2x2 on very small screens, 4-col on wider */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 10 }}>
        <QuickAction Icon={ArrowUpRight}   label="Send"     primary onClick={() => setActiveView('send')} />
        <QuickAction Icon={ArrowDownLeft}  label="Receive"  onClick={() => setActiveView('receive')} />
        <QuickAction Icon={ShoppingBag}    label="Shop"     onClick={() => setActiveView('shop')} />
        <QuickAction Icon={CreditCard}     label="Buy USDC" onClick={() => setActiveView('onramp')} />
      </div>

      {/* Agent spending */}
      <div style={{
        background: '#EFEFEF', border: `1px solid ${PW_BORDER}`,
        borderRadius: 14, padding: 16, marginBottom: 12,
        boxShadow: '0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(0,0,0,0.05)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: PW_BLUE_LIGHT, opacity: 0.85 }}>Agent Spending</div>
          <Badge variant="blue" dot>Active</Badge>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          {[
            { label: 'Daily limit', val: `${agentPermissions.dailyLimit} USDC` },
            { label: 'Used today', val: `${agentDailyUsed} USDC` },
            { label: 'Remaining', val: `${dailyRemaining} USDC` },
          ].map(({ label, val }) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: PW_TEXT, fontFamily: MONO }}>{val}</div>
              <div style={{ fontSize: 11, color: PW_TEXT_3, marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>
        {/* Progress bar */}
        <div style={{ height: 4, background: 'rgba(0,0,0,0.05)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: pct > 80 ? '#ef4444' : PW_BLUE, borderRadius: 2, transition: 'width 0.5s ease' }} />
        </div>
        <button
          onClick={() => setActiveView('agent')}
          style={{
            marginTop: 14, width: '100%', padding: '10px', borderRadius: 9,
            background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.08)',
            color: PW_BLUE_LIGHT, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: SANS,
            transition: 'all 0.2s',
          }}
        >Open Agent →</button>
      </div>

      {/* Recent activity */}
      <div style={{
        background: '#EFEFEF', border: `1px solid ${PW_BORDER}`,
        borderRadius: 14, padding: 16,
        boxShadow: '0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(0,0,0,0.05)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: PW_BLUE_LIGHT, opacity: 0.85 }}>Recent Activity</div>
          <button onClick={() => setActiveView('activity')} style={{ fontSize: 12, color: PW_BLUE_LIGHT, background: 'none', border: 'none', cursor: 'pointer', fontFamily: MONO }}>View all →</button>
        </div>
        {recent.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: PW_TEXT_3, fontSize: 13 }}>No activity yet</div>
        ) : (
          recent.map(item => <ActivityRow key={item.id} item={item} />)
        )}
      </div>
    </div>
  )
}
