import { useState, useEffect, useRef } from 'react'
import {
  Repeat, Plus, Play, Pause, Trash2, Clock, Check,
  AlertCircle, X, ChevronRight,
  CheckCircle2, ArrowRight,
} from 'lucide-react'
import { useWriteContract, useWaitForTransactionReceipt, useAccount, useSwitchChain } from 'wagmi'
import { erc20Abi, isAddress } from 'viem'
import { toast } from 'sonner'
import { useAppStore, type RecurringFrequency } from '../../store/appStore'
import { syncRtCreate, syncRtUpdate, syncRtDelete } from '../../hooks/useBackendSync'
import { getUsdc, buildTxExplorerUrl } from '@/onchain-facts'
import { parseAmount } from '@/onchain-money'
import { formatAddress } from '../../utils/format'
import { sendFromPasskeyWallet } from '../CirclePasskeyLogin'
import { useCircleTransaction } from '../../hooks/useCircleTransaction'

const F     = "'Inter', -apple-system, sans-serif"
const SURF  = 'var(--nan-surface)'
const SURF2 = 'var(--nan-surface2)'
const BDR   = 'var(--nan-bdr)'
const BLUE  = '#0066FF'
const TEXT  = 'var(--nan-text)'
const T2    = 'var(--nan-text2)'
const T3    = 'var(--nan-text3)'
const ARC   = 5042002
const GREEN = '#22C55E'
const RED   = '#EF4444'

const FREQ_OPTIONS: { value: RecurringFrequency; label: string; sub: string; ms?: number }[] = [
  { value: 'manual',  label: 'Manual',  sub: 'Run on demand only' },
  { value: 'daily',   label: 'Daily',   sub: 'Every 24 hours',  ms: 86400000 },
  { value: 'weekly',  label: 'Weekly',  sub: 'Every 7 days',    ms: 7 * 86400000 },
  { value: 'monthly', label: 'Monthly', sub: 'Every 30 days' },
]

function freqLabel(f: RecurringFrequency) {
  return FREQ_OPTIONS.find(o => o.value === f)?.label ?? 'Manual'
}

function nextRunLabel(iso?: string) {
  if (!iso) return null
  const d = new Date(iso)
  const now = new Date()
  const diff = d.getTime() - now.getTime()
  if (diff < 0) return 'Due now'
  const days = Math.floor(diff / 86400000)
  const h    = Math.floor(diff / 3600000)
  if (days >= 1) return `in ${days}d`
  if (h >= 1)   return `in ${h}h`
  return 'soon'
}

function nextRunDate(freq: RecurringFrequency): string | undefined {
  const now = new Date()
  if (freq === 'daily')   return new Date(now.getTime() + 86400000).toISOString()
  if (freq === 'weekly')  return new Date(now.getTime() + 7 * 86400000).toISOString()
  if (freq === 'monthly') return new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()).toISOString()
  return undefined
}

function fmtDate(iso?: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })
}

function shortAddr(addr: string) {
  if (!addr || addr.length < 10) return addr
  return `${addr.slice(0, 6)}••••${addr.slice(-4)}`
}

// ── Spinner ─────────────────────────────────────────────────────────────────
function Spin({ size = 14, color = BLUE }: { size?: number; color?: string }) {
  return (
    <div style={{
      width: size, height: size, border: `2px solid rgba(255,255,255,0.12)`,
      borderTopColor: color, borderRadius: '50%',
      animation: 'nan-spin 0.7s linear infinite', flexShrink: 0,
    }} />
  )
}

// ── Field wrapper ────────────────────────────────────────────────────────────
function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: T2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>{label}</div>
      {children}
      {error && <div style={{ fontSize: 11, color: RED, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}><AlertCircle size={10} />{error}</div>}
    </div>
  )
}

export function RecurringPage() {
  const { address: wagmiAddress, chainId } = useAccount()
  const { switchChain }      = useSwitchChain()
  const {
    addActivity, recurringTasks, auth,
    addRecurringTask, updateRecurringTask, removeRecurringTask, recordRecurringRun,
  } = useAppStore()

  // Support Circle/passkey users who don't connect via wagmi
  const circleAddress = auth?.circleWalletAddress as `0x${string}` | undefined
  const address = wagmiAddress ?? circleAddress
  const isPasskeyUser = !!auth?.isPasskeyUser
  const isCircleUser = !wagmiAddress && !!auth?.userToken

  const usdcFact     = getUsdc(ARC)
  const isWrongChain = !!wagmiAddress && chainId !== undefined && chainId !== ARC

  // Circle UCW transaction hook (email/PIN users)
  const circleTx = useCircleTransaction()

  // ── form state ──────────────────────────────────────────────────────────
  type Step = 'list' | 'form' | 'review' | 'success'
  const [step,         setStep]         = useState<Step>('list')
  const [newName,      setNewName]      = useState('')
  const [newRecipient, setNewRecipient] = useState('')
  const [newAmount,    setNewAmount]    = useState('')
  const [newFreq,      setNewFreq]      = useState<RecurringFrequency>('manual')
  const [errors,       setErrors]       = useState<{ name?: string; recipient?: string; amount?: string }>({})
  const [lastCreated,  setLastCreated]  = useState<{ name: string; amount: string; freq: string } | null>(null)

  // ── per-action loading + confirm ────────────────────────────────────────
  const [pausingId,  setPausingId]  = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)

  // ── run machinery (unchanged logic) ────────────────────────────────────
  const [runningId, setRunningId] = useState<string | null>(null)
  const runningRef = useRef<{ id: string; name: string; amount: string; recipient: string } | null>(null)
  const { writeContract, data: txHash, isPending, error: writeError, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  // ── Auto-scheduler ──────────────────────────────────────────────────────
  useEffect(() => {
    const check = () => {
      // Auto-scheduler only runs for wagmi users — Circle/passkey users must tap "Run now"
      // because their transaction paths require user interaction (PIN popup / biometric)
      if (!wagmiAddress || !usdcFact || runningId) return
      const now = new Date()
      for (const task of recurringTasks) {
        if (!task.active || task.frequency === 'manual' || !task.nextRunAt) continue
        if (new Date(task.nextRunAt) <= now) {
          runningRef.current = { id: task.id, name: task.name, amount: task.amount, recipient: task.recipient }
          setRunningId(task.id)
          writeContract({
            address: usdcFact.address as `0x${string}`,
            abi: erc20Abi, functionName: 'transfer',
            args: [task.recipient as `0x${string}`, parseAmount(ARC, task.amount).raw],
            chainId: ARC,
          })
          break
        }
      }
    }
    check()
    const t = setInterval(check, 60_000)
    return () => clearInterval(t)
  }, [recurringTasks, wagmiAddress, usdcFact, runningId]) // eslint-disable-line

  useEffect(() => {
    if (isSuccess && txHash && runningRef.current) {
      const { id, name, amount, recipient } = runningRef.current
      recordRecurringRun(id, txHash)
      addActivity({ type: 'sent', description: name, amount: parseFloat(amount), sign: '-', status: 'confirmed', counterparty: formatAddress(recipient), txHash })
      toast.success(`Sent ${amount} USDC — ${name}`)
      setRunningId(null); runningRef.current = null; reset()
    }
  }, [isSuccess, txHash]) // eslint-disable-line

  useEffect(() => {
    if (writeError && runningRef.current) {
      toast.error(writeError.message?.includes('cancel') ? 'Transaction cancelled' : 'Something went wrong. Please try again.')
      setRunningId(null); runningRef.current = null; reset()
    }
  }, [writeError]) // eslint-disable-line

  // ── Validation ───────────────────────────────────────────────────────────
  const validate = () => {
    const e: typeof errors = {}
    if (!newName.trim())       e.name      = 'Name is required'
    if (!isAddress(newRecipient)) e.recipient = 'Enter a valid 0x address'
    const n = parseFloat(newAmount)
    if (!newAmount || isNaN(n) || n <= 0) e.amount = 'Enter a valid amount'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const openForm = () => {
    setNewName(''); setNewRecipient(''); setNewAmount(''); setNewFreq('manual'); setErrors({})
    setStep('form')
  }

  const goReview = () => { if (validate()) setStep('review') }

  const confirmCreate = () => {
    const nextRunAt = nextRunDate(newFreq)
    const id = addRecurringTask({ name: newName.trim(), recipient: newRecipient.trim(), amount: newAmount.trim(), active: true, frequency: newFreq, nextRunAt })
    const created = useAppStore.getState().recurringTasks.find(t => t.id === id)
    if (created && address) void syncRtCreate(address, created)
    setLastCreated({ name: newName.trim(), amount: newAmount.trim(), freq: freqLabel(newFreq) })
    setStep('success')
  }

  const runNow = (task: typeof recurringTasks[0]) => {
    if (!usdcFact || !address) return
    if (isWrongChain) { switchChain({ chainId: ARC }); return }
    if (runningId)    { toast.error('A payment is already in progress'); return }
    runningRef.current = { id: task.id, name: task.name, amount: task.amount, recipient: task.recipient }
    setRunningId(task.id)

    // ── Passkey (ERC-4337) path ───────────────────────────────────────────
    if (isPasskeyUser) {
      const clientKey = import.meta.env.VITE_CIRCLE_CLIENT_KEY as string ?? ''
      sendFromPasskeyWallet({
        clientKey,
        to: task.recipient as `0x${string}`,
        amount: parseAmount(ARC, task.amount).raw,
      }).then((txHash: string | undefined) => {
        const hash = txHash ?? 'passkey-tx'
        recordRecurringRun(task.id, hash)
        addActivity({ type: 'sent', description: task.name, amount: parseFloat(task.amount), sign: '-', status: 'confirmed', counterparty: formatAddress(task.recipient), txHash: hash })
        toast.success(`Sent ${task.amount} USDC — ${task.name}`)
        setRunningId(null); runningRef.current = null
      }).catch((e: unknown) => {
        toast.error(e instanceof Error ? e.message : 'Transaction failed')
        setRunningId(null); runningRef.current = null
      })
      return
    }

    // ── Circle UCW (email/PIN) path ───────────────────────────────────────
    if (isCircleUser && auth?.walletId) {
      circleTx.executeContract({
        contractAddress: usdcFact.address,
        abiFunctionSignature: 'transfer(address,uint256)',
        abiParameters: [task.recipient, parseAmount(ARC, task.amount).raw.toString()],
      }).then((txHash: string | undefined) => {
        const hash = txHash ?? 'circle-tx'
        recordRecurringRun(task.id, hash)
        addActivity({ type: 'sent', description: task.name, amount: parseFloat(task.amount), sign: '-', status: 'confirmed', counterparty: formatAddress(task.recipient), txHash: hash })
        toast.success(`Sent ${task.amount} USDC — ${task.name}`)
        setRunningId(null); runningRef.current = null
      }).catch((e: unknown) => {
        toast.error(e instanceof Error ? e.message : 'Transaction failed')
        setRunningId(null); runningRef.current = null
      })
      return
    }

    // ── Wagmi path (MetaMask etc.) ────────────────────────────────────────
    writeContract({ address: usdcFact.address as `0x${string}`, abi: erc20Abi, functionName: 'transfer', args: [task.recipient as `0x${string}`, parseAmount(ARC, task.amount).raw], chainId: ARC })
  }

  const togglePause = (task: typeof recurringTasks[0]) => {
    setPausingId(task.id)
    const newActive = !task.active
    updateRecurringTask(task.id, { active: newActive })
    if (address) void syncRtUpdate(address, task.id, { active: newActive })
    toast.success(task.active ? 'Payment paused' : 'Payment resumed')
    setTimeout(() => setPausingId(null), 600)
  }

  const deleteTask = (id: string) => {
    setDeletingId(id)
    setTimeout(() => {
      removeRecurringTask(id)
      if (address) void syncRtDelete(address, id)
      setDeletingId(null)
      setConfirmDel(null)
      toast.success('Recurring payment deleted')
    }, 400)
  }

  const isRunning = (id: string) => runningId === id && (isPending || isConfirming)
  const totalRuns  = recurringTasks.reduce((s, t) => s + t.runCount, 0)
  const activeCount = recurringTasks.filter(t => t.active).length

  // ── Preview next date for review step ────────────────────────────────────
  const previewNextDate = fmtDate(nextRunDate(newFreq))

  // ── Base input style ─────────────────────────────────────────────────────
  const inputBase: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    padding: '11px 14px',
    border: `1px solid ${BDR}`, borderRadius: 10,
    fontFamily: F, fontSize: 14, outline: 'none',
    color: TEXT, background: SURF2,
  }

  // ── Button base ──────────────────────────────────────────────────────────
  const btnPrimary: React.CSSProperties = {
    flex: 1, height: 44, background: BLUE, color: '#fff',
    border: 'none', borderRadius: 11, fontSize: 14, fontWeight: 600,
    cursor: 'pointer', fontFamily: F, display: 'flex',
    alignItems: 'center', justifyContent: 'center', gap: 6,
  }
  const btnGhost: React.CSSProperties = {
    flex: 1, height: 44, background: 'transparent', color: T2,
    border: `1px solid ${BDR}`, borderRadius: 11, fontSize: 14, fontWeight: 600,
    cursor: 'pointer', fontFamily: F,
  }

  return (
    <div style={{ fontFamily: F, width: '100%', minHeight: '100%', paddingBottom: 96 }}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '20px 0 18px',
        borderBottom: `1px solid ${BDR}`, marginBottom: 18,
      }}>
        <div style={{
          width: 38, height: 38, borderRadius: 11,
          background: BLUE, display: 'flex', alignItems: 'center',
          justifyContent: 'center', flexShrink: 0,
        }}>
          <Repeat size={18} color="#fff" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: TEXT, letterSpacing: '-0.02em' }}>Recurring Payments</div>
          <div style={{ fontSize: 12, color: T2, marginTop: 1 }}>Scheduled USDC transfers</div>
        </div>
        {step === 'list' && (
          <button onClick={openForm} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '0 14px', height: 36,
            background: BLUE, color: '#fff', border: 'none',
            borderRadius: 10, fontSize: 13, fontWeight: 600,
            cursor: 'pointer', fontFamily: F, flexShrink: 0,
          }}>
            <Plus size={15} /> New
          </button>
        )}
      </div>

      {/* ── Wrong chain banner ──────────────────────────────────────────── */}
      {isWrongChain && (
        <div style={{ background: 'rgba(0,102,255,0.06)', border: `1px solid rgba(0,102,255,0.15)`, borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <AlertCircle size={14} color={BLUE} style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: TEXT, flex: 1 }}>Switch to Arc Testnet to run payments.</span>
          <button onClick={() => switchChain({ chainId: ARC })} style={{ fontSize: 12, fontWeight: 600, color: '#fff', background: BLUE, border: 'none', borderRadius: 8, padding: '5px 12px', cursor: 'pointer', fontFamily: F }}>Switch</button>
        </div>
      )}

      {!address && step === 'list' && (
        <div style={{ background: SURF, border: `1px solid ${BDR}`, borderRadius: 12, padding: '10px 14px', display: 'flex', gap: 8, marginBottom: 14 }}>
          <AlertCircle size={14} color={T2} style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 12, color: T2 }}>Sign in or connect your wallet to run payments.</span>
        </div>
      )}

      {/* ── Stats row ───────────────────────────────────────────────────── */}
      {step === 'list' && recurringTasks.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 18 }}>
          {[
            { label: 'Total schedules', value: recurringTasks.length },
            { label: 'Active',          value: activeCount },
            { label: 'All-time runs',   value: totalRuns },
          ].map(s => (
            <div key={s.label} style={{ background: SURF, border: `1px solid ${BDR}`, borderRadius: 12, padding: '12px 12px 10px' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: TEXT, letterSpacing: '-0.03em' }}>{s.value}</div>
              <div style={{ fontSize: 10, color: T3, marginTop: 2, lineHeight: 1.3 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          STEP: FORM
      ══════════════════════════════════════════════════════════════════ */}
      {step === 'form' && (
        <div style={{ background: SURF, border: `1px solid ${BDR}`, borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: TEXT }}>New recurring payment</div>
            <button onClick={() => setStep('list')} style={{ width: 30, height: 30, borderRadius: 8, background: SURF2, border: `1px solid ${BDR}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <X size={14} color={T2} />
            </button>
          </div>

          <Field label="Payment name" error={errors.name}>
            <input
              placeholder="e.g. Weekly allowance"
              value={newName} onChange={e => setNewName(e.target.value)}
              style={{ ...inputBase, borderColor: errors.name ? 'rgba(239,68,68,0.5)' : BDR }}
            />
          </Field>

          <Field label="Recipient address" error={errors.recipient}>
            <input
              placeholder="0x..."
              value={newRecipient} onChange={e => setNewRecipient(e.target.value)}
              style={{ ...inputBase, fontFamily: 'monospace', fontSize: 13, borderColor: errors.recipient ? 'rgba(239,68,68,0.5)' : BDR }}
            />
          </Field>

          <Field label="Amount (USDC)" error={errors.amount}>
            <div style={{ position: 'relative' }}>
              <input
                placeholder="0.00" type="number" min="0" step="0.01"
                value={newAmount} onChange={e => setNewAmount(e.target.value)}
                style={{ ...inputBase, paddingRight: 58, fontSize: 16, fontWeight: 700, borderColor: errors.amount ? 'rgba(239,68,68,0.5)' : BDR }}
              />
              <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 12, fontWeight: 700, color: T2 }}>USDC</span>
            </div>
          </Field>

          <Field label="Frequency">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {FREQ_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => setNewFreq(opt.value)} style={{
                  padding: '10px 12px', border: `1px solid ${newFreq === opt.value ? BLUE : BDR}`,
                  borderRadius: 10, background: newFreq === opt.value ? 'rgba(0,102,255,0.10)' : SURF2,
                  color: newFreq === opt.value ? BLUE : T2, fontFamily: F, fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', textAlign: 'left',
                }}>
                  <div>{opt.label}</div>
                  <div style={{ fontSize: 10, fontWeight: 400, color: newFreq === opt.value ? 'rgba(0,102,255,0.7)' : T3, marginTop: 2 }}>{opt.sub}</div>
                </button>
              ))}
            </div>
          </Field>

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setStep('list')} style={btnGhost}>Cancel</button>
            <button onClick={goReview} style={btnPrimary}>
              Review <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          STEP: REVIEW
      ══════════════════════════════════════════════════════════════════ */}
      {step === 'review' && (
        <div style={{ background: SURF, border: `1px solid ${BDR}`, borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', gap: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: T3, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 16 }}>Review payment</div>

          {/* Amount */}
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: 40, fontWeight: 800, color: TEXT, letterSpacing: '-0.04em', lineHeight: 1 }}>{newAmount}</div>
            <div style={{ fontSize: 16, color: T2, fontWeight: 600, marginTop: 4 }}>USDC</div>
          </div>

          {/* Details */}
          {[
            { label: 'Name',         value: newName },
            { label: 'To',           value: shortAddr(newRecipient), mono: true },
            { label: 'Schedule',     value: `Every ${freqLabel(newFreq).toLowerCase()}` },
            { label: 'First payment', value: newFreq === 'manual' ? 'On demand' : previewNextDate },
          ].map((row, i, arr) => (
            <div key={row.label} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '12px 0',
              borderBottom: i < arr.length - 1 ? `1px solid ${BDR}` : 'none',
            }}>
              <span style={{ fontSize: 13, color: T2 }}>{row.label}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: TEXT, fontFamily: row.mono ? 'monospace' : F }}>{row.value}</span>
            </div>
          ))}

          <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
            <button onClick={() => setStep('form')} style={btnGhost}>Back</button>
            <button onClick={confirmCreate} style={btnPrimary}>
              <Check size={15} /> Create payment
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          STEP: SUCCESS
      ══════════════════════════════════════════════════════════════════ */}
      {step === 'success' && lastCreated && (
        <div style={{ background: SURF, border: `1px solid rgba(34,197,94,0.25)`, borderRadius: 16, padding: 28, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center' }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(34,197,94,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CheckCircle2 size={28} color={GREEN} />
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, color: TEXT }}>Recurring payment created</div>
          <div style={{ fontSize: 13, color: T2, lineHeight: 1.5 }}>
            <span style={{ fontWeight: 700, color: TEXT }}>{lastCreated.amount} USDC</span> will be sent {lastCreated.freq === 'Manual' ? 'on demand' : `every ${lastCreated.freq.toLowerCase()}`}.
          </div>
          <button onClick={() => setStep('list')} style={{ ...btnPrimary, flex: 'none', width: '100%', marginTop: 8 }}>
            View schedules <ArrowRight size={15} />
          </button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          STEP: LIST
      ══════════════════════════════════════════════════════════════════ */}
      {step === 'list' && (
        <>
          {/* Empty state */}
          {recurringTasks.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 56, height: 56, borderRadius: 16, background: SURF, border: `1px solid ${BDR}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Repeat size={24} color={T3} />
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: TEXT }}>No recurring payments</div>
              <div style={{ fontSize: 13, color: T2, maxWidth: 240, lineHeight: 1.5 }}>Automate payments you make regularly with NAN.</div>
              <button onClick={openForm} style={{ ...btnPrimary, flex: 'none', padding: '0 24px', marginTop: 4, width: 'auto' }}>
                <Plus size={15} /> Create recurring payment
              </button>
            </div>
          )}

          {/* Payment cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {recurringTasks.map(task => {
              const running     = isRunning(task.id)
              const nextLabel   = nextRunLabel(task.nextRunAt)
              const isPausing   = pausingId === task.id
              const isDeleting  = deletingId === task.id
              const confirmingDel = confirmDel === task.id

              return (
                <div key={task.id} style={{
                  background: SURF, border: `1px solid ${BDR}`,
                  borderRadius: 14, overflow: 'hidden',
                  opacity: isDeleting ? 0.4 : 1,
                  transition: 'opacity 0.3s',
                }}>
                  {/* Card header */}
                  <div style={{ padding: '14px 14px 12px', borderBottom: `1px solid ${BDR}` }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                      {/* Left: name + status */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: 4 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>{task.name.replace(/^agent:/, '')}</span>
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                            color: task.active ? GREEN : T3,
                            background: task.active ? 'rgba(34,197,94,0.10)' : SURF2,
                            border: `1px solid ${task.active ? 'rgba(34,197,94,0.20)' : BDR}`,
                          }}>
                            {task.active ? '● Active' : '○ Paused'}
                          </span>
                        </div>
                        {/* Amount */}
                        <div style={{ fontSize: 22, fontWeight: 800, color: TEXT, letterSpacing: '-0.03em', lineHeight: 1 }}>{task.amount} <span style={{ fontSize: 13, fontWeight: 600, color: T2 }}>USDC</span></div>
                      </div>
                    </div>
                  </div>

                  {/* Card body */}
                  <div style={{ padding: '12px 14px' }}>
                    {/* Recipient */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 4 }}>
                      <span style={{ fontSize: 11, color: T3, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>To</span>
                      <span style={{ fontSize: 12, color: TEXT, fontFamily: 'monospace' }}>{shortAddr(task.recipient)}</span>
                    </div>

                    {/* Grid: Schedule | Next | Completed */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
                      {[
                        { label: 'Schedule', value: freqLabel(task.frequency) },
                        { label: 'Next payment', value: task.frequency === 'manual' ? 'On demand' : (nextLabel ?? fmtDate(task.nextRunAt)) },
                        { label: 'Completed', value: task.runCount.toString() },
                      ].map(col => (
                        <div key={col.label} style={{ background: SURF2, borderRadius: 10, padding: '8px 10px' }}>
                          <div style={{ fontSize: 10, color: T3, fontWeight: 600, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{col.label}</div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: TEXT }}>{col.value}</div>
                        </div>
                      ))}
                    </div>

                    {/* Last run + tx link */}
                    {(task.lastRun || task.lastTxHash) && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                        {task.lastRun && (
                          <span style={{ fontSize: 11, color: T3, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Clock size={10} color={T3} /> Last run {task.lastRun}
                          </span>
                        )}
                        {task.lastTxHash && (
                          <a href={buildTxExplorerUrl(ARC, task.lastTxHash)} target="_blank" rel="noopener noreferrer"
                            style={{ fontSize: 11, color: BLUE, fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3 }}>
                            View tx <ArrowRight size={10} />
                          </a>
                        )}
                      </div>
                    )}

                    {/* Delete confirm overlay */}
                    {confirmingDel ? (
                      <div style={{ background: 'rgba(239,68,68,0.07)', border: `1px solid rgba(239,68,68,0.18)`, borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>Delete this payment?</div>
                        <div style={{ fontSize: 12, color: T2 }}>This will permanently remove the schedule.</div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => setConfirmDel(null)} style={{ ...btnGhost, flex: 1, height: 38, fontSize: 13 }}>Cancel</button>
                          <button onClick={() => deleteTask(task.id)} style={{ flex: 1, height: 38, background: RED, color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: F, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                            {isDeleting ? <Spin color="#fff" /> : <><Trash2 size={13} /> Delete</>}
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Action row */
                      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                        {/* Run now */}
                        <button
                          onClick={() => runNow(task)}
                          disabled={!task.active || running || !address || !!runningId}
                          style={{
                            flex: 1, minWidth: 80, height: 36,
                            background: running ? SURF2 : BLUE,
                            color: running ? T2 : '#fff',
                            border: `1px solid ${running ? BDR : BLUE}`,
                            borderRadius: 9, fontSize: 12, fontWeight: 600,
                            cursor: (!task.active || running || !address || !!runningId) ? 'not-allowed' : 'pointer',
                            opacity: (!task.active || !address) ? 0.45 : 1,
                            fontFamily: F, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                          }}>
                          {running ? <><Spin size={12} color={T2} /> Running</> : <><Check size={12} /> Run now</>}
                        </button>

                        {/* Pause / Resume */}
                        <button
                          onClick={() => togglePause(task)}
                          style={{
                            flex: 1, minWidth: 80, height: 36,
                            background: SURF2, color: TEXT,
                            border: `1px solid ${BDR}`,
                            borderRadius: 9, fontSize: 12, fontWeight: 600,
                            cursor: 'pointer', fontFamily: F,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                          }}>
                          {isPausing
                            ? <Spin size={12} color={T2} />
                            : task.active
                              ? <><Pause size={12} /> Pause</>
                              : <><Play size={12} /> Resume</>
                          }
                        </button>

                        {/* Delete */}
                        <button
                          onClick={() => setConfirmDel(task.id)}
                          style={{
                            width: 36, height: 36, background: SURF2, color: T2,
                            border: `1px solid ${BDR}`,
                            borderRadius: 9, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Add more button at bottom when list exists */}
          {recurringTasks.length > 0 && (
            <button onClick={openForm} style={{
              width: '100%', height: 44, marginTop: 8,
              background: 'transparent', color: BLUE,
              border: `1px dashed rgba(0,102,255,0.35)`,
              borderRadius: 12, fontSize: 13, fontWeight: 600,
              cursor: 'pointer', fontFamily: F,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
              <Plus size={14} /> Add another schedule
            </button>
          )}
        </>
      )}
    </div>
  )
}
