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
  RefreshCw, Info, Zap,
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

const F    = "'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
const MONO = "'JetBrains Mono', 'SF Mono', Menlo, monospace"
const ARC  = 5042002
const EURC_ADDRESS = '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a' as const

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

// ─── Token card with cross-chain + gateway sub-rows ──────────────────────────

interface TokenCardProps {
  symbol: 'USDC' | 'EURC' | 'USDT'
  quantity: string          // all-chains total
  usdValue: string          // USD equivalent of total
  crossChainCount: number   // how many chains have > 0 balance
  gatewayAvailable: string  // shown only for USDC
  gatewayPending: string
  onClick: () => void
  hidden: boolean
  C: NanTheme
  isLoading: boolean
}

function TokenCard({
  symbol, quantity, usdValue, crossChainCount,
  gatewayAvailable, gatewayPending,
  onClick, hidden, C, isLoading,
}: TokenCardProps) {
  const isEurc     = symbol === 'EURC'
  const tokenColor = symbol === 'USDC' ? '#2775CA' : symbol === 'EURC' ? '#0099CC' : '#26A17B'
  const gwAvail    = parseFloat(gatewayAvailable)
  const gwPend     = parseFloat(gatewayPending)
  const showGw     = symbol === 'USDC' && (gwAvail > 0 || gwPend > 0)

  return (
    <button
      onClick={onClick}
      style={{
        background: C.surf, border: `1px solid ${C.bdr}`,
        borderRadius: 18, padding: '14px 13px 12px',
        cursor: 'pointer', fontFamily: F,
        WebkitTapHighlightColor: 'transparent',
        textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 0,
      }}
    >
      {/* Token logo */}
      <div style={{ marginBottom: 10 }}>
        <TokenLogo symbol={symbol} size={30} radius={9} />
      </div>

      {/* Primary amount */}
      {isLoading ? (
        <div style={{ height: 18, width: 54, background: C.surf2, borderRadius: 6, marginBottom: 4 }} />
      ) : (
        <div style={{
          fontSize: 15, fontWeight: 800, color: C.text,
          fontFamily: MONO, letterSpacing: '-0.02em',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          marginBottom: 2,
        }}>
          {hidden ? '••••' : `${isEurc ? '€' : '$'}${quantity}`}
        </div>
      )}

      {/* USD equivalent for EURC */}
      {!hidden && !isLoading && isEurc && parseFloat(usdValue) > 0 && (
        <div style={{ fontSize: 9, color: C.t3, fontFamily: MONO, marginBottom: 2 }}>
          ≈ ${usdValue}
        </div>
      )}

      {/* Token label */}
      <div style={{ fontSize: 10, fontWeight: 700, color: tokenColor, marginBottom: 8 }}>
        {symbol}
      </div>

      {/* ── Cross-chain sub-row ── */}
      <div style={{
        width: '100%', borderTop: `1px solid ${C.bdr}`,
        paddingTop: 8, marginBottom: showGw ? 6 : 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ display: 'flex', gap: -2 }}>
            {/* mini chain dots */}
            {Array.from({ length: Math.min(crossChainCount || 1, 3) }).map((_, i) => (
              <div key={i} style={{
                width: 10, height: 10, borderRadius: '50%',
                background: crossChainCount > 0 ? tokenColor : C.t3,
                border: `1.5px solid ${C.surf}`,
                marginLeft: i === 0 ? 0 : -4,
                opacity: crossChainCount > 0 ? 1 - i * 0.2 : 0.3,
              }} />
            ))}
          </div>
          <span style={{ fontSize: 9, color: C.t3, fontWeight: 600 }}>
            {crossChainCount > 0
              ? `${crossChainCount} network${crossChainCount > 1 ? 's' : ''}`
              : 'cross-chain'}
          </span>
        </div>
        <ChevronRight size={11} color={C.t3} />
      </div>

      {/* ── Gateway sub-row (USDC only) ── */}
      {showGw && (
        <div style={{
          width: '100%', borderTop: `1px solid ${C.bdr}`,
          paddingTop: 7,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Zap size={10} color={C.blue} />
            <span style={{ fontSize: 9, color: C.blue, fontWeight: 700 }}>Gateway</span>
          </div>
          <span style={{ fontSize: 9, fontFamily: MONO, fontWeight: 700, color: C.text }}>
            {hidden ? '••••' : `$${gwAvail.toFixed(2)}`}
            {gwPend > 0 && !hidden && (
              <span style={{ color: C.gold, fontWeight: 600 }}> +${gwPend.toFixed(2)}</span>
            )}
          </span>
        </div>
      )}
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

  // ── Legacy single-chain reads (kept for fallback while portfolio loads) ────
  const usdcFact = getUsdc(ARC)
  const { data: rawBalance, isLoading: arcUsdcLoading } = useReadContract({
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
  const usdcNum = rawBalance !== undefined ? Number(rawBalance) / 1e6 : 0
  const eurcNum = rawEurc    !== undefined ? Number(rawEurc)    / 1e6 : 0

  // ── Portfolio (multi-chain, multi-token) ──────────────────────────────────
  const portfolio = usePortfolioBalances(address)
  const { usdPerEur, rates, loading: fxLoading } = useFxRates()

  const portfolioTotal   = parseFloat(portfolio.totalUsd)
  const legacyTotal      = usdcNum + eurcNum * usdPerEur
  const displayTotal     = portfolio.isLoading ? legacyTotal.toFixed(2) : portfolio.totalUsd
  const isLoadingBalance = portfolio.isLoading && arcUsdcLoading

  // ── Sync store ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (address && portfolioTotal > 0) setMainWalletBalance(portfolio.totalUsd, address)
  }, [portfolio.totalUsd, address, portfolioTotal, setMainWalletBalance])

  useSyncMultiChainBalances(address, setCrossChainBalances)

  // ── UI state ─────────────────────────────────────────────────────────────
  const [hidden,   setHidden]   = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [tokenSheet, setTokenSheet] = useState<'USDC' | 'EURC' | 'USDT' | null>(null)

  /* eslint-disable react/set-state-in-effect */
  useEffect(() => { setHydrated(true) }, [])
  /* eslint-enable react/set-state-in-effect */

  const firstName = profile.displayName?.split(' ')[0]
    || auth?.email?.split('@')[0]
    || 'there'

  const recent = [...activity]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 4)

  // Per-token cross-chain count
  const chainsWithUsdc = portfolio.networks.filter(n => n.positions.some(p => p.symbol === 'USDC' && parseFloat(p.quantity) > 0)).length
  const chainsWithEurc = portfolio.networks.filter(n => n.positions.some(p => p.symbol === 'EURC' && parseFloat(p.quantity) > 0)).length
  const chainsWithUsdt = portfolio.networks.filter(n => n.positions.some(p => p.symbol === 'USDT' && parseFloat(p.quantity) > 0)).length

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
              width: 40, height: 40, borderRadius: 12,
              background: profile.avatarUrl ? C.surf2 : C.blue,
              border: profile.avatarUrl ? `1.5px solid ${C.bdr}` : 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', overflow: 'hidden', flexShrink: 0,
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {profile.avatarUrl
              ? <img src={profile.avatarUrl} alt="avatar" style={{ width: 40, height: 40, objectFit: 'cover' }} />
              : <svg viewBox="0 0 324 480" width="16" height="22" fill="none">
                  <path d="M255,0 L84,167 L71,163 L0,97 L0,378 L246,132 L255,110 Z" fill="#fff"/>
                  <path d="M69,480 L240,313 L253,317 L324,383 L324,102 L78,348 L69,370 Z" fill="#fff"/>
                </svg>
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

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <NotificationBell color={C.t2} />
          <button
            onClick={() => setActiveView('onramp')}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '7px 12px', borderRadius: 12,
              background: C.blue, border: 'none',
              color: '#fff', fontSize: 12, fontWeight: 700,
              cursor: 'pointer', fontFamily: F,
              boxShadow: '0 3px 12px rgba(0,102,255,0.35)',
              WebkitTapHighlightColor: 'transparent',
              letterSpacing: '-0.01em',
            }}
          >
            <Plus size={12} strokeWidth={2.5} />
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
            <button
              onClick={() => setHidden(h => !h)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, WebkitTapHighlightColor: 'transparent' }}
              aria-label={hidden ? 'Show balance' : 'Hide balance'}
            >
              {hidden ? <EyeOff size={15} color={C.t3} /> : <Eye size={15} color={C.t3} />}
            </button>
          </div>
        </div>

        {isLoadingBalance ? (
          <div style={{ height: 44, width: 180, background: C.surf2, borderRadius: 10, animation: 'nan-shimmer 1.4s ease infinite' }} />
        ) : (
          <div style={{ fontSize: 38, fontWeight: 800, letterSpacing: '-0.04em', color: C.text, lineHeight: 1.1, fontFamily: F }}>
            {hidden ? '••••••' : `$${displayTotal}`}
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

      {/* ── 3. TOKEN CARDS (USDC / EURC / USDT) — tap to open network breakdown ── */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 10, marginBottom: 20,
        marginTop: fxLoading ? 18 : 0,
      }}>
        <TokenCard
          symbol="USDC"
          quantity={portfolio.byToken.USDC.quantity}
          usdValue={portfolio.byToken.USDC.usdValue}
          crossChainCount={chainsWithUsdc}
          gatewayAvailable={portfolio.gatewayAvailable}
          gatewayPending={portfolio.gatewayPending}
          onClick={() => setTokenSheet('USDC')}
          hidden={hidden}
          C={C}
          isLoading={portfolio.isLoading}
        />
        <TokenCard
          symbol="EURC"
          quantity={portfolio.byToken.EURC.quantity}
          usdValue={portfolio.byToken.EURC.usdValue}
          crossChainCount={chainsWithEurc}
          gatewayAvailable="0"
          gatewayPending="0"
          onClick={() => setTokenSheet('EURC')}
          hidden={hidden}
          C={C}
          isLoading={portfolio.isLoading}
        />
        <TokenCard
          symbol="USDT"
          quantity={portfolio.byToken.USDT.quantity}
          usdValue={portfolio.byToken.USDT.usdValue}
          crossChainCount={chainsWithUsdt}
          gatewayAvailable="0"
          gatewayPending="0"
          onClick={() => setTokenSheet('USDT')}
          hidden={hidden}
          C={C}
          isLoading={portfolio.isLoading}
        />
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
