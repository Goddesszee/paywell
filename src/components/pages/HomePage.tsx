import React, { useState, useEffect } from 'react'
import { useAccount, useReadContract } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { erc20Abi } from 'viem'
import {
  Eye, EyeOff, Plus, Send, ArrowLeftRight,
  Activity as ActivityIcon,
  ArrowUpRight, ArrowDownLeft, ChevronRight,
  ArrowDownToLine, Sparkles, Bot,
  CheckCircle2, Clock, Bell, ShoppingBag,
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
const GREEN = '#00C853'
const RED   = '#FF3B3B'
const EURC_ADDRESS = '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a' as const

// ─── Transaction row ──────────────────────────────────────────────────────────

function txTypeIcon(item: ActivityItem) {
  if (item.agentInitiated) return { icon: <Bot size={15} color={BLUE} />, bg: 'rgba(0,102,255,0.10)' }
  if (item.type === 'bridge') return { icon: <ArrowLeftRight size={15} color="#818CF8" />, bg: 'rgba(129,140,248,0.10)' }
  if (item.type === 'purchase' || item.type === 'agent_purchase') return { icon: <ShoppingBag size={15} color="#F0A500" />, bg: 'rgba(240,165,0,0.10)' }
  if (item.sign === '+') return { icon: <ArrowDownLeft size={15} color={GREEN} />, bg: 'rgba(0,200,83,0.10)' }
  return { icon: <ArrowUpRight size={15} color={RED} />, bg: 'rgba(255,59,59,0.10)' }
}

function TxRow({ item, C, last }: { item: ActivityItem; C: NanTheme; last: boolean }) {
  const isIn = item.sign === '+'
  const { icon, bg } = txTypeIcon(item)
  const ts = new Date(item.timestamp)
  const timeLabel = ts.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })
  const dateLabel = ts.toLocaleDateString('en', { month: 'short', day: 'numeric' })
  const isConfirmed = item.status === 'confirmed'
  const isPending   = item.status === 'pending'

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 0',
      borderBottom: last ? 'none' : `1px solid ${C.bdr}`,
    }}>
      {/* Icon */}
      <div style={{
        width: 38, height: 38, borderRadius: 11, flexShrink: 0,
        background: bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {icon}
      </div>

      {/* Description + meta */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.description}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
          {item.counterparty && (
            <span style={{ fontSize: 11, color: C.t3 }}>{item.counterparty}</span>
          )}
          <span style={{ fontSize: 10, color: C.t3 }}>{dateLabel} · {timeLabel}</span>
          {isConfirmed && <CheckCircle2 size={10} color={GREEN} />}
          {isPending   && <Clock        size={10} color="#F0A500" />}
        </div>
      </div>

      {/* Amount */}
      <span style={{
        fontFamily: MONO, fontSize: 13, fontWeight: 700,
        color: isIn ? GREEN : RED, flexShrink: 0,
      }}>
        {item.sign}{item.amount}
      </span>
    </div>
  )
}

// ─── Action button ────────────────────────────────────────────────────────────

function ActionBtn({ Icon, label, primary, ai, onClick, C }: {
  Icon: React.ElementType; label: string; primary?: boolean; ai?: boolean
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
        background: primary ? BLUE : ai ? 'rgba(0,102,255,0.13)' : C.surf2,
        border: primary ? 'none' : ai ? '1px solid rgba(0,102,255,0.30)' : `1px solid ${C.bdr}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: primary ? '0 6px 20px rgba(0,102,255,0.40)' : ai ? '0 2px 12px rgba(0,102,255,0.18)' : 'none',
        flexShrink: 0, position: 'relative',
      }}>
        <Icon size={20} color={primary ? '#fff' : ai ? BLUE : C.t2} strokeWidth={1.9} />
        {ai && (
          <div style={{
            position: 'absolute', top: -4, right: -4,
            width: 14, height: 14, borderRadius: '50%',
            background: BLUE, border: '2px solid #08090B',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Sparkles size={7} color="#fff" strokeWidth={2.5} />
          </div>
        )}
      </div>
      <span style={{ fontSize: 11, fontWeight: ai ? 700 : 600, color: ai ? BLUE : C.t2, whiteSpace: 'nowrap' }}>{label}</span>
    </button>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function HomePage() {
  const C = useNanTheme()
  const { address: wagmiAddress, isConnected } = useAccount()
  const {
    activity, setActiveView, auth, profile,
    setMainWalletBalance, setCrossChainBalances,
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
    <div style={{ maxWidth: 480, width: '100%', margin: '0 auto', fontFamily: F, paddingBottom: 32 }}>

      {/* ── 1. HEADER ── */}
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
            <div style={{ fontSize: 11, color: C.t3, marginTop: 1 }}>
              Your AI agent is ready
            </div>
          </div>
        </div>

        {/* Right: bell + Add Money */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <button
            onClick={() => setActiveView('notifications')}
            style={{
              width: 38, height: 38, borderRadius: 12,
              background: C.surf2, border: `1px solid ${C.bdr}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
            }}
          >
            <Bell size={16} color={C.t2} strokeWidth={2} />
          </button>
          <button
            onClick={() => setActiveView('onramp')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '10px 16px', borderRadius: 14,
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
      </div>

      {/* ── 2. NAN AGENT HERO CARD ── */}
      <div
        onClick={() => setActiveView('agent')}
        style={{
          position: 'relative', overflow: 'hidden',
          borderRadius: 22,
          border: '1px solid rgba(0,102,255,0.32)',
          background: 'linear-gradient(145deg, rgba(0,102,255,0.15) 0%, rgba(0,102,255,0.05) 60%, rgba(0,0,0,0) 100%)',
          padding: '20px 20px 18px',
          marginBottom: 20,
          cursor: 'pointer',
          WebkitTapHighlightColor: 'transparent',
          boxShadow: '0 0 40px rgba(0,102,255,0.10)',
        }}
      >
        {/* Glow orb */}
        <div style={{
          position: 'absolute', top: -30, right: -30,
          width: 130, height: 130, borderRadius: '50%',
          background: 'rgba(0,102,255,0.18)', filter: 'blur(40px)',
          pointerEvents: 'none',
        }} />

        {/* Top row: icon + status */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 14,
              background: BLUE,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 16px rgba(0,102,255,0.45)',
              flexShrink: 0,
            }}>
              <Bot size={22} color="#fff" strokeWidth={1.7} />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.text, letterSpacing: '-0.025em' }}>
                NAN Agent
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: GREEN, boxShadow: `0 0 6px ${GREEN}` }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: GREEN }}>Active</span>
              </div>
            </div>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '7px 14px', borderRadius: 100,
            background: BLUE, cursor: 'pointer',
          }}
            onClick={e => { e.stopPropagation(); setActiveView('agent') }}
          >
            <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>View Agent</span>
            <ChevronRight size={13} color="#fff" strokeWidth={2.5} />
          </div>
        </div>

        {/* Description */}
        <div style={{ fontSize: 13, color: C.t2, lineHeight: 1.6, maxWidth: 280 }}>
          Your AI agent handles payments, budgets and approved services — safely, within your limits.
        </div>

        {/* Capability chips */}
        <div style={{ display: 'flex', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
          {['Send USDC', 'Pay services', 'Manage budget', 'Recurring'].map(cap => (
            <span key={cap} style={{
              fontSize: 10, fontWeight: 600, color: 'rgba(107,159,255,0.9)',
              background: 'rgba(0,102,255,0.12)',
              border: '1px solid rgba(0,102,255,0.20)',
              borderRadius: 100, padding: '3px 9px',
            }}>{cap}</span>
          ))}
        </div>
      </div>

      {/* ── 3. TOTAL WALLET BALANCE ── */}
      <div style={{ marginBottom: 18 }}>
        <div style={{
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', marginBottom: 5,
        }}>
          <span style={{ fontSize: 11, color: C.t3, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Total Wallet Balance
          </span>
          <button
            onClick={() => setHidden(h => !h)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, WebkitTapHighlightColor: 'transparent' }}
            aria-label={hidden ? 'Show balance' : 'Hide balance'}
          >
            {hidden ? <EyeOff size={15} color={C.t3} /> : <Eye size={15} color={C.t3} />}
          </button>
        </div>

        {isLoading ? (
          <div style={{ height: 44, width: 180, background: C.surf2, borderRadius: 10, animation: 'nan-shimmer 1.4s ease infinite' }} />
        ) : (
          <div style={{ fontSize: 38, fontWeight: 800, letterSpacing: '-0.04em', color: C.text, lineHeight: 1.1, fontFamily: F }}>
            {hidden ? '••••••' : `$${formatted}`}
          </div>
        )}

        {hydrated && !hasWallet && (
          <div style={{ marginTop: 12 }}>
            <ConnectKitButton />
          </div>
        )}
      </div>

      {/* ── 4. ASSET CARDS — 3-col grid ── */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
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
          <div style={{ fontSize: 14, fontWeight: 800, color: C.text, fontFamily: MONO, letterSpacing: '-0.02em', marginBottom: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {hidden ? '••••' : `$${formatted}`}
          </div>
          <div style={{ fontSize: 10, fontWeight: 600, color: '#2775CA' }}>USDC</div>
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
          <div style={{ fontSize: 14, fontWeight: 800, color: C.text, fontFamily: MONO, letterSpacing: '-0.02em', marginBottom: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {hidden ? '••••' : `€${eurcFormatted}`}
          </div>
          <div style={{ fontSize: 10, fontWeight: 600, color: '#0099CC' }}>EURC</div>
        </button>

        {/* USDT */}
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
            <TokenLogo symbol="USDT" size={30} radius={9} />
          </div>
          <div style={{ fontSize: 14, fontWeight: 800, color: C.text, fontFamily: MONO, letterSpacing: '-0.02em', marginBottom: 5 }}>
            {hidden ? '••••' : '$0.00'}
          </div>
          <div style={{ fontSize: 10, fontWeight: 600, color: '#26A17B' }}>USDT</div>
        </button>
      </div>

      {/* ── 5. ACTION BUTTONS: Send · Receive · Convert · NAN Agent ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 22, gap: 4 }}>
        <ActionBtn Icon={Send}            label="Send"      primary onClick={() => setActiveView('send')}    C={C} />
        <ActionBtn Icon={ArrowDownToLine} label="Receive"           onClick={() => setActiveView('receive')} C={C} />
        <ActionBtn Icon={ArrowLeftRight}  label="Convert"           onClick={() => setActiveView('swap')}    C={C} />
        <ActionBtn Icon={Bot}             label="NAN Agent" ai      onClick={() => setActiveView('agent')}   C={C} />
      </div>



      {/* ── 7. RECENT ACTIVITY ── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Recent Activity</span>
          <button
            onClick={() => setActiveView('activity')}
            style={{
              fontSize: 12, color: BLUE, background: 'none', border: 'none',
              cursor: 'pointer', fontFamily: F,
              display: 'flex', alignItems: 'center', gap: 3,
              fontWeight: 600, WebkitTapHighlightColor: 'transparent',
            }}
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
