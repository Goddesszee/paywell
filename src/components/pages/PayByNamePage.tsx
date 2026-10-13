/**
 * PayByNamePage — public pay-by-NAN-name page.
 *
 * URL: nanarc.xyz/?nanpay=alice  (or ?nanpay=@alice)
 *
 * Flow:
 *  1. Resolve the NAN handle → wallet address via NANNameRegistry (read-only, no account needed)
 *  2. Show branded merchant card with amount input
 *  3. Payer chooses: Connect Wallet (instant USDC on Arc) OR Buy with Card (Circle onramp)
 *  4. No NAN account required on either side of the transaction
 *
 * This is additive — it does not modify PaymentRequestPayPage or any other page.
 */
import React, { useState, useEffect, useCallback } from 'react'
import {
  CreditCard, Wallet, ArrowUpRight, AlertCircle,
  CheckCircle2, ExternalLink, Copy, Check, Loader2,
  Smartphone, AtSign,
} from 'lucide-react'
import {
  useWriteContract, useWaitForTransactionReceipt,
  useAccount, useChainId, useSwitchChain,
} from 'wagmi'
import { erc20Abi, isAddress } from 'viem'
import { ConnectKitButton } from 'connectkit'
import { QRCodeSVG } from 'qrcode.react'
import { toast } from 'sonner'
import { NanLogo } from '../NanLogo'
import { createPublicClient, http } from 'viem'
import { usePublicPage } from '../../hooks/usePublicPage'

// ── Constants ─────────────────────────────────────────────────────────────────
const F    = "'Inter', -apple-system, sans-serif"
const MONO = "'JetBrains Mono', Menlo, monospace"
const BLUE = '#0866F5'
const ARC_ID = 5042
const USDC_ADDRESS  = '0x3600000000000000000000000000000000000000' as `0x${string}`
const USDC_DECIMALS = 6
const ARC_RPC = 'https://rpc.mainnet.arc.io'
const NAME_REGISTRY = (import.meta.env.VITE_NAME_REGISTRY as string | undefined) ?? ''

// Minimal ABI — only what we need for public resolution
const RESOLVE_ABI = [
  { name: 'resolve',     type: 'function', stateMutability: 'view', inputs: [{ name: 'name', type: 'string' }], outputs: [{ name: '', type: 'address' }] },
  { name: 'primaryName', type: 'function', stateMutability: 'view', inputs: [{ name: 'addr', type: 'address' }], outputs: [{ name: '', type: 'string'  }] },
] as const

const ARC_CHAIN = {
  id: ARC_ID,
  name: 'Arc',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: [ARC_RPC] }, public: { http: [ARC_RPC] } },
  blockExplorers: { default: { name: 'Arc Explorer', url: 'https://explorer.arc.io' } },
} as const

let _publicClient: ReturnType<typeof createPublicClient> | null = null
function getPublicClient() {
  if (!_publicClient) _publicClient = createPublicClient({ transport: http(ARC_RPC), chain: ARC_CHAIN })
  return _publicClient
}

async function resolveNanName(handle: string): Promise<string | null> {
  if (!NAME_REGISTRY) return null
  const name = handle.startsWith('@') ? handle.slice(1) : handle
  if (!name) return null
  try {
    const addr = await getPublicClient().readContract({
      address: NAME_REGISTRY as `0x${string}`,
      abi: RESOLVE_ABI,
      functionName: 'resolve',
      args: [name],
    }) as string
    if (!addr || addr === '0x0000000000000000000000000000000000000000') return null
    return addr
  } catch { return null }
}

function fmt(n: number) {
  return n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── Onramp session (card payment) ─────────────────────────────────────────────
async function mintOnrampSession(destinationAddress: string, amount: number): Promise<{ widgetUrl?: string; error?: string }> {
  try {
    const res = await fetch('/api/onramp-session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ destinationAddress, amount: String(amount), appUserId: destinationAddress }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({})) as { message?: string }
      return { error: j.message ?? `HTTP ${res.status}` }
    }
    const d = await res.json() as { widgetUrl?: string }
    return d
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Network error' }
  }
}

// ── Crypto wallet pay panel ───────────────────────────────────────────────────
function WalletPayPanel({
  toAddress, amount, handle,
  onSuccess,
}: {
  toAddress: string; amount: number; handle: string
  onSuccess: (txHash: string) => void
}) {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()
  const [switching, setSwitching] = useState(false)

  const { writeContract, data: txHash, isPending, error: writeError, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })
  const onWrongChain = isConnected && chainId !== ARC_ID

  useEffect(() => {
    if (isSuccess && txHash) { onSuccess(txHash); toast.success('Payment sent!') }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess, txHash])

  const handlePay = () => {
    if (!isConnected || !address) return
    if (onWrongChain) { setSwitching(true); switchChain({ chainId: ARC_ID }, { onSettled: () => setSwitching(false) }); return }
    if (!isAddress(toAddress)) { toast.error('Invalid recipient address.'); return }
    writeContract({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [toAddress, BigInt(Math.round(amount * 10 ** USDC_DECIMALS))],
    })
  }

  const busy = switching || isPending || isConfirming
  const noAmount = amount <= 0

  if (!isConnected) return (
    <div style={{ textAlign: 'center', padding: '12px 0' }}>
      <p style={{ fontSize: 13, color: '#666', marginBottom: 14, lineHeight: 1.5 }}>
        Connect any EVM wallet to pay with USDC on Arc.
      </p>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <ConnectKitButton />
      </div>
      <p style={{ fontSize: 11, color: '#bbb', marginTop: 12 }}>MetaMask, Coinbase Wallet, WalletConnect &amp; more</p>
    </div>
  )

  return (
    <div>
      <div style={{ fontSize: 12, color: '#666', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10B981', display: 'inline-block' }} />
        {address!.slice(0, 10)}…{address!.slice(-6)}
      </div>
      {onWrongChain && (
        <div style={{ background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#b45309', marginBottom: 12 }}>
          Wrong network — click Pay to switch to Arc automatically.
        </div>
      )}
      {writeError && (
        <div style={{ background: '#fee8e8', border: '1px solid #f5c6c6', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#c0392b', marginBottom: 12 }}>
          {writeError.message?.includes('rejected') ? 'Rejected in wallet.' : 'Transaction failed. Please try again.'}
        </div>
      )}
      {noAmount && (
        <div style={{ fontSize: 12, color: '#aaa', textAlign: 'center', marginBottom: 10 }}>
          Enter an amount above to pay.
        </div>
      )}
      <button
        onClick={handlePay} disabled={busy || noAmount}
        style={{ width: '100%', height: 52, borderRadius: 14, background: (busy || noAmount) ? '#d0d0d0' : BLUE, border: 'none', color: '#fff', fontSize: 16, fontWeight: 700, cursor: (busy || noAmount) ? 'not-allowed' : 'pointer', fontFamily: F, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: (busy || noAmount) ? 'none' : '0 4px 20px rgba(8,102,245,0.30)', transition: 'all 0.15s' }}
      >
        {switching ? 'Switching to Arc…' : isPending ? 'Approve in wallet…' : isConfirming ? (
          <><span style={{ width: 18, height: 18, border: '2.5px solid rgba(255,255,255,0.35)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'nbspin 0.8s linear infinite' }} />Confirming…</>
        ) : onWrongChain ? (
          <><ArrowUpRight size={18} />Switch to Arc &amp; Pay</>
        ) : noAmount ? (
          <><ArrowUpRight size={18} />Enter amount above</>
        ) : (
          <><ArrowUpRight size={18} />Pay {fmt(amount)} USDC to @{handle}</>
        )}
      </button>
      {writeError && (
        <button onClick={() => reset()} style={{ marginTop: 8, width: '100%', height: 40, borderRadius: 12, background: 'none', border: '1px solid #ddd', color: '#555', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: F }}>
          Try again
        </button>
      )}
    </div>
  )
}

// ── Card payment (onramp) panel ───────────────────────────────────────────────
type OnrampState = 'idle' | 'loading' | 'widget' | 'success' | 'error'

function CardPayPanel({ toAddress, amount }: { toAddress: string; amount: number }) {
  const [state, setState] = useState<OnrampState>('idle')
  const [widgetUrl, setWidgetUrl] = useState('')
  const [widgetReady, setWidgetReady] = useState(false)
  const [error, setError] = useState('')

  const start = useCallback(async () => {
    setState('loading')
    setError('')
    const { widgetUrl: url, error: err } = await mintOnrampSession(toAddress, amount)
    if (err || !url) { setError(err ?? 'Could not start onramp'); setState('error'); return }
    setWidgetUrl(url)
    setState('widget')
  }, [toAddress, amount])

  useEffect(() => {
    if (state !== 'widget') return
    function onMsg(evt: MessageEvent) {
      try {
        const msg = evt.data as { event?: string; code?: string }
        if (!msg?.event) return
        if (msg.event === 'INITIALIZATION_SUCCESS') setWidgetReady(true)
        if (msg.event === 'DEPOSIT_SUBMITTED' || msg.event === 'DEPOSIT_SETTLED') setState('success')
        if (msg.event === 'DEPOSIT_NOT_COMPLETED' && msg.code === 'CANCELED_BY_CUSTOMER') setState('idle')
      } catch { /* ignore */ }
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [state])

  if (state === 'success') return (
    <div style={{ textAlign: 'center', padding: '20px 0' }}>
      <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
        <CheckCircle2 size={28} color="#10B981" />
      </div>
      <div style={{ fontSize: 18, fontWeight: 800, color: '#111', marginBottom: 6 }}>Purchase submitted!</div>
      <div style={{ fontSize: 13, color: '#666', lineHeight: 1.6 }}>USDC will arrive in the recipient's wallet once settled by Circle.</div>
      <button onClick={() => setState('idle')} style={{ marginTop: 20, padding: '11px 28px', borderRadius: 12, background: BLUE, border: 'none', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: F }}>
        Done
      </button>
    </div>
  )

  if (state === 'widget') return (
    <div style={{ position: 'relative' }}>
      {!widgetReady && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#fff', zIndex: 5, gap: 12, borderRadius: 14 }}>
          <Loader2 size={28} color={BLUE} style={{ animation: 'nbspin 1s linear infinite' }} />
          <div style={{ fontSize: 13, color: '#555' }}>Loading Circle Onramp…</div>
        </div>
      )}
      <iframe
        src={widgetUrl}
        title="Circle Onramp — buy USDC with card"
        onLoad={() => setWidgetReady(true)}
        allow="camera; microphone; payment; clipboard-write"
        referrerPolicy="strict-origin-when-cross-origin"
        style={{ width: '100%', height: 640, border: 'none', borderRadius: 14, display: 'block' }}
      />
      <button onClick={() => setState('idle')} style={{ marginTop: 10, width: '100%', padding: '10px', borderRadius: 12, background: 'none', border: '1px solid #e0e0e0', color: '#555', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: F }}>
        ← Back
      </button>
    </div>
  )

  return (
    <div>
      {state === 'error' && (
        <div style={{ background: '#fee8e8', border: '1px solid #f5c6c6', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#c0392b', marginBottom: 14 }}>
          {error}
        </div>
      )}
      <p style={{ fontSize: 13, color: '#555', lineHeight: 1.6, marginBottom: 16 }}>
        Pay with your debit or credit card. Circle will convert your payment to USDC and send it directly to <strong>@{toAddress.slice(0, 8)}…</strong>'s wallet. KYC handled by Circle.
      </p>
      {amount <= 0 && (
        <div style={{ fontSize: 12, color: '#aaa', textAlign: 'center', marginBottom: 10 }}>
          Enter an amount above to continue.
        </div>
      )}
      <button
        onClick={() => { void start() }}
        disabled={state === 'loading' || amount <= 0}
        style={{ width: '100%', height: 52, borderRadius: 14, background: (state === 'loading' || amount <= 0) ? '#d0d0d0' : '#111', border: 'none', color: '#fff', fontSize: 15, fontWeight: 700, cursor: (state === 'loading' || amount <= 0) ? 'not-allowed' : 'pointer', fontFamily: F, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, transition: 'all 0.15s' }}
      >
        {state === 'loading' ? (
          <><Loader2 size={18} style={{ animation: 'nbspin 1s linear infinite' }} />Opening checkout…</>
        ) : amount <= 0 ? (
          <><CreditCard size={18} />Enter amount above</>
        ) : (
          <><CreditCard size={18} />Pay {fmt(amount)} with Card</>
        )}
      </button>
      <p style={{ fontSize: 10, color: '#aaa', marginTop: 10, textAlign: 'center', lineHeight: 1.5 }}>
        Powered by Circle · Card &amp; bank transfer · Fees shown at checkout
      </p>
    </div>
  )
}

// ── QR tab ────────────────────────────────────────────────────────────────────
function QrTab({ toAddress, amount }: { toAddress: string; amount: number }) {
  const hasAmount = amount > 0
  const amountHex = hasAmount ? `0x${(BigInt(Math.round(amount * 10 ** USDC_DECIMALS))).toString(16)}` : ''
  const qrValue = hasAmount
    ? `ethereum:${USDC_ADDRESS}/transfer?address=${toAddress}&uint256=${amountHex}`
    : toAddress
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '8px 0' }}>
      <div style={{ background: '#fff', border: '1px solid #e8e8e8', borderRadius: 16, padding: 14 }}>
        <QRCodeSVG value={qrValue} size={180} bgColor="#ffffff" fgColor="#111111" level="M" />
      </div>
      <div style={{ textAlign: 'center', fontSize: 12, color: '#666', lineHeight: 1.5 }}>
        {hasAmount
          ? <>Scan with MetaMask, Trust Wallet, or any EVM wallet.<br />Tap <strong>Scan</strong> — the amount pre-fills.</>
          : <>Scan to load the recipient address in your wallet.<br />Enter an amount above to pre-fill the payment.</>}
      </div>
    </div>
  )
}

// ── Copy address panel ────────────────────────────────────────────────────────
function CopyAddressPanel({ toAddress, amount, handle }: { toAddress: string; amount: number; handle: string }) {
  const [copiedAddr, setCopiedAddr] = useState(false)
  const [copiedAmt, setCopiedAmt]   = useState(false)

  const copy = (text: string, which: 'addr' | 'amt') => {
    void navigator.clipboard.writeText(text)
    if (which === 'addr') { setCopiedAddr(true); setTimeout(() => setCopiedAddr(false), 2000) }
    else                  { setCopiedAmt(true);  setTimeout(() => setCopiedAmt(false),  2000) }
    toast.success('Copied!')
  }

  const steps = [
    { n: '1', text: 'Open your wallet app or exchange' },
    { n: '2', text: amount > 0 ? `Send exactly ${amount.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC on Arc` : 'Enter an amount above, then send that exact amount in USDC on Arc' },
    { n: '3', text: 'Paste the address below as the recipient' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ background: '#f7f8fa', borderRadius: 12, padding: '14px 16px' }}>
        {steps.map((s, i) => (
          <div key={s.n} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: i < steps.length - 1 ? 10 : 0 }}>
            <span style={{ width: 20, height: 20, borderRadius: '50%', background: BLUE, color: '#fff', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{s.n}</span>
            <span style={{ fontSize: 13, color: '#444', lineHeight: 1.4 }}>{s.text}</span>
          </div>
        ))}
      </div>

      {amount > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Amount</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, background: '#f7f8fa', border: '1px solid #e8e8e8', borderRadius: 10, padding: '10px 14px', fontFamily: MONO, fontSize: 15, fontWeight: 700, color: '#111' }}>
              {amount.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC
            </div>
            <button onClick={() => copy(String(amount), 'amt')}
              style={{ width: 40, height: 40, borderRadius: 10, background: copiedAmt ? '#e8f8ef' : '#f7f8fa', border: `1px solid ${copiedAmt ? '#b6e8cb' : '#e8e8e8'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0 }}>
              {copiedAmt ? <Check size={15} color="#1a7a42" /> : <Copy size={15} color="#666" />}
            </button>
          </div>
        </div>
      )}

      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Recipient address (USDC · Arc)</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, background: '#f7f8fa', border: '1px solid #e8e8e8', borderRadius: 10, padding: '10px 14px', fontFamily: MONO, fontSize: 12, color: '#111', wordBreak: 'break-all', lineHeight: 1.5 }}>
            {toAddress}
          </div>
          <button onClick={() => copy(toAddress, 'addr')}
            style={{ width: 40, height: 40, borderRadius: 10, background: copiedAddr ? '#e8f8ef' : '#f7f8fa', border: `1px solid ${copiedAddr ? '#b6e8cb' : '#e8e8e8'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0 }}>
            {copiedAddr ? <Check size={15} color="#1a7a42" /> : <Copy size={15} color="#666" />}
          </button>
        </div>
      </div>

      <div style={{ fontSize: 11, color: '#bbb', textAlign: 'center', paddingTop: 4 }}>
        Paying @{handle} · USDC on Arc
      </div>
    </div>
  )
}

// ── Amount editor ─────────────────────────────────────────────────────────────
const QUICK = [10, 25, 50, 100]

function AmountPicker({ value, onChange, fixed }: { value: number; onChange: (n: number) => void; fixed: boolean }) {
  const [raw, setRaw] = useState(value > 0 ? String(value) : '')
  if (fixed) return (
    <div style={{ textAlign: 'center', padding: '16px 0 8px' }}>
      <div style={{ fontSize: 11, color: '#888', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Amount</div>
      <div style={{ fontSize: 44, fontWeight: 900, color: '#111', fontFamily: MONO, letterSpacing: '-0.04em', lineHeight: 1 }}>{fmt(value)}</div>
      <div style={{ fontSize: 14, color: '#666', fontWeight: 600, marginTop: 4 }}>USDC</div>
    </div>
  )
  return (
    <div style={{ padding: '14px 0 8px' }}>
      <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Enter amount</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', background: '#f7f8fa', border: '1.5px solid #e8e8e8', borderRadius: 12, marginBottom: 10 }}>
        <span style={{ fontSize: 26, fontWeight: 800, color: '#aaa' }}>$</span>
        <input
          type="number" min={0} value={raw} placeholder="0.00"
          onChange={e => { setRaw(e.target.value); const n = parseFloat(e.target.value); if (!isNaN(n) && n > 0) onChange(n) }}
          style={{ flex: 1, border: 'none', outline: 'none', fontSize: 32, fontWeight: 800, color: '#111', background: 'transparent', fontFamily: MONO, minWidth: 0, letterSpacing: '-0.02em' }}
        />
        <span style={{ fontSize: 13, fontWeight: 700, color: '#888', flexShrink: 0 }}>USDC</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 7 }}>
        {QUICK.map(a => (
          <button key={a} onClick={() => { setRaw(String(a)); onChange(a) }}
            style={{ height: 38, borderRadius: 9, background: value === a ? BLUE : '#f7f8fa', color: value === a ? '#fff' : '#555', border: `1px solid ${value === a ? BLUE : '#e8e8e8'}`, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: F, transition: 'all 0.12s' }}>
            ${a}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Main public page ──────────────────────────────────────────────────────────
type PayMethod = 'wallet' | 'card' | 'qr' | 'copy'
type ResolveState = 'loading' | 'found' | 'notfound' | 'noregistry'

// Derive URL amount once at module parse time — avoids setState-in-effect
function getUrlAmount(): { amount: number; fixed: boolean } {
  try {
    const p = new URLSearchParams(window.location.search)
    const a = parseFloat(p.get('amount') ?? '0')
    if (a > 0) return { amount: a, fixed: true }
  } catch { /* ignore */ }
  return { amount: 0, fixed: false }
}

// Derive initial resolve state synchronously — avoids setState-in-effect for
// the trivial cases (no handle, no registry) while still letting the async
// path set 'found' / 'notfound' via the effect below.
function getInitialResolveState(cleanHandle: string): ResolveState {
  if (!cleanHandle) return 'notfound'
  if (!NAME_REGISTRY) return 'noregistry'
  return 'loading'
}

export function PayByNamePage({ handle }: { handle: string }) {
  usePublicPage()

  const cleanHandle = handle.replace(/^@/, '')

  const [resolveState, setResolveState] = useState<ResolveState>(() => getInitialResolveState(cleanHandle))
  const [toAddress, setToAddress] = useState('')
  const [amount, setAmount]     = useState(() => getUrlAmount().amount)
  const [fixedAmount]           = useState(() => getUrlAmount().fixed)
  const [method, setMethod]     = useState<PayMethod>('wallet')
  const [successHash, setSuccessHash] = useState<string | null>(null)

  // Resolve handle (only runs when NAME_REGISTRY is set and cleanHandle is non-empty)
  useEffect(() => {
    if (resolveState !== 'loading') return
    void (async () => {
      const addr = await resolveNanName(cleanHandle)
      if (addr) { setToAddress(addr); setResolveState('found') }
      else setResolveState('notfound')
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleanHandle])

  // ── Loading ────────────────────────────────────────────────────────────────
  if (resolveState === 'loading') return (
    <Shell>
      <div style={{ textAlign: 'center', padding: '48px 0' }}>
        <Loader2 size={36} color={BLUE} style={{ animation: 'nbspin 1s linear infinite', marginBottom: 14 }} />
        <div style={{ fontSize: 15, color: '#555' }}>Resolving @{cleanHandle}…</div>
      </div>
    </Shell>
  )

  // ── Not found ──────────────────────────────────────────────────────────────
  if (resolveState === 'notfound' || resolveState === 'noregistry') return (
    <Shell>
      <div style={{ textAlign: 'center', padding: '32px 0' }}>
        <div style={{ width: 60, height: 60, borderRadius: '50%', background: '#fee8e8', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <AlertCircle size={26} color="#c0392b" />
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: '#111', marginBottom: 8 }}>@{cleanHandle} not found</h2>
        <p style={{ fontSize: 14, color: '#666', lineHeight: 1.6 }}>
          {resolveState === 'noregistry'
            ? 'The NAN Name Registry is not configured on this deployment.'
            : 'This NAN name doesn\'t exist or hasn\'t been registered yet.'}
        </p>
        <a href="https://nanarc.xyz" style={{ display: 'inline-block', marginTop: 20, padding: '11px 24px', borderRadius: 12, background: BLUE, color: '#fff', fontSize: 14, fontWeight: 700, textDecoration: 'none', fontFamily: F }}>
          Open NAN
        </a>
      </div>
    </Shell>
  )

  // ── Success ────────────────────────────────────────────────────────────────
  if (successHash) return (
    <Shell>
      <div style={{ textAlign: 'center', padding: '28px 0' }}>
        <div style={{ width: 76, height: 76, borderRadius: '50%', background: 'rgba(16,185,129,0.10)', border: '2px solid rgba(16,185,129,0.20)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <CheckCircle2 size={34} color="#10B981" />
        </div>
        <h2 style={{ fontSize: 24, fontWeight: 800, color: '#111', letterSpacing: '-0.03em', marginBottom: 8 }}>Payment sent!</h2>
        <p style={{ fontSize: 14, color: '#555', lineHeight: 1.6, marginBottom: 20 }}>
          You sent <strong>{fmt(amount)} USDC</strong> to <strong>@{cleanHandle}</strong>.
        </p>
        <a
          href={`https://explorer.arc.io/tx/${successHash}`}
          target="_blank" rel="noreferrer"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: BLUE, fontWeight: 600, textDecoration: 'none', background: 'rgba(8,102,245,0.06)', padding: '8px 16px', borderRadius: 10 }}
        >
          <ExternalLink size={13} /> View on explorer
        </a>
        <div style={{ marginTop: 28 }}>
          <a href="https://nanarc.xyz" style={{ display: 'inline-block', padding: '11px 24px', borderRadius: 12, background: '#f7f8fa', border: '1px solid #e0e0e0', color: '#555', fontSize: 13, fontWeight: 600, textDecoration: 'none', fontFamily: F }}>
            Get your own NAN name
          </a>
        </div>
      </div>
    </Shell>
  )

  // ── Main pay page ──────────────────────────────────────────────────────────
  return (
    <Shell>
      {/* Merchant header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20, paddingBottom: 18, borderBottom: '1px solid #f0f0f0' }}>
        <div style={{ width: 54, height: 54, borderRadius: 16, background: `linear-gradient(135deg, ${BLUE} 0%, #7B61FF 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 4px 14px rgba(8,102,245,0.30)' }}>
          <AtSign size={24} color="#fff" strokeWidth={2.2} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#111', letterSpacing: '-0.03em', lineHeight: 1.1 }}>@{cleanHandle}</div>
          <div style={{ fontSize: 12, color: '#888', marginTop: 3 }}>NAN Pay · USDC on Arc</div>
        </div>
      </div>

      {/* Amount */}
      <AmountPicker value={amount} onChange={setAmount} fixed={fixedAmount} />

      {/* Payment method tabs */}
      <div style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', gap: 5, background: '#f4f4f4', borderRadius: 13, padding: 4, marginBottom: 20 }}>
          {([
            { id: 'wallet', icon: <Wallet size={15} />,     label: 'Wallet' },
            { id: 'card',   icon: <CreditCard size={15} />, label: 'Card' },
            { id: 'qr',     icon: <Smartphone size={15} />, label: 'Scan QR' },
            { id: 'copy',   icon: <Copy size={15} />,       label: 'Copy' },
          ] as { id: PayMethod; icon: React.ReactNode; label: string }[]).map(t => (
            <button
              key={t.id} onClick={() => setMethod(t.id)}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '10px 4px', borderRadius: 10, cursor: 'pointer', transition: 'all 0.12s', background: method === t.id ? '#fff' : 'transparent', border: method === t.id ? '1px solid #e0e0e0' : '1px solid transparent', boxShadow: method === t.id ? '0 2px 8px rgba(0,0,0,0.06)' : 'none', color: method === t.id ? '#111' : '#999' }}
            >
              <div style={{ color: method === t.id ? BLUE : '#bbb', transition: 'color 0.12s' }}>{t.icon}</div>
              <span style={{ fontSize: 10, fontWeight: method === t.id ? 700 : 500, fontFamily: F, whiteSpace: 'nowrap' }}>{t.label}</span>
            </button>
          ))}
        </div>

        {/* Payment panels */}
        {method === 'wallet' ? (
          <WalletPayPanel toAddress={toAddress} amount={amount} handle={cleanHandle} onSuccess={setSuccessHash} />
        ) : method === 'card' ? (
          <CardPayPanel toAddress={toAddress} amount={amount} />
        ) : method === 'qr' ? (
          <QrTab toAddress={toAddress} amount={amount} />
        ) : (
          <CopyAddressPanel toAddress={toAddress} amount={amount} handle={cleanHandle} />
        )}
      </div>

      {/* "No crypto needed" badge for card method */}
      {method === 'card' && (
        <div style={{ marginTop: 14, padding: '10px 14px', background: 'rgba(8,102,245,0.04)', border: '1px solid rgba(8,102,245,0.12)', borderRadius: 10, fontSize: 12, color: '#555', lineHeight: 1.5 }}>
          <strong style={{ color: BLUE }}>No crypto wallet needed.</strong> Pay directly with your debit or credit card — Circle converts your payment to USDC automatically.
        </div>
      )}

      <style>{`@keyframes nbspin { to { transform: rotate(360deg); } }`}</style>
    </Shell>
  )
}

// ── Shared outer shell ─────────────────────────────────────────────────────────
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100dvh', background: '#f4f6fa', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', padding: '28px 16px 56px', fontFamily: F, overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch' }}>
      {/* Card */}
      <div style={{ background: '#fff', borderRadius: 24, border: '1px solid #e8e8e8', width: '100%', maxWidth: 460, boxShadow: '0 8px 40px rgba(0,0,0,0.09)' }}>
        {/* Header bar */}
        <div style={{ background: '#0057FF', padding: '16px 22px', borderRadius: '24px 24px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <NanLogo height={20} />
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.70)', fontFamily: MONO, letterSpacing: '0.04em' }}>Arc · USDC</span>
        </div>
        {/* Body */}
        <div style={{ padding: '22px 24px 28px' }}>
          {children}
        </div>
      </div>
      {/* Footer */}
      <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 7, opacity: 0.38 }}>
        <NanLogo height={13} />
        <span style={{ fontSize: 11, color: '#555' }}>Powered by NAN</span>
      </div>
    </div>
  )
}
