import { useState, useEffect, useRef } from 'react'
import { Repeat, Plus, Play, Pause, Trash2, Clock, Check, AlertCircle, X } from 'lucide-react'
import { useWriteContract, useWaitForTransactionReceipt, useAccount, useSwitchChain } from 'wagmi'
import { erc20Abi, isAddress } from 'viem'
import { toast } from 'sonner'
import { useAppStore } from '../../store/appStore'
import { getUsdc } from '@/onchain-facts'
import { parseAmount } from '@/onchain-money'
import { formatAddress } from '../../utils/format'

const F = "'Inter', -apple-system, sans-serif"
const BLACK = '#0D0D0D'
const WHITE = '#FFFFFF'
const SURFACE = '#F7F7F8'
const BORDER = 'rgba(0,0,0,0.08)'
const TEXT2 = '#5C5C6B'
const TEXT3 = '#9898A6'
const ARC_TESTNET_ID = 5042002

interface RecurringTask {
  id: string
  name: string
  recipient: string
  amount: string
  active: boolean
  lastRun?: string
  lastTxHash?: string
  runCount: number
}

type FormStep = 'closed' | 'open'

export function RecurringPage() {
  const { address, chainId } = useAccount()
  const { addActivity } = useAppStore()
  const { switchChain } = useSwitchChain()
  const usdcFact = getUsdc(ARC_TESTNET_ID)
  const isWrongChain = chainId !== undefined && chainId !== ARC_TESTNET_ID

  const [tasks, setTasks] = useState<RecurringTask[]>([])
  const [formStep, setFormStep] = useState<FormStep>('closed')
  const [newName, setNewName] = useState('')
  const [newRecipient, setNewRecipient] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [errors, setErrors] = useState<{ name?: string; recipient?: string; amount?: string }>({})

  // Track which task is currently being run
  const [runningId, setRunningId] = useState<string | null>(null)
  const runningTaskRef = useRef<RecurringTask | null>(null)

  const { writeContract, data: txHash, isPending, error: writeError, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  // On success — mark last run and record activity
  useEffect(() => {
    if (isSuccess && txHash && runningTaskRef.current) {
      const task = runningTaskRef.current
      const now = new Date().toLocaleString()
      setTasks(ts => ts.map(t => t.id === task.id
        ? { ...t, lastRun: now, lastTxHash: txHash, runCount: t.runCount + 1 }
        : t
      ))
      addActivity({
        type: 'sent',
        description: task.name,
        amount: parseFloat(task.amount),
        sign: '-',
        status: 'confirmed',
        counterparty: formatAddress(task.recipient),
        txHash,
      })
      toast.success(`Sent ${task.amount} USDC — ${task.name}`)
      setRunningId(null)
      runningTaskRef.current = null
      reset()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess, txHash])

  useEffect(() => {
    if (writeError && runningTaskRef.current) {
      const msg = writeError.message?.includes('cancelled') ? 'Transaction cancelled' : 'Transaction failed'
      toast.error(msg)
      setRunningId(null)
      runningTaskRef.current = null
      reset()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [writeError])

  const validate = () => {
    const e: typeof errors = {}
    if (!newName.trim()) e.name = 'Name is required'
    if (!isAddress(newRecipient)) e.recipient = 'Enter a valid 0x address'
    const n = parseFloat(newAmount)
    if (!newAmount || isNaN(n) || n <= 0) e.amount = 'Enter a valid amount'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const addTask = () => {
    if (!validate()) return
    setTasks(ts => [...ts, {
      id: Date.now().toString(),
      name: newName.trim(),
      recipient: newRecipient.trim(),
      amount: newAmount.trim(),
      active: true,
      runCount: 0,
    }])
    setNewName(''); setNewRecipient(''); setNewAmount('')
    setErrors({})
    setFormStep('closed')
    toast.success('Recurring payment added')
  }

  const toggleActive = (id: string) =>
    setTasks(ts => ts.map(t => t.id === id ? { ...t, active: !t.active } : t))

  const removeTask = (id: string) => {
    setTasks(ts => ts.filter(t => t.id !== id))
    toast.success('Task removed')
  }

  const runNow = (task: RecurringTask) => {
    if (!usdcFact || !address) return
    if (isWrongChain) { switchChain({ chainId: ARC_TESTNET_ID }); return }
    if (runningId) { toast.error('A payment is already in progress'); return }
    runningTaskRef.current = task
    setRunningId(task.id)
    const parsed = parseAmount(ARC_TESTNET_ID, task.amount)
    writeContract({
      address: usdcFact.address as `0x${string}`,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [task.recipient as `0x${string}`, parsed.raw],
      chainId: ARC_TESTNET_ID,
    })
  }

  const activeCount = tasks.filter(t => t.active).length

  const isRunning = (id: string) => runningId === id && (isPending || isConfirming)

  return (
    <div style={{ fontFamily: F, maxWidth: 520, margin: '0 auto', padding: '0 0 88px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 0 16px' }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: BLACK, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Repeat size={18} color={WHITE} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: BLACK, letterSpacing: '-0.02em' }}>Recurring Payments</div>
          <div style={{ fontSize: 12, color: TEXT2 }}>Run USDC transfers on demand or on a schedule</div>
        </div>
        <button
          onClick={() => setFormStep(s => s === 'open' ? 'closed' : 'open')}
          style={{ width: 36, height: 36, borderRadius: 10, background: formStep === 'open' ? SURFACE : BLACK, border: `1px solid ${formStep === 'open' ? BORDER : BLACK}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
        >
          {formStep === 'open'
            ? <X size={16} color={BLACK} />
            : <Plus size={16} color={WHITE} />}
        </button>
      </div>

      {/* Stats */}
      {tasks.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
          {[
            { label: 'Total', value: tasks.length.toString() },
            { label: 'Active', value: activeCount.toString() },
            { label: 'Total runs', value: tasks.reduce((s, t) => s + t.runCount, 0).toString() },
          ].map(s => (
            <div key={s.label} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '10px 12px' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: BLACK }}>{s.value}</div>
              <div style={{ fontSize: 11, color: TEXT3, marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Wrong chain */}
      {isWrongChain && (
        <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <AlertCircle size={14} color={BLACK} style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: BLACK, flex: 1 }}>Switch to Arc Testnet to send payments.</span>
          <button onClick={() => switchChain({ chainId: ARC_TESTNET_ID })}
            style={{ fontSize: 12, fontWeight: 600, color: WHITE, background: BLACK, border: 'none', borderRadius: 8, padding: '5px 12px', cursor: 'pointer', fontFamily: F }}>
            Switch
          </button>
        </div>
      )}

      {/* Not connected */}
      {!address && (
        <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '10px 14px', display: 'flex', gap: 8, marginBottom: 14 }}>
          <AlertCircle size={14} color={TEXT2} style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 12, color: TEXT2 }}>Connect your wallet to run payments.</span>
        </div>
      )}

      {/* Add form */}
      {formStep === 'open' && (
        <div style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: BLACK }}>New recurring payment</div>

          <div>
            <input placeholder="Name (e.g. Weekly allowance)" value={newName} onChange={e => setNewName(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', border: `1px solid ${errors.name ? '#0D0D0D' : BORDER}`, borderRadius: 10, fontFamily: F, fontSize: 13, outline: 'none', color: BLACK, background: WHITE, boxSizing: 'border-box' }} />
            {errors.name && <div style={{ fontSize: 11, color: BLACK, marginTop: 3 }}>{errors.name}</div>}
          </div>

          <div>
            <input placeholder="Recipient address (0x...)" value={newRecipient} onChange={e => setNewRecipient(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', border: `1px solid ${errors.recipient ? '#0D0D0D' : BORDER}`, borderRadius: 10, fontFamily: 'monospace', fontSize: 12, outline: 'none', color: BLACK, background: WHITE, boxSizing: 'border-box' }} />
            {errors.recipient && <div style={{ fontSize: 11, color: BLACK, marginTop: 3 }}>{errors.recipient}</div>}
          </div>

          <div>
            <div style={{ position: 'relative' }}>
              <input placeholder="0.00" type="number" min="0" step="0.01" value={newAmount} onChange={e => setNewAmount(e.target.value)}
                style={{ width: '100%', padding: '10px 52px 10px 12px', border: `1px solid ${errors.amount ? '#0D0D0D' : BORDER}`, borderRadius: 10, fontFamily: F, fontSize: 14, fontWeight: 600, outline: 'none', color: BLACK, background: WHITE, boxSizing: 'border-box' }} />
              <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 12, fontWeight: 600, color: TEXT2 }}>USDC</span>
            </div>
            {errors.amount && <div style={{ fontSize: 11, color: BLACK, marginTop: 3 }}>{errors.amount}</div>}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={addTask}
              style={{ flex: 1, height: 40, background: BLACK, color: WHITE, border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: F }}>
              Add payment
            </button>
            <button onClick={() => { setFormStep('closed'); setErrors({}) }}
              style={{ flex: 1, height: 40, background: WHITE, color: BLACK, border: `1px solid ${BORDER}`, borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: F }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {tasks.length === 0 && formStep === 'closed' && (
        <div style={{ textAlign: 'center', padding: '56px 0', color: TEXT3 }}>
          <Repeat size={32} color={TEXT3} style={{ margin: '0 auto 12px' }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: BLACK }}>No recurring payments yet</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Tap + to add your first scheduled USDC payment</div>
        </div>
      )}

      {/* Task list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {tasks.map(task => {
          const running = isRunning(task.id)
          return (
            <div key={task.id} style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 14, opacity: !task.active ? 0.65 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: BLACK }}>{task.name}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: task.active ? WHITE : TEXT3, background: task.active ? BLACK : SURFACE, padding: '2px 8px', borderRadius: 20, border: `1px solid ${task.active ? BLACK : BORDER}`, flexShrink: 0 }}>
                      {task.active ? 'Active' : 'Paused'}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: TEXT2, fontFamily: 'monospace', wordBreak: 'break-all' }}>
                    → {task.recipient.slice(0, 12)}...{task.recipient.slice(-8)}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: BLACK, marginTop: 4 }}>{task.amount} USDC</div>
                </div>

                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  {/* Run now */}
                  <button
                    onClick={() => runNow(task)}
                    disabled={!task.active || running || !address || !!runningId}
                    title="Run now — sends USDC immediately"
                    style={{
                      width: 32, height: 32, borderRadius: 9, background: running ? SURFACE : BLACK,
                      border: `1px solid ${running ? BORDER : BLACK}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: (!task.active || running || !address || !!runningId) ? 'not-allowed' : 'pointer',
                      opacity: (!task.active || !address) ? 0.4 : 1,
                    }}
                  >
                    {running
                      ? <div style={{ width: 12, height: 12, border: `2px solid ${TEXT3}`, borderTopColor: BLACK, borderRadius: '50%', animation: 'nan-spin 0.8s linear infinite' }} />
                      : <Check size={13} color={WHITE} />}
                  </button>

                  {/* Pause/resume */}
                  <button onClick={() => toggleActive(task.id)}
                    style={{ width: 32, height: 32, borderRadius: 9, background: SURFACE, border: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                    {task.active ? <Pause size={13} color={BLACK} /> : <Play size={13} color={BLACK} />}
                  </button>

                  {/* Delete */}
                  <button onClick={() => removeTask(task.id)}
                    style={{ width: 32, height: 32, borderRadius: 9, background: SURFACE, border: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                    <Trash2 size={13} color={BLACK} />
                  </button>
                </div>
              </div>

              {/* Footer */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 10, borderTop: `1px solid ${BORDER}`, flexWrap: 'wrap' }}>
                <Repeat size={11} color={TEXT3} />
                <span style={{ fontSize: 11, color: TEXT3 }}>{task.runCount} run{task.runCount !== 1 ? 's' : ''}</span>
                {task.lastRun && (
                  <span style={{ fontSize: 11, color: TEXT3, marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Clock size={10} color={TEXT3} /> Last: {task.lastRun}
                  </span>
                )}
                {task.lastTxHash && (
                  <a
                    href={`https://explorer.arc.testnet/tx/${task.lastTxHash}`}
                    target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 10, color: BLACK, fontWeight: 600, textDecoration: 'underline', marginLeft: task.lastRun ? 0 : 'auto' }}
                  >
                    View tx
                  </a>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
