import React, { useState } from 'react'
import { useAccount, useReadContract } from 'wagmi'
import { erc20Abi } from 'viem'
import {
  Eye, EyeOff, Plus, Send, ArrowLeftRight,
  Bot, Activity as ActivityIcon,
  ArrowUpRight, ArrowDownLeft, ChevronRight, ArrowDownToLine,
} from 'lucide-react'
import { useAppStore, ActivityItem } from '../../store/appStore'
import { getUsdc } from '../../onchain-facts'
import { Amount, usdcDecimalsFor } from '../../onchain-money'
import { useNanTheme, NanTheme } from '../../hooks/useNanTheme'

const F    = "'Inter', -apple-system, sans-serif"
const MONO = "'JetBrains Mono', 'SF Mono', Menlo, monospace"
const ARC  = 5042002
const BLUE = '#0066FF'

// ── helpers ───────────────────────────────────────────────────────────────────

function TxRow({ item, C, last }: { item: ActivityItem; C: NanTheme; last: boolean }) {
  const isIn  = item.sign === '+'
  const isBot = !!item.agentInitiated
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 0',
      borderBottom: last ? 'none' : `1px solid ${C.bdr}`,
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 9, flexShrink: 0,
        background: isBot ? 'rgba(0,102,255,0.10)' : isIn ? 'rgba(0,200,83,0.10)' : 'rgba(255,59,59,0.10)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {isBot
          ? <Bot size={14} color={BLUE} />
          : isIn
            ? <ArrowDownLeft size={14} color="#00C853" />
            : <ArrowUpRight  size={14} color="#FF3B3B" />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.description}
        </div>
        <div style={{ fontSize: 11, color: C.t3, marginTop: 1 }}>
          {item.counterparty || new Date(item.timestamp).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
        </div>
      </div>
      <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: isIn ? '#00C853' : '#FF3B3B', flexShrink: 0 }}>
        {item.sign}{item.amount}
      </span>
    </div>
  )
}

function ActionBtn({ Icon, label, primary, onClick, C }: {
  Icon: React.ElementType; label: string; primary?: boolean
  onClick: () => void; C: NanTheme
}) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      background: 'none', border: 'none', cursor: 'pointer', fontFamily: F,
      WebkitTapHighlightColor: 'transparent', flex: 1, padding: '2px 0', minWidth: 0,
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: 16,
        background: primary ? BLUE : C.surf2,
        border: primary ? 'none' : `1px solid ${C.bdr}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: primary ? '0 6px 18px rgba(0,102,255,0.38)' : 'none',
        flexShrink: 0,
      }}>
        <Icon size={19} color={primary ? '#fff' : C.t2} strokeWidth={2} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 600, color: C.t2, whiteSpace: 'nowrap' }}>{label}</span>
    </button>
  )
}

function QuickTile({ emoji, label, onClick, C }: {
  emoji: string; label: string; onClick: () => void; C: NanTheme
}) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 7, padding: '14px 6px 12px', minHeight: 76,
      background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 14,
      cursor: 'pointer', fontFamily: F, WebkitTapHighlightColor: 'transparent',
      flex: 1, minWidth: 0,
    }}>
      <span style={{ fontSize: 24, lineHeight: 1 }}>{emoji}</span>
      <span style={{ fontSize: 11, fontWeight: 600, color: C.t2, whiteSpace: 'nowrap' }}>{label}</span>
    </button>
  )
}

// ── main ──────────────────────────────────────────────────────────────────────

export function HomePage() {
  const C = useNanTheme()
  const { address, isConnected } = useAccount()
  const { activity, setActiveView, auth, profile } = useAppStore()

  const usdcFact = getUsdc(ARC)
  const { data: rawBalance, isLoading } = useReadContract({
    address: usdcFact?.address as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: ARC,
    query: { enabled: !!address && !!usdcFact },
  })

  const formatted = rawBalance !== undefined
    ? Amount.fromRaw(rawBalance, usdcDecimalsFor(ARC)).toFixed(2)
    : '0.00'

  const [hidden, setHidden] = useState(false)

  const firstName = profile.displayName?.split(' ')[0]
    || auth?.email?.split('@')[0]
    || 'there'

  const recent = activity.slice(0, 4)

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', fontFamily: F }}>

      {/* ── Greeting + Add Money ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
          <button
            onClick={() => setActiveView('profile')}
            style={{
              width: 36, height: 36, borderRadius: '50%',
              background: C.surf2, border: `1.5px solid ${C.bdr}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', overflow: 'hidden', flexShrink: 0,
              WebkitTapHighlightColor: 'transparent',
            }}>
            {profile.avatarUrl
              ? <img src={profile.avatarUrl} alt="avatar" style={{ width: 36, height: 36, objectFit: 'cover' }} />
              : <span style={{ fontSize: 14, fontWeight: 700, color: BLUE }}>
                  {(profile.displayName || auth?.email || 'N').slice(0,1).toUpperCase()}
                </span>
            }
          </button>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Hi, {firstName}
            </div>
          </div>
        </div>

        <button
          onClick={() => setActiveView('onramp')}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '8px 14px', borderRadius: 12, flexShrink: 0,
            background: BLUE, border: 'none',
            color: '#fff', fontSize: 12, fontWeight: 700,
            cursor: 'pointer', fontFamily: F,
            boxShadow: '0 3px 12px rgba(0,102,255,0.38)',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <Plus size={13} strokeWidth={2.5} />
          Add Money
        </button>
      </div>

      {/* ── Total Balance ── */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
          <span style={{ fontSize: 12, color: C.t3, fontWeight: 500 }}>Total Balance</span>
          <button
            onClick={() => setHidden(h => !h)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 3, WebkitTapHighlightColor: 'transparent' }}
            aria-label={hidden ? 'Show balance' : 'Hide balance'}
          >
            {hidden ? <EyeOff size={15} color={C.t3} /> : <Eye size={15} color={C.t3} />}
          </button>
        </div>

        {isLoading ? (
          <div style={{ height: 40, width: 160, background: C.surf2, borderRadius: 8, animation: 'nan-shimmer 1.4s ease infinite' }} />
        ) : (
          <span style={{ fontSize: 36, fontWeight: 800, letterSpacing: '-0.03em', color: C.text, lineHeight: 1, fontFamily: F }}>
            {hidden ? '••••••' : `$${formatted}`}
          </span>
        )}

        {!isConnected && (
          <div style={{ fontSize: 11, color: C.t3, marginTop: 4 }}>
            Connect wallet to see live balance
          </div>
        )}
      </div>

      {/* ── Balance cards — horizontal scroll ── */}
      <div style={{
        display: 'flex', gap: 8, marginBottom: 14, overflowX: 'auto',
        marginLeft: -14, marginRight: -14,
        paddingLeft: 14, paddingRight: 14,
        scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch',
      }}>
        {[
          { flag: '🇺🇸', label: 'USDC',    symbol: '$',  value: formatted, view: 'wallet',  accent: '#0066FF' },
          { flag: '🇪🇺', label: 'EURC',    symbol: '€',  value: '0.00',    view: 'wallet',  accent: '#0099CC' },
          { flag: '🇳🇬', label: 'NGN',     symbol: '₦',  value: '0.00',    view: 'wallet',  accent: '#00A651' },
          { flag: '🇨🇦', label: 'CAD',     symbol: 'C$', value: '0.00',    view: 'wallet',  accent: '#FF0000' },
          { flag: '🎁',  label: 'Rewards', symbol: '',   value: '0 pts',   view: 'faucet',  accent: '#FF9500' },
        ].map(card => (
          <button
            key={card.label}
            onClick={() => setActiveView(card.view)}
            style={{
              flexShrink: 0, width: 120,
              background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 16,
              padding: '12px 12px 10px', cursor: 'pointer', fontFamily: F,
              WebkitTapHighlightColor: 'transparent', textAlign: 'left',
            }}
          >
            <div style={{ marginBottom: 7 }}><span style={{ fontSize: 20 }}>{card.flag}</span></div>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.text, fontFamily: MONO, letterSpacing: '-0.02em', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {hidden ? '••••' : `${card.symbol}${card.value}`}
            </div>
            <div style={{ fontSize: 10, fontWeight: 600, color: card.accent }}>{card.label}</div>
          </button>
        ))}
      </div>

      {/* ── Primary actions ── */}
      <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: 16 }}>
        <ActionBtn Icon={Send}            label="Send"    primary onClick={() => setActiveView('send')}    C={C} />
        <ActionBtn Icon={ArrowDownToLine} label="Receive"         onClick={() => setActiveView('receive')} C={C} />
        <ActionBtn Icon={ArrowLeftRight}  label="Convert"         onClick={() => setActiveView('swap')}    C={C} />
      </div>

      {/* ── Quick actions ── */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 10 }}>Quick action</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
          <QuickTile emoji="🤖" label="Agents"   onClick={() => setActiveView('agent')}  C={C} />
          <QuickTile emoji="⚡" label="Payments" onClick={() => setActiveView('wallet')} C={C} />
          <QuickTile emoji="🎁" label="Rewards"  onClick={() => setActiveView('faucet')} C={C} />
        </div>
      </div>

      {/* ── Recent activity ── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Recent Activity</span>
          <button onClick={() => setActiveView('activity')}
            style={{ fontSize: 12, color: BLUE, background: 'none', border: 'none', cursor: 'pointer', fontFamily: F, display: 'flex', alignItems: 'center', gap: 2, fontWeight: 600 }}>
            View all <ChevronRight size={12} />
          </button>
        </div>

        <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 16, padding: '0 12px' }}>
          {recent.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 16px' }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: C.surf2, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px' }}>
                <ActivityIcon size={17} color={C.t3} />
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 3 }}>No activity yet</div>
              <div style={{ fontSize: 11, color: C.t3 }}>Your transactions will appear here</div>
            </div>
          ) : (
            recent.map((item, idx) => (
              <TxRow key={item.id} item={item} C={C} last={idx === recent.length - 1} />
            ))
          )}
        </div>
      </div>

    </div>
  )
}
