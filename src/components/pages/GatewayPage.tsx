/**
 * GatewayPage — Circle Gateway unified cross-chain USDC balance.
 *
 * Wallet path strategy:
 *   wagmi   → useSignTypedData (EIP-712 burn intent) + writeContract for deposit/transfer
 *   passkey → EIP1193Provider from getPasskeyAdapter → signTypedData via walletClient
 *   UCW     → create-contract-exec challenge → W3S PIN popup
 *   none    → prompt to connect
 *
 * Gateway contracts (Arc Testnet):
 *   GatewayWallet  0x0077777d7EBA4688BDeF3E311b846F25870A19B9
 *   GatewayMinter  0x0022222ABE238Cc2C7Bb1f21003F0a260052475B
 */

import { useState, useEffect, useRef } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useSignTypedData } from 'wagmi'
import { erc20Abi, formatUnits, parseUnits } from 'viem'
import { ArrowDownToLine, ArrowUpFromLine, Loader2, CheckCircle, XCircle, ExternalLink, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '../../store/appStore'
import { useNanWallet } from '../../hooks/useNanWallet'

const USDC_ADDRESS = '0x3600000000000000000000000000000000000000' as const
const GATEWAY_WALLET = '0x0077777d7EBA4688BDeF3E311b846F25870A19B9' as const
const ARC_TESTNET_ID = 5042002
const RPC_URL = 'https://rpc.testnet.arc.io'

// Minimal GatewayWallet ABI — depositFor + transfer
const GATEWAY_ABI = [
  {
    name: 'depositFor',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'recipient', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'recipient', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'destChain', type: 'uint32' },
      { name: 'nonce', type: 'uint64' },
      { name: 'deadline', type: 'uint64' },
      { name: 'signature', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

type GatewayAction = 'deposit' | 'transfer'
type TxStatus = 'idle' | 'approving' | 'signing' | 'confirming' | 'success' | 'error'

export function GatewayPage() {
  const nan = useNanWallet()
  const auth = useAppStore((s) => s.auth)
  const addActivity = useAppStore((s) => s.addActivity)
  const { address: _wagmiAddress } = useAccount()
  const { switchChainAsync } = useSwitchChain()

  const [action, setAction] = useState<GatewayAction>('deposit')
  const [amount, setAmount] = useState('')
  const [recipient, setRecipient] = useState('')
  const [destChain, setDestChain] = useState<number>(6) // Base Sepolia CCTP domain
  const [status, setStatus] = useState<TxStatus>('idle')
  const [error, setError] = useState('')
  const [txHash, setTxHash] = useState('')

  // ── Balances ────────────────────────────────────────────────────────────────
  const { data: usdcBalance, refetch: refetchUsdc } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [nan.address as `0x${string}`],
    chainId: ARC_TESTNET_ID,
    query: { enabled: !!nan.address },
  })

  const { data: gatewayBalance, refetch: refetchGateway } = useReadContract({
    address: GATEWAY_WALLET,
    abi: GATEWAY_ABI,
    functionName: 'balanceOf',
    args: [nan.address as `0x${string}`],
    chainId: ARC_TESTNET_ID,
    query: { enabled: !!nan.address },
  })

  const usdcFmt = usdcBalance !== undefined ? parseFloat(formatUnits(usdcBalance, 6)).toFixed(2) : '—'
  const gwFmt   = gatewayBalance !== undefined ? parseFloat(formatUnits(gatewayBalance, 6)).toFixed(2) : '—'

  // ── wagmi contract write ────────────────────────────────────────────────────
  const { writeContractAsync } = useWriteContract()
  const { signTypedDataAsync } = useSignTypedData()
  const [pendingHash, setPendingHash] = useState<`0x${string}` | undefined>()
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: pendingHash })

  // Merge wagmi receipt state with local status — no setState mirrors inside effects
  const effectiveStatus: TxStatus = pendingHash
    ? (isConfirmed ? 'success' : isConfirming ? 'confirming' : status)
    : status
  const effectiveTxHash = pendingHash && isConfirmed ? pendingHash : txHash

  // Fire external side-effects (activity log, toast, refetch) exactly once per confirmed hash
  const gwFiredRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (isConfirmed && pendingHash && gwFiredRef.current !== pendingHash) {
      gwFiredRef.current = pendingHash
      void refetchUsdc()
      void refetchGateway()
      addActivity({
        type: action === 'deposit' ? 'sent' : 'bridge',
        description: action === 'deposit' ? `Deposited ${amount} USDC to Gateway` : `Gateway transfer ${amount} USDC`,
        amount: parseFloat(amount),
        sign: '-',
        status: 'confirmed',
        txHash: pendingHash,
        chain: 'Arc Testnet',
      })
      toast.success(action === 'deposit' ? 'Deposited to Gateway!' : 'Gateway transfer initiated!')
    }
  }, [isConfirmed, pendingHash, action, amount, addActivity, refetchUsdc, refetchGateway])

  // ── Fetch arc block for transfer nonce ─────────────────────────────────────
  async function fetchArcBlockNumber(): Promise<bigint> {
    const res = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
    })
    const data = await res.json() as { result: string }
    return BigInt(data.result)
  }

  // ── Handle deposit ─────────────────────────────────────────────────────────
  async function handleDeposit() {
    if (!amount || parseFloat(amount) <= 0) { toast.error('Enter an amount'); return }
    if (!nan.isConnected) { toast.error('Connect your wallet first'); return }

    setStatus('approving')
    setError('')

    try {
      if (nan.type === 'wagmi') {
        if (nan.chainId !== ARC_TESTNET_ID) await switchChainAsync({ chainId: ARC_TESTNET_ID })
        // Approve USDC to GatewayWallet
        const approveTx = await writeContractAsync({
          address: USDC_ADDRESS,
          abi: erc20Abi,
          functionName: 'approve',
          args: [GATEWAY_WALLET, parseUnits(amount, 6)],
          chainId: ARC_TESTNET_ID,
        })
        setStatus('confirming')
        // Wait for approve then deposit
        await fetch(RPC_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [approveTx] }),
        })
        setStatus('signing')
        const depositTx = await writeContractAsync({
          address: GATEWAY_WALLET,
          abi: GATEWAY_ABI,
          functionName: 'depositFor',
          args: [nan.address as `0x${string}`, parseUnits(amount, 6)],
          chainId: ARC_TESTNET_ID,
        })
        setPendingHash(depositTx)
        setStatus('confirming')
      } else if (nan.type === 'ucw') {
        // UCW — approve then deposit via contract-exec challenges
        const approveRes = await fetch('/api/wallet', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'create-contract-exec',
            userToken: nan.userToken,
            walletId: nan.walletId,
            contractAddress: USDC_ADDRESS,
            abiFunctionSignature: 'approve(address,uint256)',
            abiParameters: [GATEWAY_WALLET, parseUnits(amount, 6).toString()],
          }),
        })
        const approveData = await approveRes.json() as { challengeId?: string; error?: string }
        if (approveData.error) throw new Error(approveData.error)

        const { W3SSdk } = await import('@circle-fin/w3s-pw-web-sdk')
        const sdk = new W3SSdk()
        sdk.setAppSettings({ appId: import.meta.env.VITE_CIRCLE_APP_ID as string })
        if (auth?.encryptionKey) sdk.setAuthentication({ userToken: nan.userToken!, encryptionKey: auth.encryptionKey })
        setStatus('signing')
        await new Promise<void>((resolve, reject) => sdk.execute(approveData.challengeId!, (err, res) => err || !res ? reject(new Error(err?.message ?? 'failed')) : resolve()))

        const depositRes = await fetch('/api/wallet', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'create-contract-exec',
            userToken: nan.userToken,
            walletId: nan.walletId,
            contractAddress: GATEWAY_WALLET,
            abiFunctionSignature: 'depositFor(address,uint256)',
            abiParameters: [nan.address, parseUnits(amount, 6).toString()],
          }),
        })
        const depositData = await depositRes.json() as { challengeId?: string; error?: string }
        if (depositData.error) throw new Error(depositData.error)
        await new Promise<void>((resolve, reject) => sdk.execute(depositData.challengeId!, (err, res) => err || !res ? reject(new Error(err?.message ?? 'failed')) : resolve()))
        setStatus('success')
        refetchUsdc().catch(() => {})
        refetchGateway().catch(() => {})
        toast.success('Deposited to Gateway!')
      } else {
        toast.error('Passkey gateway deposit: use a browser wallet or UCW for this operation.')
        setStatus('idle')
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('rejected') || msg.includes('cancelled')) { toast.info('Cancelled'); setStatus('idle') }
      else { setError(msg); setStatus('error') }
    }
  }

  // ── Handle Gateway transfer ────────────────────────────────────────────────
  async function handleTransfer() {
    if (!amount || parseFloat(amount) <= 0) { toast.error('Enter an amount'); return }
    if (!recipient || !/^0x[0-9a-fA-F]{40}$/.test(recipient)) { toast.error('Enter a valid recipient address'); return }
    if (!nan.isConnected || nan.type !== 'wagmi') {
      toast.error('Gateway instant transfer requires a browser wallet (wagmi)')
      return
    }
    if (nan.chainId !== ARC_TESTNET_ID) await switchChainAsync({ chainId: ARC_TESTNET_ID })

    setStatus('signing')
    setError('')

    try {
      const block = await fetchArcBlockNumber()
      const nonce = block
      const deadline = block + 100n

      // EIP-712 burn intent for Gateway transfer
      const domain = {
        name: 'GatewayWallet',
        version: '1',
        chainId: ARC_TESTNET_ID,
        verifyingContract: GATEWAY_WALLET,
      }
      const types = {
        Transfer: [
          { name: 'recipient', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'destChain', type: 'uint32' },
          { name: 'nonce', type: 'uint64' },
          { name: 'deadline', type: 'uint64' },
        ],
      }
      const message = {
        recipient: recipient as `0x${string}`,
        amount: parseUnits(amount, 6),
        destChain,
        nonce,
        deadline,
      }

      const sig = await signTypedDataAsync({ domain, types, primaryType: 'Transfer', message })
      setStatus('confirming')

      const tx = await writeContractAsync({
        address: GATEWAY_WALLET,
        abi: GATEWAY_ABI,
        functionName: 'transfer',
        args: [recipient as `0x${string}`, parseUnits(amount, 6), destChain, nonce, deadline, sig],
        chainId: ARC_TESTNET_ID,
      })
      setPendingHash(tx)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('rejected') || msg.includes('cancelled')) { toast.info('Cancelled'); setStatus('idle') }
      else { setError(msg); setStatus('error') }
    }
  }

  const busy = ['approving','signing','confirming'].includes(effectiveStatus)

  return (
    <div className="min-h-dvh bg-[var(--nan-bg)] flex flex-col items-center justify-start pt-6 pb-24 px-4">
      <div className="w-full max-w-md space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--nan-text)] tracking-tight">Gateway</h1>
          <p className="text-sm text-[var(--nan-text2)] mt-1">Circle Gateway — unified cross-chain USDC balance</p>
        </div>

        {!nan.isConnected ? (
          <div className="rounded-2xl bg-[var(--nan-surface)] border border-[var(--nan-bdr)] p-5 text-center text-sm text-[var(--nan-text2)]">
            Connect your wallet or log in.
          </div>
        ) : (
          <>
            {/* Balances */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-[var(--nan-surface)] border border-[var(--nan-bdr)] p-4">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--nan-text3)]">Wallet USDC</p>
                <p className="text-2xl font-bold text-[var(--nan-text)] tabular-nums mt-1">{usdcFmt}</p>
              </div>
              <div className="rounded-2xl bg-[var(--nan-surface)] border border-[var(--nan-bdr)] p-4">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--nan-text3)]">Gateway Balance</p>
                <p className="text-2xl font-bold text-[var(--nan-text)] tabular-nums mt-1">{gwFmt}</p>
              </div>
            </div>

            {/* Action tabs */}
            <div className="flex rounded-xl bg-[var(--nan-surface)] border border-[var(--nan-bdr)] p-1 gap-1">
              {(['deposit','transfer'] as GatewayAction[]).map(a => (
                <button
                  key={a}
                  onClick={() => { setAction(a); setStatus('idle'); setError('') }}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold capitalize transition-colors ${action === a ? 'bg-[var(--nan-blue)] text-white' : 'text-[var(--nan-text2)]'}`}
                >
                  {a === 'deposit' ? 'Deposit' : 'Transfer'}
                </button>
              ))}
            </div>

            {status !== 'success' && (
              <div className="rounded-2xl bg-[var(--nan-surface)] border border-[var(--nan-bdr)] p-5 space-y-4">
                <div className="space-y-1">
                  <label className="text-xs text-[var(--nan-text3)] font-medium">Amount (USDC)</label>
                  <input
                    type="number" min="0" step="0.01"
                    value={amount} onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00" disabled={busy}
                    className="w-full rounded-xl bg-[var(--nan-bg)] border border-[var(--nan-bdr)] text-[var(--nan-text)] px-3 py-2 text-sm tabular-nums focus:outline-none focus:border-[var(--nan-blue)]"
                  />
                </div>

                {action === 'transfer' && (
                  <>
                    <div className="space-y-1">
                      <label className="text-xs text-[var(--nan-text3)] font-medium">Recipient address</label>
                      <input
                        value={recipient} onChange={(e) => setRecipient(e.target.value)}
                        placeholder="0x…" disabled={busy}
                        className="w-full rounded-xl bg-[var(--nan-bg)] border border-[var(--nan-bdr)] text-[var(--nan-text)] px-3 py-2 text-sm font-mono focus:outline-none focus:border-[var(--nan-blue)]"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-[var(--nan-text3)] font-medium">Destination chain (CCTP domain)</label>
                      <select
                        value={destChain} onChange={(e) => setDestChain(Number(e.target.value))}
                        disabled={busy}
                        className="w-full rounded-xl bg-[var(--nan-bg)] border border-[var(--nan-bdr)] text-[var(--nan-text)] px-3 py-2 text-sm focus:outline-none"
                      >
                        <option value={6}>Base Sepolia (domain 6)</option>
                        <option value={0}>Ethereum Sepolia (domain 0)</option>
                        <option value={3}>Arbitrum Sepolia (domain 3)</option>
                      </select>
                    </div>
                    {nan.type !== 'wagmi' && (
                      <p className="text-xs text-amber-400">Gateway instant transfer requires a browser wallet. Use Deposit for UCW/passkey.</p>
                    )}
                  </>
                )}

                {status === 'error' && error && (
                  <div className="flex items-start gap-2 rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-400">
                    <XCircle size={14} className="mt-0.5 shrink-0" /><span>{error}</span>
                  </div>
                )}

                {busy && (
                  <div className="flex items-center gap-2 text-xs text-[var(--nan-text2)]">
                    <Loader2 size={13} className="animate-spin" />
                    <span>
                      {status === 'approving' ? 'Approving USDC…' : status === 'signing' ? 'Sign in wallet…' : 'Confirming…'}
                    </span>
                  </div>
                )}

                <button
                  onClick={() => void (action === 'deposit' ? handleDeposit() : handleTransfer())}
                  disabled={busy || !amount}
                  className="w-full py-3 rounded-xl bg-[var(--nan-blue)] text-white font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {busy ? <Loader2 size={15} className="animate-spin" /> : action === 'deposit' ? <ArrowDownToLine size={15} /> : <ArrowUpFromLine size={15} />}
                  {busy ? 'Processing…' : action === 'deposit' ? 'Deposit to Gateway' : 'Instant Transfer'}
                </button>
              </div>
            )}

            {status === 'success' && (
              <div className="rounded-2xl bg-[var(--nan-surface)] border border-[var(--nan-bdr)] p-6 text-center space-y-4">
                <CheckCircle size={40} className="mx-auto text-green-400" />
                <p className="font-semibold text-[var(--nan-text)]">
                  {action === 'deposit' ? 'Deposited to Gateway!' : 'Transfer initiated!'}
                </p>
                {txHash && (
                  <a href={`https://explorer.testnet.arc.io/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-[var(--nan-blue)] hover:underline">
                    View on explorer <ExternalLink size={11} />
                  </a>
                )}
                <button onClick={() => { setStatus('idle'); setAmount(''); setTxHash('') }}
                  className="inline-flex items-center gap-1 text-xs text-[var(--nan-text2)] hover:text-[var(--nan-text)]">
                  <RefreshCw size={12} /> Do another
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
