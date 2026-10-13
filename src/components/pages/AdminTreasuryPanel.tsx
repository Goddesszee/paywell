/**
 * AdminTreasuryPanel — withdraw USDC from the platform contracts (owner-only functions).
 *
 * The contracts only let their OWNER wallet withdraw, so the transaction is signed by the owner's
 * browser wallet (never by the server). The panel reads the contract's USDC balance + owner, blocks
 * the withdrawal unless the connected wallet IS the owner, and records each withdrawal in the audit log.
 *
 * Contracts:
 *   - NANNameRegistry  withdraw(to, amount)                        (collected name fees)
 *   - PaywellEscrow    emergencyWithdraw(token, to, amount)        (only the surplus above locked funds;
 *                                                                   shown when VITE_ESCROW_ADDRESS is set)
 */
import { useState } from 'react'
import { useAccount, usePublicClient, useReadContract, useSwitchChain, useWriteContract } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { parseUnits, formatUnits, isAddress, type Abi } from 'viem'
import { toast } from 'sonner'
import { buildTxExplorerUrl, buildAddressExplorerUrl } from '../../onchain-facts'
import { adminFetch } from '../../lib/admin-api'

const SANS = "'Inter', -apple-system, sans-serif"
const MONO = "'JetBrains Mono', Menlo, monospace"
const S = 'var(--nan-surface)'
const B = 'var(--nan-bdr)'
const ARC_CHAIN_ID = 5042
const USDC = '0x3600000000000000000000000000000000000000' as const

const ERC20_ABI = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }] },
] as const satisfies Abi
const REGISTRY_ABI = [
  { type: 'function', name: 'owner', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'withdraw', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [] },
] as const satisfies Abi
const ESCROW_ABI = [
  { type: 'function', name: 'owner', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'lockedBalance', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'emergencyWithdraw', stateMutability: 'nonpayable', inputs: [{ name: 'token', type: 'address' }, { name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [] },
] as const satisfies Abi

const REGISTRY = ((import.meta.env.VITE_NAME_REGISTRY as string | undefined) ?? '').trim() || '0x7b839c3bE9394b2a6baC286776f37042609f83b2'
const ESCROW = ((import.meta.env.VITE_ESCROW_ADDRESS as string | undefined) ?? '').trim()

type Kind = 'registry' | 'escrow'

function ContractCard({ kind, address, label }: { kind: Kind; address: `0x${string}`; label: string }) {
  const { address: me, chainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  const publicClient = usePublicClient({ chainId: ARC_CHAIN_ID })

  const abi = kind === 'registry' ? REGISTRY_ABI : ESCROW_ABI
  const owner  = useReadContract({ address, abi, functionName: 'owner', chainId: ARC_CHAIN_ID })
  const bal    = useReadContract({ address: USDC, abi: ERC20_ABI, functionName: 'balanceOf', args: [address], chainId: ARC_CHAIN_ID })
  const locked = useReadContract({ address, abi: ESCROW_ABI, functionName: 'lockedBalance', chainId: ARC_CHAIN_ID, query: { enabled: kind === 'escrow' } })

  const balance = (bal.data as bigint | undefined) ?? 0n
  const lockedAmt = kind === 'escrow' ? ((locked.data as bigint | undefined) ?? 0n) : 0n
  const withdrawable = balance > lockedAmt ? balance - lockedAmt : 0n
  const ownerAddr = owner.data as string | undefined
  const isOwner = !!me && !!ownerAddr && me.toLowerCase() === ownerAddr.toLowerCase()

  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [lastTx, setLastTx] = useState('')

  const dest = (to.trim() || me || '') as string
  const amountWei = (() => { try { return amount ? parseUnits(amount, 6) : 0n } catch { return 0n } })()
  const problem =
    !me ? 'Connect the owner wallet'
    : !ownerAddr ? 'Reading contract owner…'
    : !isOwner ? `Connected wallet is not the owner (${ownerAddr.slice(0, 6)}…${ownerAddr.slice(-4)})`
    : !isAddress(dest) ? 'Enter a valid recipient address'
    : amountWei <= 0n ? 'Enter an amount'
    : amountWei > withdrawable ? 'Amount exceeds the withdrawable balance'
    : ''

  const withdraw = async () => {
    if (problem || busy) return
    setBusy(true)
    try {
      if (chainId !== ARC_CHAIN_ID) await switchChainAsync({ chainId: ARC_CHAIN_ID })
      const hash = kind === 'registry'
        ? await writeContractAsync({ address, abi: REGISTRY_ABI, functionName: 'withdraw', args: [dest as `0x${string}`, amountWei], chainId: ARC_CHAIN_ID })
        : await writeContractAsync({ address, abi: ESCROW_ABI, functionName: 'emergencyWithdraw', args: [USDC, dest as `0x${string}`, amountWei], chainId: ARC_CHAIN_ID })
      setLastTx(hash)
      toast.info('Withdrawal submitted — waiting for confirmation…')
      const receipt = await publicClient?.waitForTransactionReceipt({ hash })
      if (receipt && receipt.status !== 'success') throw new Error('Transaction reverted')
      toast.success(`Withdrew ${amount} USDC`)
      void adminFetch('/api/admin/treasury/log', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contract: label, address, to: dest, amount, txHash: hash }),
      }).catch(() => { /* audit log is best-effort */ })
      setAmount('')
      void bal.refetch()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Withdrawal failed'
      toast.error(/user rejected|denied/i.test(msg) ? 'Withdrawal cancelled' : msg.slice(0, 140))
    } finally { setBusy(false) }
  }

  return (
    <div style={{ background: S, border: `1px solid ${B}`, borderRadius: 14, padding: '16px', marginBottom: 12 }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 2 }}>{label}</div>
      <a href={buildAddressExplorerUrl(ARC_CHAIN_ID, address) ?? '#'} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'var(--nan-text2)', fontFamily: MONO, wordBreak: 'break-all' }}>{address}</a>

      <div style={{ display: 'flex', gap: 10, margin: '12px 0' }}>
        <div style={{ flex: 1, background: 'var(--nan-bg)', border: `1px solid ${B}`, borderRadius: 10, padding: '10px 12px' }}>
          <div style={{ fontSize: 10, color: 'var(--nan-text2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Withdrawable</div>
          <div style={{ fontSize: 18, fontWeight: 800, fontFamily: MONO }}>{bal.isLoading ? '…' : formatUnits(withdrawable, 6)} <span style={{ fontSize: 11, color: 'var(--nan-text2)' }}>USDC</span></div>
          {kind === 'escrow' && <div style={{ fontSize: 10, color: 'var(--nan-text2)', marginTop: 2 }}>{formatUnits(lockedAmt, 6)} USDC locked in open orders</div>}
        </div>
        <div style={{ flex: 1, background: 'var(--nan-bg)', border: `1px solid ${B}`, borderRadius: 10, padding: '10px 12px', minWidth: 0 }}>
          <div style={{ fontSize: 10, color: 'var(--nan-text2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Owner</div>
          <div style={{ fontSize: 12, fontFamily: MONO, marginTop: 4, wordBreak: 'break-all' }}>{ownerAddr ? `${ownerAddr.slice(0, 8)}…${ownerAddr.slice(-6)}` : '…'}</div>
        </div>
      </div>

      <label style={{ fontSize: 11, color: 'var(--nan-text2)' }}>Send to (defaults to the connected wallet)</label>
      <input value={to} onChange={e => setTo(e.target.value)} placeholder={me ?? '0x…'} style={{ width: '100%', boxSizing: 'border-box', margin: '4px 0 10px', padding: '10px 12px', borderRadius: 10, border: `1px solid ${B}`, background: 'var(--nan-bg)', color: 'var(--nan-text)', fontFamily: MONO, fontSize: 12 }} />
      <label style={{ fontSize: 11, color: 'var(--nan-text2)' }}>Amount (USDC)</label>
      <div style={{ display: 'flex', gap: 8, margin: '4px 0 12px' }}>
        <input value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder="0.00" style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, border: `1px solid ${B}`, background: 'var(--nan-bg)', color: 'var(--nan-text)', fontFamily: MONO, fontSize: 14 }} />
        <button onClick={() => setAmount(formatUnits(withdrawable, 6))} style={{ padding: '0 14px', borderRadius: 10, border: `1px solid ${B}`, background: 'transparent', color: 'var(--nan-text)', fontSize: 12, fontWeight: 700, fontFamily: SANS, cursor: 'pointer' }}>Max</button>
      </div>

      {!me ? (
        <ConnectKitButton />
      ) : (
        <button onClick={() => { void withdraw() }} disabled={!!problem || busy} style={{ width: '100%', padding: '13px', borderRadius: 12, border: 'none', background: problem ? 'var(--nan-surface-2, #2a2f3a)' : '#0866F5', color: problem ? 'var(--nan-text2)' : '#fff', fontSize: 14, fontWeight: 700, fontFamily: SANS, cursor: problem ? 'not-allowed' : 'pointer' }}>
          {busy ? 'Waiting for wallet / confirmation…' : problem || `Withdraw ${amount} USDC`}
        </button>
      )}
      {me && problem && !busy && <div style={{ fontSize: 11, color: '#F59E0B', marginTop: 8 }}>{problem}</div>}
      {lastTx && (
        <a href={buildTxExplorerUrl(ARC_CHAIN_ID, lastTx) ?? '#'} target="_blank" rel="noreferrer" style={{ display: 'block', fontSize: 12, color: '#3B82F6', marginTop: 10 }}>View last withdrawal ↗</a>
      )}
    </div>
  )
}

export function AdminTreasuryPanel() {
  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 4 }}>Treasury</div>
      <div style={{ fontSize: 13, color: 'var(--nan-text2)', marginBottom: 14 }}>
        Withdraw USDC held by the platform contracts. Only the contract&apos;s owner wallet can do this — connect it below and approve in your wallet.
      </div>
      <ContractCard kind="registry" address={REGISTRY as `0x${string}`} label="NAN Name Registry" />
      {isAddress(ESCROW) && <ContractCard kind="escrow" address={ESCROW as `0x${string}`} label="Paywell Escrow (surplus only)" />}
    </div>
  )
}
