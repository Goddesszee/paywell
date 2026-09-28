import { useState } from 'react'
import { Repeat, Plus, Play, Pause, Trash2, Clock, Info } from 'lucide-react'

const F = "'Inter', -apple-system, sans-serif"
const BLACK = '#0D0D0D'
const WHITE = '#FFFFFF'
const SURFACE = '#F7F7F8'
const BORDER = 'rgba(0,0,0,0.08)'
const TEXT2 = '#5C5C6B'
const TEXT3 = '#9898A6'

interface RecurringTask {
  id: string
  description: string
  instruction: string
  schedule: string
  active: boolean
  nextRun?: string
  amount?: string
  recipient?: string
}

export function RecurringPage() {
  const [tasks, setTasks] = useState<RecurringTask[]>([
    { id: '1', description: 'Weekly DCA', instruction: 'Buy 10 USDC of ETH every Monday at 9am', schedule: 'Weekly · Mon 09:00', active: false, nextRun: 'Mon 5 Oct 09:00', amount: '10' },
    { id: '2', description: 'Monthly savings', instruction: 'Bridge 50 USDC to Base Sepolia on the 1st of every month', schedule: 'Monthly · 1st', active: false, nextRun: '1 Oct 09:00', amount: '50' },
  ])
  const [showAdd, setShowAdd] = useState(false)
  const [newDesc, setNewDesc] = useState('')
  const [newInstr, setNewInstr] = useState('')
  const [newSched, setNewSched] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [newRecipient, setNewRecipient] = useState('')

  const toggle = (id: string) => setTasks(t => t.map(x => x.id === id ? { ...x, active: !x.active } : x))
  const remove = (id: string) => setTasks(t => t.filter(x => x.id !== id))
  const add = () => {
    if (!newDesc.trim() || !newInstr.trim()) return
    setTasks(t => [...t, {
      id: Date.now().toString(),
      description: newDesc,
      instruction: newInstr,
      schedule: newSched || 'Manual',
      active: false,
      amount: newAmount || undefined,
      recipient: newRecipient || undefined,
    }])
    setNewDesc(''); setNewInstr(''); setNewSched(''); setNewAmount(''); setNewRecipient('')
    setShowAdd(false)
  }

  const activeCount = tasks.filter(t => t.active).length

  return (
    <div style={{ fontFamily: F, maxWidth: 520, margin: '0 auto', padding: '0 0 88px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 0 16px' }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: BLACK, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Repeat size={18} color={WHITE} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: BLACK, letterSpacing: '-0.02em' }}>Recurring Payments</div>
          <div style={{ fontSize: 12, color: TEXT2 }}>Scheduled agent-powered payment tasks</div>
        </div>
        <button onClick={() => setShowAdd(v => !v)} style={{ width: 36, height: 36, borderRadius: 10, background: BLACK, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
          <Plus size={16} color={WHITE} />
        </button>
      </div>

      {/* Stats bar */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
        {[
          { label: 'Total tasks', value: tasks.length.toString() },
          { label: 'Active', value: activeCount.toString() },
          { label: 'Paused', value: (tasks.length - activeCount).toString() },
        ].map(s => (
          <div key={s.label} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '10px 12px' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: BLACK }}>{s.value}</div>
            <div style={{ fontSize: 11, color: TEXT3, marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Add form */}
      {showAdd && (
        <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: BLACK }}>New recurring task</div>
          <input placeholder="Task name (e.g. Weekly DCA)" value={newDesc} onChange={e => setNewDesc(e.target.value)}
            style={{ padding: '10px 12px', border: `1px solid ${BORDER}`, borderRadius: 10, fontFamily: F, fontSize: 13, outline: 'none', color: BLACK, background: WHITE }} />
          <textarea placeholder="Instruction for the agent (e.g. Send 10 USDC to 0x... every Monday)" value={newInstr} onChange={e => setNewInstr(e.target.value)} rows={2}
            style={{ padding: '10px 12px', border: `1px solid ${BORDER}`, borderRadius: 10, fontFamily: F, fontSize: 13, outline: 'none', color: BLACK, background: WHITE, resize: 'none' }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <input placeholder="Amount (USDC)" value={newAmount} onChange={e => setNewAmount(e.target.value)} type="number" min="0" step="0.01"
              style={{ padding: '10px 12px', border: `1px solid ${BORDER}`, borderRadius: 10, fontFamily: F, fontSize: 13, outline: 'none', color: BLACK, background: WHITE }} />
            <input placeholder="Schedule (e.g. Weekly · Mon)" value={newSched} onChange={e => setNewSched(e.target.value)}
              style={{ padding: '10px 12px', border: `1px solid ${BORDER}`, borderRadius: 10, fontFamily: F, fontSize: 13, outline: 'none', color: BLACK, background: WHITE }} />
          </div>
          <input placeholder="Recipient address (optional)" value={newRecipient} onChange={e => setNewRecipient(e.target.value)}
            style={{ padding: '10px 12px', border: `1px solid ${BORDER}`, borderRadius: 10, fontFamily: 'monospace', fontSize: 13, outline: 'none', color: BLACK, background: WHITE }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={add} style={{ flex: 1, height: 40, background: BLACK, color: WHITE, border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: F }}>Add task</button>
            <button onClick={() => setShowAdd(false)} style={{ flex: 1, height: 40, background: WHITE, color: BLACK, border: `1px solid ${BORDER}`, borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: F }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Notice */}
      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 14px', display: 'flex', gap: 8, marginBottom: 14 }}>
        <Info size={13} color={TEXT2} style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: 12, color: TEXT2, lineHeight: 1.5 }}>
          Recurring tasks are executed by your Paywell AI agent. The agent will request your approval before each payment unless auto-approve is enabled in Agent Settings.
        </div>
      </div>

      {/* Task list */}
      {tasks.length === 0 && !showAdd && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: TEXT3 }}>
          <Repeat size={32} color={TEXT3} style={{ margin: '0 auto 12px' }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: BLACK }}>No recurring tasks yet</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Tap + to add your first scheduled payment</div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {tasks.map(task => (
          <div key={task.id} style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: BLACK }}>{task.description}</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: task.active ? WHITE : TEXT3, background: task.active ? BLACK : SURFACE, padding: '2px 8px', borderRadius: 20, border: `1px solid ${task.active ? BLACK : BORDER}` }}>
                    {task.active ? 'Active' : 'Paused'}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: TEXT2, lineHeight: 1.4 }}>{task.instruction}</div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button onClick={() => toggle(task.id)} style={{ width: 32, height: 32, borderRadius: 9, background: task.active ? BLACK : SURFACE, border: `1px solid ${task.active ? BLACK : BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  {task.active ? <Pause size={13} color={WHITE} /> : <Play size={13} color={BLACK} />}
                </button>
                <button onClick={() => remove(task.id)} style={{ width: 32, height: 32, borderRadius: 9, background: SURFACE, border: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <Trash2 size={13} color={BLACK} />
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 10, borderTop: `1px solid ${BORDER}` }}>
              <Repeat size={11} color={TEXT3} />
              <span style={{ fontSize: 11, color: TEXT3 }}>{task.schedule}</span>
              {task.amount && <span style={{ fontSize: 11, fontWeight: 700, color: BLACK, marginLeft: 4 }}>{task.amount} USDC</span>}
              {task.nextRun && (
                <span style={{ fontSize: 11, color: TEXT3, marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Clock size={10} color={TEXT3} /> Next: {task.nextRun}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
