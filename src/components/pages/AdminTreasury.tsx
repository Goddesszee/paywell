import { useState } from 'react'
import { useAccount, useConnect, useSwitchChain, useReadContract, useWriteContract, usePublicClient } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { parseUnits, formatUnits, isAddress, erc20Abi } from 'viem'
import { NAME_REGISTRY } from '../../hooks/useNanName'

const USDC = '0x3600000000000000000000000000000000000000' as const
const ARC_ID = 5042
const ABI = [
  { name: 'owner', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] },
  { name: 'withdraw', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [] },
] as const

const S = 'var(--nan-surf)', B = 'var(--nan-border)'
const card: React.CSSProperties = { background: S, border: `1px solid ${B}`, borderRadius: 14, padding: '16px 18px', marginBottom: 20 }
const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--nan-text3)', textTransform: 'uppercase', letterSpacing: '0.07em' }
const input: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 9, background: 'var(--nan-bg)', border: `1px solid ${B}`, color: 'var(--nan-text)', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }
const btn = (primary = false, disabled = false): React.CSSProperties => ({ padding: '10px 14px', borderRadius: 9, border: primary ? 'none' : `1px solid ${B}`, background: primary ? '#0866F5' : 'transparent', color: primary ? '#fff' : 'var(--nan-text2)', fontSize: 13, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, fontFamily: 'inherit' })

/**
 * Admin-only treasury card: shows the USDC held by the NAN name registry contract and lets the
 * contract OWNER wallet call withdraw(to, amount). The transaction is signed in the admin's own
 * wallet (MetaMask etc.) — NAN never holds a key. Only the owner address can succeed on-chain.
 */
export function AdminTreasury() {
  const { address, isConnected, chainId } = useAccount()
  const { connect, isPending: connecting } = useConnect()
  const { switchChainAsync } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  const client = usePublicClient({ chainId: ARC_ID })
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const registry = NAME_REGISTRY as `0x${string}`
  const enabled = /^0x[0-9a-fA-F]{40}$/.test(NAME_REGISTRY)

  const bal = useReadContract({ address: USDC, abi: erc20Abi, functionName: 'balanceOf', args: enabled ? [registry] : undefined, chainId: ARC_ID, query: { enabled, refetchInterval: 20000 } })
  const own = useReadContract({ address: registry, abi: ABI, functionName: 'owner', chainId: ARC_ID, query: { enabled } })

  const balance = typeof bal.data === 'bigint' ? bal.data : 0n
  const owner = (own.data as string | undefined) ?? ''
  const isOwner = !!address && !!owner && address.toLowerCase() === owner.toLowerCase()
  const dest = to || address || ''

  const withdraw = async () => {
    setMsg(null)
    try {
      if (!isAddress(dest)) throw new Error('Enter a valid destination address.')
      const amt = parseUnits(amount || '0', 6)
      if (amt <= 0n) throw new Error('Enter an amount.')
      if (amt > balance) throw new Error('Amount is more than the contract balance.')
      if (!isOwner) throw new Error(`Connect the owner wallet (${owner.slice(0, 6)}…${owner.slice(-4)}) to withdraw.`)
      setBusy(true)
      if (chainId !== ARC_ID) await switchChainAsync({ chainId: ARC_ID })
      const hash = await writeContractAsync({ address: registry, abi: ABI, functionName: 'withdraw', args: [dest, amt], chainId: ARC_ID })
      setMsg({ ok: true, text: `Submitted: ${hash}. Waiting for confirmation…` })
      const rc = await client?.waitForTransactionReceipt({ hash })
      if (rc && rc.status !== 'success') throw new Error('Transaction failed on-chain.')
      setMsg({ ok: true, text: `Withdrawn ${amount} USDC to ${dest.slice(0, 6)}…${dest.slice(-4)}. Tx ${hash}` })
      setAmount('')
      void bal.refetch()
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Withdraw failed'
      setMsg({ ok: false, text: /rejected|denied/i.test(m) ? 'Cancelled in wallet.' : m.slice(0, 220) })
    } finally { setBusy(false) }
  }

  if (!enabled) return (
    <div style={card}><div style={lbl}>NAN name treasury</div>
      <div style={{ fontSize: 13, color: 'var(--nan-text2)', marginTop: 8 }}>Set <code>VITE_NAME_REGISTRY</code> in Vercel to enable withdrawals.</div></div>
  )

  return (
    <div style={card}>
      <div style={lbl}>NAN name treasury · withdraw</div>
      <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', margin: '6px 0 2px' }}>{formatUnits(balance, 6)} USDC</div>
      <div style={{ fontSize: 12, color: 'var(--nan-text2)', marginBottom: 12, wordBreak: 'break-all' }}>
        In contract {registry.slice(0, 8)}…{registry.slice(-6)} · owner {owner ? `${owner.slice(0, 6)}…${owner.slice(-4)}` : '…'}
      </div>
      {!isConnected ? (
        <button style={btn(true, connecting)} disabled={connecting} onClick={() => connect({ connector: injected() })}>{connecting ? 'Connecting…' : 'Connect owner wallet'}</button>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ fontSize: 12, color: isOwner ? '#10B981' : '#F59E0B' }}>
            {isOwner ? 'Owner wallet connected ✓' : `Connected ${address?.slice(0, 6)}…${address?.slice(-4)} is not the contract owner`}
          </div>
          <input style={input} placeholder={`Send to (default: ${address?.slice(0, 6)}…${address?.slice(-4)})`} value={to} onChange={e => setTo(e.target.value.trim())} />
          <div style={{ display: 'flex', gap: 8 }}>
            <input style={input} inputMode="decimal" placeholder="Amount (USDC)" value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} />
            <button style={btn()} onClick={() => setAmount(formatUnits(balance, 6))}>Max</button>
          </div>
          <button style={btn(true, busy || !isOwner || balance === 0n)} disabled={busy || !isOwner || balance === 0n} onClick={() => void withdraw()}>{busy ? 'Waiting for wallet…' : 'Withdraw'}</button>
        </div>
      )}
      {msg && <div style={{ marginTop: 10, fontSize: 12, color: msg.ok ? '#10B981' : '#EF4444', wordBreak: 'break-all' }}>{msg.text}</div>}
    </div>
  )
}
