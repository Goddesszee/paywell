/**
 * AgentRecurringTab — Recurring USDC payments from the Agent Wallet
 *
 * The Agent Wallet is a Circle user-controlled wallet. Sending USDC from it
 * goes through /api/agent-wallet (action=send-usdc), which calls the Circle
 * developer-controlled wallets SDK server-side.
 *
 * Auto-scheduler: a useEffect checks every 60s for overdue tasks and fires
 * them via the Circle SDK path. No wagmi required.
 */
import React, { useState, useEffect, useRef } from 'react'
import { isAddress } from 'viem'
import { toast } from 'sonner'
import { Repeat, Plus, Play, Pause, Trash2, Clock, Check, AlertCircle, X, Calendar, Loader2 } from 'lucide-react'
import { useAppStore, type RecurringFrequency, type RecurringTask } from '../../store/appStore'

const F    = "'Inter', -apple-system, sans-serif"
const MONO = "'JetBrains Mono', 'SF Mono', Menlo, monospace"
const BLUE = '#0066FF'
const GREEN = '#00C853'
const RED   = '#FF3B3B'

const FREQ_OPTIONS: { value: RecurringFrequency; label: string; sub: string }[] = [
  { value: 'manual',  label: 'Manual',  sub: 'Run on demand only' },
  { value: 'daily',   label: 'Daily',   sub: 'Every 24 hours' },
  { value: 'weekly',  label: 'Weekly',  sub: 'Every 7 days' },
  { value: 'monthly', label: 'Monthly', sub: 'Every 30 days' },
]

function freqLabel(f: RecurringFrequency) {
  return FREQ_OPTIONS.find(o => o.value === f)?.label ?? 'Manual'
}

function nextRunLabel(iso?: string) {
  if (!iso) return null
  const diff = new Date(iso).getTime() - Date.now()
  if (diff < 0) return 'Due now'
  const h = Math.floor(diff / 3600000)
  const d = Math.floor(diff / 86400000)
  if (d >= 1) return `in ${d}d`
  if (h >= 1) return `in ${h}h`
  return 'soon'
}

interface Props {
  C: {
    bg: string; surf: string; surf2: string
    bdr: string; text: string; t2: string; t3: string
  }
}

export function AgentRecurringTab({ C }: Props) {
  const {
    agentWallet, addAgentSpend,
    recurringTasks, addRecurringTask, updateRecurringTask,
    removeRecurringTask, recordRecurringRun, addActivity,
  } = useAppStore()

  const [formOpen, setFormOpen] = useState(false)
  const [newName, setNewName]   = useState('')
  const [newTo,   setNewTo]     = useState('')
  const [newAmt,  setNewAmt]    = useState('')
  const [newFreq, setNewFreq]   = useState<RecurringFrequency>('manual')
  const [errors,  setErrors]    = useState<{ name?: string; to?: string; amt?: string }>({})
  const [runningId, setRunningId] = useState<string | null>(null)
  const runRef = useRef<RecurringTask | null>(null)

  // Filter to agent-wallet tasks (prefixed 'agent:')
  const agentTasks = recurringTasks.filter(t => t.name.startsWith('agent:') || t.recipient.startsWith('0x'))

  // ── execute via Circle agent wallet backend ────────────────────────────────
  const executeAgentSend = async (task: RecurringTask): Promise<string | null> => {
    const userToken = agentWallet.userToken
    if (!userToken) throw new Error('Agent Wallet session expired. Please re-authenticate.')
    const r = await fetch('/api/agent-wallet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-token': userToken },
      body: JSON.stringify({
        action: 'send-usdc',
        userToken,
        toAddress: task.recipient,
        amount: task.amount,
      }),
    })
    const d = await r.json() as { ok?: boolean; txHash?: string; transactionId?: string; error?: string }
    if (!r.ok || d.error) throw new Error(d.error ?? 'Transfer failed')
    return d.txHash ?? d.transactionId ?? null
  }

  const runNow = async (task: RecurringTask) => {
    if (runningId) { toast.error('A payment is already running'); return }
    if (!agentWallet.provisioned) { toast.error('Agent Wallet not set up'); return }
    const bal = parseFloat(agentWallet.balance_usdc || '0')
    const amt = parseFloat(task.amount)
    if (bal < amt) { toast.error(`Insufficient balance: ${bal.toFixed(4)} USDC available`); return }
    runRef.current = task
    setRunningId(task.id)
    try {
      const txRef = await executeAgentSend(task)
      recordRecurringRun(task.id, txRef ?? `agent-${Date.now().toString(36)}`)
      addAgentSpend({ id: `spend-${Date.now()}`, service_id: 'recurring-pay', service_name: `Recurring: ${task.name.replace(/^agent:/, '')}`, amount_usdc: amt, txId: txRef ?? undefined, paid: true, timestamp: new Date().toISOString() })
      addActivity({ type: 'sent', description: task.name.replace(/^agent:/, ''), amount: amt, sign: '-', status: 'confirmed', counterparty: task.recipient.slice(0, 10) + '…', txHash: txRef ?? undefined })
      toast.success(`Sent ${task.amount} USDC`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Payment failed')
    } finally {
      setRunningId(null); runRef.current = null
    }
  }

  // ── Auto-scheduler: check every 60s ───────────────────────────────────────
  useEffect(() => {
    if (!agentWallet.provisioned) return
    const check = () => {
      if (runningId) return
      const now = new Date()
      for (const task of agentTasks) {
        if (!task.active || task.frequency === 'manual' || !task.nextRunAt) continue
        if (new Date(task.nextRunAt) <= now) {
          void runNow(task)
          break
        }
      }
    }
    check()
    const t = setInterval(check, 60_000)
    return () => clearInterval(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentTasks, runningId, agentWallet.provisioned])

  const validate = () => {
    const e: typeof errors = {}
    if (!newName.trim()) e.name = 'Name is required'
    if (!isAddress(newTo)) e.to = 'Enter a valid 0x address'
    const n = parseFloat(newAmt)
    if (!newAmt || isNaN(n) || n <= 0) e.amt = 'Enter a valid amount'
    setErrors(e); return Object.keys(e).length === 0
  }

  const addTask = () => {
    if (!validate()) return
    const now = new Date()
    let nextRunAt: string | undefined
    if (newFreq === 'daily')   nextRunAt = new Date(now.getTime() + 86400000).toISOString()
    if (newFreq === 'weekly')  nextRunAt = new Date(now.getTime() + 7 * 86400000).toISOString()
    if (newFreq === 'monthly') nextRunAt = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()).toISOString()
    // Prefix name with 'agent:' so we can distinguish from main-wallet recurring tasks
    addRecurringTask({ name: `agent:${newName.trim()}`, recipient: newTo.trim(), amount: newAmt.trim(), active: true, frequency: newFreq, nextRunAt })
    setNewName(''); setNewTo(''); setNewAmt(''); setNewFreq('manual'); setErrors({}); setFormOpen(false)
    toast.success('Recurring payment added to Agent Wallet')
  }

  const totalRuns = agentTasks.reduce((s, t) => s + t.runCount, 0)
  const balance   = parseFloat(agentWallet.balance_usdc || '0')

  if (!agentWallet.provisioned) {
    return (
      <div style={{ padding: '32px 0', textAlign: 'center', fontFamily: F }}>
        <AlertCircle size={28} color={C.t3} style={{ margin: '0 auto 12px' }} />
        <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 6 }}>Agent Wallet not set up</div>
        <div style={{ fontSize: 12, color: C.t2 }}>Complete wallet setup first to schedule recurring payments.</div>
      </div>
    )
  }

  return (
    <div style={{ fontFamily: F, display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Repeat size={15} color={BLUE} /> Agent Recurring Payments
          </div>
          <div style={{ fontSize: 11, color: C.t2, marginTop: 2 }}>Auto-executes from your Agent Wallet</div>
        </div>
        <button
          onClick={() => setFormOpen(v => !v)}
          style={{ width: 34, height: 34, borderRadius: 10, background: formOpen ? C.surf2 : BLUE, border: `1px solid ${formOpen ? C.bdr : BLUE}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
        >
          {formOpen ? <X size={15} color={C.text} /> : <Plus size={15} color="#fff" />}
        </button>
      </div>

      {/* Balance notice */}
      <div style={{ background: 'rgba(0,102,255,0.06)', border: '1px solid rgba(0,102,255,0.16)', borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, color: C.t2 }}>Agent Wallet balance</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.text, fontFamily: MONO }}>{balance.toFixed(4)} USDC</span>
      </div>

      {/* Stats */}
      {agentTasks.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {[
            { label: 'Total', value: agentTasks.length },
            { label: 'Active', value: agentTasks.filter(t => t.active).length },
            { label: 'All runs', value: totalRuns },
          ].map(s => (
            <div key={s.label} style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 12, padding: '10px 12px' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>{s.value}</div>
              <div style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Add form */}
      {formOpen && (
        <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>New agent recurring payment</div>

          {/* Name */}
          <div>
            <input placeholder="Name (e.g. Weekly vendor payment)" value={newName} onChange={e => setNewName(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', border: `1px solid ${errors.name ? 'rgba(255,59,59,0.5)' : C.bdr}`, borderRadius: 10, fontFamily: F, fontSize: 13, outline: 'none', color: C.text, background: C.surf2, boxSizing: 'border-box' as const }} />
            {errors.name && <div style={{ fontSize: 11, color: RED, marginTop: 3 }}>{errors.name}</div>}
          </div>

          {/* Recipient */}
          <div>
            <input placeholder="Recipient address (0x...)" value={newTo} onChange={e => setNewTo(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', border: `1px solid ${errors.to ? 'rgba(255,59,59,0.5)' : C.bdr}`, borderRadius: 10, fontFamily: MONO, fontSize: 12, outline: 'none', color: C.text, background: C.surf2, boxSizing: 'border-box' as const }} />
            {errors.to && <div style={{ fontSize: 11, color: RED, marginTop: 3 }}>{errors.to}</div>}
          </div>

          {/* Amount */}
          <div>
            <div style={{ position: 'relative' }}>
              <input placeholder="0.00" type="number" min="0" step="0.01" value={newAmt} onChange={e => setNewAmt(e.target.value)}
                style={{ width: '100%', padding: '10px 52px 10px 12px', border: `1px solid ${errors.amt ? 'rgba(255,59,59,0.5)' : C.bdr}`, borderRadius: 10, fontFamily: F, fontSize: 14, fontWeight: 600, outline: 'none', color: C.text, background: C.surf2, boxSizing: 'border-box' as const }} />
              <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 12, fontWeight: 600, color: C.t2 }}>USDC</span>
            </div>
            {errors.amt && <div style={{ fontSize: 11, color: RED, marginTop: 3 }}>{errors.amt}</div>}
          </div>

          {/* Frequency */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.t2, marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Frequency</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {FREQ_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => setNewFreq(opt.value)}
                  style={{ padding: '9px 12px', border: `1px solid ${newFreq === opt.value ? BLUE : C.bdr}`, borderRadius: 10, background: newFreq === opt.value ? 'rgba(0,102,255,0.10)' : C.surf2, color: newFreq === opt.value ? BLUE : C.t2, fontFamily: F, fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'left' as const }}>
                  <div>{opt.label}</div>
                  <div style={{ fontSize: 10, fontWeight: 400, color: newFreq === opt.value ? BLUE : C.t3, marginTop: 2 }}>{opt.sub}</div>
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={addTask} style={{ flex: 1, height: 40, background: BLUE, color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: F }}>Add payment</button>
            <button onClick={() => { setFormOpen(false); setErrors({}) }} style={{ flex: 1, height: 40, background: C.surf2, color: C.text, border: `1px solid ${C.bdr}`, borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: F }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {agentTasks.length === 0 && !formOpen && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: C.t3 }}>
          <Repeat size={30} color={C.t3} style={{ margin: '0 auto 12px' }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>No recurring payments yet</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Tap + to schedule automated USDC payments from your Agent Wallet</div>
        </div>
      )}

      {/* Task cards */}
      {agentTasks.map(task => {
        const running  = runningId === task.id
        const nextLabel = nextRunLabel(task.nextRunAt)
        const displayName = task.name.replace(/^agent:/, '')
        return (
          <div key={task.id} style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 14, padding: 14, opacity: !task.active ? 0.65 : 1 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' as const }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{displayName}</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: task.active ? BLUE : C.t3, background: task.active ? 'rgba(0,102,255,0.10)' : C.surf2, padding: '2px 8px', borderRadius: 20, border: `1px solid ${task.active ? 'rgba(0,102,255,0.20)' : C.bdr}` }}>
                    {task.active ? 'Active' : 'Paused'}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: C.t3, background: C.surf2, padding: '2px 8px', borderRadius: 20, border: `1px solid ${C.bdr}` }}>
                    {freqLabel(task.frequency)}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: C.t2, fontFamily: MONO, wordBreak: 'break-all' as const }}>→ {task.recipient.slice(0, 12)}…{task.recipient.slice(-8)}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginTop: 4 }}>{task.amount} USDC</div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button
                  onClick={() => void runNow(task)}
                  disabled={!task.active || running || !!runningId}
                  title="Run now"
                  style={{ width: 32, height: 32, borderRadius: 9, background: running ? C.surf2 : BLUE, border: `1px solid ${running ? C.bdr : BLUE}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: (!task.active || running || !!runningId) ? 'not-allowed' : 'pointer', opacity: !task.active ? 0.4 : 1 }}
                >
                  {running
                    ? <Loader2 size={13} color={C.t3} style={{ animation: 'spin 1s linear infinite' }} />
                    : <Check size={13} color="#fff" />}
                </button>
                <button onClick={() => updateRecurringTask(task.id, { active: !task.active })} title={task.active ? 'Pause' : 'Resume'} style={{ width: 32, height: 32, borderRadius: 9, background: C.surf2, border: `1px solid ${C.bdr}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  {task.active ? <Pause size={13} color={C.t2} /> : <Play size={13} color={C.t2} />}
                </button>
                <button onClick={() => { removeRecurringTask(task.id); toast.success('Task removed') }} title="Delete" style={{ width: 32, height: 32, borderRadius: 9, background: C.surf2, border: `1px solid ${C.bdr}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <Trash2 size={13} color={C.t2} />
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 10, borderTop: `1px solid ${C.bdr}`, flexWrap: 'wrap' as const }}>
              <Repeat size={11} color={C.t3} />
              <span style={{ fontSize: 11, color: C.t3 }}>{task.runCount} run{task.runCount !== 1 ? 's' : ''}</span>
              {task.lastRun && (
                <span style={{ fontSize: 11, color: C.t3, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Clock size={10} color={C.t3} /> Last: {task.lastRun}
                </span>
              )}
              {nextLabel && task.frequency !== 'manual' && (
                <span style={{ fontSize: 11, color: BLUE, display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
                  <Calendar size={10} color={BLUE} /> Next: {nextLabel}
                </span>
              )}
              {task.lastTxHash && (
                <span style={{ fontSize: 10, color: GREEN, fontFamily: MONO, marginLeft: nextLabel && task.frequency !== 'manual' ? 0 : 'auto' }}>
                  tx: {task.lastTxHash.slice(0, 10)}…
                </span>
              )}
            </div>
          </div>
        )
      })}

      <div style={{ fontSize: 11, color: C.t3, lineHeight: 1.6, padding: '4px 0' }}>
        Payments are sent from your Agent Wallet via the Circle Agent Stack. The scheduler checks every 60 seconds while this tab is open.
      </div>
    </div>
  )
}
