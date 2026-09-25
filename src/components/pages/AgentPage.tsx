import React, { useState, useRef, useEffect } from 'react'
import {
  Bot, Send, X, Check, Zap, Shield, ShoppingBag,
  ToggleLeft, ToggleRight, Coins, Loader2, Plus,
  Repeat, Trash2, Play, Pause, ExternalLink, Copy
} from 'lucide-react'
import { useWriteContract, useAccount } from 'wagmi'
import { parseUnits } from 'viem'
import { Input } from '../ui/Input'
import { LoadingDots } from '../ui/Spinner'
import { useAppStore } from '../../store/appStore'
import type { AgentMessage, AgentPermissions } from '../../store/appStore'
import { PRODUCTS, CATEGORIES, Product } from '../../data/products'
import { formatUSDC, formatRelativeTime } from '../../utils/format'
import { nanChat, backendConfigured } from '../../lib/api'
import { getUsdc } from '../../onchain-facts'

const F = "'Inter', -apple-system, sans-serif"
const BLACK = '#0D0D0D'
const WHITE = '#FFFFFF'
const SURFACE = '#F7F7F8'
const BORDER = 'rgba(0,0,0,0.08)'
const TEXT2 = '#5C5C6B'
const TEXT3 = '#9898A6'
const SUCCESS = '#16A34A'
const DANGER = '#DC2626'

const X402_PRICE = '0.001'
const USDC_TRANSFER_ABI = [{
  name: 'transfer', type: 'function', stateMutability: 'nonpayable',
  inputs: [{ name: 'to', type: 'address' }, { name: 'value', type: 'uint256' }],
  outputs: [{ name: '', type: 'bool' }],
}] as const

type AgentTab = 'chat' | 'recurring' | 'x402' | 'permissions' | 'history'

interface RecurringTask {
  id: string
  description: string
  instruction: string
  schedule: string
  active: boolean
  lastRun?: string
  nextRun?: string
}

interface X402Service {
  id: string
  name: string
  description: string
  price: string
  endpoint: string
  calls: number
  earned: string
  active: boolean
}

function simulateAgentResponse(
  userMessage: string,
  permissions: AgentPermissions,
  dailyUsed: number
): Omit<AgentMessage, 'id' | 'timestamp'> {
  const msg = userMessage.toLowerCase()
  const dailyRemaining = permissions.dailyLimit - dailyUsed
  const priceMatch = msg.match(/under\s+(\d+)|less than\s+(\d+)|max\s+(\d+)|budget.*?(\d+)/)
  const maxPrice = priceMatch ? parseInt(priceMatch[1] || priceMatch[2] || priceMatch[3] || priceMatch[4]) : null
  const keywords = ['keyboard','headphone','laptop','stand','lamp','backpack','wallet','cable','hub','charger','notebook','template','font','icon']
  const matchedKeyword = keywords.find(k => msg.includes(k))
  const categoryKeywords: Record<string,string> = { tech:'tech', digital:'digital', home:'home', fashion:'fashion', clothes:'fashion', template:'digital', design:'digital' }
  const matchedCategory = Object.keys(categoryKeywords).find(k => msg.includes(k))
  let candidates = PRODUCTS.filter(p => {
    if (!permissions.allowedCategories.includes(p.category)) return false
    if (maxPrice !== null && p.price > maxPrice) return false
    if (p.price > permissions.perTxLimit) return false
    if (!p.inStock) return false
    if (matchedKeyword && p.name.toLowerCase().includes(matchedKeyword)) return true
    if (matchedCategory && p.category === categoryKeywords[matchedCategory]) return true
    return true
  })
  if (matchedKeyword) candidates = candidates.filter(p => p.name.toLowerCase().includes(matchedKeyword)).concat(candidates.filter(p => !p.name.toLowerCase().includes(matchedKeyword)))
  candidates = candidates.slice(0, 3)
  if (candidates.length === 0) {
    if (dailyRemaining <= 0) return { role:'agent', content:`Daily limit of ${permissions.dailyLimit} USDC reached. Resets tomorrow.`, action:'info' }
    return { role:'agent', content:`No products found within your limits (max ${formatUSDC(permissions.perTxLimit)} USDC, categories: ${permissions.allowedCategories.join(', ')}).`, action:'info' }
  }
  const top = candidates[0]
  const canAuto = !permissions.requireApproval && top.price <= permissions.autoApproveUnder
  if (msg.includes('buy') || msg.includes('purchase') || msg.includes('get me') || msg.includes('order')) {
    if (top.price > dailyRemaining) return { role:'agent', content:`Found ${top.name} for ${top.price} USDC but only ${formatUSDC(dailyRemaining)} USDC remains today.`, products:[top], action:'info' }
    return { role:'agent', content: canAuto ? `Purchasing ${top.name} from ${top.merchant} for ${top.price} USDC (auto-approved).` : `Purchase ${top.name} from ${top.merchant} for ${top.price} USDC?`, products:[top], action:'purchase_request', purchaseProductId:top.id, purchaseAmount:top.price }
  }
  return { role:'agent', content:`Found ${candidates.length} option${candidates.length>1?'s':''} within your limits:`, products:candidates, action:'search' }
}

export function AgentPage() {
  const [tab, setTab] = useState<AgentTab>('chat')

  const TABS: { id: AgentTab; label: string; highlight?: boolean }[] = [
    { id: 'chat',        label: 'Chat' },
    { id: 'x402',        label: 'x402 ●', highlight: true },
    { id: 'recurring',   label: 'Recurring' },
    { id: 'permissions', label: 'Limits' },
    { id: 'history',     label: 'History' },
  ]

  return (
    <div style={{ fontFamily: F, maxWidth: 520, margin: '0 auto', padding: '0 0 88px' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'20px 0 16px' }}>
        <div style={{ width:36, height:36, borderRadius:10, background:BLACK, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <Bot size={18} color={WHITE} />
        </div>
        <div>
          <div style={{ fontSize:17, fontWeight:700, color:BLACK, letterSpacing:'-0.02em' }}>Paywell Agent</div>
          <AgentStatusLine />
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display:'flex', background:SURFACE, borderRadius:12, padding:3, marginBottom:16, gap:2 }}>
        {TABS.map(t => {
          const isActive = tab === t.id
          const isX402 = t.id === 'x402'
          return (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex:1, padding:'7px 4px', border:'none', borderRadius:9, cursor:'pointer',
            fontFamily:F, fontSize:12, fontWeight: isActive ? 700 : 500,
            background: isActive ? (isX402 ? BLACK : WHITE) : 'transparent',
            color: isActive ? (isX402 ? WHITE : BLACK) : (isX402 ? BLACK : TEXT2),
            boxShadow: isActive ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
            transition:'all 0.15s', whiteSpace:'nowrap',
          }}>
            {t.label}
          </button>
        )})}
      </div>

      {tab === 'chat'        && <AgentChat />}
      {tab === 'recurring'   && <RecurringTab />}
      {tab === 'x402'        && <X402Tab />}
      {tab === 'permissions' && <PermissionsTab />}
      {tab === 'history'     && <HistoryTab />}
    </div>
  )
}

function AgentStatusLine() {
  const { agentPermissions, agentDailyUsed } = useAppStore()
  const remaining = agentPermissions.dailyLimit - agentDailyUsed
  if (!agentPermissions.enabled) return (
    <div style={{ fontSize:11, color:DANGER, fontWeight:600, display:'flex', alignItems:'center', gap:4 }}>
      <span style={{ width:6, height:6, borderRadius:'50%', background:DANGER, display:'inline-block' }} />Disabled
    </div>
  )
  return (
    <div style={{ fontSize:11, color:SUCCESS, fontWeight:600, display:'flex', alignItems:'center', gap:4 }}>
      <span style={{ width:6, height:6, borderRadius:'50%', background:SUCCESS, display:'inline-block' }} />
      Active · {formatUSDC(remaining)} USDC remaining today
    </div>
  )
}

function AgentChat() {
  const { agentMessages, addAgentMessage, agentPermissions, agentDailyUsed, approveAgentPurchase, rejectAgentPurchase, clearAgentMessages, auth } = useAppStore()
  const { address, chainId } = useAccount()
  const { writeContractAsync } = useWriteContract()
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const [x402Paying, setX402Paying] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const sellerAddress = import.meta.env.VITE_X402_SELLER_ADDRESS as string | undefined

  useEffect(() => { endRef.current?.scrollIntoView({ behavior:'smooth' }) }, [agentMessages, typing])

  const payX402 = async () => {
    if (!sellerAddress || !address || !chainId) return false
    try {
      setX402Paying(true)
      const usdc = getUsdc(chainId)
      if (!usdc) return false
      await writeContractAsync({
        address: usdc.address as `0x${string}`,
        abi: USDC_TRANSFER_ABI,
        functionName: 'transfer',
        args: [sellerAddress as `0x${string}`, parseUnits(X402_PRICE, usdc.decimals)],
      })
      setX402Paying(false)
      return true
    } catch { setX402Paying(false); return false }
  }

  const send = async () => {
    const text = input.trim()
    if (!text) return
    setInput('')
    if (sellerAddress && address) {
      const paid = await payX402()
      if (!paid) { addAgentMessage({ role:'agent', content:'Payment of 0.001 USDC required. Approve in your wallet.', action:'info' }); return }
    }
    addAgentMessage({ role:'user', content:text })
    setTyping(true)
    try {
      if (backendConfigured() && auth) {
        const msgs: Array<{role:'user'|'assistant'; content:string}> = agentMessages.filter(m => m.role==='user'||m.role==='agent').slice(-8).map(m => ({ role:(m.role==='agent'?'assistant':'user'), content:m.content }))
        msgs.push({ role:'user', content:text })
        const res = await nanChat({ messages:msgs, usdcBal:String(agentPermissions.dailyLimit), userAddress:auth.walletAddress, sessionToken:auth.sessionToken })
        setTyping(false)
        addAgentMessage({ role:'agent', content:res.reply, action:'info' })
        return
      }
    } catch { /* fall through */ }
    await new Promise(r => setTimeout(r, 800 + Math.random()*500))
    setTyping(false)
    addAgentMessage(simulateAgentResponse(text, agentPermissions, agentDailyUsed))
  }

  const QUICK = ['Find a wireless keyboard under 25 USDC', 'Show digital downloads under 15 USDC', 'Buy the cheapest laptop stand', 'What can you buy for me today?']

  return (
    <div style={{ display:'flex', flexDirection:'column', height:500 }}>
      {sellerAddress && (
        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', marginBottom:10, background:SURFACE, borderRadius:10, border:`1px solid ${BORDER}` }}>
          <Coins size={13} color={BLACK} />
          <span style={{ fontSize:11, color:TEXT2, fontFamily:F }}>
            <strong style={{ color:BLACK }}>x402</strong> · 0.001 USDC per message · paid onchain
          </span>
          {x402Paying && <Loader2 size={11} color={BLACK} style={{ marginLeft:'auto', animation:'spin 1s linear infinite' }} />}
        </div>
      )}
      <div style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:12, marginBottom:10, paddingRight:2 }}>
        {agentMessages.map(msg => (
          <MsgBubble key={msg.id} msg={msg} onApprove={approveAgentPurchase} onReject={rejectAgentPurchase} />
        ))}
        {typing && (
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ width:28, height:28, borderRadius:'50%', background:SURFACE, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <Bot size={13} color={BLACK} />
            </div>
            <div style={{ background:WHITE, border:`1px solid ${BORDER}`, borderRadius:16, padding:'10px 14px' }}>
              <LoadingDots />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>
      {agentMessages.length <= 2 && (
        <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:10 }}>
          {QUICK.map(p => (
            <button key={p} onClick={() => setInput(p)} style={{ fontSize:11, fontWeight:500, padding:'6px 10px', background:SURFACE, border:`1px solid ${BORDER}`, borderRadius:20, cursor:'pointer', color:TEXT2, fontFamily:F }}>
              {p}
            </button>
          ))}
        </div>
      )}
      <div style={{ display:'flex', gap:8 }}>
        <input
          value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void send()} }}
          placeholder="Ask your agent to find or buy something..."
          style={{ flex:1, padding:'11px 14px', border:`1px solid ${BORDER}`, borderRadius:12, fontFamily:F, fontSize:14, outline:'none', background:WHITE, color:BLACK }}
        />
        <button onClick={() => void send()} disabled={!input.trim()||typing||x402Paying}
          style={{ width:44, height:44, borderRadius:12, background:BLACK, border:'none', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', flexShrink:0, opacity:(!input.trim()||typing||x402Paying)?0.4:1 }}>
          {x402Paying ? <Loader2 size={16} color={WHITE} style={{animation:'spin 1s linear infinite'}} /> : <Send size={16} color={WHITE} />}
        </button>
        <button onClick={clearAgentMessages} style={{ width:44, height:44, borderRadius:12, background:SURFACE, border:`1px solid ${BORDER}`, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', flexShrink:0 }}>
          <X size={16} color={TEXT2} />
        </button>
      </div>
    </div>
  )
}

function MsgBubble({ msg, onApprove, onReject }: { msg:AgentMessage; onApprove:(id:string)=>void; onReject:(id:string)=>void }) {
  if (msg.role === 'user') return (
    <div style={{ display:'flex', justifyContent:'flex-end' }}>
      <div style={{ background:BLACK, color:WHITE, fontSize:13, borderRadius:16, borderTopRightRadius:4, padding:'10px 14px', maxWidth:'78%' }}>{msg.content}</div>
    </div>
  )
  return (
    <div style={{ display:'flex', alignItems:'flex-start', gap:8 }}>
      <div style={{ width:28, height:28, borderRadius:'50%', background:SURFACE, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
        <Bot size={13} color={BLACK} />
      </div>
      <div style={{ flex:1, maxWidth:'90%', display:'flex', flexDirection:'column', gap:8 }}>
        <div style={{ background:WHITE, border:`1px solid ${BORDER}`, borderRadius:16, borderTopLeftRadius:4, padding:'10px 14px', fontSize:13, color:BLACK }}>{msg.content}</div>
        {msg.products && msg.products.length > 0 && msg.products.map(p => <ProductPill key={p.id} product={p} />)}
        {msg.action==='purchase_request' && msg.approved===undefined && (
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => onApprove(msg.id)} style={{ flex:1, height:34, background:BLACK, color:WHITE, border:'none', borderRadius:10, fontSize:12, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6, fontFamily:F }}>
              <Check size={12} /> Approve
            </button>
            <button onClick={() => onReject(msg.id)} style={{ flex:1, height:34, background:SURFACE, color:BLACK, border:`1px solid ${BORDER}`, borderRadius:10, fontSize:12, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6, fontFamily:F }}>
              <X size={12} /> Decline
            </button>
          </div>
        )}
        {msg.action==='purchase_request' && msg.approved===true && <div style={{ fontSize:11, color:SUCCESS, fontWeight:600, display:'flex', alignItems:'center', gap:4 }}><Check size={11} /> Approved</div>}
        {msg.action==='purchase_request' && msg.approved===false && <div style={{ fontSize:11, color:TEXT3, fontWeight:500, display:'flex', alignItems:'center', gap:4 }}><X size={11} /> Declined</div>}
        <div style={{ fontSize:10, color:TEXT3 }}>{formatRelativeTime(msg.timestamp)}</div>
      </div>
    </div>
  )
}

function ProductPill({ product }: { product: Product }) {
  return (
    <div style={{ background:WHITE, border:`1px solid ${BORDER}`, borderRadius:12, padding:'10px 12px', display:'flex', alignItems:'center', gap:10 }}>
      <img src={product.imageUrl} alt={product.name} style={{ width:36, height:36, borderRadius:8, objectFit:'cover', background:SURFACE, flexShrink:0 }} />
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:12, fontWeight:700, color:BLACK, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{product.name}</div>
        <div style={{ fontSize:11, color:TEXT2 }}>{product.merchant}</div>
      </div>
      <div style={{ fontSize:13, fontWeight:700, color:BLACK, flexShrink:0 }}>{product.price} <span style={{ fontSize:10, fontWeight:500, color:TEXT2 }}>USDC</span></div>
    </div>
  )
}

function RecurringTab() {
  const [tasks, setTasks] = useState<RecurringTask[]>([
    { id:'1', description:'Weekly DCA', instruction:'Buy 10 USDC of ETH every Monday at 9am', schedule:'Weekly · Mon 09:00', active:false, nextRun:'Mon 29 Sep 09:00' },
    { id:'2', description:'Monthly savings', instruction:'Bridge 50 USDC to Base Sepolia on the 1st of every month', schedule:'Monthly · 1st', active:false, nextRun:'1 Oct 09:00' },
  ])
  const [showAdd, setShowAdd] = useState(false)
  const [newDesc, setNewDesc] = useState('')
  const [newInstr, setNewInstr] = useState('')
  const [newSched, setNewSched] = useState('')

  const toggle = (id: string) => setTasks(t => t.map(x => x.id===id ? {...x, active:!x.active} : x))
  const remove = (id: string) => setTasks(t => t.filter(x => x.id!==id))
  const add = () => {
    if (!newDesc.trim() || !newInstr.trim()) return
    setTasks(t => [...t, { id:Date.now().toString(), description:newDesc, instruction:newInstr, schedule:newSched||'Manual', active:false }])
    setNewDesc(''); setNewInstr(''); setNewSched(''); setShowAdd(false)
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
        <div>
          <div style={{ fontSize:15, fontWeight:700, color:BLACK, letterSpacing:'-0.02em' }}>Recurring tasks</div>
          <div style={{ fontSize:12, color:TEXT2, marginTop:2 }}>Your agent runs these automatically on schedule</div>
        </div>
        <button onClick={() => setShowAdd(v => !v)} style={{ width:32, height:32, borderRadius:9, background:BLACK, border:'none', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
          <Plus size={16} color={WHITE} />
        </button>
      </div>

      {showAdd && (
        <div style={{ background:SURFACE, border:`1px solid ${BORDER}`, borderRadius:14, padding:16, display:'flex', flexDirection:'column', gap:10 }}>
          <div style={{ fontSize:13, fontWeight:600, color:BLACK }}>New recurring task</div>
          <input placeholder="Task name (e.g. Weekly DCA)" value={newDesc} onChange={e => setNewDesc(e.target.value)}
            style={{ padding:'10px 12px', border:`1px solid ${BORDER}`, borderRadius:10, fontFamily:F, fontSize:13, outline:'none', color:BLACK, background:WHITE }} />
          <textarea placeholder="Instruction for the agent (e.g. Buy 10 USDC of ETH every Monday at 9am)" value={newInstr} onChange={e => setNewInstr(e.target.value)} rows={2}
            style={{ padding:'10px 12px', border:`1px solid ${BORDER}`, borderRadius:10, fontFamily:F, fontSize:13, outline:'none', color:BLACK, background:WHITE, resize:'none' }} />
          <input placeholder="Schedule (e.g. Weekly · Mon 09:00)" value={newSched} onChange={e => setNewSched(e.target.value)}
            style={{ padding:'10px 12px', border:`1px solid ${BORDER}`, borderRadius:10, fontFamily:F, fontSize:13, outline:'none', color:BLACK, background:WHITE }} />
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={add} style={{ flex:1, height:40, background:BLACK, color:WHITE, border:'none', borderRadius:10, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:F }}>Add task</button>
            <button onClick={() => setShowAdd(false)} style={{ flex:1, height:40, background:SURFACE, color:BLACK, border:`1px solid ${BORDER}`, borderRadius:10, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:F }}>Cancel</button>
          </div>
        </div>
      )}

      {tasks.length === 0 && !showAdd && (
        <div style={{ textAlign:'center', padding:'40px 0', color:TEXT3 }}>
          <Repeat size={28} color={TEXT3} style={{ margin:'0 auto 10px' }} />
          <div style={{ fontSize:13 }}>No recurring tasks yet</div>
          <div style={{ fontSize:11, marginTop:4 }}>Tap + to add your first scheduled instruction</div>
        </div>
      )}

      {tasks.map(task => (
        <div key={task.id} style={{ background:WHITE, border:`1px solid ${BORDER}`, borderRadius:14, padding:14, display:'flex', flexDirection:'column', gap:8 }}>
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8 }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:700, color:BLACK }}>{task.description}</div>
              <div style={{ fontSize:11, color:TEXT2, marginTop:2, lineHeight:1.4 }}>{task.instruction}</div>
            </div>
            <div style={{ display:'flex', gap:6, flexShrink:0 }}>
              <button onClick={() => toggle(task.id)} style={{ width:30, height:30, borderRadius:8, background:task.active?BLACK:SURFACE, border:`1px solid ${task.active?BLACK:BORDER}`, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
                {task.active ? <Pause size={13} color={WHITE} /> : <Play size={13} color={BLACK} />}
              </button>
              <button onClick={() => remove(task.id)} style={{ width:30, height:30, borderRadius:8, background:SURFACE, border:`1px solid ${BORDER}`, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
                <Trash2 size={13} color={DANGER} />
              </button>
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8, paddingTop:6, borderTop:`1px solid ${BORDER}` }}>
            <Repeat size={11} color={TEXT3} />
            <span style={{ fontSize:11, color:TEXT3 }}>{task.schedule}</span>
            {task.nextRun && <span style={{ fontSize:11, color:TEXT3, marginLeft:'auto' }}>Next: {task.nextRun}</span>}
            <span style={{ fontSize:10, fontWeight:600, color:task.active?SUCCESS:TEXT3, background:task.active?'#DCFCE7':SURFACE, padding:'2px 8px', borderRadius:20 }}>
              {task.active ? 'Active' : 'Paused'}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

function X402Tab() {
  const { address } = useAccount()
  const [services, setServices] = useState<X402Service[]>([
    { id:'1', name:'Agent Chat API', description:'AI-powered chat endpoint for other agents', price:'0.001', endpoint:'/api/chat', calls:142, earned:'0.142', active:true },
    { id:'2', name:'Market Data Feed', description:'Real-time USDC price and volume data', price:'0.005', endpoint:'/api/market', calls:37, earned:'0.185', active:false },
  ])
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newPrice, setNewPrice] = useState('0.001')
  const [newEndpoint, setNewEndpoint] = useState('')
  const [copied, setCopied] = useState(false)

  const toggle = (id: string) => setServices(s => s.map(x => x.id===id ? {...x, active:!x.active} : x))
  const remove = (id: string) => setServices(s => s.filter(x => x.id!==id))
  const addService = () => {
    if (!newName.trim()) return
    setServices(s => [...s, { id:Date.now().toString(), name:newName, description:newDesc, price:newPrice||'0.001', endpoint:newEndpoint||'/api/'+newName.toLowerCase().replace(/\s+/g,'-'), calls:0, earned:'0', active:true }])
    setNewName(''); setNewDesc(''); setNewPrice('0.001'); setNewEndpoint(''); setShowAdd(false)
  }
  const copyAddress = () => {
    if (address) { navigator.clipboard.writeText(address).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }).catch(() => {}) }
  }

  const totalEarned = services.reduce((sum, s) => sum + parseFloat(s.earned), 0).toFixed(3)
  const totalCalls  = services.reduce((sum, s) => sum + s.calls, 0)

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      {/* What is x402 */}
      <div style={{ background:BLACK, borderRadius:14, padding:16, color:WHITE }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
          <Coins size={16} color={WHITE} />
          <span style={{ fontSize:13, fontWeight:700, letterSpacing:'-0.01em' }}>x402 · Pay-per-use services</span>
        </div>
        <div style={{ fontSize:12, color:'rgba(255,255,255,0.7)', lineHeight:1.5, marginBottom:10 }}>
          Other AI agents and humans pay USDC to call your services. No invoices, no subscriptions — just instant onchain micropayments per API call.
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
          <div style={{ background:'rgba(255,255,255,0.08)', borderRadius:10, padding:'10px 12px' }}>
            <div style={{ fontSize:18, fontWeight:700 }}>{totalEarned} <span style={{ fontSize:11, fontWeight:500, opacity:0.7 }}>USDC</span></div>
            <div style={{ fontSize:11, opacity:0.6, marginTop:2 }}>Total earned</div>
          </div>
          <div style={{ background:'rgba(255,255,255,0.08)', borderRadius:10, padding:'10px 12px' }}>
            <div style={{ fontSize:18, fontWeight:700 }}>{totalCalls}</div>
            <div style={{ fontSize:11, opacity:0.6, marginTop:2 }}>Total calls</div>
          </div>
        </div>
      </div>

      {/* Receiver address */}
      {address && (
        <div style={{ background:SURFACE, border:`1px solid ${BORDER}`, borderRadius:12, padding:'12px 14px' }}>
          <div style={{ fontSize:11, fontWeight:600, color:TEXT2, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:6 }}>Payment receiver</div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ flex:1, fontSize:12, fontWeight:500, color:BLACK, fontFamily:'monospace', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {address.slice(0,10)}…{address.slice(-8)}
            </div>
            <button onClick={copyAddress} style={{ width:30, height:30, borderRadius:8, background:copied?BLACK:WHITE, border:`1px solid ${BORDER}`, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', flexShrink:0 }}>
              {copied ? <Check size={12} color={WHITE} /> : <Copy size={12} color={TEXT2} />}
            </button>
          </div>
          <div style={{ fontSize:11, color:TEXT3, marginTop:4 }}>USDC payments go directly to your connected wallet</div>
        </div>
      )}

      {/* Services list */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ fontSize:14, fontWeight:700, color:BLACK }}>Your services</div>
        <button onClick={() => setShowAdd(v=>!v)} style={{ width:30, height:30, borderRadius:8, background:BLACK, border:'none', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
          <Plus size={15} color={WHITE} />
        </button>
      </div>

      {showAdd && (
        <div style={{ background:SURFACE, border:`1px solid ${BORDER}`, borderRadius:14, padding:16, display:'flex', flexDirection:'column', gap:10 }}>
          <div style={{ fontSize:13, fontWeight:600, color:BLACK }}>Add x402 service</div>
          <input placeholder="Service name" value={newName} onChange={e => setNewName(e.target.value)}
            style={{ padding:'10px 12px', border:`1px solid ${BORDER}`, borderRadius:10, fontFamily:F, fontSize:13, outline:'none', color:BLACK, background:WHITE }} />
          <input placeholder="Description" value={newDesc} onChange={e => setNewDesc(e.target.value)}
            style={{ padding:'10px 12px', border:`1px solid ${BORDER}`, borderRadius:10, fontFamily:F, fontSize:13, outline:'none', color:BLACK, background:WHITE }} />
          <div style={{ display:'flex', gap:8 }}>
            <input placeholder="Price (USDC)" value={newPrice} onChange={e => setNewPrice(e.target.value)} type="number" min="0" step="0.001"
              style={{ flex:1, padding:'10px 12px', border:`1px solid ${BORDER}`, borderRadius:10, fontFamily:F, fontSize:13, outline:'none', color:BLACK, background:WHITE }} />
            <input placeholder="Endpoint (/api/...)" value={newEndpoint} onChange={e => setNewEndpoint(e.target.value)}
              style={{ flex:2, padding:'10px 12px', border:`1px solid ${BORDER}`, borderRadius:10, fontFamily:F, fontSize:13, outline:'none', color:BLACK, background:WHITE }} />
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={addService} style={{ flex:1, height:40, background:BLACK, color:WHITE, border:'none', borderRadius:10, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:F }}>Add service</button>
            <button onClick={() => setShowAdd(false)} style={{ flex:1, height:40, background:SURFACE, color:BLACK, border:`1px solid ${BORDER}`, borderRadius:10, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:F }}>Cancel</button>
          </div>
        </div>
      )}

      {services.map(svc => (
        <div key={svc.id} style={{ background:WHITE, border:`1px solid ${BORDER}`, borderRadius:14, padding:14 }}>
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8, marginBottom:10 }}>
            <div style={{ flex:1 }}>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <span style={{ fontSize:13, fontWeight:700, color:BLACK }}>{svc.name}</span>
                <span style={{ fontSize:10, fontWeight:600, color:svc.active?SUCCESS:TEXT3, background:svc.active?'#DCFCE7':SURFACE, padding:'2px 7px', borderRadius:20 }}>
                  {svc.active?'Live':'Paused'}
                </span>
              </div>
              <div style={{ fontSize:11, color:TEXT2, marginTop:2 }}>{svc.description}</div>
            </div>
            <div style={{ display:'flex', gap:6, flexShrink:0 }}>
              <button onClick={() => toggle(svc.id)} style={{ width:30, height:30, borderRadius:8, background:svc.active?BLACK:SURFACE, border:`1px solid ${svc.active?BLACK:BORDER}`, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
                {svc.active ? <Pause size={13} color={WHITE} /> : <Play size={13} color={BLACK} />}
              </button>
              <button onClick={() => remove(svc.id)} style={{ width:30, height:30, borderRadius:8, background:SURFACE, border:`1px solid ${BORDER}`, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
                <Trash2 size={13} color={DANGER} />
              </button>
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, paddingTop:10, borderTop:`1px solid ${BORDER}` }}>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:BLACK }}>{svc.price} USDC</div>
              <div style={{ fontSize:10, color:TEXT3 }}>per call</div>
            </div>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:BLACK }}>{svc.calls}</div>
              <div style={{ fontSize:10, color:TEXT3 }}>total calls</div>
            </div>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:BLACK }}>{svc.earned} USDC</div>
              <div style={{ fontSize:10, color:TEXT3 }}>earned</div>
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:10 }}>
            <code style={{ flex:1, fontSize:10, color:TEXT2, background:SURFACE, padding:'4px 8px', borderRadius:6, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {svc.endpoint}
            </code>
            <a href={`https://willowy-biscochitos-076df8.netlify.app${svc.endpoint}`} target="_blank" rel="noreferrer"
              style={{ width:26, height:26, borderRadius:7, background:SURFACE, border:`1px solid ${BORDER}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, textDecoration:'none' }}>
              <ExternalLink size={11} color={TEXT2} />
            </a>
          </div>
        </div>
      ))}

      {services.length === 0 && !showAdd && (
        <div style={{ textAlign:'center', padding:'32px 0', color:TEXT3 }}>
          <Coins size={28} color={TEXT3} style={{ margin:'0 auto 10px' }} />
          <div style={{ fontSize:13 }}>No services yet</div>
          <div style={{ fontSize:11, marginTop:4 }}>Add a service to start earning USDC from other agents</div>
        </div>
      )}
    </div>
  )
}

function PermissionsTab() {
  const { agentPermissions, setAgentPermissions } = useAppStore()
  const [daily, setDaily] = useState(agentPermissions.dailyLimit.toString())
  const [perTx, setPerTx] = useState(agentPermissions.perTxLimit.toString())
  const [autoApprove, setAutoApprove] = useState(agentPermissions.autoApproveUnder.toString())
  const [saved, setSaved] = useState(false)
  const categories = CATEGORIES.filter(c => c.id !== 'all')

  const handleSave = () => {
    setAgentPermissions({ dailyLimit:Math.max(0,parseFloat(daily)||0), perTxLimit:Math.max(0,parseFloat(perTx)||0), autoApproveUnder:Math.max(0,parseFloat(autoApprove)||0) })
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }
  const toggleCat = (id: string) => {
    const cats = agentPermissions.allowedCategories
    setAgentPermissions({ allowedCategories: cats.includes(id) ? cats.filter(c=>c!==id) : [...cats, id] })
  }

  const row = (label: string, value: string, setter: (v:string)=>void, suffix: string) => (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 0', borderBottom:`1px solid ${BORDER}` }}>
      <span style={{ fontSize:13, color:BLACK, fontWeight:500 }}>{label}</span>
      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
        <input type="number" min="0" value={value} onChange={e => setter(e.target.value)}
          style={{ width:70, padding:'6px 8px', border:`1px solid ${BORDER}`, borderRadius:8, fontFamily:F, fontSize:13, fontWeight:600, textAlign:'right', outline:'none', color:BLACK, background:SURFACE }} />
        <span style={{ fontSize:11, color:TEXT2, fontWeight:500 }}>{suffix}</span>
      </div>
    </div>
  )

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      {/* Enable toggle */}
      <div style={{ background:WHITE, border:`1px solid ${BORDER}`, borderRadius:14, padding:14, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:36, height:36, borderRadius:10, background:SURFACE, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <Zap size={16} color={BLACK} />
          </div>
          <div>
            <div style={{ fontSize:13, fontWeight:700, color:BLACK }}>Agent enabled</div>
            <div style={{ fontSize:11, color:TEXT2 }}>Allow agent to make purchases</div>
          </div>
        </div>
        <button onClick={() => setAgentPermissions({ enabled:!agentPermissions.enabled })} style={{ background:'none', border:'none', cursor:'pointer', padding:0 }}>
          {agentPermissions.enabled ? <ToggleRight size={28} color={BLACK} /> : <ToggleLeft size={28} color={TEXT3} />}
        </button>
      </div>

      {/* Limits */}
      <div style={{ background:WHITE, border:`1px solid ${BORDER}`, borderRadius:14, padding:'0 14px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'14px 0 10px', borderBottom:`1px solid ${BORDER}` }}>
          <Shield size={14} color={BLACK} />
          <span style={{ fontSize:13, fontWeight:700, color:BLACK }}>Spending limits</span>
        </div>
        {row('Daily limit', daily, setDaily, 'USDC/day')}
        {row('Per transaction', perTx, setPerTx, 'USDC')}
        {row('Auto-approve under', autoApprove, setAutoApprove, 'USDC')}
        <div style={{ padding:'10px 0', fontSize:11, color:TEXT3 }}>Purchases below auto-approve run without asking you.</div>
      </div>

      {/* Require approval */}
      <div style={{ background:WHITE, border:`1px solid ${BORDER}`, borderRadius:14, padding:14, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontSize:13, fontWeight:700, color:BLACK }}>Always require approval</div>
          <div style={{ fontSize:11, color:TEXT2 }}>Agent asks before every purchase</div>
        </div>
        <button onClick={() => setAgentPermissions({ requireApproval:!agentPermissions.requireApproval })} style={{ background:'none', border:'none', cursor:'pointer', padding:0 }}>
          {agentPermissions.requireApproval ? <ToggleRight size={28} color={BLACK} /> : <ToggleLeft size={28} color={TEXT3} />}
        </button>
      </div>

      {/* Categories */}
      <div style={{ background:WHITE, border:`1px solid ${BORDER}`, borderRadius:14, padding:14 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
          <ShoppingBag size={14} color={BLACK} />
          <span style={{ fontSize:13, fontWeight:700, color:BLACK }}>Allowed categories</span>
        </div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
          {categories.map(cat => {
            const on = agentPermissions.allowedCategories.includes(cat.id)
            return (
              <button key={cat.id} onClick={() => toggleCat(cat.id)} style={{ height:32, padding:'0 12px', borderRadius:20, border:`1px solid ${on?BLACK:BORDER}`, background:on?BLACK:SURFACE, color:on?WHITE:BLACK, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:F, display:'flex', alignItems:'center', gap:4 }}>
                {on && <Check size={11} />}{cat.label}
              </button>
            )
          })}
        </div>
      </div>

      <button onClick={handleSave} style={{ width:'100%', height:48, background:BLACK, color:WHITE, border:'none', borderRadius:14, fontSize:14, fontWeight:600, cursor:'pointer', fontFamily:F, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
        {saved ? <><Check size={16} /> Saved</> : 'Save permissions'}
      </button>
    </div>
  )
}

function HistoryTab() {
  const { activity } = useAppStore()
  const agentActivity = activity.filter(a => a.agentInitiated)
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
        <div style={{ fontSize:15, fontWeight:700, color:BLACK }}>Agent activity</div>
        <span style={{ fontSize:12, fontWeight:600, color:TEXT2 }}>{agentActivity.length} actions</span>
      </div>
      {agentActivity.length === 0 ? (
        <div style={{ textAlign:'center', padding:'48px 0', color:TEXT3 }}>
          <Bot size={28} color={TEXT3} style={{ margin:'0 auto 10px' }} />
          <div style={{ fontSize:13 }}>No agent activity yet</div>
          <div style={{ fontSize:11, marginTop:4 }}>Your agent's purchases and actions appear here</div>
        </div>
      ) : agentActivity.map(item => (
        <div key={item.id} style={{ background:WHITE, border:`1px solid ${BORDER}`, borderRadius:14, padding:14, display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ width:36, height:36, borderRadius:10, background:SURFACE, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <Bot size={16} color={BLACK} />
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:13, fontWeight:600, color:BLACK, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.description}</div>
            <div style={{ fontSize:11, color:TEXT2, marginTop:2 }}>{item.counterparty} · {formatRelativeTime(item.timestamp)}</div>
          </div>
          <div style={{ flexShrink:0, textAlign:'right' }}>
            <div style={{ fontSize:13, fontWeight:700, color:BLACK }}>−{formatUSDC(item.amount)} USDC</div>
            <div style={{ fontSize:10, fontWeight:600, color:item.status==='confirmed'?SUCCESS:item.status==='pending'?'#D97706':DANGER, marginTop:2 }}>{item.status}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
