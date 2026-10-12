/**
 * BatchPayrollPage — upload a CSV of recipients and fan out USDC sends.
 * CSV format: name, address, amount (header row optional)
 * All sends use the connected wallet (wagmi / passkey / Circle UCW).
 */
import { useState, useRef, useMemo } from 'react'
import {
  Users, Upload, X, Check, AlertCircle, ArrowRight,
  Download, Play, CheckCircle2, XCircle, Clock,
} from 'lucide-react'
import { toast } from 'sonner'
import { useWriteContract, useAccount, useSwitchChain } from 'wagmi'
import { erc20Abi, isAddress } from 'viem'
import { useAppStore } from '../../store/appStore'
import { getUsdc } from '@/onchain-facts'
import { parseAmount } from '@/onchain-money'
import { sendFromPasskeyWallet } from '../CirclePasskeyLogin'
import { useCircleTransaction } from '../../hooks/useCircleTransaction'
import { getClientKey } from '../../lib/circle-session'

// ── Design tokens ────────────────────────────────────────────────────────────
const F     = "'Inter', -apple-system, sans-serif"
const SURF  = 'var(--nan-surface)'
const SURF2 = 'var(--nan-surface2)'
const BDR   = 'var(--nan-bdr)'
const BLUE  = '#0866F5'
const TEXT  = 'var(--nan-text)'
const T2    = 'var(--nan-text2)'
const T3    = 'var(--nan-text3)'
const GREEN = '#22C55E'
const RED   = '#EF4444'
const AMBER = '#F59E0B'
const ARC   = 5042

interface PayrollRow {
  id: string
  name: string
  address: string
  amount: string
  status: 'pending' | 'sending' | 'done' | 'failed'
  error?: string
  txHash?: string
}

function uid() { return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }

function parseCSV(text: string): PayrollRow[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const rows: PayrollRow[] = []
  for (const line of lines) {
    // Support comma and tab delimiters
    const parts = line.includes('\t') ? line.split('\t') : line.split(',')
    const [a, b, c] = parts.map(p => p.trim().replace(/^["']|["']$/g, ''))
    // Skip header row
    if (!a || a.toLowerCase() === 'name' || a.toLowerCase() === 'address') continue
    // Detect column order: address first vs name first
    const isAddrFirst = isAddress(a)
    const name    = isAddrFirst ? (b ?? '') : a
    const address = isAddrFirst ? a : b
    const amount  = isAddrFirst ? (c ?? '') : (c ?? b ?? '')
    if (!address) continue
    rows.push({ id: uid(), name: name || address, address, amount: amount || '', status: 'pending' })
  }
  return rows
}

function downloadTemplate() {
  const csv = 'name,address,amount\nAlice,0xRecipientAddress1,100\nBob,0xRecipientAddress2,50.50\n'
  const blob = new Blob([csv], { type: 'text/csv' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'payroll_template.csv'; a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}

function Spin({ size = 14, color = BLUE }: { size?: number; color?: string }) {
  return <div style={{ width: size, height: size, border: `2px solid rgba(255,255,255,0.15)`, borderTopColor: color, borderRadius: '50%', animation: 'nan-spin 0.7s linear infinite', flexShrink: 0 }} />
}

// ── Main component ────────────────────────────────────────────────────────────
export function BatchPayrollPage() {
  const { address: wagmiAddress, chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const { auth, addActivity } = useAppStore()
  const circleAddress = auth?.circleWalletAddress as `0x${string}` | undefined
  const address = wagmiAddress ?? circleAddress
  const isPasskeyUser = !!auth?.isPasskeyUser
  const isCircleUser  = !wagmiAddress && !!auth?.userToken
  const isWrongChain  = !!wagmiAddress && chainId !== undefined && chainId !== ARC

  const usdcFact = getUsdc(ARC)
  const circleTx = useCircleTransaction()
  const { writeContract } = useWriteContract()

  const [rows,       setRows]       = useState<PayrollRow[]>([])
  const [running,    setRunning]    = useState(false)
  const [done,       setDone]       = useState(false)
  const [dragOver,   setDragOver]   = useState(false)
  const [manualName,    setManualName]    = useState('')
  const [manualAddress, setManualAddress] = useState('')
  const [manualAmount,  setManualAmount]  = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const validRows    = useMemo(() => rows.filter(r => isAddress(r.address) && parseFloat(r.amount) > 0), [rows])
  const invalidRows  = useMemo(() => rows.filter(r => !isAddress(r.address) || !(parseFloat(r.amount) > 0)), [rows])
  const totalAmount  = useMemo(() => validRows.reduce((s, r) => s + parseFloat(r.amount), 0), [validRows])
  const doneCount    = rows.filter(r => r.status === 'done').length
  const failedCount  = rows.filter(r => r.status === 'failed').length

  const handleFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = e => {
      const parsed = parseCSV(e.target?.result as string)
      if (parsed.length === 0) { toast.error('No valid rows found in file'); return }
      setRows(parsed); setDone(false)
      toast.success(`Loaded ${parsed.length} rows`)
    }
    reader.readAsText(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const addManual = () => {
    if (!isAddress(manualAddress)) { toast.error('Invalid wallet address'); return }
    const amt = parseFloat(manualAmount)
    if (!amt || amt <= 0) { toast.error('Enter a valid amount'); return }
    setRows(r => [...r, { id: uid(), name: manualName || manualAddress, address: manualAddress, amount: manualAmount, status: 'pending' }])
    setManualName(''); setManualAddress(''); setManualAmount('')
  }

  const removeRow = (id: string) => setRows(r => r.filter(x => x.id !== id))

  const updateRow = (id: string, patch: Partial<PayrollRow>) =>
    setRows(r => r.map(x => x.id === id ? { ...x, ...patch } : x))

  // ── Execute one row ───────────────────────────────────────────────────────
  const sendOne = async (row: PayrollRow): Promise<void> => {
    if (!usdcFact || !address) return
    updateRow(row.id, { status: 'sending' })
    const raw = parseAmount(ARC, row.amount).raw

    try {
      if (isPasskeyUser) {
        const clientKey = getClientKey() ?? ''
        const txHash = await sendFromPasskeyWallet({ clientKey, to: row.address as `0x${string}`, amount: raw })
        updateRow(row.id, { status: 'done', txHash: txHash ?? 'passkey-tx' })
        addActivity({ type: 'sent', description: `Payroll: ${row.name}`, amount: parseFloat(row.amount), sign: '-', status: 'confirmed', counterparty: row.address, txHash: txHash ?? 'passkey-tx' })
        return
      }

      if (isCircleUser && auth?.walletId) {
        const txHash = await circleTx.executeContract({
          contractAddress: usdcFact.address,
          abiFunctionSignature: 'transfer(address,uint256)',
          abiParameters: [row.address, raw.toString()],
        })
        updateRow(row.id, { status: 'done', txHash: txHash ?? 'circle-tx' })
        addActivity({ type: 'sent', description: `Payroll: ${row.name}`, amount: parseFloat(row.amount), sign: '-', status: 'confirmed', counterparty: row.address, txHash: txHash ?? 'circle-tx' })
        return
      }

      // Wagmi path — sequential per row (one tx at a time)
      await new Promise<void>((resolve, reject) => {
        writeContract(
          { address: usdcFact.address as `0x${string}`, abi: erc20Abi, functionName: 'transfer', args: [row.address as `0x${string}`, raw], chainId: ARC },
          {
            onSuccess: (txHash) => {
              updateRow(row.id, { status: 'done', txHash })
              addActivity({ type: 'sent', description: `Payroll: ${row.name}`, amount: parseFloat(row.amount), sign: '-', status: 'confirmed', counterparty: row.address, txHash })
              resolve()
            },
            onError: (err) => reject(err instanceof Error ? err : new Error((err as { message?: string })?.message ?? 'Transaction failed')),
          }
        )
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Transaction failed'
      updateRow(row.id, { status: 'failed', error: msg.slice(0, 80) })
    }
  }

  const runPayroll = async () => {
    if (!address) { toast.error('Connect your wallet first'); return }
    if (isWrongChain) { switchChain({ chainId: ARC }); return }
    if (validRows.length === 0) { toast.error('No valid rows to send'); return }
    setRunning(true)
    // Reset statuses
    setRows(r => r.map(x => ({ ...x, status: 'pending' as const, error: undefined, txHash: undefined })))
    for (const row of validRows) {
      await sendOne(row)
    }
    setRunning(false)
    setDone(true)
    toast.success(`Payroll complete: ${validRows.length - failedCount} sent`)
  }

  const inputBase: React.CSSProperties = {
    flex: 1, boxSizing: 'border-box', padding: '9px 12px',
    border: `1px solid ${BDR}`, borderRadius: 9, fontFamily: F,
    fontSize: 13, outline: 'none', color: TEXT, background: SURF2,
  }

  return (
    <div style={{ fontFamily: F, width: '100%', paddingBottom: 96 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 0 18px', borderBottom: `1px solid ${BDR}`, marginBottom: 18 }}>
        <div style={{ width: 38, height: 38, borderRadius: 11, background: BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Users size={18} color="#fff" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: TEXT, letterSpacing: '-0.02em' }}>Batch Payroll</div>
          <div style={{ fontSize: 12, color: T2, marginTop: 1 }}>Send USDC to multiple addresses at once</div>
        </div>
        <button onClick={downloadTemplate} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '0 12px', height: 34, background: SURF, border: `1px solid ${BDR}`, borderRadius: 9, fontSize: 12, fontWeight: 600, color: T2, cursor: 'pointer', fontFamily: F }}>
          <Download size={13} /> Template
        </button>
      </div>

      {/* Wrong chain */}
      {isWrongChain && (
        <div style={{ background: 'rgba(8,102,245,0.06)', border: `1px solid rgba(8,102,245,0.15)`, borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <AlertCircle size={14} color={BLUE} />
          <span style={{ fontSize: 12, color: TEXT, flex: 1 }}>Switch to Arc to send payments.</span>
          <button onClick={() => switchChain({ chainId: ARC })} style={{ fontSize: 12, fontWeight: 600, color: '#fff', background: BLUE, border: 'none', borderRadius: 8, padding: '5px 12px', cursor: 'pointer', fontFamily: F }}>Switch</button>
        </div>
      )}

      {/* Not connected */}
      {!address && (
        <div style={{ background: SURF, border: `1px solid ${BDR}`, borderRadius: 12, padding: '10px 14px', display: 'flex', gap: 8, marginBottom: 14 }}>
          <AlertCircle size={14} color={T2} style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 12, color: T2 }}>Connect your wallet to send payments.</span>
        </div>
      )}

      {/* CSV upload zone */}
      {rows.length === 0 && (
        <div
          onDrop={handleDrop}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onClick={() => fileRef.current?.click()}
          style={{
            border: `2px dashed ${dragOver ? BLUE : BDR}`,
            borderRadius: 16, padding: '40px 24px', textAlign: 'center',
            background: dragOver ? 'rgba(8,102,245,0.04)' : SURF,
            cursor: 'pointer', marginBottom: 16, transition: 'all 0.15s',
          }}
        >
          <Upload size={32} color={dragOver ? BLUE : T3} style={{ marginBottom: 12 }} />
          <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, marginBottom: 6 }}>Drop a CSV file here</div>
          <div style={{ fontSize: 12, color: T2 }}>or click to browse · columns: name, address, amount</div>
          <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
        </div>
      )}

      {/* Manual add row */}
      <div style={{ background: SURF, border: `1px solid ${BDR}`, borderRadius: 14, padding: 14, marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: T3, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Add recipient manually</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input value={manualName} onChange={e => setManualName(e.target.value)} placeholder="Name" style={{ ...inputBase, minWidth: 100 }} />
          <input value={manualAddress} onChange={e => setManualAddress(e.target.value)} placeholder="0x address" style={{ ...inputBase, minWidth: 140, fontFamily: 'monospace', fontSize: 12 }} />
          <input type="number" value={manualAmount} onChange={e => setManualAmount(e.target.value)} placeholder="Amount USDC" style={{ ...inputBase, minWidth: 110 }} />
          <button onClick={addManual} style={{ height: 38, padding: '0 14px', background: BLUE, color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: F, display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
            <Check size={14} /> Add
          </button>
        </div>
      </div>

      {/* Row list */}
      {rows.length > 0 && (
        <>
          {/* Summary bar */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
            {[
              { label: 'Recipients', value: validRows.length },
              { label: 'Invalid rows', value: invalidRows.length, highlight: invalidRows.length > 0 ? AMBER : undefined },
              { label: 'Total USDC', value: totalAmount.toFixed(2) },
            ].map(s => (
              <div key={s.label} style={{ background: SURF, border: `1px solid ${BDR}`, borderRadius: 12, padding: '10px 12px' }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: s.highlight ?? TEXT }}>{s.value}</div>
                <div style={{ fontSize: 10, color: T3, marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
            {rows.map(row => {
              const valid = isAddress(row.address) && parseFloat(row.amount) > 0
              return (
                <div key={row.id} style={{ background: SURF, border: `1px solid ${valid ? BDR : 'rgba(245,158,11,0.3)'}`, borderRadius: 12, padding: '11px 13px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  {/* Status icon */}
                  <div style={{ width: 22, height: 22, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {row.status === 'pending'  && <Clock size={14} color={T3} />}
                    {row.status === 'sending'  && <Spin size={14} color={BLUE} />}
                    {row.status === 'done'     && <CheckCircle2 size={14} color={GREEN} />}
                    {row.status === 'failed'   && <XCircle size={14} color={RED} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{row.name}</div>
                    <div style={{ fontSize: 11, color: T3, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.address || <span style={{ color: RED }}>missing address</span>}
                    </div>
                    {row.error && <div style={{ fontSize: 11, color: RED, marginTop: 2 }}>{row.error}</div>}
                    {row.txHash && (
                      <a href={`https://explorer.arc.io/tx/${row.txHash}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: BLUE, textDecoration: 'none', fontWeight: 600 }}>
                        View tx →
                      </a>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: valid ? TEXT : AMBER }}>{row.amount || '—'}</div>
                    <div style={{ fontSize: 10, color: T3 }}>USDC</div>
                  </div>
                  {!running && (
                    <button onClick={() => removeRow(row.id)} style={{ width: 28, height: 28, background: SURF2, border: `1px solid ${BDR}`, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                      <X size={12} color={T2} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          {/* Done banner */}
          {done && (
            <div style={{ background: 'rgba(34,197,94,0.08)', border: `1px solid rgba(34,197,94,0.25)`, borderRadius: 14, padding: '16px 18px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
              <CheckCircle2 size={22} color={GREEN} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>Payroll complete</div>
                <div style={{ fontSize: 12, color: T2 }}>
                  {doneCount} sent{failedCount > 0 ? `, ${failedCount} failed` : ''}
                </div>
              </div>
            </div>
          )}

          {/* Action row */}
          <div style={{ display: 'flex', gap: 8 }}>
            {!running && !done && (
              <button onClick={() => { setRows([]); setDone(false) }} style={{ flex: 1, height: 44, background: 'transparent', color: T2, border: `1px solid ${BDR}`, borderRadius: 11, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: F }}>
                Clear all
              </button>
            )}
            {done && failedCount > 0 && (
              <button onClick={() => { setRows(r => r.map(x => x.status === 'failed' ? { ...x, status: 'pending', error: undefined } : x)); setDone(false) }} style={{ flex: 1, height: 44, background: SURF, border: `1px solid ${BDR}`, borderRadius: 11, fontSize: 14, fontWeight: 600, color: T2, cursor: 'pointer', fontFamily: F }}>
                Retry failed
              </button>
            )}
            <button
              onClick={() => { void runPayroll() }}
              disabled={running || validRows.length === 0 || !address}
              style={{ flex: 2, height: 44, background: running ? SURF2 : BLUE, color: running ? T2 : '#fff', border: `1px solid ${running ? BDR : BLUE}`, borderRadius: 11, fontSize: 14, fontWeight: 600, cursor: running || !address ? 'not-allowed' : 'pointer', fontFamily: F, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, opacity: !address ? 0.5 : 1 }}
            >
              {running
                ? <><Spin size={15} /> Sending {doneCount + failedCount}/{validRows.length}…</>
                : done
                  ? <><ArrowRight size={15} /> Send again</>
                  : <><Play size={15} /> Send {validRows.length} payments · {totalAmount.toFixed(2)} USDC</>
              }
            </button>
          </div>
        </>
      )}
    </div>
  )
}
