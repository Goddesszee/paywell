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
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '13px 0',
      borderBottom: last ? 'none' : `1px solid ${C.bdr}`,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 12, flexShrink: 0,
        background: isBot
          ? 'rgba(0,102,255,0.10)'
          : isIn ? 'rgba(0,200,83,0.10)' : 'rgba(255,59,59,0.10)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {isBot
          ? <Bot size={17} color={BLUE} />
          : isIn
            ? <ArrowDownLeft size={17} color="#00C853" />
            : <ArrowUpRight size={17} color="#FF3B3B" />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.description}
        </div>
        <div style={{ fontSize: 12, color: C.t3, marginTop: 2 }}>
          {item.counterparty || new Date(item.timestamp).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
        </div>
      </div>
      <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: isIn ? '#00C853' : '#FF3B3B', flexShrink: 0 }}>
        {item.sign}{item.amount}
      </span>
    </div>
  )
}

function PrimaryAction({ Icon, label, primary, onClick, C }: {
  Icon: React.ElementType; label: string; primary?: boolean
  onClick: () => void; C: NanTheme
}) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
      background: 'none', border: 'none', cursor: 'pointer', fontFamily: F,
      WebkitTapHighlightColor: 'transparent', flex: 1, padding: '4px 2px',
      minWidth: 0,
    }}>
      <div style={{
        width: 58, height: 58, borderRadius: 20,
        background: primary ? BLUE : C.surf2,
        border: primary ? 'none' : `1.5px solid ${C.bdr}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: primary ? '0 8px 24px rgba(0,102,255,0.40)' : 'none',
        transition: 'transform 0.12s, box-shadow 0.12s',
        flexShrink: 0,
      }}>
        <Icon size={23} color={primary ? '#fff' : C.t2} strokeWidth={2} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color: C.t2, whiteSpace: 'nowrap' }}>{label}</span>
    </button>
  )
}

function QuickTile({ emoji, label, onClick, C }: {
  emoji: string; label: string; onClick: () => void; C: NanTheme
}) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 10, padding: '18px 8px 16px', minHeight: 96,
      background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 18,
      cursor: 'pointer', fontFamily: F, WebkitTapHighlightColor: 'transparent',
      transition: 'all 0.15s', flex: 1, minWidth: 0,
    }}>
      <span style={{ fontSize: 30, lineHeight: 1 }}>{emoji}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: C.t2, whiteSpace: 'nowrap' }}>{label}</span>
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

  const hour = new Date().getHours()
  const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'

  const recent = activity.slice(0, 5)

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', fontFamily: F, paddingBottom: 16 }}>

      {/* ── Greeting row ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 14, gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <button
            onClick={() => setActiveView('profile')}
            style={{
              width: 44, height: 44, borderRadius: '50%',
              background: C.surf2, border: `2px solid ${C.bdr}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', overflow: 'hidden', flexShrink: 0,
              WebkitTapHighlightColor: 'transparent',
            }}>
            {profile.avatarUrl
              ? <img src={profile.avatarUrl} alt="avatar" style={{ width: 44, height: 44, objectFit: 'cover' }} />
              : <span style={{ fontSize: 18, fontWeight: 700, color: BLUE }}>
                  {(profile.displayName || auth?.email || 'N').slice(0,1).toUpperCase()}
                </span>
            }
          </button>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, color: C.t3, fontWeight: 500 }}>Good {timeOfDay}</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: C.text, letterSpacing: '-0.02em', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Hi, {firstName}
            </div>
          </div>
        </div>

        <button
          onClick={() => setActiveView('onramp')}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '10px 16px', borderRadius: 14, flexShrink: 0,
            background: BLUE, border: 'none',
            color: '#fff', fontSize: 13, fontWeight: 700,
            cursor: 'pointer', fontFamily: F,
            boxShadow: '0 4px 16px rgba(0,102,255,0.4)',
            WebkitTapHighlightColor: 'transparent',
            whiteSpace: 'nowrap',
          }}
        >
          <Plus size={15} strokeWidth={2.5} />
          Add Money
        </button>
      </div>

      {/* ── Total Balance ── */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 13, color: C.t3, fontWeight: 500 }}>Total Balance</span>
          <button
            onClick={() => setHidden(h => !h)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: C.t3, WebkitTapHighlightColor: 'transparent' }}
            aria-label={hidden ? 'Show balance' : 'Hide balance'}
          >
            {hidden ? <EyeOff size={18} color={C.t3} /> : <Eye size={18} color={C.t3} />}
          </button>
        </div>

        {isLoading ? (
          <div style={{ height: 52, width: 200, background: C.surf2, borderRadius: 10, animation: 'nan-shimmer 1.4s ease infinite' }} />
        ) : (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 44, fontWeight: 800, letterSpacing: '-0.03em', color: C.text, lineHeight: 1, fontFamily: F }}>
              {hidden ? '••••••' : `$${formatted}`}
            </span>
          </div>
        )}

        {!isConnected && (
          <div style={{ fontSize: 12, color: C.t3, marginTop: 6 }}>
            Connect your wallet to see your live balance
          </div>
        )}
      </div>

      {/* ── Account cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
        {/* USDC card */}
        <div style={{
          background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 20,
          padding: '16px 14px 14px', minWidth: 0,
        }}>
          <div style={{ marginBottom: 12 }}>
            <span style={{ fontSize: 24 }}>🇺🇸</span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.text, fontFamily: MONO, letterSpacing: '-0.02em', marginBottom: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {hidden ? '••••' : `$${formatted}`}
          </div>
          <button
            onClick={() => setActiveView('wallet')}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              fontSize: 11, fontWeight: 600, color: C.t2,
              background: C.surf2, border: `1px solid ${C.bdr}`,
              borderRadius: 8, padding: '7px 10px', cursor: 'pointer',
              fontFamily: F, WebkitTapHighlightColor: 'transparent',
              width: '100%', justifyContent: 'center',
            }}>
            <span>🏛</span> USDC Wallet
          </button>
        </div>

        {/* Agent budget card */}
        <div style={{
          background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 20,
          padding: '16px 14px 14px', minWidth: 0,
        }}>
          <div style={{ marginBottom: 12 }}>
            <span style={{ fontSize: 24 }}>🤖</span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.text, fontFamily: MONO, letterSpacing: '-0.02em', marginBottom: 12 }}>
            {hidden ? '••••' : '$0.00'}
          </div>
          <button
            onClick={() => setActiveView('agent')}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              fontSize: 11, fontWeight: 600, color: C.t2,
              background: C.surf2, border: `1px solid ${C.bdr}`,
              borderRadius: 8, padding: '7px 10px', cursor: 'pointer',
              fontFamily: F, WebkitTapHighlightColor: 'transparent',
              width: '100%', justifyContent: 'center',
            }}>
            <span>🏛</span> Agent Budget
          </button>
        </div>
      </div>

      {/* ── Primary actions: Send / Receive / Convert ── */}
      <div style={{
        display: 'flex', justifyContent: 'space-around',
        marginBottom: 20,
      }}>
        <PrimaryAction Icon={Send}            label="Send"    primary onClick={() => setActiveView('send')}    C={C} />
        <PrimaryAction Icon={ArrowDownToLine} label="Receive"         onClick={() => setActiveView('receive')} C={C} />
        <PrimaryAction Icon={ArrowLeftRight}  label="Convert"         onClick={() => setActiveView('swap')}    C={C} />
      </div>

      {/* ── Quick actions ── */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.text, letterSpacing: '-0.01em', marginBottom: 14 }}>
          Quick action
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
          <QuickTile emoji="🤖" label="Agents"    onClick={() => setActiveView('agent')}    C={C} />
          <QuickTile emoji="⚡" label="Payments"  onClick={() => setActiveView('wallet')}   C={C} />
          <QuickTile emoji="🎁" label="Rewards"   onClick={() => setActiveView('faucet')}   C={C} />
        </div>
      </div>

      {/* ── Recent activity ── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: C.text, letterSpacing: '-0.01em' }}>
            Recent Activity
          </span>
          <button
            onClick={() => setActiveView('activity')}
            style={{ fontSize: 13, color: BLUE, background: 'none', border: 'none', cursor: 'pointer', fontFamily: F, display: 'flex', alignItems: 'center', gap: 2, fontWeight: 600 }}>
            View all <ChevronRight size={13} />
          </button>
        </div>

        <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 20, padding: '0 16px' }}>
          {recent.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '36px 20px' }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: C.surf2, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                <ActivityIcon size={22} color={C.t3} />
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 4 }}>No activity yet</div>
              <div style={{ fontSize: 13, color: C.t3 }}>Your transactions will appear here</div>
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
