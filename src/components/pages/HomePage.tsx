import React, { useState, useEffect } from 'react'
import { useAccount, useReadContract } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { erc20Abi } from 'viem'
import {
  Eye, EyeOff, Plus, Send, ArrowLeftRight,
  Activity as ActivityIcon,
  ArrowUpRight, ArrowDownLeft, ChevronRight,
  ArrowDownToLine, Sparkles, Bot,
  CheckCircle2, Clock, ShoppingBag,
  RefreshCw, Info, Gift,
} from 'lucide-react'
import { useAppStore, ActivityItem } from '../../store/appStore'
import { getUsdc } from '../../onchain-facts'
import { useNanTheme, NanTheme } from '../../hooks/useNanTheme'
import { NotificationBell } from '../ui/NotificationBell'
import { TokenLogo } from '../ui/TokenLogo'
import { useSyncMultiChainBalances } from '../../hooks/useMultiChainBalances'
import { usePortfolioBalances } from '../../hooks/usePortfolioBalances'
import { useFxRates } from '../../hooks/useFxRates'
import { TokenNetworkSheet } from './TokenNetworkSheet'
import { useNanName } from '../../hooks/useNanName'
import { RewardsSheet } from './RewardsSheet'

const F    = "'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
const MONO = "'JetBrains Mono', 'SF Mono', Menlo, monospace"
const ARC  = 5042002

// ─── Transaction row ──────────────────────────────────────────────────────────

function txTypeIcon(item: ActivityItem, C: NanTheme) {
  if (item.agentInitiated) return { icon: <Bot size={15} color={C.blue} />, bg: C.blueDim }
  if (item.type === 'bridge') return { icon: <ArrowLeftRight size={15} color="#818CF8" />, bg: 'rgba(129,140,248,0.10)' }
  if (item.type === 'purchase' || item.type === 'agent_purchase') return { icon: <ShoppingBag size={15} color={C.gold} />, bg: `rgba(240,165,0,0.10)` }
  if (item.sign === '+') return { icon: <ArrowDownLeft size={15} color={C.green} />, bg: 'rgba(0,200,83,0.10)' }
  return { icon: <ArrowUpRight size={15} color={C.red} />, bg: 'rgba(255,59,59,0.10)' }
}

function TxRow({ item, C, last }: { item: ActivityItem; C: NanTheme; last: boolean }) {
  const isIn = item.sign === '+'
  const { icon, bg } = txTypeIcon(item, C)
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
      <div style={{
        width: 38, height: 38, borderRadius: 11, flexShrink: 0,
        background: bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.description}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
          {item.counterparty && (
            <span style={{ fontSize: 11, color: C.t3 }}>{item.counterparty}</span>
          )}
          <span style={{ fontSize: 10, color: C.t3 }}>{dateLabel} · {timeLabel}</span>
          {isConfirmed && <CheckCircle2 size={10} color={C.green} />}
          {isPending   && <Clock        size={10} color={C.gold} />}
        </div>
      </div>
      <span style={{
        fontFamily: MONO, fontSize: 13, fontWeight: 700,
        color: isIn ? C.green : C.red, flexShrink: 0,
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
        background: primary ? C.blue : ai ? C.blueDim : C.surf2,
        border: primary ? 'none' : ai ? `1px solid ${C.blueBd}` : `1px solid ${C.bdr}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: primary ? `0 6px 20px ${C.blue}66` : ai ? `0 2px 12px ${C.blue}30` : 'none',
        flexShrink: 0, position: 'relative',
      }}>
        <Icon size={20} color={primary ? '#fff' : ai ? C.blue : C.t2} strokeWidth={1.9} />
        {ai && (
          <div style={{
            position: 'absolute', top: -4, right: -4,
            width: 14, height: 14, borderRadius: '50%',
            background: C.blue, border: `2px solid ${C.bg}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Sparkles size={7} color="#fff" strokeWidth={2.5} />
          </div>
        )}
      </div>
      <span style={{ fontSize: 11, fontWeight: ai ? 700 : 600, color: ai ? C.blue : C.t2, whiteSpace: 'nowrap' }}>{label}</span>
    </button>
  )
}

// ─── Card dimensions shared across the scroll row ────────────────────────────
const CARD_W = 130  // px — fits ~2.5 on a 375 px screen so next card peeks

// ─── Token card — logo + amount + label ──────────────────────────────────────

function TokenCard({
  symbol, quantity, usdValue, onClick, hidden, C, isLoading,
}: {
  symbol: 'USDC' | 'EURC'
  quantity: string; usdValue: string
  onClick: () => void; hidden: boolean; C: NanTheme; isLoading: boolean
}) {
  const isEurc     = symbol === 'EURC'
  const tokenColor = symbol === 'USDC' ? '#2775CA' : '#0099CC'
  const isInert    = !onClick || onClick.toString() === '() => {}'
  return (
    <div
      onClick={onClick}
      style={{
        width: CARD_W, flexShrink: 0,
        background: C.surf, border: `1px solid ${C.bdr}`,
        borderRadius: 16, padding: '14px 12px 12px',
        cursor: isInert ? 'default' : 'pointer', fontFamily: F,
        WebkitTapHighlightColor: 'transparent', textAlign: 'left',
      }}
    >
      <div style={{ marginBottom: 8 }}>
        <TokenLogo symbol={symbol} size={30} radius={9} />
      </div>
      {isLoading ? (
        <div style={{ height: 18, width: 54, background: C.surf2, borderRadius: 6, marginBottom: 6 }} />
      ) : (
        <div style={{
          fontSize: 14, fontWeight: 800, color: C.text,
          fontFamily: MONO, letterSpacing: '-0.02em',
          marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {hidden ? '••••' : `${isEurc ? '€' : '$'}${quantity}`}
        </div>
      )}
      {!hidden && !isLoading && isEurc && parseFloat(usdValue) > 0 && (
        <div style={{ fontSize: 9, color: C.t3, fontFamily: MONO, marginBottom: 2 }}>≈ ${usdValue}</div>
      )}
      <div style={{ fontSize: 10, fontWeight: 600, color: tokenColor }}>
        {symbol} · Arc
      </div>
    </div>
  )
}

// ─── Cross-chain card ─────────────────────────────────────────────────────────

function CrossChainCard({
  networksWithBalance, totalUsd, hidden, isLoading, onClick, C,
}: {
  networksWithBalance: number; totalUsd: string
  hidden: boolean; isLoading: boolean
  onClick: () => void; C: NanTheme
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: CARD_W, flexShrink: 0,
        background: C.surf, border: `1px solid ${C.bdr}`,
        borderRadius: 16, padding: '14px 12px 12px',
        cursor: 'pointer', fontFamily: F,
        WebkitTapHighlightColor: 'transparent', textAlign: 'left',
      }}
    >
      {/* stacked dots as logo */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, height: 30 }}>
        {Array.from({ length: Math.min(networksWithBalance || 3, 4) }).map((_, i) => (
          <div key={i} style={{
            width: 18, height: 18, borderRadius: '50%',
            background: C.blue,
            border: `2px solid ${C.surf}`,
            marginLeft: i === 0 ? 0 : -6,
            opacity: 1 - i * 0.2,
          }} />
        ))}
      </div>
      {isLoading ? (
        <div style={{ height: 18, width: 54, background: C.surf2, borderRadius: 6, marginBottom: 6 }} />
      ) : (
        <div style={{
          fontSize: 14, fontWeight: 800, color: C.text,
          fontFamily: MONO, letterSpacing: '-0.02em',
          marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {hidden ? '••••' : `$${totalUsd}`}
        </div>
      )}
      <div style={{ fontSize: 10, fontWeight: 600, color: C.t2 }}>
        Other chains · {networksWithBalance}
      </div>
    </button>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function HomePage() {
  const C = useNanTheme()
  const { address: wagmiAddress, isConnected } = useAccount()
  const {
    activity, setActiveView, auth, profile, nanHandle, setNanHandle,
    setMainWalletBalance, setCrossChainBalances,
  } = useAppStore()

  const address   = wagmiAddress ?? (auth?.circleWalletAddress as `0x${string}` | undefined)
  const hasWallet = isConnected || !!auth?.circleWalletAddress

  // Resolve NAN handle on home page so the nudge hides immediately when a handle exists
  const { resolveName, registrySet } = useNanName()
  useEffect(() => {
    if (!address || !registrySet || nanHandle) return
    resolveName(address).then(h => { if (h) setNanHandle(h) }).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, registrySet])

  // ── Store sync: single-chain Arc USDC read for setMainWalletBalance ──────────
  // The portfolio hook covers all chains, but the store setter expects the Arc balance
  // specifically for the "wallet address → balance" map used by the payment watcher.
  const usdcFact = getUsdc(ARC)
  const { data: rawBalance } = useReadContract({
    address: usdcFact?.address as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: ARC,
    query: { enabled: !!address && !!usdcFact, refetchInterval: 30_000 },
  })

  // ── Portfolio (multi-chain, multi-token) ──────────────────────────────────
  const portfolio = usePortfolioBalances(address)
  const { usdPerEur, rates, loading: fxLoading } = useFxRates()

  // Show the real multi-chain total once loaded; $0.00 while loading (skeleton covers it).
  const displayTotal     = portfolio.totalUsd
  // Skeleton shows whenever the portfolio batch is still in-flight.
  const isLoadingBalance = portfolio.isLoading

  // ── Sync store ────────────────────────────────────────────────────────────
  useEffect(() => {
    const arcBal = rawBalance !== undefined ? (Number(rawBalance) / 1e6).toFixed(2) : undefined
    if (address && arcBal) setMainWalletBalance(arcBal, address)
  }, [rawBalance, address, setMainWalletBalance])

  useSyncMultiChainBalances(address, setCrossChainBalances)

  // ── UI state ─────────────────────────────────────────────────────────────
  const [hidden,       setHidden]       = useState(false)
  const [hydrated,     setHydrated]     = useState(false)
  const [tokenSheet,   setTokenSheet]   = useState<'USDC' | 'EURC' | 'USDT' | null>(null)
  const [rewardsOpen,  setRewardsOpen]  = useState(false)

  /* eslint-disable react/set-state-in-effect */
  useEffect(() => { setHydrated(true) }, [])
  /* eslint-enable react/set-state-in-effect */

  // NAN handle always wins. Fall back to email prefix only if it looks like
  // an actual email (contains @), not a raw wallet address (0x…).
  const emailPrefix = auth?.email && auth.email.includes('@') && !auth.email.startsWith('0x')
    ? auth.email.split('@')[0]
    : null
  const firstName = nanHandle
    ? `@${nanHandle}`
    : emailPrefix || profile.displayName?.split(' ')[0] || 'there'
  // Only show the NAN name nudge once the page has hydrated AND we have confirmed
  // the user has no handle (nanHandle === '' not just undefined/loading).
  const hasHandle = !!nanHandle || !hydrated

  const recent = [...activity]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 4)

  // Positions filtered by token for the sheet
  const positionsFor = (sym: 'USDC' | 'EURC' | 'USDT') =>
    portfolio.networks.flatMap(n => n.positions.filter(p => p.symbol === sym))

  return (
    <div style={{ maxWidth: 480, width: '100%', margin: '0 auto', fontFamily: F, paddingBottom: 32 }}>

      {/* ── 1. HEADER ── */}
      <div style={{
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 20, gap: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <button
            onClick={() => setActiveView('profile')}
            style={{
              width: 36, height: 36, borderRadius: '50%',
              background: profile.avatarUrl ? 'transparent' : C.blue,
              border: profile.avatarUrl ? `2px solid ${C.bdr}` : 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', overflow: 'hidden', flexShrink: 0,
              WebkitTapHighlightColor: 'transparent', padding: 0,
            }}
          >
            {profile.avatarUrl
              ? <img src={profile.avatarUrl} alt="avatar" style={{ width: 36, height: 36, objectFit: 'cover' }} />
              : <svg viewBox="0 0 20 20" width="16" height="16" fill="none">
                  <circle cx="10" cy="7" r="3.2" stroke="#fff" strokeWidth="1.6" />
                  <path d="M3.5 17c0-3.038 2.91-5.5 6.5-5.5s6.5 2.462 6.5 5.5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
            }
          </button>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Hi, {firstName}
            </div>
            {!hasHandle && (
              <button
                onClick={() => setActiveView('nan-name')}
                style={{
                  background: 'none', border: 'none', padding: 0,
                  cursor: 'pointer', fontFamily: F,
                  fontSize: 11, fontWeight: 600,
                  color: C.blue, marginTop: 1,
                  animation: 'nan-pulse 1.4s ease-in-out infinite',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                ✦ Get your NAN name
              </button>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <NotificationBell color={C.t2} />
          <button
            onClick={() => setActiveView('onramp')}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '6px 10px', borderRadius: 20,
              background: C.blue, border: 'none',
              color: '#fff', fontSize: 11, fontWeight: 700,
              cursor: 'pointer', fontFamily: F,
              boxShadow: '0 2px 8px rgba(0,102,255,0.30)',
              WebkitTapHighlightColor: 'transparent',
              letterSpacing: '-0.01em', whiteSpace: 'nowrap',
            }}
          >
            <Plus size={11} strokeWidth={2.5} />
            Add Money
          </button>
        </div>
      </div>

      {/* ── 2. TOTAL PORTFOLIO BALANCE ── */}
      <div style={{ marginBottom: 4 }}>
        <div style={{
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', marginBottom: 5,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: C.t3, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Total Portfolio Balance
            </span>
            <button
              title="Sum of USDC, EURC and USDT across all supported networks. Gateway balance is shown separately inside each token card to avoid double-counting."
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', lineHeight: 1 }}
            >
              <Info size={12} color={C.t3} />
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {portfolio.lastUpdated && (
              <button
                onClick={() => portfolio.refetch()}
                title={`Updated ${portfolio.lastUpdated.toLocaleTimeString()}`}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 3, display: 'flex', lineHeight: 1 }}
              >
                <RefreshCw size={12} color={C.t3} />
              </button>
            )}
          </div>
        </div>

        {isLoadingBalance ? (
          <div style={{ height: 44, width: 180, background: C.surf2, borderRadius: 10, animation: 'nan-shimmer 1.4s ease infinite' }} />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 38, fontWeight: 800, letterSpacing: '-0.04em', color: C.text, lineHeight: 1.1, fontFamily: F }}>
              {hidden ? '••••••' : `$${displayTotal}`}
            </div>
            <button
              onClick={() => setHidden(h => !h)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, WebkitTapHighlightColor: 'transparent', flexShrink: 0, marginTop: 4 }}
              aria-label={hidden ? 'Show balance' : 'Hide balance'}
            >
              {hidden ? <EyeOff size={17} color={C.t3} /> : <Eye size={17} color={C.t3} />}
            </button>
          </div>
        )}

        {/* FX timestamp */}
        {!fxLoading && portfolio.fxUpdatedAt && (
          <div style={{ fontSize: 10, color: C.t3, marginTop: 5 }}>
            Rates updated {portfolio.fxUpdatedAt.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}
            {' · '}EUR/USD {portfolio.eurUsdRate.toFixed(4)}
          </div>
        )}

        {hydrated && !hasWallet && (
          <div style={{ marginTop: 12 }}>
            <ConnectKitButton />
          </div>
        )}
      </div>

      {/* ── FX TICKER STRIP ── */}
      {!fxLoading && Object.keys(rates).length > 0 && (
        <div style={{
          display: 'flex', gap: 10, overflowX: 'auto', marginBottom: 18, marginTop: 14,
          paddingBottom: 2,
          msOverflowStyle: 'none', scrollbarWidth: 'none',
        }}>
          {[
            { pair: 'EUR/USD', val: usdPerEur },
            ...['GBP','NGN','GHS','KES','ZAR','JPY'].map(c => ({
              pair: `${c}/USD`,
              val: rates[c] ? 1 / rates[c] : null,
            })).filter(r => r.val !== null),
          ].map(({ pair, val }) => (
            <div key={pair} style={{
              flexShrink: 0,
              background: C.surf, border: `1px solid ${C.bdr}`,
              borderRadius: 10, padding: '6px 10px',
              display: 'flex', flexDirection: 'column', gap: 2,
            }}>
              <span style={{ fontSize: 9, color: C.t3, fontWeight: 600, letterSpacing: '0.04em' }}>{pair}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.text, fontFamily: MONO }}>
                {pair.startsWith('JPY') || pair.startsWith('NGN')
                  ? (val as number).toFixed(2)
                  : (val as number).toFixed(4)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── 3. HORIZONTAL SCROLL ROW: USDC (Arc) → EURC (Arc) → Cross-chain (non-Arc) ── */}
      {/* Gateway removed — accessible via bottom nav / sidebar.                         */}
      {/* Cross-chain shows only non-Arc chains so Arc isn't double-counted.              */}
      {/* Total portfolio = USDC card + EURC card + Cross-chain card (no overlap).        */}
      <div style={{
        display: 'flex', gap: 10, overflowX: 'auto',
        marginBottom: 20, marginTop: fxLoading ? 18 : 0,
        marginLeft: -16, marginRight: -16,
        paddingLeft: 16, paddingRight: 16,
        paddingBottom: 4,
        msOverflowStyle: 'none', scrollbarWidth: 'none',
        WebkitOverflowScrolling: 'touch',
      }}>
        <TokenCard
          symbol="USDC"
          quantity={portfolio.byToken.USDC.quantity}
          usdValue={portfolio.byToken.USDC.usdValue}
          onClick={() => {}}
          hidden={hidden} C={C} isLoading={portfolio.isLoading}
        />
        <TokenCard
          symbol="EURC"
          quantity={portfolio.byToken.EURC.quantity}
          usdValue={portfolio.byToken.EURC.usdValue}
          onClick={() => {}}
          hidden={hidden} C={C} isLoading={portfolio.isLoading}
        />
        <CrossChainCard
          networksWithBalance={portfolio.nonArcNetworksWithBalance}
          totalUsd={portfolio.nonArcTotalUsd}
          hidden={hidden} isLoading={portfolio.isLoading}
          onClick={() => setTokenSheet('USDC')}
          C={C}
        />
        {/* ── Rewards card — same size as token cards ── */}
        <button
          onClick={() => setRewardsOpen(true)}
          style={{
            width: CARD_W, flexShrink: 0,
            background: 'linear-gradient(145deg, rgba(0,102,255,0.14) 0%, rgba(80,0,255,0.08) 100%)',
            border: '1px solid rgba(0,102,255,0.25)',
            borderRadius: 16, padding: '14px 12px 12px',
            cursor: 'pointer', fontFamily: F,
            WebkitTapHighlightColor: 'transparent', textAlign: 'left',
          }}
        >
          <div style={{ marginBottom: 8 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 9,
              background: C.blue,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Gift size={15} color="#fff" strokeWidth={1.8} />
            </div>
          </div>
          <div style={{
            fontSize: 14, fontWeight: 800, color: C.text,
            fontFamily: MONO, letterSpacing: '-0.02em',
            marginBottom: 2,
          }}>
            {hidden ? '••••' : '$0.00'}
          </div>
          <div style={{ fontSize: 10, fontWeight: 600, color: C.blue }}>
            Rewards · USDC
          </div>
        </button>

        {/* trailing spacer so last card doesn't hug the right edge */}
        <div style={{ width: 6, flexShrink: 0 }} />
      </div>

      {/* ── 4. ACTION BUTTONS ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 22, gap: 4 }}>
        <ActionBtn Icon={Send}            label="Send"      primary onClick={() => setActiveView('send')}    C={C} />
        <ActionBtn Icon={ArrowDownToLine} label="Receive"           onClick={() => setActiveView('receive')} C={C} />
        <ActionBtn Icon={ArrowLeftRight}  label="Convert"           onClick={() => setActiveView('swap')}    C={C} />
        <ActionBtn Icon={Bot}             label="NAN AI"    ai      onClick={() => setActiveView('agent')}   C={C} />
      </div>

      {/* ── 5. QUICK ACTIONS — Agent Wallet ── */}
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 10 }}>Quick actions</div>
        <button
          onClick={() => setActiveView('agent-wallet')}
          style={{
            width: '100%', padding: '18px 20px', borderRadius: 18,
            border: '1px solid rgba(0,102,255,0.22)',
            background: 'linear-gradient(135deg, rgba(0,102,255,0.10) 0%, rgba(0,102,255,0.03) 100%)',
            cursor: 'pointer', fontFamily: F, WebkitTapHighlightColor: 'transparent',
            display: 'flex', alignItems: 'center', gap: 16,
          }}
        >
          <div style={{
            width: 48, height: 48, borderRadius: 15, flexShrink: 0,
            background: C.blue, display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(0,102,255,0.35)',
          }}>
            <Bot size={22} color="#fff" strokeWidth={1.8} />
          </div>
          <div style={{ textAlign: 'left', flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.text, letterSpacing: '-0.02em', marginBottom: 3 }}>
              Agent Wallet
            </div>
            <div style={{ fontSize: 12, color: C.t2, lineHeight: 1.45 }}>
              Give your AI agent a wallet to pay for approved services
            </div>
          </div>
          <ChevronRight size={17} color={C.blue} strokeWidth={2.5} />
        </button>
      </div>

      {/* ── 6. RECENT ACTIVITY ── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Recent Activity</span>
          <button
            onClick={() => setActiveView('activity')}
            style={{
              fontSize: 12, color: C.blue, background: 'none', border: 'none',
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


      {/* ── Rewards sheet ── */}
      {rewardsOpen && <RewardsSheet onClose={() => setRewardsOpen(false)} />}

      {/* ── Token network sheet (slide-up, opens on card tap) ── */}
      {tokenSheet && (
        <TokenNetworkSheet
          symbol={tokenSheet}
          positions={positionsFor(tokenSheet)}
          totalQuantity={portfolio.byToken[tokenSheet].quantity}
          totalUsdValue={portfolio.byToken[tokenSheet].usdValue}
          gatewayAvailable={portfolio.gatewayAvailable}
          gatewayPending={portfolio.gatewayPending}
          eurUsdRate={portfolio.eurUsdRate}
          hidden={hidden}
          onClose={() => setTokenSheet(null)}
        />
      )}

    </div>
  )
}
