/**
 * PaymentRequestPage — generate and pay USDC payment request links.
 *
 * Two modes:
 *   1. Create — enter amount + memo → generates shareable ?to=&amount=&memo= URL
 *   2. Pay    — when ?to=&amount=&memo= params are present, shows prefilled pay UI
 *
 * Paying uses the same send logic as WalletPage — all four login paths supported.
 */

import { useState, useEffect, useRef } from 'react'
import { useReadContract, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi'
import { erc20Abi, parseUnits, formatUnits } from 'viem'
import { Link, Copy, CheckCircle, XCircle, Loader2, ExternalLink, QrCode } from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '../../store/appStore'
import { useNanWallet } from '../../hooks/useNanWallet'
import { sendFromPasskeyWallet } from '../CirclePasskeyLogin'

const USDC_ADDRESS = '0x3600000000000000000000000000000000000000' as const
const ARC_TESTNET_ID = 5042002

type PageMode = 'create' | 'pay'
type TxStatus = 'idle' | 'signing' | 'confirming' | 'success' | 'error'

function parsePayParams() {
  const p = new URLSearchParams(window.location.search)
  const to = p.get('to')
  const amount = p.get('amount')
  const memo = p.get('memo')
  if (to && amount) return { to, amount, memo: memo ?? '' }
  return null
}

export function PaymentRequestPage() {
  const nan = useNanWallet()
  const auth = useAppStore((s) => s.auth)
  const addActivity = useAppStore((s) => s.addActivity)
  const { switchChainAsync } = useSwitchChain()

  const clientKey = (import.meta.env.VITE_CLIENT_KEY as string | undefined)?.trim()

  // Detect URL params on mount
  const prefilled = parsePayParams()
  const [mode, setMode] = useState<PageMode>(prefilled ? 'pay' : 'create')

  // Create mode fields
  const [reqAmount, setReqAmount] = useState('')
  const [reqMemo, setReqMemo] = useState('')
  const [generatedLink, setGeneratedLink] = useState('')
  const [copied, setCopied] = useState(false)

  // Pay mode fields
  const [payTo, setPayTo] = useState(prefilled?.to ?? '')
  const [payAmount, setPayAmount] = useState(prefilled?.amount ?? '')
  const [payMemo] = useState(prefilled?.memo ?? '')
  const [txStatus, setTxStatus] = useState<TxStatus>('idle')
  const [txError, setTxError] = useState('')
  const [txHash, setTxHash] = useState('')

  // USDC balance
  const { data: balanceRaw } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [nan.address as `0x${string}`],
    chainId: ARC_TESTNET_ID,
    query: { enabled: !!nan.address },
  })
  const balanceFmt = balanceRaw !== undefined ? parseFloat(formatUnits(balanceRaw, 6)).toFixed(2) : '—'

  // wagmi write
  const { writeContractAsync } = useWriteContract()
  const [pendingHash, setPendingHash] = useState<`0x${string}` | undefined>()
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: pendingHash })

  // Derive pay status from wagmi receipt — no setState mirrors inside effects
  const effectiveTxStatus: TxStatus = pendingHash
    ? (isConfirmed ? 'success' : isConfirming ? 'confirming' : txStatus)
    : txStatus
  const effectiveTxHash = pendingHash && isConfirmed ? pendingHash : txHash

  // Fire external side-effects (activity log, toast) exactly once per confirmed hash
  const prFiredRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (isConfirmed && pendingHash && prFiredRef.current !== pendingHash) {
      prFiredRef.current = pendingHash
      addActivity({ type: 'sent', description: `Payment${payMemo ? ` "${payMemo}"` : ''} to ${payTo.slice(0,6)}…${payTo.slice(-4)}`, amount: parseFloat(payAmount), sign: '-', status: 'confirmed', txHash: pendingHash, chain: 'Arc Testnet' })
      toast.success('Payment sent!')
    }
  }, [isConfirmed, pendingHash, payMemo, payTo, payAmount, addActivity])

  // ── Generate link ──────────────────────────────────────────────────────────
  function generateLink() {
    if (!nan.address) { toast.error('Connect your wallet to create a payment request'); return }
    if (!reqAmount || parseFloat(reqAmount) <= 0) { toast.error('Enter a request amount'); return }
    const params = new URLSearchParams({ to: nan.address, amount: reqAmount })
    if (reqMemo) params.set('memo', reqMemo)
    setGeneratedLink(`${window.location.origin}${window.location.pathname}?${params.toString()}`)
  }

  function copyLink() {
    void navigator.clipboard.writeText(generatedLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success('Link copied!')
  }

  // ── Pay ────────────────────────────────────────────────────────────────────
  async function handlePay() {
    if (!payTo || !/^0x[0-9a-fA-F]{40}$/.test(payTo)) { toast.error('Invalid recipient address'); return }
    if (!payAmount || parseFloat(payAmount) <= 0) { toast.error('Enter a valid amount'); return }
    if (!nan.isConnected) { toast.error('Connect your wallet first'); return }

    setTxStatus('signing')
    setTxError('')
    setTxHash('')

    try {
      if (nan.type === 'wagmi') {
        if (nan.chainId !== ARC_TESTNET_ID) await switchChainAsync({ chainId: ARC_TESTNET_ID })
        const hash = await writeContractAsync({
          address: USDC_ADDRESS,
          abi: erc20Abi,
          functionName: 'transfer',
          args: [payTo as `0x${string}`, parseUnits(payAmount, 6)],
          chainId: ARC_TESTNET_ID,
        })
        setPendingHash(hash)
        setTxStatus('confirming')

      } else if (nan.type === 'passkey') {
        if (!clientKey) throw new Error('VITE_CLIENT_KEY not configured')
        const hash = await sendFromPasskeyWallet({ clientKey, to: payTo as `0x${string}`, amount: parseUnits(payAmount, 6) })
        setTxHash(hash)
        setTxStatus('success')
        addActivity({ type: 'sent', description: `Payment${payMemo ? ` "${payMemo}"` : ''} to ${payTo.slice(0,6)}…${payTo.slice(-4)}`, amount: parseFloat(payAmount), sign: '-', status: 'confirmed', txHash: hash, chain: 'Arc Testnet' })
        toast.success('Payment sent!')

      } else if (nan.type === 'ucw') {
        const res = await fetch('/api/wallet', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'create-transfer', userToken: nan.userToken, walletId: nan.walletId, destinationAddress: payTo, amount: payAmount, tokenAddress: USDC_ADDRESS, blockchain: 'ARC-TESTNET' }),
        })
        const data = await res.json() as { challengeId?: string; error?: string }
        if (!res.ok || data.error) throw new Error(data.error ?? 'Transfer failed')
        const { W3SSdk } = await import('@circle-fin/w3s-pw-web-sdk')
        const sdk = new W3SSdk()
        sdk.setAppSettings({ appId: import.meta.env.VITE_CIRCLE_APP_ID as string })
        if (auth?.encryptionKey) sdk.setAuthentication({ userToken: nan.userToken!, encryptionKey: auth.encryptionKey })
        setTxStatus('confirming')
        await new Promise<void>((resolve, reject) => sdk.execute(data.challengeId!, (err, res) => err || !res ? reject(new Error(err?.message ?? 'failed')) : resolve()))
        setTxStatus('success')
        addActivity({ type: 'sent', description: `Payment to ${payTo.slice(0,6)}…${payTo.slice(-4)}`, amount: parseFloat(payAmount), sign: '-', status: 'confirmed', chain: 'Arc Testnet' })
        toast.success('Payment submitted!')
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('rejected') || msg.includes('cancelled') || msg.includes('denied')) { toast.info('Cancelled'); setTxStatus('idle') }
      else { setTxError(msg); setTxStatus('error') }
    }
  }

  const busy = effectiveTxStatus === 'signing' || effectiveTxStatus === 'confirming'

  return (
    <div className="min-h-dvh bg-[var(--nan-bg)] flex flex-col items-center justify-start pt-6 pb-24 px-4">
      <div className="w-full max-w-md space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--nan-text)] tracking-tight">Payment Request</h1>
          <p className="text-sm text-[var(--nan-text2)] mt-1">Create or pay a USDC payment request</p>
        </div>

        {/* Mode tabs */}
        <div className="flex rounded-xl bg-[var(--nan-surface)] border border-[var(--nan-bdr)] p-1 gap-1">
          {(['create','pay'] as PageMode[]).map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); setTxStatus('idle'); setTxError('') }}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold capitalize transition-colors ${mode === m ? 'bg-[var(--nan-blue)] text-white' : 'text-[var(--nan-text2)]'}`}
            >
              {m === 'create' ? 'Create Request' : 'Pay Request'}
            </button>
          ))}
        </div>

        {/* Create mode */}
        {mode === 'create' && (
          <div className="rounded-2xl bg-[var(--nan-surface)] border border-[var(--nan-bdr)] p-5 space-y-4">
            <p className="text-xs text-[var(--nan-text3)]">
              Your address: <span className="font-mono text-[var(--nan-text2)]">{nan.address ? `${nan.address.slice(0,8)}…${nan.address.slice(-6)}` : 'Not connected'}</span>
            </p>

            <div className="space-y-1">
              <label className="text-xs text-[var(--nan-text3)] font-medium">Request amount (USDC)</label>
              <input
                type="number" min="0" step="0.01"
                value={reqAmount} onChange={(e) => setReqAmount(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-xl bg-[var(--nan-bg)] border border-[var(--nan-bdr)] text-[var(--nan-text)] px-3 py-2 text-sm tabular-nums focus:outline-none focus:border-[var(--nan-blue)]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-[var(--nan-text3)] font-medium">Memo (optional)</label>
              <input
                value={reqMemo} onChange={(e) => setReqMemo(e.target.value)}
                placeholder="Invoice #123, Coffee, etc."
                className="w-full rounded-xl bg-[var(--nan-bg)] border border-[var(--nan-bdr)] text-[var(--nan-text)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--nan-blue)]"
              />
            </div>

            <button
              onClick={generateLink}
              disabled={!reqAmount || !nan.isConnected}
              className="w-full py-3 rounded-xl bg-[var(--nan-blue)] text-white font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Link size={15} /> Generate Link
            </button>

            {generatedLink && (
              <div className="rounded-xl bg-[var(--nan-bg)] border border-[var(--nan-bdr)] p-3 space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--nan-text3)]">Payment link</p>
                <p className="text-xs font-mono text-[var(--nan-text2)] break-all">{generatedLink}</p>
                <button
                  onClick={copyLink}
                  className="inline-flex items-center gap-1.5 text-xs text-[var(--nan-blue)] hover:underline"
                >
                  {copied ? <><CheckCircle size={12} /> Copied!</> : <><Copy size={12} /> Copy link</>}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Pay mode */}
        {mode === 'pay' && (
          effectiveTxStatus === 'success' ? (
            <div className="rounded-2xl bg-[var(--nan-surface)] border border-[var(--nan-bdr)] p-6 text-center space-y-4">
              <CheckCircle size={40} className="mx-auto text-green-400" />
              <p className="font-semibold text-[var(--nan-text)]">Payment sent!</p>
              {effectiveTxHash && (
                <a href={`https://explorer.testnet.arc.io/tx/${effectiveTxHash}`} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-[var(--nan-blue)] hover:underline">
                  View on explorer <ExternalLink size={11} />
                </a>
              )}
              <button onClick={() => { setTxStatus('idle'); setPayTo(''); setPayAmount(''); setTxHash(''); setPendingHash(undefined) }}
                className="text-xs text-[var(--nan-text2)] hover:text-[var(--nan-text)]">Send another</button>
            </div>
          ) : (
            <div className="rounded-2xl bg-[var(--nan-surface)] border border-[var(--nan-bdr)] p-5 space-y-4">
              {!nan.isConnected && (
                <p className="text-sm text-[var(--nan-text2)] text-center">Connect your wallet to pay.</p>
              )}

              {nan.isConnected && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-widest text-[var(--nan-text3)]">Signing via</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--nan-bdr)] text-[var(--nan-text2)]">
                      {nan.type === 'wagmi' ? 'Browser Wallet' : nan.type === 'passkey' ? 'Passkey' : 'Circle UCW'}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-[var(--nan-text3)] font-medium">Recipient</label>
                    <input
                      value={payTo} onChange={(e) => setPayTo(e.target.value)}
                      placeholder="0x… wallet address" disabled={busy}
                      className="w-full rounded-xl bg-[var(--nan-bg)] border border-[var(--nan-bdr)] text-[var(--nan-text)] px-3 py-2 text-sm font-mono focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-[var(--nan-text3)] font-medium">Amount (USDC)</label>
                    <input
                      type="number" min="0" step="0.01"
                      value={payAmount} onChange={(e) => setPayAmount(e.target.value)}
                      placeholder="0.00" disabled={busy}
                      className="w-full rounded-xl bg-[var(--nan-bg)] border border-[var(--nan-bdr)] text-[var(--nan-text)] px-3 py-2 text-sm tabular-nums focus:outline-none"
                    />
                    <p className="text-[10px] text-[var(--nan-text3)]">Balance: {balanceFmt} USDC</p>
                  </div>

                  {payMemo && (
                    <div className="rounded-xl bg-[var(--nan-bg)] border border-[var(--nan-bdr)] px-3 py-2">
                      <p className="text-xs text-[var(--nan-text3)]">Memo: <span className="text-[var(--nan-text2)]">{payMemo}</span></p>
                    </div>
                  )}

                  {effectiveTxStatus === 'error' && txError && (
                    <div className="flex items-start gap-2 rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-400">
                      <XCircle size={14} className="mt-0.5 shrink-0" /><span>{txError}</span>
                    </div>
                  )}

                  {busy && (
                    <div className="flex items-center gap-2 text-xs text-[var(--nan-text2)]">
                      <Loader2 size={13} className="animate-spin" />
                      <span>{effectiveTxStatus === 'signing' ? 'Waiting for wallet…' : 'Confirming…'}</span>
                    </div>
                  )}

                  <button
                    onClick={() => void handlePay()}
                    disabled={busy || !payTo || !payAmount}
                    className="w-full py-3 rounded-xl bg-[var(--nan-blue)] text-white font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {busy ? <Loader2 size={15} className="animate-spin" /> : <QrCode size={15} />}
                    {busy ? (effectiveTxStatus === 'signing' ? 'Confirm in wallet…' : 'Processing…') : `Pay ${payAmount ? `${payAmount} USDC` : 'USDC'}`}
                  </button>
                </>
              )}
            </div>
          )
        )}
      </div>
    </div>
  )
}
