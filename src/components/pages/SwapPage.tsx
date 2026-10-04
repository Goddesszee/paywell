import React, { useState, useCallback, useRef } from 'react'
import { useAccount, useChainId, useSwitchChain, useReadContract, useBalance } from 'wagmi'
import { AppKit, type SwapEstimate } from '@circle-fin/app-kit'
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2'
import { erc20Abi, type EIP1193Provider } from 'viem'
import { ArrowDown, Settings, CheckCircle, ExternalLink, RefreshCw, AlertCircle, X, Search } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { swapFee, SWAP_FEE_BPS, bpsToPercent } from '../../lib/fees'
import { useNanTheme } from '../../hooks/useNanTheme'

const CHAIN_ID  = 5042002
const CHAIN_KEY = 'Arc_Testnet'

// ── Token registry with logos + addresses ─────────────────────────────────────
// Addresses on Arc Testnet (chainId 5042002). null = native/no ERC-20 on this chain.
const TOKEN_META: Record<string, { label: string; color: string; address: `0x${string}` | null; decimals: number; logo: string; arcUnsupported?: boolean }> = {
  USDC:  { label: 'USD Coin',        color: '#2775CA', address: '0x3600000000000000000000000000000000000000', decimals: 6,  logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png' },
  EURC:  { label: 'Euro Coin',       color: '#0099CC', address: '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a', decimals: 6,  logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x1aBaEA1f7C830bD89Acc67eC4af516284b1bC33c/logo.png' },
  // Tokens below have no deployed contract on Arc Testnet — they are shown in
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
function TokenLogo({ symbol, size = 28 }: { symbol: Token; size?: number }) {
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
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 7,
      padding: '7px 12px 7px 8px',
      background: c.surf2, border: `1px solid ${c.bdr2}`,
      borderRadius: 100, cursor: 'pointer',
      fontFamily: 'var(--nan-font)', transition: 'all 0.15s', flexShrink: 0,
    }}>
      <TokenLogo symbol={token} size={20} />
      <span style={{ fontSize: 14, fontWeight: 700, color: c.text }}>{token}</span>
      <span style={{ fontSize: 10, color: c.t3 }}>▾</span>
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
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, background: c.surf, border: `1px solid ${c.bdr2}`, borderRadius: '20px 20px 0 0', padding: '0 0 32px', maxHeight: '78vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: c.bdr2 }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 18px 12px' }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: c.text }}>Select token</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.t2, padding: 4 }}><X size={18} /></button>
        </div>
        <div style={{ padding: '0 16px 10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: c.surf2, border: `1px solid ${c.bdr}`, borderRadius: 10, padding: '9px 12px' }}>
            <Search size={14} color={c.t3} />
            <input autoFocus placeholder="Search tokens…" value={query} onChange={e => setQuery(e.target.value)}
              style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: c.text, fontSize: 14, fontFamily: 'var(--nan-font)' }} />
          </div>
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {filtered.map(t => (
            <button key={t} onClick={() => { onSelect(t); onClose() }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '11px 18px', background: t === current ? c.blueDim : 'transparent', border: 'none', cursor: 'pointer', borderBottom: `1px solid ${c.bdr}`, transition: 'background 0.1s' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <TokenLogo symbol={t} size={36} />
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: t === current ? c.blue : c.text }}>{t}</div>
                  <div style={{ fontSize: 11, color: c.t3 }}>
                    {TOKEN_META[t].label}
                    {TOKEN_META[t].arcUnsupported && <span style={{ marginLeft: 6, fontSize: 10, color: '#F59E0B', fontWeight: 600 }}>· Not on Arc Testnet</span>}
                  </div>
                </div>
              </div>
              {t === current && <CheckCircle size={16} color={c.blue} />}
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
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, background: c.surf, border: `1px solid ${c.bdr2}`, borderRadius: '20px 20px 0 0', padding: '0 20px 40px' }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: c.bdr2 }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0 18px' }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: c.text }}>Slippage tolerance</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.t2 }}><X size={18} /></button>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {presets.map(bps => (
            <button key={bps} onClick={() => { onChange(bps); setCustom('') }}
              style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: `1px solid ${slippageBps === bps && !custom ? c.blue : c.bdr2}`, background: slippageBps === bps && !custom ? c.blueDim : c.surf2, color: slippageBps === bps && !custom ? c.blue : c.t2, fontFamily: 'var(--nan-font)', fontSize: 14, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s' }}>
              {bps / 100}%
            </button>
          ))}
        </div>
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, color: c.t3, marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Custom</div>
          <div style={{ display: 'flex', alignItems: 'center', background: c.surf2, border: `1px solid ${custom ? c.blue : c.bdr}`, borderRadius: 10, padding: '10px 14px', boxShadow: custom ? `0 0 0 3px ${c.blueDim}` : 'none', transition: 'all 0.15s' }}>
            <input type="text" inputMode="decimal" placeholder="0.5" value={custom}
              onChange={e => { const v = e.target.value.replace(/[^0-9.]/g, ''); setCustom(v); const bps = Math.round(parseFloat(v || '0') * 100); if (bps > 0 && bps <= 5000) onChange(bps) }}
              style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: c.text, fontSize: 15, fontWeight: 700, fontFamily: 'var(--nan-font)' }} />
            <span style={{ fontSize: 14, color: c.t2, fontWeight: 600 }}>%</span>
          </div>
        </div>
        {slippageBps > 200 && (
          <div className="nan-warn-box" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 14 }}>
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

// ── Main component ────────────────────────────────────────────────────────────
export function SwapPage() {
  const c = useNanTheme()
  const { connector, isConnected, address: wagmiAddress } = useAccount()
  const auth = useAppStore(s => s.auth)
  const circleWalletAddress = auth?.circleWalletAddress as `0x${string}` | undefined
  const isCircleUser = !wagmiAddress && !!circleWalletAddress
  // Use wagmi address for connected wallets; fall back to Circle wallet address
  const address = wagmiAddress ?? (isCircleUser ? circleWalletAddress : undefined)
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
    if (swapPrefill.fromToken && (swapPrefill.fromToken === 'USDC' || swapPrefill.fromToken === 'EURC')) setTokenIn(swapPrefill.fromToken)
    if (swapPrefill.toToken   && (swapPrefill.toToken   === 'USDC' || swapPrefill.toToken   === 'EURC')) setTokenOut(swapPrefill.toToken)
    setSwapPrefill(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [reviewed, setReviewed] = useState<ReviewedSwap | null>(null)
  const [phase,    setPhase]    = useState<Phase>('idle')
  const [errMsg,   setErrMsg]   = useState('')
  const [txHash,   setTxHash]   = useState('')
  const [explorerUrl, setExplorerUrl] = useState('')
  const [slippageBps, setSlippageBps] = useState(100)

  const [showSellModal, setShowSellModal] = useState(false)
  const [showBuyModal,  setShowBuyModal]  = useState(false)
  const [showSlippage,  setShowSlippage]  = useState(false)

  // Instantiate AppKit once — stable across renders
  const appKitRef = useRef<AppKit | null>(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const appKit = React.useMemo(() => { appKitRef.current ??= new AppKit(); return appKitRef.current }, [])

  const balIn  = useTokenBalance(tokenIn,  address)
  const balOut = useTokenBalance(tokenOut, address)

  // circleWalletAddress is declared above near wagmiAddress

  const arcNoPair = (tokenIn === 'USDC' && tokenOut === 'NATIVE') || (tokenIn === 'NATIVE' && tokenOut === 'USDC')
  const sameToken = tokenIn === tokenOut
  const arcUnsupportedPair = !!(TOKEN_META[tokenIn]?.arcUnsupported || TOKEN_META[tokenOut]?.arcUnsupported)
  const invalid   = sameToken || arcNoPair || arcUnsupportedPair
  // Circle users can swap when they have a wallet address (server-side path)
  const canReview = (isConnected || isCircleUser) && !!amountIn && parseFloat(amountIn) > 0 && !invalid

  // Display address: prefer connected wagmi wallet, fall back to Circle wallet
  const displayAddress = address ?? circleWalletAddress ?? ''
  const addrShort = displayAddress ? `${displayAddress.slice(0, 4)}…${displayAddress.slice(-4)}` : ''

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
    if (!connector) throw new Error('Wallet not connected')
    if (chainId !== CHAIN_ID) await switchChainAsync({ chainId: CHAIN_ID })
    const provider = (await connector.getProvider()) as EIP1193Provider
    return createViemAdapterFromProvider({ provider })
  }

  // ── Circle user-controlled wallet: UCW swap via challenge relay ──────────
  const reviewSwapCircle = async () => {
    if (!circleWalletAddress) return
    setPhase('estimating'); setErrMsg('')
    const userToken = auth?.userToken
    const walletId  = auth?.circleWalletId
    if (!userToken || !walletId) { setPhase('error'); setErrMsg('Circle session expired — please log in again.'); return }
    try {
      const resp = await fetch('/api/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ucw-swap-estimate', userToken, walletAddress: circleWalletAddress, walletId, tokenIn, tokenOut, amountIn, slippageBps: String(slippageBps) }),
      })
      const data = await resp.json() as { estimate?: unknown; error?: string }
      if (!resp.ok || data.error) throw new Error(data.error ?? 'Estimation failed')
      setReviewed({ estimate: data.estimate as import('@circle-fin/app-kit').SwapEstimate, tokenIn, tokenOut, amountIn, slippageBps, account: circleWalletAddress })
      setPhase('reviewed')
    } catch (e: unknown) {
      setPhase('error'); setErrMsg(e instanceof Error ? e.message : 'Estimation failed.')
    }
  }

  const executeSwapCircle = async () => {
    if (!reviewed || !circleWalletAddress) return
    setPhase('swapping'); setErrMsg('')
    const userToken     = auth?.userToken
    const encryptionKey = auth?.encryptionKey
    const walletId      = auth?.circleWalletId
    const appId         = import.meta.env.VITE_CIRCLE_APP_ID as string | undefined
    if (!userToken || !encryptionKey || !walletId || !appId) {
      setPhase('error'); setErrMsg('Circle session expired — please log in again.'); return
    }
    try {
      // Step 1: server starts the swap and returns a challengeId
      const startResp = await fetch('/api/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ucw-swap-start', userToken, walletAddress: circleWalletAddress, walletId, tokenIn: reviewed.tokenIn, tokenOut: reviewed.tokenOut, amountIn: reviewed.amountIn, slippageBps: String(reviewed.slippageBps) }),
      })
      const startData = await startResp.json() as { challengeId?: string; error?: string }
      if (!startResp.ok || startData.error) throw new Error(startData.error ?? 'Swap start failed')
      const { challengeId } = startData
      if (!challengeId) throw new Error('No challengeId returned from swap start')

      // Step 2: user approves via W3S SDK PIN popup
      const { W3SSdk } = await import('@circle-fin/w3s-pw-web-sdk')
      const sdk = new W3SSdk({ appSettings: { appId } })
      sdk.setAuthentication({ userToken, encryptionKey })

      const transactionId = await new Promise<string>((resolve, reject) => {
        sdk.execute(challengeId, (err, result) => {
          if (err) { reject(new Error(err.message ?? 'Challenge failed')); return }
          const r = result as Record<string, unknown> | undefined
          const txId = r?.['transactionId'] as string ?? r?.['result'] as string ?? ''
          if (!txId) { reject(new Error('No transactionId from challenge result')); return }
          resolve(txId)
        })
      })

      // Step 3: confirm and poll until the swap lands on-chain
      const confirmResp = await fetch('/api/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ucw-swap-confirm', userToken, transactionId }),
      })
      const confirmData = await confirmResp.json() as { result?: { txHash?: string; explorerUrl?: string }; error?: string }
      if (!confirmResp.ok || confirmData.error) throw new Error(confirmData.error ?? 'Swap confirm failed')

      const rHash = confirmData.result?.txHash ?? ''
      const rUrl  = confirmData.result?.explorerUrl ?? ''
      setTxHash(rHash); setExplorerUrl(rUrl); setPhase('done')
      const gross = parseFloat(reviewed.amountIn)
      void swapFee(gross)
      addActivity({ type: 'swap', description: `Swap ${reviewed.tokenIn} → ${reviewed.tokenOut}`, amount: gross, sign: '-', status: 'confirmed', counterparty: reviewed.tokenOut, txHash: rHash })
    } catch (e: unknown) {
      setPhase('error'); setErrMsg(e instanceof Error ? e.message : 'Swap failed.')
    }
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
        config: { slippageBps },
      })
      setReviewed({ estimate, tokenIn, tokenOut, amountIn, slippageBps, account: address })
      setPhase('reviewed')
    } catch (e: unknown) {
      setPhase('error'); setErrMsg(e instanceof Error ? e.message : 'Estimation failed.')
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
        amountIn: reviewed.amountIn, config: { slippageBps: reviewed.slippageBps },
      })
      const rHash = (result as { txHash?: string }).txHash ?? ''
      const rUrl  = (result as { explorerUrl?: string }).explorerUrl ?? ''
      setTxHash(rHash); setExplorerUrl(rUrl); setPhase('done')
      const gross = parseFloat(reviewed.amountIn)
      void swapFee(gross)
      addActivity({ type: 'swap', description: `Swap ${reviewed.tokenIn} → ${reviewed.tokenOut}`, amount: gross, sign: '-', status: 'confirmed', counterparty: reviewed.tokenOut, txHash: rHash })

    } catch (e: unknown) {
      setPhase('error'); setErrMsg(e instanceof Error ? e.message : 'Swap failed.')
    }
  }

  const flipTokens = () => { setTokenIn(tokenOut); setTokenOut(tokenIn); setReviewed(null); setPhase('idle') }
  const clearQuote = () => { setReviewed(null); setPhase('idle') }
  const reset      = () => { setAmountIn(''); setReviewed(null); setPhase('idle'); setErrMsg(''); setTxHash('') }
  const estimatedOut = reviewed?.estimate?.estimatedOutput

  // ── Success screen ────────────────────────────────────────────────────────
  if (phase === 'done') return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 0 100px', fontFamily: 'var(--nan-font)' }}>
      <div style={{ textAlign: 'center', padding: '56px 24px 32px' }}>
        <div className="nan-check-circle" style={{ margin: '0 auto 18px' }}><CheckCircle size={28} color={c.green} /></div>
        <div style={{ fontSize: 22, fontWeight: 700, color: c.text, letterSpacing: '-0.025em', marginBottom: 6 }}>Swap complete</div>
        <div style={{ fontSize: 14, color: c.t2, marginBottom: 28 }}>Your tokens have been exchanged.</div>
        {txHash && (
          <a href={explorerUrl || `https://explorer.testnet.arc.io/tx/${txHash}`} target="_blank" rel="noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: c.blue, textDecoration: 'none', background: c.blueDim, border: `1px solid ${c.blueBd}`, borderRadius: 8, padding: '8px 14px', marginBottom: 28 }}>
            {txHash.slice(0, 14)}… <ExternalLink size={12} />
          </a>
        )}
        <button onClick={reset} className="nan-btn nan-btn-primary nan-btn-full" style={{ borderRadius: 14 }}>Swap again</button>
      </div>
    </div>
  )

  // (Circle user gate removed — Circle users now swap via server-side path)

  // ── Main swap UI ──────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 0 100px', fontFamily: 'var(--nan-font)' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 0 16px' }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: c.text, letterSpacing: '-0.02em' }}>Swap</span>
        <button onClick={() => setShowSlippage(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 9, border: `1px solid ${c.bdr}`, background: c.surf, cursor: 'pointer', transition: 'all 0.15s' }}>
          <Settings size={14} color={c.t2} />
          <span style={{ fontSize: 12, fontWeight: 600, color: c.t2 }}>{(slippageBps / 100).toFixed(2)}%</span>
        </button>
      </div>

      {/* ── Sell panel ── */}
      <div style={{ background: c.surf, border: `1px solid ${c.bdr}`, borderRadius: 16, overflow: 'visible', marginBottom: 2 }}>
        <div style={{ padding: '16px 16px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: c.t2 }}>Sell</span>
            {(isConnected || isCircleUser) && addrShort && <span style={{ fontSize: 12, color: c.t3, display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: isCircleUser ? '#00C853' : c.blue, display: 'inline-block' }} />{addrShort}{isCircleUser && <span style={{ fontSize: 10, color: '#00C853', fontWeight: 600, marginLeft: 2 }}>Circle</span>}</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="text" inputMode="decimal" placeholder="0" value={amountIn}
              onChange={e => { const v = e.target.value.replace(/[^0-9.]/g, ''); if (v === '' || /^\d*\.?\d*$/.test(v)) { setAmountIn(v); setReviewed(null); setPhase('idle') } }}
              disabled={phase === 'swapping'}
              style={{ flex: 1, fontSize: 36, fontWeight: 700, color: c.text, border: 'none', outline: 'none', background: 'transparent', fontFamily: 'var(--nan-mono)', minWidth: 0, fontVariantNumeric: 'tabular-nums' }} />
            <TokenPill token={tokenIn} onClick={() => setShowSellModal(true)} c={c} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
            <span style={{ fontSize: 13, color: c.t3 }}>{amountIn && parseFloat(amountIn) > 0 ? `$${parseFloat(amountIn).toFixed(2)}` : '$0.00'}</span>
            {(isConnected || isCircleUser) && <span style={{ fontSize: 12, color: c.t3 }}>Balance: {balIn}</span>}
          </div>
          {/* % chips */}
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            {([['20%', 20], ['50%', 50], ['MAX', 'max']] as [string, number | 'max'][]).map(([label, pct]) => (
              <button key={label}
                onClick={() => applyPct(pct)}
                style={{ flex: 1, padding: '7px 0', border: `1px solid ${c.bdr2}`, borderRadius: 8, background: c.surf2, color: c.t2, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--nan-font)', transition: 'all 0.12s', WebkitTapHighlightColor: 'transparent' }}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Flip ── */}
      <div style={{ display: 'flex', justifyContent: 'center', margin: '-1px 0', zIndex: 2, position: 'relative' }}>
        <button onClick={flipTokens} style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${c.bdr2}`, background: c.surf2, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.15s', boxShadow: c.isDark ? '0 2px 8px rgba(0,0,0,0.4)' : '0 2px 8px rgba(0,0,0,0.08)' }}>
          <ArrowDown size={15} color={c.t2} />
        </button>
      </div>

      {/* ── Buy panel ── */}
      <div style={{ background: c.surf, border: `1px solid ${c.bdr}`, borderRadius: 16, overflow: 'hidden', marginTop: 2, marginBottom: 10 }}>
        <div style={{ padding: '16px 16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: c.t2 }}>Buy</span>
            {(isConnected || isCircleUser) && addrShort && <span style={{ fontSize: 12, color: c.t3, display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: isCircleUser ? '#00C853' : c.blue, display: 'inline-block' }} />{addrShort}{isCircleUser && <span style={{ fontSize: 10, color: '#00C853', fontWeight: 600, marginLeft: 2 }}>Circle</span>}</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, fontSize: 36, fontWeight: 700, color: estimatedOut ? c.green : c.t3, fontFamily: 'var(--nan-mono)', minWidth: 0, fontVariantNumeric: 'tabular-nums' }}>
              {phase === 'estimating' ? <span className="nan-skel" style={{ display: 'inline-block', width: 80, height: 36, borderRadius: 8 }} /> : estimatedOut ? estimatedOut.amount : '0'}
            </div>
            <TokenPill token={tokenOut} onClick={() => setShowBuyModal(true)} c={c} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
            <span style={{ fontSize: 13, color: c.t3 }}>
              {estimatedOut && parseFloat(estimatedOut.amount) > 0
                ? `~$${parseFloat(estimatedOut.amount).toFixed(2)}`
                : '$0.00'}
            </span>
            {(isConnected || isCircleUser) && <span style={{ fontSize: 12, color: c.t3 }}>Balance: {balOut}</span>}
          </div>
        </div>
      </div>

      {/* ── Warnings ── */}
      {(sameToken || arcNoPair || arcUnsupportedPair) && (
        <div className="nan-warn-box" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <AlertCircle size={14} />
          <span>
            {arcNoPair ? 'USDC and NATIVE are the same asset on Arc.'
              : sameToken ? 'Choose different tokens to swap.'
              : `${TOKEN_META[tokenIn]?.arcUnsupported ? tokenIn : tokenOut} is not available on Arc Testnet. Bridge to another chain to trade it.`}
          </span>
        </div>
      )}

      {/* ── Quote details ── */}
      {reviewed && phase === 'reviewed' && (
        <div className="nan-card" style={{ marginBottom: 10 }}>
          <div className="nan-card-inner">
            {([
              ['Estimated output', `${estimatedOut?.amount ?? '—'} ${estimatedOut?.token ?? tokenOut}`],
              ['Slippage tolerance', `${(reviewed.slippageBps / 100).toFixed(2)}%`],
              [`NAN fee (${bpsToPercent(SWAP_FEE_BPS)})`, `${swapFee(parseFloat(reviewed.amountIn) || 0).toFixed(4)} ${reviewed.tokenIn}`],
              ...(reviewed.estimate.fees?.map(f => [`${f.type} fee`, `${f.amount} ${f.token}`]) ?? []),
            ] as [string, string][]).map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: `1px solid ${c.bdr}` }}>
                <span style={{ fontSize: 12, color: c.t2 }}>{label}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: c.text }}>{value}</span>
              </div>
            ))}
            <div style={{ paddingTop: 8, fontSize: 11, color: c.t3 }}>Routed via LiFi aggregator. Amounts may vary at execution.</div>
          </div>
        </div>
      )}

      {/* ── Error ── */}
      {phase === 'error' && errMsg && (
        <div className="nan-error-box" style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
          <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} /><span>{errMsg}</span>
        </div>
      )}

      {/* ── CTA ── */}
      {phase === 'reviewed' ? (
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={clearQuote} className="nan-btn nan-btn-ghost" style={{ flex: 1, height: 54, borderRadius: 14, gap: 6 }}><RefreshCw size={14} /> New quote</button>
          <button onClick={() => void executeSwap()} className="nan-btn nan-btn-primary" style={{ flex: 2, height: 54, borderRadius: 14 }}>
            Swap {reviewed?.amountIn} {reviewed?.tokenIn} → {reviewed?.tokenOut}
          </button>
        </div>
      ) : (
        <button onClick={() => void reviewSwap()} disabled={!canReview || phase === 'estimating' || phase === 'swapping'}
          className="nan-btn nan-btn-full"
          style={{ height: 54, borderRadius: 14, background: canReview ? c.blue : c.surf2, color: canReview ? '#fff' : c.t3, border: `1px solid ${canReview ? c.blue : c.bdr}`, fontSize: 15, fontWeight: 700, cursor: canReview ? 'pointer' : 'not-allowed', transition: 'all 0.15s' }}>
          {phase === 'estimating' ? <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><span className="nan-spinner" />Getting quote…</span>
            : phase === 'swapping' ? <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><span className="nan-spinner" />Swapping…</span>
            : !isConnected && !isCircleUser ? 'Connect wallet to swap'
            : !amountIn || parseFloat(amountIn) === 0 ? 'Enter an amount'
            : arcUnsupportedPair ? 'Token not available on Arc Testnet'
            : invalid ? 'Select different tokens'
            : 'Get quote'}
        </button>
      )}

      <div style={{ marginTop: 14, fontSize: 11, color: c.t3, textAlign: 'center' }}>Powered by Circle App Kit · Routed via LiFi</div>

      {/* ── Modals ── */}
      {showSellModal && <TokenModal current={tokenIn} exclude={tokenOut} onSelect={t => { setTokenIn(t); setReviewed(null); setPhase('idle') }} onClose={() => setShowSellModal(false)} c={c} />}
      {showBuyModal  && <TokenModal current={tokenOut} exclude={tokenIn} onSelect={t => { setTokenOut(t); setReviewed(null); setPhase('idle') }} onClose={() => setShowBuyModal(false)} c={c} />}
      {showSlippage  && <SlippagePanel slippageBps={slippageBps} onChange={setSlippageBps} onClose={() => setShowSlippage(false)} c={c} />}
    </div>
  )
}
