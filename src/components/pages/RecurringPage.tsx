import { useState, useEffect, useRef } from 'react'
import { Repeat, Plus, Play, Pause, Trash2, Clock, Check, AlertCircle, X, Calendar } from 'lucide-react'
import { useWriteContract, useWaitForTransactionReceipt, useAccount, useSwitchChain } from 'wagmi'
import { erc20Abi, isAddress } from 'viem'
import { toast } from 'sonner'
import { useAppStore, type RecurringFrequency } from '../../store/appStore'
import { getUsdc, buildTxExplorerUrl } from '@/onchain-facts'
import { parseAmount } from '@/onchain-money'
import { formatAddress } from '../../utils/format'

const F    = "'Inter', -apple-system, sans-serif"
const SURF = 'var(--nan-surface)'
const SURF2= 'var(--nan-surface2)'
const BDR  = 'var(--nan-bdr)'
const BLUE = '#0066FF'
const TEXT = 'var(--nan-text)'
const T2   = 'var(--nan-text2)'
const T3   = 'var(--nan-text3)'
const ARC  = 5042002

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
  const d = new Date(iso)
  const now = new Date()
  const diff = d.getTime() - now.getTime()
  if (diff < 0) return 'Due now'
  const h = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (days >= 1) return `in ${days}d`
  if (h >= 1)   return `in ${h}h`
  return 'soon'
}

export function RecurringPage() {
  const { address, chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const { addActivity, recurringTasks, addRecurringTask, updateRecurringTask, removeRecurringTask, recordRecurringRun } = useAppStore()
  const usdcFact = getUsdc(ARC)
  const isWrongChain = chainId !== undefined && chainId !== ARC
  const [formOpen, setFormOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newRecipient, setNewRecipient] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [newFreq, setNewFreq] = useState<RecurringFrequency>('manual')
  const [errors, setErrors] = useState<{ name?: string; recipient?: string; amount?: string }>({})
  const [runningId, setRunningId] = useState<string | null>(null)
  const runningRef = useRef<{ id: string; name: string; amount: string; recipient: string } | null>(null)
  const { writeContract, data: txHash, isPending, error: writeError, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  // ── Auto-scheduler: fire overdue tasks every 60s ────────────────────────────
  useEffect(() => {
    const check = () => {
      if (!address || !usdcFact || runningId) return
      const now = new Date()
      for (const task of recurringTasks) {
        if (!task.active || task.frequency === 'manual' || !task.nextRunAt) continue
        if (new Date(task.nextRunAt) <= now) {
          // Task is due — auto-fire it
          runningRef.current = { id: task.id, name: task.name, amount: task.amount, recipient: task.recipient }
          setRunningId(task.id)
          writeContract({
            address: usdcFact.address as `0x${string}`,
            abi: erc20Abi, functionName: 'transfer',
            args: [task.recipient as `0x${string}`, parseAmount(ARC, task.amount).raw],
            chainId: ARC,
          })
          break // one at a time
        }
      }
    }
    check() // run immediately
    const t = setInterval(check, 60_000)
    return () => clearInterval(t)
  }, [recurringTasks, address, usdcFact, runningId]) // eslint-disable-line

  useEffect(() => {
    if (isSuccess && txHash && runningRef.current) {
      const { id, name, amount, recipient } = runningRef.current
      recordRecurringRun(id, txHash)
      addActivity({ type:'sent', description:name, amount:parseFloat(amount), sign:'-', status:'confirmed', counterparty:formatAddress(recipient), txHash })
      toast.success(`Sent ${amount} USDC — ${name}`)
      setRunningId(null); runningRef.current = null; reset()
    }
  }, [isSuccess, txHash]) // eslint-disable-line

  useEffect(() => {
    if (writeError && runningRef.current) {
      toast.error(writeError.message?.includes('cancel') ? 'Transaction cancelled' : 'Transaction failed')
      setRunningId(null); runningRef.current = null; reset()
    }
  }, [writeError]) // eslint-disable-line

  const validate = () => {
    const e: typeof errors = {}
    if (!newName.trim()) e.name = 'Name is required'
    if (!isAddress(newRecipient)) e.recipient = 'Enter a valid 0x address'
    const n = parseFloat(newAmount)
    if (!newAmount || isNaN(n) || n <= 0) e.amount = 'Enter a valid amount'
    setErrors(e); return Object.keys(e).length === 0
  }

  const addTask = () => {
    if (!validate()) return
    const now = new Date()
    let nextRunAt: string | undefined
    if (newFreq === 'daily')   nextRunAt = new Date(now.getTime() + 86400000).toISOString()
    if (newFreq === 'weekly')  nextRunAt = new Date(now.getTime() + 7*86400000).toISOString()
    if (newFreq === 'monthly') nextRunAt = new Date(now.getFullYear(), now.getMonth()+1, now.getDate()).toISOString()
    addRecurringTask({ name: newName.trim(), recipient: newRecipient.trim(), amount: newAmount.trim(), active: true, frequency: newFreq, nextRunAt })
    setNewName(''); setNewRecipient(''); setNewAmount(''); setNewFreq('manual'); setErrors({}); setFormOpen(false)
    toast.success('Recurring payment added')
  }

  const runNow = (task: typeof recurringTasks[0]) => {
    if (!usdcFact || !address) return
    if (isWrongChain) { switchChain({ chainId: ARC }); return }
    if (runningId) { toast.error('A payment is already in progress'); return }
    runningRef.current = { id: task.id, name: task.name, amount: task.amount, recipient: task.recipient }
    setRunningId(task.id)
    writeContract({ address: usdcFact.address as `0x${string}`, abi: erc20Abi, functionName: 'transfer', args: [task.recipient as `0x${string}`, parseAmount(ARC, task.amount).raw], chainId: ARC })
  }

  const isRunning = (id: string) => runningId === id && (isPending || isConfirming)
  const totalRuns = recurringTasks.reduce((s,t) => s+t.runCount, 0)

  return (
    <div style={{ fontFamily: F, maxWidth: 520, margin: '0 auto', paddingBottom: 88 }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'20px 0 16px' }}>
        <div style={{ width:36, height:36, borderRadius:10, background:BLUE, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <Repeat size={18} color="#fff" />
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:17, fontWeight:700, color:TEXT, letterSpacing:'-0.02em' }}>Recurring Payments</div>
          <div style={{ fontSize:12, color:T2 }}>Scheduled USDC transfers · auto-executes when due</div>
        </div>
        <button onClick={() => setFormOpen(v => !v)} style={{ width:36, height:36, borderRadius:10, background:formOpen?SURF2:BLUE, border:`1px solid ${formOpen?BDR:BLUE}`, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
          {formOpen ? <X size={16} color={TEXT} /> : <Plus size={16} color="#fff" />}
        </button>
      </div>

      {/* Stats */}
      {recurringTasks.length > 0 && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:16 }}>
          {[
            { label:'Total',    value: recurringTasks.length.toString() },
            { label:'Active',   value: recurringTasks.filter(t=>t.active).length.toString() },
            { label:'All runs', value: totalRuns.toString() },
          ].map(s => (
            <div key={s.label} style={{ background:SURF, border:`1px solid ${BDR}`, borderRadius:12, padding:'10px 12px' }}>
              <div style={{ fontSize:18, fontWeight:700, color:TEXT }}>{s.value}</div>
              <div style={{ fontSize:11, color:T3, marginTop:2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {isWrongChain && (
        <div style={{ background:`rgba(0,102,255,0.06)`, border:`1px solid rgba(0,102,255,0.15)`, borderRadius:12, padding:'10px 14px', display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
          <AlertCircle size={14} color={BLUE} style={{ flexShrink:0 }} />
          <span style={{ fontSize:12, color:TEXT, flex:1 }}>Switch to Arc Testnet to send payments.</span>
          <button onClick={() => switchChain({ chainId: ARC })} style={{ fontSize:12, fontWeight:600, color:'#fff', background:BLUE, border:'none', borderRadius:8, padding:'5px 12px', cursor:'pointer', fontFamily:F }}>Switch</button>
        </div>
      )}

      {!address && (
        <div style={{ background:SURF, border:`1px solid ${BDR}`, borderRadius:12, padding:'10px 14px', display:'flex', gap:8, marginBottom:14 }}>
          <AlertCircle size={14} color={T2} style={{ flexShrink:0, marginTop:1 }} />
          <span style={{ fontSize:12, color:T2 }}>Connect your wallet to run payments.</span>
        </div>
      )}

      {/* Add form */}
      {formOpen && (
        <div style={{ background:SURF, border:`1px solid ${BDR}`, borderRadius:14, padding:16, display:'flex', flexDirection:'column', gap:10, marginBottom:14 }}>
          <div style={{ fontSize:13, fontWeight:700, color:TEXT }}>New recurring payment</div>
          {[
            { ph:'Name (e.g. Weekly allowance)', val:newName, set:setNewName, err:errors.name, mono:false },
            { ph:'Recipient address (0x...)',    val:newRecipient, set:setNewRecipient, err:errors.recipient, mono:true },
          ].map(({ ph, val, set, err, mono }) => (
            <div key={ph}>
              <input placeholder={ph} value={val} onChange={e => set(e.target.value)}
                style={{ width:'100%', padding:'10px 12px', border:`1px solid ${err?'rgba(255,68,68,0.5)':BDR}`, borderRadius:10, fontFamily:mono?'monospace':F, fontSize:mono?12:13, outline:'none', color:TEXT, background:SURF2, boxSizing:'border-box' }} />
              {err && <div style={{ fontSize:11, color:'#FF4444', marginTop:3 }}>{err}</div>}
            </div>
          ))}
          <div>
            <div style={{ position:'relative' }}>
              <input placeholder="0.00" type="number" min="0" step="0.01" value={newAmount} onChange={e => setNewAmount(e.target.value)}
                style={{ width:'100%', padding:'10px 52px 10px 12px', border:`1px solid ${errors.amount?'rgba(255,68,68,0.5)':BDR}`, borderRadius:10, fontFamily:F, fontSize:14, fontWeight:600, outline:'none', color:TEXT, background:SURF2, boxSizing:'border-box' }} />
              <span style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', fontSize:12, fontWeight:600, color:T2 }}>USDC</span>
            </div>
            {errors.amount && <div style={{ fontSize:11, color:'#FF4444', marginTop:3 }}>{errors.amount}</div>}
          </div>
          {/* Frequency */}
          <div>
            <div style={{ fontSize:11, fontWeight:600, color:T2, marginBottom:6, textTransform:'uppercase', letterSpacing:'0.05em' }}>Frequency</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
              {FREQ_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => setNewFreq(opt.value)} style={{ padding:'9px 12px', border:`1px solid ${newFreq===opt.value?BLUE:BDR}`, borderRadius:10, background:newFreq===opt.value?'rgba(0,102,255,0.10)':SURF2, color:newFreq===opt.value?BLUE:T2, fontFamily:F, fontSize:12, fontWeight:600, cursor:'pointer', textAlign:'left', transition:'all 0.12s' }}>
                  <div>{opt.label}</div>
                  <div style={{ fontSize:10, fontWeight:400, color:newFreq===opt.value?BLUE:T3, marginTop:2 }}>{opt.sub}</div>
                </button>
              ))}
            </div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={addTask} style={{ flex:1, height:40, background:BLUE, color:'#fff', border:'none', borderRadius:10, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:F }}>Add payment</button>
            <button onClick={() => { setFormOpen(false); setErrors({}) }} style={{ flex:1, height:40, background:SURF2, color:TEXT, border:`1px solid ${BDR}`, borderRadius:10, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:F }}>Cancel</button>
          </div>
        </div>
      )}

      {recurringTasks.length === 0 && !formOpen && (
        <div style={{ textAlign:'center', padding:'56px 0', color:T3 }}>
          <Repeat size={32} color={T3} style={{ margin:'0 auto 12px' }} />
          <div style={{ fontSize:14, fontWeight:600, color:TEXT }}>No recurring payments yet</div>
          <div style={{ fontSize:12, marginTop:4 }}>Tap + to add your first scheduled USDC payment</div>
        </div>
      )}

      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {recurringTasks.map(task => {
          const running = isRunning(task.id)
          const nextLabel = nextRunLabel(task.nextRunAt)
          return (
            <div key={task.id} style={{ background:SURF, border:`1px solid ${BDR}`, borderRadius:14, padding:14, opacity:!task.active?0.65:1 }}>
              <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8, marginBottom:10 }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3, flexWrap:'wrap' }}>
                    <span style={{ fontSize:13, fontWeight:700, color:TEXT }}>{task.name}</span>
                    <span style={{ fontSize:10, fontWeight:600, color:task.active?BLUE:T3, background:task.active?'rgba(0,102,255,0.10)':SURF2, padding:'2px 8px', borderRadius:20, border:`1px solid ${task.active?'rgba(0,102,255,0.20)':BDR}` }}>
                      {task.active ? 'Active' : 'Paused'}
                    </span>
                    <span style={{ fontSize:10, fontWeight:600, color:T3, background:SURF2, padding:'2px 8px', borderRadius:20, border:`1px solid ${BDR}` }}>
                      {freqLabel(task.frequency)}
                    </span>
                  </div>
                  <div style={{ fontSize:11, color:T2, fontFamily:'monospace', wordBreak:'break-all' }}>→ {task.recipient.slice(0,12)}...{task.recipient.slice(-8)}</div>
                  <div style={{ fontSize:13, fontWeight:700, color:TEXT, marginTop:4 }}>{task.amount} USDC</div>
                </div>
                <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                  <button onClick={() => runNow(task)} disabled={!task.active||running||!address||!!runningId}
                    title="Run now"
                    style={{ width:32, height:32, borderRadius:9, background:running?SURF2:BLUE, border:`1px solid ${running?BDR:BLUE}`, display:'flex', alignItems:'center', justifyContent:'center', cursor:(!task.active||running||!address||!!runningId)?'not-allowed':'pointer', opacity:(!task.active||!address)?0.4:1 }}>
                    {running ? <div style={{ width:12, height:12, border:`2px solid ${T3}`, borderTopColor:BLUE, borderRadius:'50%', animation:'nan-spin 0.8s linear infinite' }} /> : <Check size={13} color="#fff" />}
                  </button>
                  <button onClick={() => updateRecurringTask(task.id, { active: !task.active })} title={task.active?'Pause':'Resume'} style={{ width:32, height:32, borderRadius:9, background:SURF2, border:`1px solid ${BDR}`, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
                    {task.active ? <Pause size={13} color={T2} /> : <Play size={13} color={T2} />}
                  </button>
                  <button onClick={() => { removeRecurringTask(task.id); toast.success('Task removed') }} title="Delete" style={{ width:32, height:32, borderRadius:9, background:SURF2, border:`1px solid ${BDR}`, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
                    <Trash2 size={13} color={T2} />
                  </button>
                </div>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:10, paddingTop:10, borderTop:`1px solid ${BDR}`, flexWrap:'wrap' }}>
                <Repeat size={11} color={T3} />
                <span style={{ fontSize:11, color:T3 }}>{task.runCount} run{task.runCount!==1?'s':''}</span>
                {task.lastRun && (
                  <span style={{ fontSize:11, color:T3, display:'flex', alignItems:'center', gap:4 }}>
                    <Clock size={10} color={T3} /> Last: {task.lastRun}
                  </span>
                )}
                {nextLabel && task.frequency !== 'manual' && (
                  <span style={{ fontSize:11, color:BLUE, display:'flex', alignItems:'center', gap:4, marginLeft:'auto' }}>
                    <Calendar size={10} color={BLUE} /> Next: {nextLabel}
                  </span>
                )}
                {task.lastTxHash && (
                  <a href={buildTxExplorerUrl(ARC, task.lastTxHash)} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize:10, color:BLUE, fontWeight:600, textDecoration:'underline', marginLeft: nextLabel && task.frequency !== 'manual' ? 0 : 'auto' }}>
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
