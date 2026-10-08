/**
 * WalletPage — wallet dashboard + USDC send for all four NAN login paths.
 *
 * Send strategy per wallet type:
 *   wagmi   → useWriteContract (ERC-20 transfer, Arc Testnet)
 *   passkey → sendFromPasskeyWallet (Circle Modular Wallet bundler, gasless)
 *   UCW     → POST /api/wallet { action: 'create-transfer' } → W3S PIN popup
 *   none    → prompt to connect
 */

import { useState, useEffect, useRef } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi'
import { erc20Abi, isAddress, parseUnits, formatUnits } from 'viem'
import { Send, QrCode, Copy, CheckCircle, XCircle, Loader2, ExternalLink, ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '../../store/appStore'
import { useNanWallet } from '../../hooks/useNanWallet'
import { sendFromPasskeyWallet } from '../CirclePasskeyLogin'

// Arc Testnet USDC contract (ERC-20 view, 6 decimals)
const USDC_ADDRESS = '0x3600000000000000000000000000000000000000' as const
const ARC_TESTNET_ID = 5042002

interface Props {
  initialSubView?: 'send' | 'receive'
}

type SubView = 'home' | 'send' | 'receive'
type SendStatus = 'idle' | 'signing' | 'confirming' | 'success' | 'error'

export function WalletPage({ initialSubView }: Props) {
  const nan = useNanWallet()
  const auth = useAppStore((s) => s.auth)
  const addActivity = useAppStore((s) => s.addActivity)
  const { address: _wagmiAddress } = useAccount()
  const { switchChainAsync } = useSwitchChain()

  const clientKey = (import.meta.env.VITE_CLIENT_KEY as string | undefined)?.trim()

  const [subView, setSubView] = useState<SubView>(initialSubView ?? 'home')
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [sendStatus, setSendStatus] = useState<SendStatus>('idle')
  const [sendError, setSendError] = useState('')
  const [sendTxHash, setSendTxHash] = useState('')
  const [copied, setCopied] = useState(false)

  // ── USDC balance (ERC-20 view, 6 decimals) ─────────────────────────────────
  const { data: balanceRaw, refetch: refetchBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [nan.address as `0x${string}`],
    chainId: ARC_TESTNET_ID,
    query: { enabled: !!nan.address },
  })
  const balanceFormatted = balanceRaw !== undefined ? formatUnits(balanceRaw, 6) : '—'

  // ── wagmi write contract ───────────────────────────────────────────────────
  const { writeContractAsync } = useWriteContract()
  const [wagmiHash, setWagmiHash] = useState<`0x${string}` | undefined>()
  const { isLoading: wagmiConfirming, isSuccess: wagmiSuccess } = useWaitForTransactionReceipt({ hash: wagmiHash })

  // Derive send status from wagmi receipt without calling setState inside an effect
  const firedRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (wagmiSuccess && wagmiHash && firedRef.current !== wagmiHash) {
      firedRef.current = wagmiHash
      // These are external side-effects (activity log, toast, refetch) — not state mirrors
      void refetchBalance()
      addActivity({ type: 'sent', description: `Sent ${amount} USDC to ${to.slice(0,6)}…${to.slice(-4)}`, amount: parseFloat(amount), sign: '-', status: 'confirmed', txHash: wagmiHash, chain: 'Arc Testnet' })
      toast.success('Transfer confirmed!')
    }
  }, [wagmiSuccess, wagmiHash, amount, to, addActivity, refetchBalance])

  // Merge wagmi-derived status with local state (wagmi path overrides when hash is set)
  const effectiveSendStatus: SendStatus = wagmiHash
    ? (wagmiSuccess ? 'success' : wagmiConfirming ? 'confirming' : sendStatus)
    : sendStatus
  const effectiveTxHash = wagmiHash && wagmiSuccess ? wagmiHash : sendTxHash

  function copyAddress() {
    if (!nan.address) return
    void navigator.clipboard.writeText(nan.address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success('Address copied')
  }

  // ── send handler ───────────────────────────────────────────────────────────
  async function handleSend() {
    if (!isAddress(to)) { toast.error('Invalid recipient address'); return }
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) { toast.error('Enter a valid amount'); return }
    if (!nan.isConnected) { toast.error('Connect your wallet first'); return }

    setSendStatus('signing')
    setSendError('')
    setSendTxHash('')

    try {
      if (nan.type === 'wagmi') {
        // wagmi — ERC-20 transfer
        if (nan.chainId !== ARC_TESTNET_ID) {
          await switchChainAsync({ chainId: ARC_TESTNET_ID })
        }
        const hash = await writeContractAsync({
          address: USDC_ADDRESS,
          abi: erc20Abi,
          functionName: 'transfer',
          args: [to, parseUnits(amount, 6)],
          chainId: ARC_TESTNET_ID,
        })
        setWagmiHash(hash)
        setSendStatus('confirming')

      } else if (nan.type === 'passkey') {
        // Passkey — Circle Modular Wallet gasless send
        if (!clientKey) throw new Error('VITE_CLIENT_KEY not configured')
        const hash = await sendFromPasskeyWallet({
          clientKey,
          to: to,
          amount: parseUnits(amount, 6),
        })
        setSendTxHash(hash)
        setSendStatus('success')
        refetchBalance().catch(() => {})
        addActivity({ type: 'sent', description: `Sent ${amount} USDC to ${to.slice(0,6)}…${to.slice(-4)}`, amount: amt, sign: '-', status: 'confirmed', txHash: hash, chain: 'Arc Testnet' })
        toast.success('Transfer confirmed!')

      } else if (nan.type === 'ucw') {
        // UCW — create-transfer challenge → W3S PIN popup
        const res = await fetch('/api/wallet', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'create-transfer',
            userToken: nan.userToken,
            walletId: nan.walletId,
            destinationAddress: to,
            amount,
            tokenAddress: USDC_ADDRESS,
            blockchain: 'ARC-TESTNET',
          }),
        })
        const data = await res.json() as { challengeId?: string; error?: string }
        if (!res.ok || data.error) throw new Error(data.error ?? 'Transfer failed')

        const { W3SSdk } = await import('@circle-fin/w3s-pw-web-sdk')
        const sdk = new W3SSdk()
        sdk.setAppSettings({ appId: import.meta.env.VITE_CIRCLE_APP_ID as string })
        if (auth?.encryptionKey) {
          sdk.setAuthentication({ userToken: nan.userToken!, encryptionKey: auth.encryptionKey })
        }
        setSendStatus('confirming')
        await new Promise<void>((resolve, reject) => {
          sdk.execute(data.challengeId!, (err, res) => {
            if (err || !res) return reject(new Error(err?.message ?? 'Challenge failed'))
            resolve()
          })
        })
        setSendStatus('success')
        refetchBalance().catch(() => {})
        addActivity({ type: 'sent', description: `Sent ${amount} USDC to ${to.slice(0,6)}…${to.slice(-4)}`, amount: amt, sign: '-', status: 'confirmed', chain: 'Arc Testnet' })
        toast.success('Transfer submitted!')
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('rejected') || msg.includes('cancelled') || msg.includes('denied')) {
        toast.info('Transfer cancelled')
        setSendStatus('idle')
      } else {
        setSendError(msg)
        setSendStatus('error')
      }
    }
  }

  const busy = effectiveSendStatus === 'signing' || effectiveSendStatus === 'confirming'

  // ── Home subview ───────────────────────────────────────────────────────────
  if (subView === 'home') return (
    <div className="min-h-dvh bg-[var(--nan-bg)] flex flex-col items-center justify-start pt-6 pb-24 px-4">
      <div className="w-full max-w-md space-y-4">
        <h1 className="text-2xl font-bold text-[var(--nan-text)] tracking-tight">Wallet</h1>

        {!nan.isConnected ? (
          <div className="rounded-2xl bg-[var(--nan-surface)] border border-[var(--nan-bdr)] p-5 text-center text-sm text-[var(--nan-text2)]">
            Connect your wallet or log in to view your balance.
          </div>
        ) : (
          <>
            {/* Balance card */}
            <div className="rounded-2xl bg-[var(--nan-surface)] border border-[var(--nan-bdr)] p-6 space-y-1">
              <p className="text-xs font-semibold uppercase tracking-widest text-[var(--nan-text3)]">USDC Balance</p>
              <p className="text-4xl font-bold text-[var(--nan-text)] tabular-nums tracking-tight">
                {balanceFormatted !== '—' ? parseFloat(balanceFormatted).toFixed(2) : '—'}
              </p>
              <p className="text-xs text-[var(--nan-text3)] font-mono">{nan.address}</p>
              <div className="flex items-center gap-1 pt-1">
                <span className="text-[10px] text-[var(--nan-text3)]">
                  {nan.type === 'wagmi' ? 'Browser Wallet' : nan.type === 'passkey' ? 'Passkey (Modular)' : 'Circle UCW'}
                  {' · Arc Testnet'}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setSubView('send')}
                className="flex items-center justify-center gap-2 rounded-xl bg-[var(--nan-blue)] text-white font-semibold text-sm py-3"
              >
                <Send size={15} /> Send
              </button>
              <button
                onClick={() => setSubView('receive')}
                className="flex items-center justify-center gap-2 rounded-xl bg-[var(--nan-surface)] border border-[var(--nan-bdr)] text-[var(--nan-text)] font-semibold text-sm py-3"
              >
                <QrCode size={15} /> Receive
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )

  // ── Receive subview ────────────────────────────────────────────────────────
  if (subView === 'receive') return (
    <div className="min-h-dvh bg-[var(--nan-bg)] flex flex-col items-center justify-start pt-6 pb-24 px-4">
      <div className="w-full max-w-md space-y-4">
        <button onClick={() => setSubView('home')} className="flex items-center gap-1 text-sm text-[var(--nan-text2)]">
          <ArrowLeft size={14} /> Back
        </button>
        <h1 className="text-xl font-bold text-[var(--nan-text)]">Receive USDC</h1>
        <div className="rounded-2xl bg-[var(--nan-surface)] border border-[var(--nan-bdr)] p-6 space-y-4 text-center">
          <p className="text-xs text-[var(--nan-text3)]">Your Arc Testnet address</p>
          <p className="font-mono text-sm text-[var(--nan-text)] break-all">{nan.address ?? '—'}</p>
          <button
            onClick={copyAddress}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--nan-bg)] border border-[var(--nan-bdr)] text-sm text-[var(--nan-text)] font-medium"
          >
            {copied ? <><CheckCircle size={14} className="text-green-400" /> Copied</> : <><Copy size={14} /> Copy Address</>}
          </button>
          <p className="text-xs text-[var(--nan-text3)]">Only send USDC on Arc Testnet to this address.</p>
        </div>
      </div>
    </div>
  )

  // ── Send subview ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-dvh bg-[var(--nan-bg)] flex flex-col items-center justify-start pt-6 pb-24 px-4">
      <div className="w-full max-w-md space-y-4">
        <button onClick={() => { setSubView('home'); setSendStatus('idle'); setSendError('') }} className="flex items-center gap-1 text-sm text-[var(--nan-text2)]">
          <ArrowLeft size={14} /> Back
        </button>
        <h1 className="text-xl font-bold text-[var(--nan-text)]">Send USDC</h1>

        {effectiveSendStatus === 'success' ? (
          <div className="rounded-2xl bg-[var(--nan-surface)] border border-[var(--nan-bdr)] p-6 text-center space-y-4">
            <CheckCircle size={40} className="mx-auto text-green-400" />
            <p className="font-semibold text-[var(--nan-text)]">Transfer submitted!</p>
            {effectiveTxHash && (
              <a href={`https://explorer.testnet.arc.io/tx/${effectiveTxHash}`} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-[var(--nan-blue)] hover:underline">
                View on explorer <ExternalLink size={11} />
              </a>
            )}
            <button onClick={() => { setSendStatus('idle'); setTo(''); setAmount(''); setSendTxHash(''); setWagmiHash(undefined) }}
              className="text-xs text-[var(--nan-text2)] hover:text-[var(--nan-text)]">Send again</button>
          </div>
        ) : (
          <div className="rounded-2xl bg-[var(--nan-surface)] border border-[var(--nan-bdr)] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-widest text-[var(--nan-text3)]">Signing via</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--nan-bdr)] text-[var(--nan-text2)]">
                {nan.type === 'wagmi' ? 'Browser Wallet' : nan.type === 'passkey' ? 'Passkey' : 'Circle UCW'}
              </span>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-[var(--nan-text3)] font-medium">Recipient</label>
              <input
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="0x… wallet address"
                disabled={busy}
                className="w-full rounded-xl bg-[var(--nan-bg)] border border-[var(--nan-bdr)] text-[var(--nan-text)] px-3 py-2 text-sm font-mono focus:outline-none focus:border-[var(--nan-blue)]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-[var(--nan-text3)] font-medium">Amount (USDC)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                disabled={busy}
                className="w-full rounded-xl bg-[var(--nan-bg)] border border-[var(--nan-bdr)] text-[var(--nan-text)] px-3 py-2 text-sm tabular-nums focus:outline-none focus:border-[var(--nan-blue)]"
              />
              <p className="text-[10px] text-[var(--nan-text3)]">Balance: {balanceFormatted !== '—' ? parseFloat(balanceFormatted).toFixed(2) : '—'} USDC</p>
            </div>

            {effectiveSendStatus === 'error' && sendError && (
              <div className="flex items-start gap-2 rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-400">
                <XCircle size={14} className="mt-0.5 shrink-0" />
                <span>{sendError}</span>
              </div>
            )}

            {busy && (
              <div className="flex items-center gap-2 text-xs text-[var(--nan-text2)]">
                <Loader2 size={13} className="animate-spin" />
                <span>{effectiveSendStatus === 'signing' ? 'Waiting for approval…' : 'Confirming on-chain…'}</span>
              </div>
            )}

            <button
              onClick={() => void handleSend()}
              disabled={busy || !to || !amount}
              className="w-full py-3 rounded-xl bg-[var(--nan-blue)] text-white font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              {busy ? (effectiveSendStatus === 'signing' ? 'Confirm in wallet…' : 'Confirming…') : 'Send USDC'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
