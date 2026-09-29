import { useState, useEffect, useRef } from 'react'
import { Repeat, Plus, Play, Pause, Trash2, Clock, Check, AlertCircle, X } from 'lucide-react'
import { useWriteContract, useWaitForTransactionReceipt, useAccount, useSwitchChain } from 'wagmi'
import { erc20Abi, isAddress } from 'viem'
import { toast } from 'sonner'
import { useAppStore } from '../../store/appStore'
import { getUsdc } from '@/onchain-facts'
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

interface RecurringTask {
  id: string; name: string; recipient: string; amount: string
  active: boolean; lastRun?: string; lastTxHash?: string; runCount: number
}

export function RecurringPage() {
  const { address, chainId } = useAccount()
  const { addActivity } = useAppStore()
  const { switchChain } = useSwitchChain()
  const usdcFact = getUsdc(ARC)
  const isWrongChain = chainId !== undefined && chainId !== ARC
  const [tasks, setTasks] = useState<RecurringTask[]>([])
  const [formOpen, setFormOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newRecipient, setNewRecipient] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [errors, setErrors] = useState<{ name?: string; recipient?: string; amount?: string }>({})
  const [runningId, setRunningId] = useState<string | null>(null)
  const runningRef = useRef<RecurringTask | null>(null)
  const { writeContract, data: txHash, isPending, error: writeError, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  useEffect(() => {
    if (isSuccess && txHash && runningRef.current) {
      const task = runningRef.current
      const now = new Date().toLocaleString()
      setTasks(ts => ts.map(t => t.id === task.id ? { ...t, lastRun: now, lastTxHash: txHash, runCount: t.runCount + 1 } : t))
      addActivity({ type:'sent', description:task.name, amount:parseFloat(task.amount), sign:'-', status:'confirmed', counterparty:formatAddress(task.recipient), txHash })
      toast.success(`Sent ${task.amount} USDC — ${task.name}`)
      setRunningId(null); runningRef.current = null; reset()
    }
  }, [isSuccess, txHash]) // eslint-disable-line

  useEffect(() => {
    if (writeError && runningRef.current) {
      toast.error(writeError.message?.includes('cancelled') ? 'Transaction cancelled' : 'Transaction failed')
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
    setTasks(ts => [...ts, { id: Date.now().toString(), name: newName.trim(), recipient: newRecipient.trim(), amount: newAmount.trim(), active: true, runCount: 0 }])
    setNewName(''); setNewRecipient(''); setNewAmount(''); setErrors({}); setFormOpen(false)
    toast.success('Recurring payment added')
  }

  const runNow = (task: RecurringTask) => {
    if (!usdcFact || !address) return
    if (isWrongChain) { switchChain({ chainId: ARC }); return }
    if (runningId) { toast.error('A payment is already in progress'); return }
    runningRef.current = task; setRunningId(task.id)
    writeContract({ address: usdcFact.address as `0x${string}`, abi: erc20Abi, functionName: 'transfer', args: [task.recipient as `0x${string}`, parseAmount(ARC, task.amount).raw], chainId: ARC })
  }

  const isRunning = (id: string) => runningId === id && (isPending || isConfirming)

  return (
    <div style={{ fontFamily: F, maxWidth: 520, margin: '0 auto', paddingBottom: 88 }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'20px 0 16px' }}>
        <div style={{ width:36, height:36, borderRadius:10, background:BLUE, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <Repeat size={18} color="#fff" />
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:17, fontWeight:700, color:TEXT, letterSpacing:'-0.02em' }}>Recurring Payments</div>
          <div style={{ fontSize:12, color:T2 }}>Run USDC transfers on demand or on a schedule</div>
        </div>
        <button onClick={() => setFormOpen(v => !v)} style={{ width:36, height:36, borderRadius:10, background:formOpen?SURF2:BLUE, border:`1px solid ${formOpen?BDR:BLUE}`, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
          {formOpen ? <X size={16} color={TEXT} /> : <Plus size={16} color="#fff" />}
        </button>
      </div>

      {/* Stats */}
      {tasks.length > 0 && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:16 }}>
          {[{ label:'Total', value:tasks.length.toString() },{ label:'Active', value:tasks.filter(t=>t.active).length.toString() },{ label:'Total runs', value:tasks.reduce((s,t)=>s+t.runCount,0).toString() }].map(s => (
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
            { ph:'Recipient address (0x...)', val:newRecipient, set:setNewRecipient, err:errors.recipient, mono:true },
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
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={addTask} style={{ flex:1, height:40, background:BLUE, color:'#fff', border:'none', borderRadius:10, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:F }}>Add payment</button>
            <button onClick={() => { setFormOpen(false); setErrors({}) }} style={{ flex:1, height:40, background:SURF2, color:TEXT, border:`1px solid ${BDR}`, borderRadius:10, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:F }}>Cancel</button>
          </div>
        </div>
      )}

      {tasks.length === 0 && !formOpen && (
        <div style={{ textAlign:'center', padding:'56px 0', color:T3 }}>
          <Repeat size={32} color={T3} style={{ margin:'0 auto 12px' }} />
          <div style={{ fontSize:14, fontWeight:600, color:TEXT }}>No recurring payments yet</div>
          <div style={{ fontSize:12, marginTop:4 }}>Tap + to add your first scheduled USDC payment</div>
        </div>
      )}

      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {tasks.map(task => {
          const running = isRunning(task.id)
          return (
            <div key={task.id} style={{ background:SURF, border:`1px solid ${BDR}`, borderRadius:14, padding:14, opacity:!task.active?0.65:1 }}>
              <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8, marginBottom:10 }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3, flexWrap:'wrap' }}>
                    <span style={{ fontSize:13, fontWeight:700, color:TEXT }}>{task.name}</span>
                    <span style={{ fontSize:10, fontWeight:600, color:task.active?BLUE:T3, background:task.active?'rgba(0,102,255,0.10)':SURF2, padding:'2px 8px', borderRadius:20, border:`1px solid ${task.active?'rgba(0,102,255,0.20)':BDR}` }}>
                      {task.active ? 'Active' : 'Paused'}
                    </span>
                  </div>
                  <div style={{ fontSize:11, color:T2, fontFamily:'monospace', wordBreak:'break-all' }}>→ {task.recipient.slice(0,12)}...{task.recipient.slice(-8)}</div>
                  <div style={{ fontSize:13, fontWeight:700, color:TEXT, marginTop:4 }}>{task.amount} USDC</div>
                </div>
                <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                  <button onClick={() => runNow(task)} disabled={!task.active||running||!address||!!runningId}
                    style={{ width:32, height:32, borderRadius:9, background:running?SURF2:BLUE, border:`1px solid ${running?BDR:BLUE}`, display:'flex', alignItems:'center', justifyContent:'center', cursor:(!task.active||running||!address||!!runningId)?'not-allowed':'pointer', opacity:(!task.active||!address)?0.4:1 }}>
                    {running ? <div style={{ width:12, height:12, border:`2px solid ${T3}`, borderTopColor:BLUE, borderRadius:'50%', animation:'nan-spin 0.8s linear infinite' }} /> : <Check size={13} color="#fff" />}
                  </button>
                  <button onClick={() => setTasks(ts => ts.map(t => t.id===task.id?{...t,active:!t.active}:t))} style={{ width:32, height:32, borderRadius:9, background:SURF2, border:`1px solid ${BDR}`, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
                    {task.active ? <Pause size={13} color={T2} /> : <Play size={13} color={T2} />}
                  </button>
                  <button onClick={() => { setTasks(ts => ts.filter(t=>t.id!==task.id)); toast.success('Task removed') }} style={{ width:32, height:32, borderRadius:9, background:SURF2, border:`1px solid ${BDR}`, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
                    <Trash2 size={13} color={T2} />
                  </button>
                </div>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:10, paddingTop:10, borderTop:`1px solid ${BDR}`, flexWrap:'wrap' }}>
                <Repeat size={11} color={T3} />
                <span style={{ fontSize:11, color:T3 }}>{task.runCount} run{task.runCount!==1?'s':''}</span>
                {task.lastRun && <span style={{ fontSize:11, color:T3, marginLeft:'auto', display:'flex', alignItems:'center', gap:4 }}><Clock size={10} color={T3} /> Last: {task.lastRun}</span>}
                {task.lastTxHash && <a href={`https://explorer.arc.testnet/tx/${task.lastTxHash}`} target="_blank" rel="noopener noreferrer" style={{ fontSize:10, color:BLUE, fontWeight:600, textDecoration:'underline', marginLeft:task.lastRun?0:'auto' }}>View tx</a>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
