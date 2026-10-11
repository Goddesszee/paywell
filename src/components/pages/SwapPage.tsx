import React, { useState, useCallback, useRef } from 'react'
import { swapKeyConfig } from '../../lib/swap-key'
import { useAccount, useChainId, useSwitchChain, useReadContract, useBalance } from 'wagmi'
import { AppKit, type SwapEstimate } from '@circle-fin/app-kit'
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2'
import { erc20Abi, type EIP1193Provider } from 'viem'
import { ArrowDown, Settings, CheckCircle, ExternalLink, RefreshCw, AlertCircle, X, Search } from 'lucide-react'
import { safeJson } from '../../lib/safe-json'
import { useAppStore } from '../../store/appStore'
import { executeWithGuard } from '../../lib/circle-execute'
import { getPasskeyAdapter } from '../CirclePasskeyLogin'
import { swapFee, SWAP_FEE_BPS, bpsToPercent } from '../../lib/fees'
import { W3SSdk } from '@circle-fin/w3s-pw-web-sdk'
import { useNanTheme } from '../../hooks/useNanTheme'
import { getClientKey } from '../../lib/circle-session'

const CHAIN_ID  = 5042
const CHAIN_KEY = 'Arc'

// ── Token registry with logos + addresses ─────────────────────────────────────
// Addresses on Arc Mainnet (chainId 5042). null = native/no ERC-20 on this chain.
const TOKEN_META: Record<string, { label: string; color: string; address: `0x${string}` | null; decimals: number; logo: string; arcUnsupported?: boolean }> = {
  USDC:  { label: 'USD Coin',        color: '#2775CA', address: '0x3600000000000000000000000000000000000000', decimals: 6,  logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png' },
  EURC:  { label: 'Euro Coin',        color: '#0099CC', address: '0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1', decimals: 6,  logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x1aBaEA1f7C830bD89Acc67eC4af516284b1bC33c/logo.png' },
  // cirBTC is live on Arc — confirmed address from Circle docs
  cirBTC:{ label: 'Circle Wrapped BTC', color: '#F7931A', address: '0x171A4217b86A807A64eB94757Db6849fb4bDbAA0', decimals: 8, logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599/logo.png' },
  // Tokens below have no deployed contract on Arc — they are shown in
  // the selector for cross-chain awareness but flagged as unavailable on this chain.
  USDT:  { label: 'Tether USD',       color: '#26A17B', address: null, decimals: 6,  logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xdAC17F958D2ee523a2206206994597C13D831ec7/logo.png',  arcUnsupported: true },
  PYUSD: { label: 'PayPal USD',       color: '#0070BA', address: null, decimals: 6,  logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x6c3ea9036406852006290770BEdFcAbA0e23A0e8/logo.png',  arcUnsupported: true },
  DAI:   { label: 'Dai',              color: '#F5A623', address: null, decimals: 18, logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x6B175474E89094C44Da98b954EedeAC495271d0F/logo.png',  arcUnsupported: true },
  USDE:  { label: 'Ethena USDe',      color: '#8B5CF6', address: null, decimals: 18, logo: 'https://assets.coingecko.com/coins/images/33613/small/usde.png',                                                                                   arcUnsupported: true },
  WBTC:  { label: 'Wrapped Bitcoin',  color: '#F7931A', address: null, decimals: 8,  logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599/logo.png',  arcUnsupported: true },
  WETH:  { label: 'Wrapped Ether',    color: '#627EEA', address: null, decimals: 18, logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',  arcUnsupported: true },
  WSOL:  { label: 'Wrapped SOL',      color: '#9945FF', address: null, decimals: 9,  logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/info/logo.png',                                                    arcUnsupported: true },
  WAVAX: { label: 'Wrapped AVAX',     color: '#E84142', address: null, decimals: 18, logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/avalanchec/info/logo.png',                                                arcUnsupported: true },
  WPOL:  { label: 'Wrapped POL',      color: '#8247E5', address: null, decimals: 18, logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/polygon/info/logo.png',                                                   arcUnsupported: true },
  NATIVE:{ label: 'Native Gas (USDC)',color: '#2775CA', address: null, decimals: 18, logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png' },
}

const TOKENS = Object.keys(TOKEN_META)
type Token = keyof typeof TOKEN_META
type Phase = 'idle' | 'estimating' | 'reviewed' | 'swapping' | 'done' | 'error'

interface ReviewedSwap {
  estimate: SwapEstimate
  tokenIn: Token
  tokenOut: Token
  amountIn: string
  slippageBps: number
  account: string | undefined
}

// ── Token logo circle ─────────────────────────────────────────────────────────
function TokenLogo({ symbol, size = 24 }: { symbol: Token; size?: number }) {
  const meta = TOKEN_META[symbol]
  const [err, setErr] = useState(false)
  if (!err) return (
    <img
      src={meta.logo}
      alt={symbol}
      onError={() => setErr(true)}
      style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
    />
  )
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: meta.color + '22', border: `1.5px solid ${meta.color}44`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.28, fontWeight: 800, color: meta.color,
    }}>
      {symbol.slice(0, 2)}
    </div>
  )
}

// ── Token pill button ─────────────────────────────────────────────────────────
function TokenPill({ token, onClick, c }: { token: Token; onClick: () => void; c: ReturnType<typeof useNanTheme> }) {
  return (
    <button
      onClick={onClick}
      aria-label={`Select token, current: ${token}`}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 10px 6px 7px',
        background: c.surf, border: `1px solid ${c.bdr2}`,
        borderRadius: 100, cursor: 'pointer',
        fontFamily: 'var(--nan-font)', transition: 'all 0.15s', flexShrink: 0,
      }}>
      <TokenLogo symbol={token} size={18} />
      <span style={{ fontSize: 13, fontWeight: 700, color: c.text }}>{token}</span>
      <span style={{ fontSize: 9, color: c.t3 }}>▾</span>
    </button>
  )
}

// ── Token selector modal ──────────────────────────────────────────────────────
function TokenModal({ current, exclude, onSelect, onClose, c }: {
  current: Token; exclude: Token
  onSelect: (t: Token) => void; onClose: () => void
  c: ReturnType<typeof useNanTheme>
}) {
  const [query, setQuery] = useState('')
  const filtered = TOKENS.filter(t =>
    t !== exclude &&
    (t.toLowerCase().includes(query.toLowerCase()) ||
     TOKEN_META[t].label.toLowerCase().includes(query.toLowerCase()))
  )
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Select token"
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 480, background: c.surf, border: `1px solid ${c.bdr2}`, borderRadius: '20px 20px 0 0', padding: '0 0 32px', maxHeight: '78vh', display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 3px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: c.bdr2 }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 16px 10px' }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: c.text }}>Select token</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.t2, padding: 4 }}><X size={16} /></button>
        </div>
        <div style={{ padding: '0 14px 8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: c.surf2, border: `1px solid ${c.bdr}`, borderRadius: 10, padding: '8px 11px' }}>
            <Search size={13} color={c.t3} />
            <input
              autoFocus
              placeholder="Search tokens…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              aria-label="Search tokens"
              style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: c.text, fontSize: 13, fontFamily: 'var(--nan-font)' }}
            />
          </div>
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {filtered.map(t => (
            <button key={t} onClick={() => { onSelect(t); onClose() }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '10px 16px', background: t === current ? c.blueDim : 'transparent', border: 'none', cursor: 'pointer', borderBottom: `1px solid ${c.bdr}`, transition: 'background 0.1s' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <TokenLogo symbol={t} size={34} />
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: t === current ? c.blue : c.text }}>{t}</div>
                  <div style={{ fontSize: 11, color: c.t3 }}>
                    {TOKEN_META[t].label}
                    {TOKEN_META[t].arcUnsupported && <span style={{ marginLeft: 5, fontSize: 10, color: '#F59E0B', fontWeight: 600 }}>· Not on Arc</span>}
                  </div>
                </div>
              </div>
              {t === current && <CheckCircle size={14} color={c.blue} />}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Slippage panel ────────────────────────────────────────────────────────────
function SlippagePanel({ slippageBps, onChange, onClose, c }: { slippageBps: number; onChange: (bps: number) => void; onClose: () => void; c: ReturnType<typeof useNanTheme> }) {
  const presets = [50, 100, 300]
  const [custom, setCustom] = useState(presets.includes(slippageBps) ? '' : (slippageBps / 100).toFixed(1))
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Slippage tolerance"
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, background: c.surf, border: `1px solid ${c.bdr2}`, borderRadius: '20px 20px 0 0', padding: '0 18px 36px' }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 3px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: c.bdr2 }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0 16px' }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: c.text }}>Slippage tolerance</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.t2 }}><X size={16} /></button>
        </div>
        <div style={{ display: 'flex', gap: 7, marginBottom: 14 }}>
          {presets.map(bps => (
            <button key={bps} onClick={() => { onChange(bps); setCustom('') }}
              style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: `1px solid ${slippageBps === bps && !custom ? c.blue : c.bdr2}`, background: slippageBps === bps && !custom ? c.blueDim : c.surf2, color: slippageBps === bps && !custom ? c.blue : c.t2, fontFamily: 'var(--nan-font)', fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s' }}>
              {bps / 100}%
            </button>
          ))}
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: c.t3, marginBottom: 5, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Custom</div>
          <div style={{ display: 'flex', alignItems: 'center', background: c.surf2, border: `1px solid ${custom ? c.blue : c.bdr}`, borderRadius: 10, padding: '9px 12px', boxShadow: custom ? `0 0 0 3px ${c.blueDim}` : 'none', transition: 'all 0.15s' }}>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.5"
              value={custom}
              onChange={e => { const v = e.target.value.replace(/[^0-9.]/g, ''); setCustom(v); const bps = Math.round(parseFloat(v || '0') * 100); if (bps > 0 && bps <= 5000) onChange(bps) }}
              aria-label="Custom slippage percentage"
              style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: c.text, fontSize: 14, fontWeight: 700, fontFamily: 'var(--nan-font)' }}
            />
            <span style={{ fontSize: 13, color: c.t2, fontWeight: 600 }}>%</span>
          </div>
        </div>
        {slippageBps > 200 && (
          <div className="nan-warn-box" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 12 }}>
            <AlertCircle size={13} /> High slippage — your trade may result in a worse price.
          </div>
        )}
        <div style={{ fontSize: 12, color: c.t3, lineHeight: 1.55 }}>
          Current: <strong style={{ color: c.text }}>{(slippageBps / 100).toFixed(2)}%</strong>
        </div>
      </div>
    </div>
  )
}

// ── Balance hook: ERC-20 for USDC/EURC, native for NATIVE ────────────────────
function useTokenBalance(token: Token, address: `0x${string}` | undefined) {
  const meta   = TOKEN_META[token]
  const isNative = token === 'NATIVE'
  const hasAddress = !!meta.address

  const { data: erc20Raw } = useReadContract({
    address: meta.address as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: !!address && hasAddress && !isNative },
  })

  const { data: nativeBal } = useBalance({
    address,
    chainId: CHAIN_ID,
    query: { enabled: !!address && isNative },
  })

  if (!address) return '—'
  if (isNative && nativeBal) {
    // native on Arc = 18-dec USDC gas; display as USDC
    const val = Number(nativeBal.value) / 1e18
    return val.toLocaleString(undefined, { maximumFractionDigits: 4 })
  }
  if (erc20Raw !== undefined) {
    const val = Number(erc20Raw) / 10 ** meta.decimals
    return val.toLocaleString(undefined, { maximumFractionDigits: 4 })
  }
  return '—'
}

// ── Inline summary row ────────────────────────────────────────────────────────
function SummaryRow({ label, value, c, last = false }: { label: string; value: string; c: ReturnType<typeof useNanTheme>; last?: boolean }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '6px 0',
      borderBottom: last ? 'none' : `1px solid ${c.bdr}`,
    }}>
      <span style={{ fontSize: 11, color: c.t3 }}>{label}</span>
      <span style={{ fontSize: 11, fontWeight: 700, color: c.text }}>{value}</span>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export function SwapPage({ inCard = false }: { inCard?: boolean }) {
  const c = useNanTheme()
  const { connector, isConnected, address: wagmiAddress } = useAccount()
  const auth = useAppStore(s => s.auth)
  const circleWalletAddress = auth?.circleWalletAddress as `0x${string}` | undefined
  const isPasskeyUser = !wagmiAddress && !!auth?.isPasskeyUser
  // Passkey users sign client-side (MSCA); email/Google users go server-side
  const isCircleUser = !wagmiAddress && !!circleWalletAddress && !isPasskeyUser
  // Use wagmi address for connected wallets; fall back to Circle/passkey wallet address
  const address = wagmiAddress ?? ((isCircleUser || isPasskeyUser) ? circleWalletAddress : undefined)
  const chainId = useChainId()
  const { switchChainAsync } = useSwitchChain()
  const addActivity = useAppStore(s => s.addActivity)

  const swapPrefill    = useAppStore(s => s.swapPrefill)
  const setSwapPrefill = useAppStore(s => s.setSwapPrefill)

  const [tokenIn,  setTokenIn]  = useState<Token>('USDC')
  const [tokenOut, setTokenOut] = useState<Token>('EURC')
  const [amountIn, setAmountIn] = useState('')

  // Apply agent-chat prefill once on mount, then clear it
  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    if (!swapPrefill) return
    if (swapPrefill.amount) setAmountIn(swapPrefill.amount)
    const supported = ['USDC', 'EURC', 'cirBTC']
    if (swapPrefill.fromToken && supported.includes(swapPrefill.fromToken)) setTokenIn(swapPrefill.fromToken)
    if (swapPrefill.toToken   && supported.includes(swapPrefill.toToken))   setTokenOut(swapPrefill.toToken)
    setSwapPrefill(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [reviewed,    setReviewed]    = useState<ReviewedSwap | null>(null)
  const [phase,       setPhase]       = useState<Phase>('idle')
  const [errMsg,      setErrMsg]      = useState('')
  const [txHash,      setTxHash]      = useState('')
  const [explorerUrl, setExplorerUrl] = useState('')
  const [slippageBps, setSlippageBps] = useState(300) // 3% default per Circle App Kit docs

  const [showSellModal, setShowSellModal] = useState(false)
  const [showBuyModal,  setShowBuyModal]  = useState(false)
  const [showSlippage,  setShowSlippage]  = useState(false)

  // Instantiate AppKit once — stable across renders
  const appKitRef = useRef<AppKit | null>(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const appKit = React.useMemo(() => { appKitRef.current ??= new AppKit(); return appKitRef.current }, [])

  const balIn  = useTokenBalance(tokenIn,  address)
  const balOut = useTokenBalance(tokenOut, address)

  const arcNoPair = (tokenIn === 'USDC' && tokenOut === 'NATIVE') || (tokenIn === 'NATIVE' && tokenOut === 'USDC')
  const sameToken = tokenIn === tokenOut
  const arcUnsupportedPair = !!(TOKEN_META[tokenIn]?.arcUnsupported || TOKEN_META[tokenOut]?.arcUnsupported)
  // All 3 Arc tokens (USDC, EURC, cirBTC) route in both directions per Circle docs.
  const invalid   = sameToken || arcNoPair || arcUnsupportedPair
  // Passkey users sign client-side; Circle email/Google users go server-side
  const canReview = (isConnected || isCircleUser || isPasskeyUser) && !!amountIn && parseFloat(amountIn) > 0 && !invalid

  // ── % chips: parse live balance and apply fraction ────────────────────────
  const applyPct = useCallback((pct: number | 'max') => {
    const raw = balIn
    if (!raw || raw === '—') return
    const num = parseFloat(raw.replace(/,/g, ''))
    if (isNaN(num) || num <= 0) return
    const val = pct === 'max' ? num : num * (pct / 100)
    setAmountIn(val.toFixed(6).replace(/\.?0+$/, ''))
    setReviewed(null); setPhase('idle')
  }, [balIn])

  const getAdapter = async () => {
    // Passkey (MSCA) path — sign client-side via Circle Modular Wallets
    if (isPasskeyUser) {
      const clientKey = getClientKey()
      if (!clientKey) throw new Error('Modular Wallets not configured (VITE_CLIENT_KEY missing)')
      return getPasskeyAdapter({ clientKey })
    }
    if (!connector) throw new Error('Wallet not connected')
    // Switch wallet to Arc before creating the adapter
    if (chainId !== CHAIN_ID) await switchChainAsync({ chainId: CHAIN_ID })
    const provider = (await connector.getProvider()) as EIP1193Provider
    return createViemAdapterFromProvider({ provider })
  }

  // ── Circle UCW user path: estimate → PIN popup → confirm ──────────────────
  const reviewSwapCircle = async () => {
    if (!circleWalletAddress) return
    const auth = useAppStore.getState().auth
    if (!auth?.userToken || !auth?.circleWalletId) {
      setPhase('error'); setErrMsg('SESSION_EXPIRED'); return
    }
    setPhase('estimating'); setErrMsg('')
    try {
      const resp = await fetch('/api/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'ucw-swap-estimate',
          userToken: auth.userToken,
          walletAddress: circleWalletAddress,
          walletId: auth.circleWalletId,
          tokenIn, tokenOut, amountIn,
          slippageBps,
        }),
      })
      const data = await safeJson<{ estimate?: SwapEstimate; error?: string }>(resp)
      if (!resp.ok || data.error || !data.estimate) throw new Error(data.error ?? 'Estimation failed')
      setReviewed({ estimate: data.estimate, tokenIn, tokenOut, amountIn, slippageBps, account: circleWalletAddress })
      setPhase('reviewed')
    } catch (e: unknown) {
      setPhase('error'); setErrMsg(friendlySwapError(e))
    }
  }

  const executeSwapCircle = async () => {
    if (!reviewed || !circleWalletAddress) return
    const auth = useAppStore.getState().auth
    if (!auth?.userToken || !auth?.circleWalletId) {
      setPhase('error'); setErrMsg('SESSION_EXPIRED'); return
    }
    setPhase('swapping'); setErrMsg('')
    try {
      // Step 1 — get challengeId from server
      const resp = await fetch('/api/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'ucw-swap-start',
          userToken: auth.userToken,
          walletAddress: circleWalletAddress,
          walletId: auth.circleWalletId,
          tokenIn: reviewed.tokenIn,
          tokenOut: reviewed.tokenOut,
          amountIn: reviewed.amountIn,
          slippageBps: reviewed.slippageBps,
        }),
      })
      const data = await safeJson<{ challengeId?: string; error?: string }>(resp)
      if (!resp.ok || data.error || !data.challengeId) throw new Error(data.error ?? 'Could not start swap')

      // Step 2 — open Circle PIN popup.
      const appId: string = (import.meta.env.VITE_CIRCLE_APP_ID as string | undefined) ?? ''
      const sdk = new W3SSdk({ appSettings: { appId } })
      if (auth.encryptionKey) {
        sdk.setAuthentication({ userToken: auth.userToken, encryptionKey: auth.encryptionKey })
      } else {
        sdk.setAuthentication({ userToken: auth.userToken, encryptionKey: '' })
      }

      const txId = await new Promise<string>((resolve, reject) => {
        executeWithGuard(sdk, data.challengeId!, (err, result) => {
          if (err) { reject(new Error(err instanceof Error ? err.message : 'PIN approval failed')); return }
          const r = result as { data?: { signature?: string; transactionHash?: string; transactionId?: string } }
          const txHash = r?.data?.transactionHash ?? r?.data?.transactionId ?? ''
          resolve(txHash)
        })
      })

      // Step 3 — confirm: poll until terminal
      if (txId) {
        const confirmResp = await fetch('/api/wallet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'ucw-swap-confirm', userToken: auth.userToken, transactionId: txId }),
        })
        const confirmData = await safeJson<{ result?: { txHash?: string; explorerUrl?: string }; error?: string }>(confirmResp)
        if (!confirmResp.ok || confirmData.error) throw new Error(confirmData.error ?? 'Swap confirm failed')
        const rHash = confirmData.result?.txHash ?? ''
        setTxHash(rHash); setExplorerUrl(confirmData.result?.explorerUrl ?? '')
      }

      setPhase('done')
      const gross = parseFloat(reviewed.amountIn)
      void swapFee(gross)
      addActivity({ type: 'swap', description: `Swap ${reviewed.tokenIn} → ${reviewed.tokenOut}`, amount: gross, sign: '-', status: 'confirmed', counterparty: reviewed.tokenOut, txHash: txId })
    } catch (e: unknown) {
      setPhase('error'); setErrMsg(friendlySwapError(e))
    }
  }

  // ── Normalise raw Circle service errors into friendly messages ───────────
  const friendlySwapError = (e: unknown): string => {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.toLowerCase().includes('no route') || msg.toLowerCase().includes('route or resource not found') || msg.toLowerCase().includes('no swap route'))
      return `No swap route available for ${tokenIn} → ${tokenOut} on Arc right now. Please wait a few seconds and try again.`
    if (msg.toLowerCase().includes('insufficient')) return `Insufficient balance to swap ${amountIn} ${tokenIn}.`
    if (msg.toLowerCase().includes('slippage')) return `Price moved too much. Try raising the slippage tolerance in settings.`
    if (msg.toLowerCase().includes('validation failed') && msg.toLowerCase().includes('apikey')) return `Swap configuration error. Please refresh the page and try again.`
    return msg
  }

  // ── EIP-1193 browser wallet path ──────────────────────────────────────────
  const reviewSwap = async () => {
    if (!canReview) return
    if (isCircleUser) { await reviewSwapCircle(); return }
    setPhase('estimating'); setErrMsg('')
    try {
      const adapter  = await getAdapter()
      const estimate = await appKit.estimateSwap({
        from: { adapter, chain: CHAIN_KEY },
        tokenIn, tokenOut, amountIn,
        config: { slippageBps, ...swapKeyConfig() },
      })
      setReviewed({ estimate, tokenIn, tokenOut, amountIn, slippageBps, account: address })
      setPhase('reviewed')
    } catch (e: unknown) {
      setPhase('error'); setErrMsg(friendlySwapError(e))
    }
  }

  const executeSwap = async () => {
    if (!reviewed) return
    if (isCircleUser) { await executeSwapCircle(); return }
    if (address !== reviewed.account) { setPhase('error'); setErrMsg('Wallet changed since estimate. Get a new quote.'); return }
    setPhase('swapping'); setErrMsg('')
    try {
      const adapter = await getAdapter()
      const result  = await appKit.swap({
        from: { adapter, chain: CHAIN_KEY },
        tokenIn:  reviewed.tokenIn, tokenOut: reviewed.tokenOut,
        amountIn: reviewed.amountIn,
        config: { slippageBps: reviewed.slippageBps, ...swapKeyConfig() },
      })
      const rHash = (result as { txHash?: string }).txHash ?? ''
      const rUrl  = (result as { explorerUrl?: string }).explorerUrl ?? ''
      setTxHash(rHash); setExplorerUrl(rUrl); setPhase('done')
      const gross = parseFloat(reviewed.amountIn)
      void swapFee(gross)
      addActivity({ type: 'swap', description: `Swap ${reviewed.tokenIn} → ${reviewed.tokenOut}`, amount: gross, sign: '-', status: 'confirmed', counterparty: reviewed.tokenOut, txHash: rHash })
    } catch (e: unknown) {
      setPhase('error'); setErrMsg(friendlySwapError(e))
    }
  }

  const flipTokens = () => { setTokenIn(tokenOut); setTokenOut(tokenIn); setReviewed(null); setPhase('idle') }
  const clearQuote = () => { setReviewed(null); setPhase('idle') }
  const reset      = () => { setAmountIn(''); setReviewed(null); setPhase('idle'); setErrMsg(''); setTxHash('') }
  const estimatedOut = reviewed?.estimate?.estimatedOutput

  const F    = 'var(--nan-font)'
  const MONO = 'var(--nan-mono)'

  // Shared padding for inCard content
  const PX = inCard ? 14 : 0
  const cardPad = `0 ${PX}px`

  // ── Success screen ────────────────────────────────────────────────────────
  if (phase === 'done') return (
    <div style={{ padding: inCard ? '20px 16px 24px' : '0 16px 80px', fontFamily: F }}>
      <div style={{ textAlign: 'center', padding: '24px 0 16px' }}>
        <div style={{ width: 52, height: 52, borderRadius: 16, background: 'rgba(16,185,129,0.10)', border: '1.5px solid rgba(16,185,129,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
          <CheckCircle size={22} color={c.green} strokeWidth={1.6} />
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, color: c.text, letterSpacing: '-0.03em', marginBottom: 4 }}>Swap complete</div>
        <div style={{ fontSize: 12, color: c.t2, marginBottom: 16 }}>Your tokens have been exchanged.</div>
        {txHash && (
          <a href={explorerUrl || `https://explorer.arc.io/tx/${txHash}`} target="_blank" rel="noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: c.blue, textDecoration: 'none', background: c.blueDim, border: `1px solid ${c.blueBd}`, borderRadius: 8, padding: '5px 12px', marginBottom: 16, fontFamily: MONO }}>
            {txHash.slice(0, 14)}… <ExternalLink size={10} />
          </a>
        )}
        <button onClick={reset} style={{ width: '100%', height: 46, background: c.blue, color: '#fff', border: 'none', borderRadius: 13, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: F, boxShadow: '0 4px 20px rgba(8,102,245,0.28)' }}>
          Swap again
        </button>
      </div>
    </div>
  )

  // ── Main swap UI ──────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: F, padding: inCard ? '0 0 2px' : '0 16px 80px' }}>

      {/* ── Standalone header with slippage (only outside TradePage card) ── */}
      {!inCard && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0 12px' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: c.text, letterSpacing: '-0.03em', lineHeight: 1.1 }}>Swap</div>
            <div style={{ fontSize: 11, color: c.t3, marginTop: 2 }}>Exchange your tokens across supported networks.</div>
          </div>
          <button
            onClick={() => setShowSlippage(true)}
            aria-label="Slippage settings"
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 11px', borderRadius: 9, border: `1px solid ${c.bdr}`, background: c.surf, cursor: 'pointer', transition: 'all 0.15s', WebkitTapHighlightColor: 'transparent' }}>
            <Settings size={11} color={c.t2} strokeWidth={2} />
            <span style={{ fontSize: 11, fontWeight: 700, color: c.t2 }}>{(slippageBps / 100).toFixed(2)}%</span>
          </button>
        </div>
      )}

      {/* ── Inline slippage row (inside TradePage card only) ── */}
      {inCard && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '8px 14px 0' }}>
          <button
            onClick={() => setShowSlippage(true)}
            aria-label="Slippage settings"
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 9px', borderRadius: 7, border: `1px solid ${c.bdr}`, background: 'transparent', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>
            <Settings size={10} color={c.t3} strokeWidth={2} />
            <span style={{ fontSize: 10, fontWeight: 600, color: c.t3 }}>{(slippageBps / 100).toFixed(2)}% slippage</span>
          </button>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          SELL PANEL
      ═══════════════════════════════════════════════════════ */}
      <div style={{
        background: c.surf2,
        border: `1px solid ${c.bdr}`,
        borderRadius: 14,
        padding: '11px 13px 10px',
        margin: inCard ? '6px 14px 0' : '0 0 2px',
      }}>
        {/* Top row: label + balance + % chips */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: c.t3, textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>You pay</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {(isConnected || isCircleUser || isPasskeyUser) && (
              <span style={{ fontSize: 10, color: c.t3 }}>
                Bal: <span style={{ color: c.t2, fontWeight: 600 }}>{balIn}</span>
              </span>
            )}
            {/* % quick-fill chips */}
            {(['25%', '50%', 'MAX'] as const).map((label, i) => {
              const pct = i === 0 ? 25 : i === 1 ? 50 : 'max' as const
              return (
                <button
                  key={label}
                  onClick={() => applyPct(pct)}
                  aria-label={`Set amount to ${label}`}
                  style={{ padding: '2px 6px', border: `1px solid ${c.bdr}`, borderRadius: 5, background: 'transparent', color: c.t3, fontSize: 9, fontWeight: 700, cursor: 'pointer', fontFamily: F, WebkitTapHighlightColor: 'transparent' }}>
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Amount input + token pill on same row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={amountIn}
            aria-label="Amount to swap"
            onChange={e => { const v = e.target.value.replace(/[^0-9.]/g, ''); if (v === '' || /^\d*\.?\d*$/.test(v)) { setAmountIn(v); setReviewed(null); setPhase('idle') } }}
            disabled={phase === 'swapping'}
            style={{ flex: 1, fontSize: 26, fontWeight: 800, color: c.text, border: 'none', outline: 'none', background: 'transparent', fontFamily: MONO, minWidth: 0, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}
          />
          <TokenPill token={tokenIn} onClick={() => setShowSellModal(true)} c={c} />
        </div>

        {/* Fiat estimate */}
        {amountIn && parseFloat(amountIn) > 0 && (
          <div style={{ fontSize: 10, color: c.t3, marginTop: 3 }}>≈ ${parseFloat(amountIn).toFixed(2)}</div>
        )}
      </div>

      {/* ── Token-switch button ── */}
      <div style={{ display: 'flex', justifyContent: 'center', margin: '-1px 0', zIndex: 2, position: 'relative' as const }}>
        <button
          onClick={flipTokens}
          aria-label="Flip tokens"
          style={{
            width: 32, height: 32, borderRadius: 10,
            border: `1.5px solid ${c.bdr2}`,
            background: c.surf,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', transition: 'background 0.15s, border-color 0.15s',
            WebkitTapHighlightColor: 'transparent',
            boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
          }}>
          <ArrowDown size={13} color={c.blue} strokeWidth={2.5} />
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════
          RECEIVE PANEL
      ═══════════════════════════════════════════════════════ */}
      <div style={{
        background: c.surf2,
        border: `1px solid ${c.bdr}`,
        borderRadius: 14,
        padding: '11px 13px 10px',
        margin: inCard ? '0 14px 0' : '2px 0 10px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: c.t3, textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>You receive</span>
          {(isConnected || isCircleUser || isPasskeyUser) && (
            <span style={{ fontSize: 10, color: c.t3 }}>
              Bal: <span style={{ color: c.t2, fontWeight: 600 }}>{balOut}</span>
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, fontSize: 26, fontWeight: 800, color: estimatedOut ? c.green : c.t3, fontFamily: MONO, minWidth: 0, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
            {phase === 'estimating'
              ? <span style={{ display: 'inline-block', width: 90, height: 26, borderRadius: 7, background: c.surf3, animation: 'nan-pulse 1.2s ease-in-out infinite' }} />
              : estimatedOut ? estimatedOut.amount : '0.00'}
          </div>
          <TokenPill token={tokenOut} onClick={() => setShowBuyModal(true)} c={c} />
        </div>
        {estimatedOut && parseFloat(estimatedOut.amount) > 0 && (
          <div style={{ fontSize: 10, color: c.t3, marginTop: 3 }}>≈ ${parseFloat(estimatedOut.amount).toFixed(2)}</div>
        )}
      </div>

      {/* ── Pair warnings ── */}
      {(sameToken || arcNoPair || arcUnsupportedPair) && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7, padding: '9px 11px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.20)', borderRadius: 11, margin: inCard ? '8px 14px 0' : '0 0 8px', fontSize: 11, color: c.t2, lineHeight: 1.5 }}>
          <AlertCircle size={12} color="#F59E0B" style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            {arcNoPair ? 'USDC and NATIVE are the same asset on Arc.'
              : sameToken ? 'Choose different tokens to swap.'
              : `${TOKEN_META[tokenIn]?.arcUnsupported ? tokenIn : tokenOut} is not available on Arc. Only USDC, EURC, and cirBTC can be swapped here.`}
          </span>
        </div>
      )}

      {/* ── Quote summary (appears after estimate) ── */}
      {reviewed && phase === 'reviewed' && (
        <div style={{
          background: c.surf2, border: `1px solid ${c.bdr}`, borderRadius: 12,
          padding: '3px 12px',
          margin: inCard ? '8px 14px 0' : '0 0 10px',
        }}>
          <SummaryRow label="Estimated output" value={`${estimatedOut?.amount ?? '—'} ${estimatedOut?.token ?? tokenOut}`} c={c} />
          <SummaryRow label="Slippage" value={`${(reviewed.slippageBps / 100).toFixed(2)}%`} c={c} />
          <SummaryRow label={`NAN fee (${bpsToPercent(SWAP_FEE_BPS)})`} value={`${swapFee(parseFloat(reviewed.amountIn) || 0).toFixed(4)} ${reviewed.tokenIn}`} c={c} />
          {(reviewed.estimate.fees ?? []).map((f, i, arr) => (
            <SummaryRow key={f.type} label={`${f.type} fee`} value={`${f.amount} ${f.token}`} c={c} last={i === arr.length - 1} />
          ))}
          <div style={{ fontSize: 10, color: c.t3, padding: '4px 0 5px' }}>Routed via LiFi · amounts may vary at execution.</div>
        </div>
      )}

      {/* ── Error state ── */}
      {phase === 'error' && errMsg && (
        errMsg === 'SESSION_EXPIRED' ? (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.20)', borderRadius: 11, margin: inCard ? '8px 14px 0' : '0 0 8px' }}>
            <AlertCircle size={12} color="#EF4444" style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: c.text, marginBottom: 3 }}>PIN required</div>
              <div style={{ fontSize: 11, color: c.t2, marginBottom: 7, lineHeight: 1.5 }}>Get a new quote and confirm with your Circle PIN.</div>
              <button onClick={() => { setPhase('idle'); setErrMsg(''); setReviewed(null) }}
                style={{ padding: '5px 12px', background: c.blue, border: 'none', borderRadius: 7, color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: F }}>
                Get new quote
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7, padding: '9px 11px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.20)', borderRadius: 11, margin: inCard ? '8px 14px 0' : '0 0 8px', fontSize: 11, color: c.t2, lineHeight: 1.5 }}>
            <AlertCircle size={12} color="#EF4444" style={{ flexShrink: 0, marginTop: 1 }} /><span>{errMsg}</span>
          </div>
        )
      )}

      {/* ── Primary action ── */}
      <div style={{ margin: inCard ? '10px 14px 14px' : '10px 0 0', padding: cardPad }}>
        {phase === 'reviewed' ? (
          <div style={{ display: 'flex', gap: 7 }}>
            <button
              onClick={clearQuote}
              style={{ flex: 1, height: 46, borderRadius: 13, border: `1px solid ${c.bdr}`, background: c.surf, color: c.t2, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: F, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, WebkitTapHighlightColor: 'transparent' }}>
              <RefreshCw size={11} /> New quote
            </button>
            <button
              onClick={() => void executeSwap()}
              style={{ flex: 2, height: 46, borderRadius: 13, border: 'none', background: c.blue, color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: F, boxShadow: '0 4px 20px rgba(8,102,245,0.28)', WebkitTapHighlightColor: 'transparent' }}>
              Confirm swap
            </button>
          </div>
        ) : (
          <button
            onClick={() => void reviewSwap()}
            disabled={!canReview || phase === 'estimating' || phase === 'swapping'}
            aria-label="Review swap"
            style={{
              width: '100%', height: 46, borderRadius: 13, border: 'none',
              background: canReview && phase !== 'estimating' && phase !== 'swapping' ? c.blue : c.surf2,
              color: canReview && phase !== 'estimating' && phase !== 'swapping' ? '#fff' : c.t3,
              fontSize: 14, fontWeight: 800,
              cursor: canReview ? 'pointer' : 'not-allowed',
              fontFamily: F, transition: 'all 0.15s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              boxShadow: canReview && phase === 'idle' ? '0 4px 20px rgba(8,102,245,0.26)' : 'none',
              WebkitTapHighlightColor: 'transparent',
            }}>
            {phase === 'estimating'
              ? <><span className="nan-spinner" />Getting quote…</>
              : phase === 'swapping'
              ? <><span className="nan-spinner" />Swapping…</>
              : !isConnected && !isCircleUser && !isPasskeyUser ? 'Connect wallet to swap'
              : !amountIn || parseFloat(amountIn) === 0 ? 'Enter an amount'
              : arcUnsupportedPair ? 'Token not on Arc'
              : invalid ? 'Select different tokens'
              : 'Review swap'}
          </button>
        )}
      </div>

      {/* Poweredby footer */}
      <div style={{ fontSize: 10, color: c.t3, textAlign: 'center' as const, padding: inCard ? '0 14px 10px' : '6px 0 0' }}>
        Circle App Kit · LiFi
      </div>

      {/* ── Modals ── */}
      {showSellModal && (
        <TokenModal
          current={tokenIn} exclude={tokenOut}
          onSelect={t => { setTokenIn(t); setReviewed(null); setPhase('idle') }}
          onClose={() => setShowSellModal(false)} c={c}
        />
      )}
      {showBuyModal && (
        <TokenModal
          current={tokenOut} exclude={tokenIn}
          onSelect={t => { setTokenOut(t); setReviewed(null); setPhase('idle') }}
          onClose={() => setShowBuyModal(false)} c={c}
        />
      )}
      {showSlippage && (
        <SlippagePanel
          slippageBps={slippageBps} onChange={setSlippageBps}
          onClose={() => setShowSlippage(false)} c={c}
        />
      )}
    </div>
  )
}
