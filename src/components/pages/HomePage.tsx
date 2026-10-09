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
  RefreshCw, Zap, Info, Globe,
} from 'lucide-react'
import { useAppStore, ActivityItem } from '../../store/appStore'
import { getUsdc } from '../../onchain-facts'
import { useNanTheme, NanTheme } from '../../hooks/useNanTheme'
import { NotificationBell } from '../ui/NotificationBell'
import { TokenLogo } from '../ui/TokenLogo'
import { useSyncMultiChainBalances } from '../../hooks/useMultiChainBalances'
import { usePortfolioBalances } from '../../hooks/usePortfolioBalances'
import { useFxRates } from '../../hooks/useFxRates'
import { NetworkDetailSheet } from './NetworkDetailSheet'
import type { NetworkSummary } from '../../hooks/usePortfolioBalances'

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

// ─── Token card (multi-chain aggregated) ─────────────────────────────────────

function TokenCard({
  symbol, quantity, usdValue, onClick, hidden, C, isLoading,
}: {
  symbol: string; quantity: string; usdValue: string
  onClick: () => void; hidden: boolean; C: NanTheme; isLoading: boolean
}) {
  const isEurc = symbol === 'EURC'
  const color = symbol === 'USDC' ? '#2775CA' : symbol === 'EURC' ? '#0099CC' : '#26A17B'
  return (
    <button
      onClick={onClick}
      style={{
        background: C.surf, border: `1px solid ${C.bdr}`,
        borderRadius: 16, padding: '14px 12px 12px',
        cursor: 'pointer', fontFamily: F,
        WebkitTapHighlightColor: 'transparent', textAlign: 'left',
      }}
    >
      <div style={{ marginBottom: 8 }}>
        <TokenLogo symbol={symbol} size={30} radius={9} />
      </div>
      {isLoading ? (
        <div style={{ height: 18, width: 50, background: C.surf2, borderRadius: 6, marginBottom: 6 }} />
      ) : (
        <div style={{ fontSize: 14, fontWeight: 800, color: C.text, fontFamily: MONO, letterSpacing: '-0.02em', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {hidden ? '••••' : `${isEurc ? '€' : '$'}${quantity}`}
        </div>
      )}
      {!hidden && !isLoading && parseFloat(usdValue) > 0 && isEurc && (
        <div style={{ fontSize: 9, color: C.t3, fontFamily: MONO, marginBottom: 2 }}>≈ ${usdValue}</div>
      )}
      <div style={{ fontSize: 10, fontWeight: 600, color }}>
        {symbol} · all chains
      </div>
    </button>
  )
}

// ─── Network row ──────────────────────────────────────────────────────────────

function NetworkRow({
  network, onClick, hidden, C, isLast,
}: {
  network: NetworkSummary; onClick: () => void; hidden: boolean; C: NanTheme; isLast: boolean
}) {
  const hasBalance = parseFloat(network.totalUsd) > 0
  const tokenSymbols = [...new Set(network.positions.filter(p => parseFloat(p.quantity) > 0).map(p => p.symbol))]

  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 12,
        padding: '13px 14px',
        background: 'none', border: 'none', cursor: 'pointer', fontFamily: F,
        borderBottom: isLast ? 'none' : `1px solid ${C.bdr}`,
        WebkitTapHighlightColor: 'transparent',
        textAlign: 'left',
      }}
    >
      {/* Icon */}
      <div style={{
        width: 36, height: 36, borderRadius: 11, flexShrink: 0,
        background: hasBalance ? C.blueDim : C.surf2,
        border: hasBalance ? `1px solid ${C.blueBd}` : `1px solid ${C.bdr}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Globe size={16} color={hasBalance ? C.blue : C.t3} />
      </div>

      {/* Name + token pills */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 3 }}>
          {network.chainName}
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {tokenSymbols.length > 0
            ? tokenSymbols.map(sym => (
                <span
                  key={sym}
                  style={{
                    fontSize: 9, fontWeight: 700,
                    color: sym === 'USDC' ? '#2775CA' : sym === 'EURC' ? '#0099CC' : '#26A17B',
                    background: sym === 'USDC' ? 'rgba(39,117,202,0.10)' : sym === 'EURC' ? 'rgba(0,153,204,0.10)' : 'rgba(38,161,123,0.10)',
                    borderRadius: 5, padding: '2px 5px',
                    letterSpacing: '0.04em',
                  }}
                >{sym}</span>
              ))
            : <span style={{ fontSize: 10, color: C.t3 }}>No balance</span>
          }
        </div>
      </div>

      {/* Value */}
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 800, color: hasBalance ? C.text : C.t3 }}>
          {hidden ? '••••' : `$${network.totalUsd}`}
        </div>
        <ChevronRight size={13} color={C.t3} style={{ marginTop: 2 }} />
      </div>
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

  // ── Legacy single-chain reads (preserved — keep existing hooks working) ────
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
  const usdcNum       = rawBalance !== undefined ? Number(rawBalance) / 1e6 : 0
  const eurcNum       = rawEurc    !== undefined ? Number(rawEurc)    / 1e6 : 0

  // ── Portfolio (multi-chain, multi-token) ──────────────────────────────────
  const portfolio = usePortfolioBalances(address)
  const { usdPerEur, rates, loading: fxLoading } = useFxRates()

  // Portfolio total drives the headline; fall back to legacy single-chain while loading
  const portfolioTotal   = parseFloat(portfolio.totalUsd)
  const legacyTotal      = usdcNum + eurcNum * usdPerEur
  const displayTotal     = portfolio.isLoading ? legacyTotal.toFixed(2) : portfolio.totalUsd
  const isLoadingBalance = portfolio.isLoading && arcUsdcLoading

  // ── Sync store (keep existing consumers working) ─────────────────────────
  useEffect(() => {
    if (address && portfolioTotal > 0) {
      setMainWalletBalance(portfolio.totalUsd, address)
    }
  }, [portfolio.totalUsd, address, portfolioTotal, setMainWalletBalance])

  useSyncMultiChainBalances(address, setCrossChainBalances)

  // ── UI state ─────────────────────────────────────────────────────────────
  const [hidden,   setHidden]   = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [selectedNetwork, setSelectedNetwork] = useState<NetworkSummary | null>(null)
  const [showAllNetworks, setShowAllNetworks] = useState(false)

  /* eslint-disable react/set-state-in-effect */
  useEffect(() => { setHydrated(true) }, [])
  /* eslint-enable react/set-state-in-effect */

  const firstName = profile.displayName?.split(' ')[0]
    || auth?.email?.split('@')[0]
    || 'there'

  const recent = [...activity]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 4)

  // Reconciliation flag: is there any difference between portfolio total and
  // displayed token cards that the user should know about?
  const tokenCardSum = parseFloat(portfolio.byToken.USDC.usdValue)
    + parseFloat(portfolio.byToken.EURC.usdValue)
    + parseFloat(portfolio.byToken.USDT.usdValue)
  const reconcileDiff = Math.abs(portfolioTotal - tokenCardSum)
  const hasReconcileGap = !portfolio.isLoading && reconcileDiff > 0.01

  // Networks: show chains with balances + top empty ones, expandable to all
  const networksWithBalance = portfolio.networks.filter(n => n.hasBalance)
  const networksToShow = showAllNetworks
    ? portfolio.networks
    : portfolio.networks.slice(0, Math.max(networksWithBalance.length + 2, 4))

  // Gateway dedup info
  const gwAvailable = parseFloat(portfolio.gatewayAvailable)
  const gwPending   = parseFloat(portfolio.gatewayPending)
  const hasGateway  = gwAvailable > 0 || gwPending > 0

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

        {/* Right: Notification bell + Add Money */}
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
              title="Includes USDC, EURC and USDT across all supported networks. Gateway balance is shown separately to avoid double-counting."
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', lineHeight: 1 }}
            >
              <Info size={12} color={C.t3} />
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {portfolio.lastUpdated && (
              <button
                onClick={() => portfolio.refetch()}
                title={`Last updated ${portfolio.lastUpdated.toLocaleTimeString()}`}
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

      {/* ── 3. ASSET CARDS — 3-col grid (multi-chain aggregated) ── */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 10, marginBottom: 4,
        marginTop: fxLoading ? 18 : 0,
      }}>
        <TokenCard
          symbol="USDC"
          quantity={portfolio.byToken.USDC.quantity}
          usdValue={portfolio.byToken.USDC.usdValue}
          onClick={() => setActiveView('wallet')}
          hidden={hidden}
          C={C}
          isLoading={portfolio.isLoading}
        />
        <TokenCard
          symbol="EURC"
          quantity={portfolio.byToken.EURC.quantity}
          usdValue={portfolio.byToken.EURC.usdValue}
          onClick={() => setActiveView('swap')}
          hidden={hidden}
          C={C}
          isLoading={portfolio.isLoading}
        />
        <TokenCard
          symbol="USDT"
          quantity={portfolio.byToken.USDT.quantity}
          usdValue={portfolio.byToken.USDT.usdValue}
          onClick={() => setActiveView('swap')}
          hidden={hidden}
          C={C}
          isLoading={portfolio.isLoading}
        />
      </div>

      {/* Reconciliation note (only shown when token cards don't fully add up) */}
      {hasReconcileGap && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          marginBottom: 16, marginTop: 8,
          padding: '8px 12px', borderRadius: 10,
          background: 'rgba(240,165,0,0.08)',
          border: '1px solid rgba(240,165,0,0.18)',
        }}>
          <Info size={12} color={C.gold} />
          <span style={{ fontSize: 11, color: C.gold, fontWeight: 500 }}>
            Token cards show ${tokenCardSum.toFixed(2)} · portfolio total is ${portfolio.totalUsd} — difference may include pending or unsupported tokens on some networks.
          </span>
        </div>
      )}

      {/* ── GATEWAY POSITION (separate, not added to portfolio total) ── */}
      {hasGateway && (
        <div style={{
          marginBottom: 16,
          padding: '14px 16px',
          borderRadius: 16,
          background: 'linear-gradient(135deg, rgba(0,102,255,0.08) 0%, rgba(0,102,255,0.03) 100%)',
          border: '1px solid rgba(0,102,255,0.18)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <Zap size={14} color={C.blue} />
              <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Gateway Liquidity</span>
              <button
                title="This is USDC already deposited into Circle Gateway for instant cross-chain transfers. It is NOT counted in your portfolio total to avoid double-counting the same underlying funds."
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}
              >
                <Info size={11} color={C.t3} />
              </button>
            </div>
            <button
              onClick={() => setActiveView('gateway')}
              style={{ fontSize: 11, fontWeight: 700, color: C.blue, background: 'none', border: 'none', cursor: 'pointer', fontFamily: F }}
            >
              Manage
            </button>
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <div>
              <div style={{ fontSize: 10, color: C.t3, marginBottom: 3 }}>Available</div>
              <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 800, color: C.text }}>
                {hidden ? '••••' : `$${parseFloat(portfolio.gatewayAvailable).toFixed(2)}`}
              </div>
            </div>
            {gwPending > 0 && (
              <div>
                <div style={{ fontSize: 10, color: C.t3, marginBottom: 3 }}>Pending</div>
                <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 800, color: C.gold }}>
                  {hidden ? '••••' : `$${gwPending.toFixed(2)}`}
                </div>
              </div>
            )}
          </div>
          <div style={{ fontSize: 10, color: C.t3, marginTop: 6 }}>
            Excluded from portfolio total — same underlying USDC
          </div>
        </div>
      )}

      {/* ── 4. ACTION BUTTONS: Send · Receive · Convert · NAN Agent ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 22, gap: 4 }}>
        <ActionBtn Icon={Send}            label="Send"      primary onClick={() => setActiveView('send')}    C={C} />
        <ActionBtn Icon={ArrowDownToLine} label="Receive"           onClick={() => setActiveView('receive')} C={C} />
        <ActionBtn Icon={ArrowLeftRight}  label="Convert"           onClick={() => setActiveView('swap')}    C={C} />
        <ActionBtn Icon={Bot}             label="NAN AI"    ai      onClick={() => setActiveView('agent')}   C={C} />
      </div>

      {/* ── 5. BALANCES BY NETWORK ── */}
      <div style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Balances by Network</span>
          <button
            onClick={() => portfolio.refetch()}
            style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: C.t3, background: 'none', border: 'none', cursor: 'pointer', fontFamily: F, fontWeight: 600 }}
          >
            <RefreshCw size={11} color={C.t3} />
            Refresh
          </button>
        </div>

        <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 16, overflow: 'hidden' }}>
          {portfolio.isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '13px 14px',
                borderBottom: i < 2 ? `1px solid ${C.bdr}` : 'none',
              }}>
                <div style={{ width: 36, height: 36, borderRadius: 11, background: C.surf2 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ height: 13, width: 100, background: C.surf2, borderRadius: 5, marginBottom: 6 }} />
                  <div style={{ height: 10, width: 60,  background: C.surf2, borderRadius: 4 }} />
                </div>
                <div style={{ height: 14, width: 50, background: C.surf2, borderRadius: 5 }} />
              </div>
            ))
          ) : (
            networksToShow.map((net, idx) => (
              <NetworkRow
                key={net.chainId}
                network={net}
                onClick={() => setSelectedNetwork(net)}
                hidden={hidden}
                C={C}
                isLast={idx === networksToShow.length - 1 && !(!showAllNetworks && portfolio.networks.length > networksToShow.length)}
              />
            ))
          )}

          {/* Show more / less toggle */}
          {!portfolio.isLoading && portfolio.networks.length > networksToShow.length && (
            <button
              onClick={() => setShowAllNetworks(true)}
              style={{
                width: '100%', padding: '12px 14px', background: 'none', border: 'none',
                borderTop: `1px solid ${C.bdr}`, cursor: 'pointer', fontFamily: F,
                fontSize: 12, fontWeight: 600, color: C.blue,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              }}
            >
              Show {portfolio.networks.length - networksToShow.length} more networks
              <ChevronRight size={13} style={{ transform: 'rotate(90deg)' }} />
            </button>
          )}
          {showAllNetworks && portfolio.networks.length > 4 && (
            <button
              onClick={() => setShowAllNetworks(false)}
              style={{
                width: '100%', padding: '12px 14px', background: 'none', border: 'none',
                borderTop: `1px solid ${C.bdr}`, cursor: 'pointer', fontFamily: F,
                fontSize: 12, fontWeight: 600, color: C.t3,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              }}
            >
              Show less
              <ChevronRight size={13} style={{ transform: 'rotate(-90deg)' }} />
            </button>
          )}
        </div>
      </div>

      {/* ── 6. QUICK ACTIONS — Agent Wallet management card ── */}
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

      {/* ── 7. RECENT ACTIVITY ── */}
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

      {/* ── Network detail sheet (slide-up) ── */}
      {selectedNetwork && (
        <NetworkDetailSheet
          network={selectedNetwork}
          onClose={() => setSelectedNetwork(null)}
        />
      )}

    </div>
  )
}
