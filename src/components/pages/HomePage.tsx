import React, { useState, useEffect } from 'react'
import { useAccount, useReadContract } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { erc20Abi } from 'viem'
import {
  Eye, EyeOff, Plus, Send, ArrowLeftRight,
  Bot, Activity as ActivityIcon, Wallet,
  ArrowUpRight, ArrowDownLeft, ChevronRight,
  ArrowDownToLine, Sparkles,
} from 'lucide-react'
import { useAppStore, ActivityItem } from '../../store/appStore'
import { getUsdc } from '../../onchain-facts'
import { useNanTheme, NanTheme } from '../../hooks/useNanTheme'
import { TokenLogo } from '../ui/TokenLogo'
import { useSyncMultiChainBalances } from '../../hooks/useMultiChainBalances'

const F    = "'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
const MONO = "'JetBrains Mono', 'SF Mono', Menlo, monospace"
const ARC  = 5042002
const BLUE = '#0066FF'
const EURC_ADDRESS = '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a' as const

// ─── Tx row ──────────────────────────────────────────────────────────────────

function TxRow({ item, C, last }: { item: ActivityItem; C: NanTheme; last: boolean }) {
  const isIn  = item.sign === '+'
  const isBot = !!item.agentInitiated
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 0',
      borderBottom: last ? 'none' : `1px solid ${C.bdr}`,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
        background: isBot
          ? 'rgba(0,102,255,0.10)'
          : isIn ? 'rgba(0,200,83,0.10)' : 'rgba(255,59,59,0.10)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {isBot
          ? <Bot size={15} color={BLUE} />
          : isIn
            ? <ArrowDownLeft size={15} color="#00C853" />
            : <ArrowUpRight  size={15} color="#FF3B3B" />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.description}
        </div>
        <div style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>
          {item.counterparty || new Date(item.timestamp).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
        </div>
      </div>
      <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: isIn ? '#00C853' : '#FF3B3B', flexShrink: 0 }}>
        {item.sign}{item.amount}
      </span>
    </div>
  )
}

// ─── Action button ────────────────────────────────────────────────────────────

function ActionBtn({ Icon, label, primary, onClick, C }: {
  Icon: React.ElementType; label: string; primary?: boolean
  onClick: () => void; C: NanTheme
}) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7,
      background: 'none', border: 'none', cursor: 'pointer', fontFamily: F,
      WebkitTapHighlightColor: 'transparent', flex: 1, padding: '4px 0', minWidth: 0,
    }}>
      <div style={{
        width: 52, height: 52, borderRadius: 18,
        background: primary ? BLUE : C.surf2,
        border: primary ? 'none' : `1px solid ${C.bdr}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: primary ? '0 6px 20px rgba(0,102,255,0.40)' : 'none',
        flexShrink: 0,
      }}>
        <Icon size={20} color={primary ? '#fff' : C.t2} strokeWidth={1.9} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 600, color: C.t2, whiteSpace: 'nowrap' }}>{label}</span>
    </button>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function HomePage() {
  const C = useNanTheme()
  const { address: wagmiAddress, isConnected } = useAccount()
  const {
    activity, setActiveView, auth, profile,
    setMainWalletBalance, setCrossChainBalances, agentWallet,
  } = useAppStore()

  const address   = wagmiAddress ?? (auth?.circleWalletAddress as `0x${string}` | undefined)
  const hasWallet = isConnected || !!auth?.circleWalletAddress

  const usdcFact = getUsdc(ARC)
  const { data: rawBalance, isLoading } = useReadContract({
    address: usdcFact?.address as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: ARC,
    query: { enabled: !!address && !!usdcFact },
  })

  const { data: rawEurc } = useReadContract({
    address: EURC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: ARC,
    query: { enabled: !!address },
  })

  const usdcNum       = rawBalance !== undefined ? Number(rawBalance) / 1e6 : 0
  const eurcNum       = rawEurc    !== undefined ? Number(rawEurc)    / 1e6 : 0
  const totalNum      = usdcNum + eurcNum
  const formatted     = totalNum.toFixed(2)
  const eurcFormatted = eurcNum.toFixed(2)
  const agentBalance  = agentWallet?.balance_usdc ?? null

  const [hidden,   setHidden]   = useState(false)
  const [hydrated, setHydrated] = useState(false)
  /* eslint-disable react/set-state-in-effect */
  useEffect(() => { setHydrated(true) }, [])
  /* eslint-enable react/set-state-in-effect */

  useEffect(() => {
    if (rawBalance !== undefined && address) {
      setMainWalletBalance(usdcNum.toFixed(2), address)
    }
  }, [rawBalance, address, usdcNum, setMainWalletBalance])

  useSyncMultiChainBalances(address, setCrossChainBalances)

  const firstName = profile.displayName?.split(' ')[0]
    || auth?.email?.split('@')[0]
    || 'there'

  const recent = activity.slice(0, 4)

  return (
    <div style={{ maxWidth: 480, width: '100%', margin: '0 auto', fontFamily: F, paddingBottom: 24 }}>

      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 20, gap: 10,
      }}>
        {/* Avatar + greeting */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <button
            onClick={() => setActiveView('profile')}
            style={{
              width: 40, height: 40, borderRadius: '50%',
              background: C.surf2, border: `1.5px solid ${C.bdr}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', overflow: 'hidden', flexShrink: 0,
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {profile.avatarUrl
              ? <img src={profile.avatarUrl} alt="avatar" style={{ width: 40, height: 40, objectFit: 'cover' }} />
              : <span style={{ fontSize: 15, fontWeight: 700, color: BLUE }}>
                  {(profile.displayName || auth?.email || 'N').slice(0, 1).toUpperCase()}
                </span>
            }
          </button>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Hi, {firstName}
            </div>
          </div>
        </div>

        {/* Add Money — primary CTA, always visible */}
        <button
          onClick={() => setActiveView('onramp')}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '10px 18px', borderRadius: 14, flexShrink: 0,
            background: BLUE, border: 'none',
            color: '#fff', fontSize: 13, fontWeight: 700,
            cursor: 'pointer', fontFamily: F,
            boxShadow: '0 4px 16px rgba(0,102,255,0.40)',
            WebkitTapHighlightColor: 'transparent',
            letterSpacing: '-0.01em',
          }}
        >
          <Plus size={14} strokeWidth={2.5} />
          Add Money
        </button>
      </div>

      {/* ── Total Balance ── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', marginBottom: 5,
        }}>
          <span style={{ fontSize: 12, color: C.t3, fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            Total Balance
          </span>
          <button
            onClick={() => setHidden(h => !h)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, WebkitTapHighlightColor: 'transparent' }}
            aria-label={hidden ? 'Show balance' : 'Hide balance'}
          >
            {hidden ? <EyeOff size={16} color={C.t3} /> : <Eye size={16} color={C.t3} />}
          </button>
        </div>

        {isLoading ? (
          <div style={{ height: 44, width: 180, background: C.surf2, borderRadius: 10, animation: 'nan-shimmer 1.4s ease infinite' }} />
        ) : (
          <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.04em', color: C.text, lineHeight: 1.1, fontFamily: F }}>
            {hidden ? '••••••' : `$${formatted}`}
          </div>
        )}

        {hydrated && !hasWallet && (
          <div style={{ marginTop: 12 }}>
            <ConnectKitButton />
          </div>
        )}
      </div>

      {/* ── Asset cards — 3-column grid, no horizontal scroll ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 10, marginBottom: 20,
      }}>
        {/* USDC */}
        <button
          onClick={() => setActiveView('wallet')}
          style={{
            background: C.surf, border: `1px solid ${C.bdr}`,
            borderRadius: 16, padding: '14px 12px 12px',
            cursor: 'pointer', fontFamily: F,
            WebkitTapHighlightColor: 'transparent', textAlign: 'left',
          }}
        >
          <div style={{ marginBottom: 8 }}>
            <TokenLogo symbol="USDC" size={30} radius={9} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 800, color: C.text, fontFamily: MONO, letterSpacing: '-0.02em', marginBottom: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {hidden ? '••••' : `$${formatted}`}
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#2775CA' }}>USDC</div>
        </button>

        {/* EURC */}
        <button
          onClick={() => setActiveView('swap')}
          style={{
            background: C.surf, border: `1px solid ${C.bdr}`,
            borderRadius: 16, padding: '14px 12px 12px',
            cursor: 'pointer', fontFamily: F,
            WebkitTapHighlightColor: 'transparent', textAlign: 'left',
          }}
        >
          <div style={{ marginBottom: 8 }}>
            <TokenLogo symbol="EURC" size={30} radius={9} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 800, color: C.text, fontFamily: MONO, letterSpacing: '-0.02em', marginBottom: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {hidden ? '••••' : `€${eurcFormatted}`}
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#0099CC' }}>EURC</div>
        </button>

        {/* Agent Wallet — visually distinct, same row */}
        <button
          onClick={() => setActiveView('agent-wallet')}
          style={{
            background: 'rgba(0,102,255,0.08)',
            border: '1px solid rgba(0,102,255,0.22)',
            borderRadius: 16, padding: '14px 12px 12px',
            cursor: 'pointer', fontFamily: F,
            WebkitTapHighlightColor: 'transparent', textAlign: 'left',
          }}
        >
          <div style={{ marginBottom: 8 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 9,
              background: BLUE,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Wallet size={15} color="#fff" strokeWidth={2} />
            </div>
          </div>
          <div style={{ fontSize: 15, fontWeight: 800, color: C.text, fontFamily: MONO, letterSpacing: '-0.02em', marginBottom: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {hidden ? '••••' : agentBalance !== null
              ? `$${parseFloat(agentBalance).toFixed(2)}`
              : '—'}
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#6B9FFF' }}>Agent Wallet</div>
        </button>
      </div>

      {/* ── Action buttons: Send · Receive · Convert · NAN Agent ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 22, gap: 4 }}>
        <ActionBtn Icon={Send}            label="Send"      primary onClick={() => setActiveView('send')}    C={C} />
        <ActionBtn Icon={ArrowDownToLine} label="Receive"           onClick={() => setActiveView('receive')} C={C} />
        <ActionBtn Icon={ArrowLeftRight}  label="Convert"           onClick={() => setActiveView('swap')}    C={C} />
        <ActionBtn Icon={Sparkles}        label="NAN Agent"         onClick={() => setActiveView('agent')}   C={C} />
      </div>

      {/* ── Quick actions ── */}
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 10 }}>Quick actions</div>

        {/* Agent Wallet full card */}
        <button
          onClick={() => setActiveView('agent-wallet')}
          style={{
            width: '100%', padding: '16px 18px', borderRadius: 18,
            border: '1px solid rgba(0,102,255,0.24)',
            background: 'linear-gradient(135deg, rgba(0,102,255,0.12) 0%, rgba(0,102,255,0.04) 100%)',
            cursor: 'pointer', fontFamily: F, WebkitTapHighlightColor: 'transparent',
            display: 'flex', alignItems: 'center', gap: 14,
          }}
        >
          <div style={{
            width: 46, height: 46, borderRadius: 14, flexShrink: 0,
            background: BLUE,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 14px rgba(0,102,255,0.38)',
          }}>
            <Wallet size={21} color="#fff" strokeWidth={1.8} />
          </div>
          <div style={{ textAlign: 'left', flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.text, letterSpacing: '-0.02em', marginBottom: 2 }}>
              Agent Wallet
            </div>
            <div style={{ fontSize: 12, color: C.t2, lineHeight: 1.4 }}>
              Give your AI agent a wallet to pay for approved services
            </div>
          </div>
          <ChevronRight size={16} color={BLUE} strokeWidth={2.5} />
        </button>

        {/* NAN Agent secondary card */}
        <button
          onClick={() => setActiveView('agent')}
          style={{
            width: '100%', padding: '14px 16px', borderRadius: 16, marginTop: 10,
            border: `1px solid ${C.bdr}`, background: C.surf,
            cursor: 'pointer', fontFamily: F, WebkitTapHighlightColor: 'transparent',
            display: 'flex', alignItems: 'center', gap: 12,
          }}
        >
          <div style={{
            width: 40, height: 40, borderRadius: 12, flexShrink: 0,
            background: 'rgba(0,102,255,0.10)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Bot size={18} color={BLUE} strokeWidth={1.8} />
          </div>
          <div style={{ textAlign: 'left', flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 2 }}>
              NAN Agent
            </div>
            <div style={{ fontSize: 11, color: C.t2 }}>
              Shop, pay &amp; manage finances with AI
            </div>
          </div>
          <ChevronRight size={14} color={C.t3} />
        </button>
      </div>

      {/* ── Recent Activity ── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Recent Activity</span>
          <button
            onClick={() => setActiveView('activity')}
            style={{ fontSize: 12, color: BLUE, background: 'none', border: 'none', cursor: 'pointer', fontFamily: F, display: 'flex', alignItems: 'center', gap: 3, fontWeight: 600, WebkitTapHighlightColor: 'transparent' }}
          >
            View all <ChevronRight size={13} />
          </button>
        </div>

        <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 16, padding: '0 14px' }}>
          {recent.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '28px 16px' }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12,
                background: C.surf2,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 10px',
              }}>
                <ActivityIcon size={18} color={C.t3} />
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 4 }}>
                No activity yet
              </div>
              <div style={{ fontSize: 12, color: C.t3 }}>
                Your transactions will appear here
              </div>
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
