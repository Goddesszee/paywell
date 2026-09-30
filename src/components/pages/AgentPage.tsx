import React, { useState, useRef, useEffect } from 'react'
import {
  Bot, Send, X, Check, Zap, Shield, ShoppingBag,
  ToggleLeft, ToggleRight, Coins, Loader2, Plus,
  Trash2, Play, Pause, ExternalLink, Copy, RefreshCw,
  Search, Globe, Cpu, FileText, AlertTriangle, CheckCircle2,
  Clock, ChevronRight, Sparkles
} from 'lucide-react'
import { useWriteContract, useAccount } from 'wagmi'
import { parseUnits } from 'viem'

import { LoadingDots } from '../ui/Spinner'
import { useAppStore } from '../../store/appStore'
import type { AgentMessage, AgentPermissions } from '../../store/appStore'
import { CATEGORIES, Product } from '../../data/products'
import { getVerifiedProducts } from '../../utils/listings'
import { formatUSDC, formatRelativeTime } from '../../utils/format'
import { nanChat, backendConfigured } from '../../lib/api'
import { getUsdc } from '../../onchain-facts'
import {
  classifyIntent, checkPolicy, orchestrate,
  type AgentPolicy, type OrchestrationUpdate,
} from '../../lib/agent-orchestrator'
import {
  getAllServices, discoverServices,
  type NanService,
  type ServiceDiscoveryResult,
} from '../../lib/agent-registry'

const F       = "'Inter', -apple-system, sans-serif"
const TEXT    = 'var(--nan-text)'
const SURF    = 'var(--nan-surface)'
const SURF2   = 'var(--nan-surface2)'
const BDR     = 'var(--nan-bdr)'
const BLUE    = '#0066FF'
const TEXT2   = 'var(--nan-text2)'
const TEXT3   = 'var(--nan-text3)'
const SUCCESS = '#00C853'
const DANGER  = '#FF3B3B'
const BLACK   = TEXT
const WHITE   = SURF2
const SURFACE = SURF
const BORDER  = BDR

const X402_PRICE = '0.001'
const USDC_TRANSFER_ABI = [{
  name: 'transfer', type: 'function', stateMutability: 'nonpayable',
  inputs: [{ name: 'to', type: 'address' }, { name: 'value', type: 'uint256' }],
  outputs: [{ name: '', type: 'bool' }],
}] as const

type AgentTab = 'chat' | 'discover' | 'policy' | 'log'

interface OrchestratorStep {
  label: string
  detail?: string
  status: 'pending' | 'running' | 'done' | 'error'
}

interface X402Service {
  id: string; name: string; description: string; price: string
  endpoint: string; calls: number; earned: string; active: boolean
}

function simulateAgentResponse(
  userMessage: string,
  permissions: AgentPermissions,
  dailyUsed: number,
  catalog: Product[]
): Omit<AgentMessage, 'id' | 'timestamp'> {
  const msg = userMessage.toLowerCase()
  const dailyRemaining = permissions.dailyLimit - dailyUsed
  const priceMatch = msg.match(/under\s+(\d+)|less than\s+(\d+)|max\s+(\d+)|budget.*?(\d+)/)
  const maxPrice = priceMatch ? parseInt(priceMatch[1] || priceMatch[2] || priceMatch[3] || priceMatch[4]) : null
  const keywords = ['keyboard','headphone','laptop','stand','lamp','backpack','wallet','cable','hub','charger','notebook','template','font','icon']
  const matchedKeyword = keywords.find(k => msg.includes(k))
  const categoryKeywords: Record<string,string> = { tech:'tech', digital:'digital', home:'home', fashion:'fashion', clothes:'fashion', template:'digital', design:'digital' }
  const matchedCategory = Object.keys(categoryKeywords).find(k => msg.includes(k))
  let candidates = catalog.filter(p => {
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
  const TABS: { id: AgentTab; label: string }[] = [
    { id: 'chat',    label: 'Chat' },
    { id: 'discover', label: 'Services' },
    { id: 'policy',  label: 'Policy' },
    { id: 'log',     label: 'Log' },
  ]
  return (
    <div style={{ fontFamily:F, maxWidth:560, margin:'0 auto', padding:'0 0 88px' }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'20px 0 16px' }}>
        <div style={{ width:36, height:36, borderRadius:10, background:BLUE, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <Bot size={18} color="#fff" />
        </div>
        <div>
          <div style={{ fontSize:17, fontWeight:700, color:TEXT, letterSpacing:'-0.02em' }}>NAN Agent</div>
          <AgentStatusLine />
        </div>
      </div>
      <div style={{ display:'flex', background:SURFACE, borderRadius:12, padding:3, marginBottom:16, gap:2 }}>
        {TABS.map(t => {
          const isActive = tab === t.id
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flex:1, padding:'7px 4px', border:'none', borderRadius:9, cursor:'pointer',
              fontFamily:F, fontSize:12, fontWeight:isActive?700:500,
              background:isActive?BLUE:'transparent',
              color:isActive?'#fff':TEXT2,
              transition:'all 0.15s', whiteSpace:'nowrap',
            }}>{t.label}</button>
          )
        })}
      </div>
      {tab === 'chat'     && <AgentChat />}
      {tab === 'discover' && <DiscoverTab />}
      {tab === 'policy'   && <PolicyTab />}
      {tab === 'log'      && <ExecutionLogTab />}
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

// ── Orchestration status stream ───────────────────────────────────────────────

interface OrchestratorStreamProps {
  steps: OrchestratorStep[]
  onConfirm: () => void
  onCancel: () => void
  awaitingConfirmation: boolean
}

function OrchestratorStream({ steps, onConfirm, onCancel, awaitingConfirmation }: OrchestratorStreamProps) {
  if (steps.length === 0) return null
  const iconForStatus = (s: OrchestratorStep['status']) => {
    if (s === 'pending') return <Clock size={12} color={TEXT3} />
    if (s === 'running') return <Loader2 size={12} color={BLUE} style={{ animation:'spin 1s linear infinite' }} />
    if (s === 'done')    return <CheckCircle2 size={12} color={SUCCESS} />
    return <AlertTriangle size={12} color={DANGER} />
  }
  return (
    <div style={{ background:SURF, border:`1px solid ${BDR}`, borderRadius:14, padding:14, marginBottom:10 }}>
      <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:10 }}>
        <Sparkles size={13} color={BLUE} />
        <span style={{ fontSize:12, fontWeight:700, color:TEXT }}>Agent Orchestration</span>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
        {steps.map((step, i) => (
          <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:8 }}>
            <div style={{ marginTop:1, flexShrink:0 }}>{iconForStatus(step.status)}</div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:12, fontWeight:600, color:step.status==='done'?TEXT:step.status==='running'?BLUE:TEXT3 }}>{step.label}</div>
              {step.detail && <div style={{ fontSize:11, color:TEXT3, marginTop:1 }}>{step.detail}</div>}
            </div>
          </div>
        ))}
      </div>
      {awaitingConfirmation && (
        <div style={{ marginTop:12, paddingTop:12, borderTop:`1px solid ${BDR}`, display:'flex', gap:8 }}>
          <button onClick={onConfirm} style={{ flex:1, height:36, background:BLUE, color:'#fff', border:'none', borderRadius:10, fontSize:12, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6, fontFamily:F }}>
            <Check size={12} /> Confirm
          </button>
          <button onClick={onCancel} style={{ flex:1, height:36, background:SURF, color:TEXT, border:`1px solid ${BDR}`, borderRadius:10, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:F }}>
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main chat tab ─────────────────────────────────────────────────────────────

function AgentChat() {
  const {
    agentMessages, addAgentMessage, agentPermissions, agentDailyUsed,
    approveAgentPurchase, rejectAgentPurchase, clearAgentMessages,
    auth, pendingListings, fetchPendingListings,
    addExecutionLog,
  } = useAppStore()
  const verifiedCatalog = React.useMemo(() => getVerifiedProducts(pendingListings), [pendingListings])
  useEffect(() => { fetchPendingListings() }, [fetchPendingListings])
  const { address, chainId } = useAccount()
  const { writeContractAsync } = useWriteContract()
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const [x402Paying, setX402Paying] = useState(false)
  const [orchSteps, setOrchSteps] = useState<OrchestratorStep[]>([])
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false)
  const [pendingConfirmCb, setPendingConfirmCb] = useState<(() => void) | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const sellerAddress = import.meta.env.VITE_X402_SELLER_ADDRESS as string | undefined

  useEffect(() => { endRef.current?.scrollIntoView({ behavior:'smooth' }) }, [agentMessages, typing, orchSteps])

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

  const runOrchestration = async (text: string) => {
    const steps: OrchestratorStep[] = []
    const push = (step: OrchestratorStep) => { steps.push(step); setOrchSteps([...steps]) }
    const updateLast = (step: OrchestratorStep) => { steps[steps.length - 1] = step; setOrchSteps([...steps]) }

    // Step 1 — classify intent
    push({ label: 'Understanding your request…', status: 'running' })
    const intent = classifyIntent(text)
    updateLast({ label: `Intent: ${intent.replace(/_/g, ' ')}`, status: 'done' })

    // Step 2 — discover services
    push({ label: 'Discovering services…', status: 'running' })
    await new Promise(r => setTimeout(r, 400))
    const found: ServiceDiscoveryResult[] = discoverServices(text, 3)
    if (found.length === 0) {
      updateLast({ label: 'No matching service found', detail: 'Falling back to AI knowledge.', status: 'error' })
      addExecutionLog({ taskId: `t-${Date.now()}`, userRequest: text, status: 'error', cost: 0, result: 'No service found' })
      return false
    }
    const best = found[0]
    const svc = best.service
    updateLast({ label: `Found: ${svc.name}`, detail: `${svc.category} · ${svc.price_usdc > 0 ? svc.price_usdc + ' USDC' : 'Free'}`, status: 'done' })

    // Step 3 — policy check
    push({ label: 'Checking spending policy…', status: 'running' })
    await new Promise(r => setTimeout(r, 200))
    const policy: AgentPolicy = {
      dailyLimit: agentPermissions.dailyLimit,
      dailyUsed: agentDailyUsed,
      perServiceLimit: agentPermissions.perServiceLimit ?? 5,
      requireApprovalAbove: agentPermissions.requireApprovalAbove ?? 5,
      requireApproval: agentPermissions.requireApproval,
      enabled: agentPermissions.enabled,
    }
    const policyResult = checkPolicy(svc, policy)
    if (!policyResult.allowed) {
      updateLast({ label: 'Blocked by policy', detail: policyResult.reason ?? 'Policy limit exceeded', status: 'error' })
      addExecutionLog({ taskId: `t-${Date.now()}`, userRequest: text, serviceId: svc.service_id, serviceName: svc.name, status: 'blocked', cost: svc.price_usdc, result: policyResult.reason ?? 'Blocked' })
      return false
    }
    updateLast({ label: 'Policy approved', detail: svc.price_usdc > 0 ? `Cost: ${svc.price_usdc} USDC` : 'Free service', status: 'done' })

    // Step 4 — confirmation if needed
    if (policyResult.requiresConfirmation && svc.price_usdc > 0) {
      push({ label: `Confirm: use ${svc.name} for ${svc.price_usdc} USDC?`, status: 'pending' })
      setOrchSteps([...steps])
      setAwaitingConfirmation(true)
      await new Promise<void>(resolve => {
        setPendingConfirmCb(() => () => {
          setAwaitingConfirmation(false)
          setPendingConfirmCb(null)
          resolve()
        })
      })
      updateLast({ label: 'Confirmed — executing service', status: 'done' })
    }

    // Step 5 — execute via orchestrate()
    push({ label: `Executing ${svc.name}…`, status: 'running' })
    let finalResult = `I searched for "${text}" using ${svc.name}. The service returned relevant results. To enable live results, add the ${svc.name} API key to your environment.`
    try {
      const orchResult = await orchestrate(text, policy, (update: OrchestrationUpdate) => {
        updateLast({ label: update.message, status: update.step === 'error' ? 'error' : 'running' })
      }, svc.service_id)
      if (orchResult.result) finalResult = orchResult.result
    } catch { /* use default result */ }

    updateLast({ label: 'Service complete', detail: finalResult.slice(0, 80), status: 'done' })
    addExecutionLog({ taskId: `t-${Date.now()}`, userRequest: text, serviceId: svc.service_id, serviceName: svc.name, status: 'complete', cost: svc.price_usdc, result: finalResult })
    addAgentMessage({ role: 'agent', content: finalResult, action: 'info' })
    setTimeout(() => setOrchSteps([]), 3000)
    return true
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
    setOrchSteps([])

    // Try orchestration first for complex tasks
    const needsService = /flight|hotel|search|research|find|book|supplier|price|compare|weather|news|data|job|career|invoice|translate|image|video|check|lookup/i.test(text)
    if (needsService && agentPermissions.enabled) {
      setTyping(false)
      const handled = await runOrchestration(text)
      if (handled) return
    }

    // Fall back to LLM / local
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
    addAgentMessage(simulateAgentResponse(text, agentPermissions, agentDailyUsed, verifiedCatalog))
  }

  const QUICK = [
    'Find me the cheapest flight from Lagos to London next Friday',
    'Research top USDC yield opportunities',
    'Find a wireless keyboard under 25 USDC',
    'What can you do for me today?',
  ]

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
        {orchSteps.length > 0 && (
          <OrchestratorStream
            steps={orchSteps}
            awaitingConfirmation={awaitingConfirmation}
            onConfirm={() => pendingConfirmCb && pendingConfirmCb()}
            onCancel={() => {
              setAwaitingConfirmation(false)
              setPendingConfirmCb(null)
              setOrchSteps([])
              addAgentMessage({ role:'agent', content:'Service call cancelled.', action:'info' })
            }}
          />
        )}
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
          placeholder="Ask me anything — I'll find the right service…"
          style={{ flex:1, padding:'11px 14px', border:`1px solid ${BORDER}`, borderRadius:12, fontFamily:F, fontSize:14, outline:'none', background:WHITE, color:BLACK }}
        />
        <button onClick={() => void send()} disabled={!input.trim()||typing||x402Paying}
          style={{ width:44, height:44, borderRadius:12, background:BLUE, border:'none', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', flexShrink:0, opacity:(!input.trim()||typing||x402Paying)?0.4:1 }}>
          {x402Paying ? <Loader2 size={16} color={WHITE} style={{animation:'spin 1s linear infinite'}} /> : <Send size={16} color='#fff' />}
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
      <div style={{ background:BLUE, color:'#fff', fontSize:13, borderRadius:16, borderTopRightRadius:4, padding:'10px 14px', maxWidth:'78%' }}>{msg.content}</div>
    </div>
  )
  return (
    <div style={{ display:'flex', alignItems:'flex-start', gap:8 }}>
      <div style={{ width:28, height:28, borderRadius:'50%', background:SURFACE, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
        <Bot size={13} color={BLACK} />
      </div>
      <div style={{ flex:1, maxWidth:'90%', display:'flex', flexDirection:'column', gap:8 }}>
        <div style={{ background:SURF, border:`1px solid ${BDR}`, borderRadius:16, borderTopLeftRadius:4, padding:'10px 14px', fontSize:13, color:BLACK }}>{msg.content}</div>
        {msg.products && msg.products.length > 0 && msg.products.map(p => <ProductPill key={p.id} product={p} />)}
        {msg.action==='purchase_request' && msg.approved===undefined && (
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => onApprove(msg.id)} style={{ flex:1, height:34, background:BLUE, color:'#fff', border:'none', borderRadius:10, fontSize:12, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6, fontFamily:F }}>
              <Check size={12} /> Approve
            </button>
            <button onClick={() => onReject(msg.id)} style={{ flex:1, height:34, background:SURF, color:TEXT, border:`1px solid ${BDR}`, borderRadius:10, fontSize:12, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6, fontFamily:F }}>
              <X size={12} /> Decline
            </button>
          </div>
        )}
        {msg.action==='purchase_request' && msg.approved===true && <div style={{ fontSize:11, color:BLACK, fontWeight:600, display:'flex', alignItems:'center', gap:4 }}><Check size={11} /> Approved</div>}
        {msg.action==='purchase_request' && msg.approved===false && <div style={{ fontSize:11, color:TEXT3, fontWeight:500, display:'flex', alignItems:'center', gap:4 }}><X size={11} /> Declined</div>}
        <div style={{ fontSize:10, color:TEXT3 }}>{formatRelativeTime(msg.timestamp)}</div>
      </div>
    </div>
  )
}

function ProductPill({ product }: { product: Product }) {
  return (
    <div style={{ background:SURF, border:`1px solid ${BDR}`, borderRadius:12, padding:'10px 12px', display:'flex', alignItems:'center', gap:10 }}>
      <img src={product.imageUrl} alt={product.name} style={{ width:36, height:36, borderRadius:8, objectFit:'cover', background:SURFACE, flexShrink:0 }} />
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:12, fontWeight:700, color:BLACK, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{product.name}</div>
        <div style={{ fontSize:11, color:TEXT2 }}>{product.merchant}</div>
      </div>
      <div style={{ fontSize:13, fontWeight:700, color:BLACK, flexShrink:0 }}>{product.price} <span style={{ fontSize:10, fontWeight:500, color:TEXT2 }}>USDC</span></div>
    </div>
  )
}

// ── Service Discovery Tab ─────────────────────────────────────────────────────

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  search: Search, research: FileText, travel: Globe,
  career: Cpu, data: FileText, developer: Cpu,
  ai: Sparkles, infrastructure: Cpu, digital_services: Globe,
  other_agents: Bot, supplier: ShoppingBag, commerce: ShoppingBag,
}

function DiscoverTab() {
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const allSvcs = getAllServices()
  const categories = ['all', ...Array.from(new Set(allSvcs.map((s: NanService) => s.category)))]
  const filtered = allSvcs.filter((s: NanService) => {
    if (filter !== 'all' && s.category !== filter) return false
    if (query && !s.name.toLowerCase().includes(query.toLowerCase()) && !s.description.toLowerCase().includes(query.toLowerCase())) return false
    return true
  })

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      <div style={{ background:'rgba(0,102,255,0.08)', border:'1px solid rgba(0,102,255,0.18)', borderRadius:14, padding:14 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
          <Globe size={14} color={BLUE} />
          <span style={{ fontSize:13, fontWeight:700, color:TEXT }}>Service Registry</span>
          <span style={{ marginLeft:'auto', fontSize:11, fontWeight:600, color:TEXT3 }}>{allSvcs.length} services</span>
        </div>
        <div style={{ fontSize:12, color:TEXT2, lineHeight:1.5 }}>
          NAN can use these services on your behalf. All payments require your approval unless you configure autopay.
        </div>
      </div>

      {/* Search */}
      <div style={{ position:'relative' }}>
        <Search size={13} color={TEXT3} style={{ position:'absolute', left:11, top:'50%', transform:'translateY(-50%)', pointerEvents:'none' }} />
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search services…"
          style={{ width:'100%', padding:'9px 12px 9px 32px', border:`1px solid ${BDR}`, borderRadius:10, fontFamily:F, fontSize:13, outline:'none', background:SURF2, color:TEXT, boxSizing:'border-box' }} />
      </div>

      {/* Category chips */}
      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
        {categories.map(c => (
          <button key={c} onClick={() => setFilter(c)} style={{
            height:28, padding:'0 12px', borderRadius:20, border:`1px solid ${filter===c?BLUE:BDR}`,
            background:filter===c?BLUE:SURF, color:filter===c?'#fff':TEXT2,
            fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:F,
          }}>{c === 'all' ? 'All' : c}</button>
        ))}
      </div>

      {/* Service cards */}
      {filtered.map(svc => <ServiceCard key={svc.service_id} svc={svc} />)}
      {filtered.length === 0 && (
        <div style={{ textAlign:'center', padding:'40px 0', color:TEXT3 }}>
          <Globe size={28} color={TEXT3} style={{ margin:'0 auto 10px' }} />
          <div style={{ fontSize:13 }}>No services match your filter</div>
        </div>
      )}
    </div>
  )
}

function ServiceCard({ svc }: { svc: NanService }) {
  const Icon = CATEGORY_ICONS[svc.category] ?? Globe
  return (
    <div style={{ background:SURF, border:`1px solid ${BDR}`, borderRadius:14, padding:14 }}>
      <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
        <div style={{ width:34, height:34, borderRadius:9, background:'rgba(0,102,255,0.1)', border:'1px solid rgba(0,102,255,0.18)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <Icon size={15} color={BLUE} />
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
            <span style={{ fontSize:13, fontWeight:700, color:TEXT }}>{svc.name}</span>
            <span style={{ fontSize:10, fontWeight:600, color:TEXT3, textTransform:'uppercase', letterSpacing:'0.05em', background:SURF2, border:`1px solid ${BDR}`, borderRadius:6, padding:'1px 6px' }}>{svc.category}</span>
            {!svc.enabled && <span style={{ fontSize:10, fontWeight:600, color:DANGER, background:'rgba(255,59,59,0.08)', border:'1px solid rgba(255,59,59,0.2)', borderRadius:6, padding:'1px 6px' }}>Disabled</span>}
          </div>
          <div style={{ fontSize:11, color:TEXT2, marginTop:3, lineHeight:1.4 }}>{svc.description}</div>
        </div>
      </div>
      <div style={{ marginTop:10, paddingTop:10, borderTop:`1px solid ${BDR}`, display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
        <div style={{ display:'flex', alignItems:'center', gap:5 }}>
          <Coins size={11} color={TEXT3} />
          <span style={{ fontSize:12, fontWeight:700, color:TEXT }}>{svc.price_usdc > 0 ? `${svc.price_usdc} USDC` : 'Free'}</span>
          {svc.price_usdc > 0 && <span style={{ fontSize:10, color:TEXT3 }}>per call</span>}
        </div>
        <span style={{ fontSize:10, color:TEXT3, marginLeft:'auto' }}>{svc.provider}</span>
        {svc.endpoint && (
          <a href={svc.endpoint.startsWith('http') ? svc.endpoint : '#'} target="_blank" rel="noreferrer"
            style={{ width:26, height:26, borderRadius:7, background:SURF2, border:`1px solid ${BDR}`, display:'flex', alignItems:'center', justifyContent:'center', textDecoration:'none' }}>
            <ChevronRight size={12} color={TEXT2} />
          </a>
        )}
      </div>
      {svc.capabilities.length > 0 && (
        <div style={{ display:'flex', flexWrap:'wrap', gap:5, marginTop:8 }}>
          {svc.capabilities.slice(0, 4).map(cap => (
            <span key={cap} style={{ fontSize:10, color:TEXT3, background:SURF2, border:`1px solid ${BDR}`, borderRadius:6, padding:'2px 7px' }}>{cap}</span>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Policy Tab ────────────────────────────────────────────────────────────────

function PolicyTab() {
  const { agentPermissions, setAgentPermissions } = useAppStore()
  const [daily, setDaily] = useState(agentPermissions.dailyLimit.toString())
  const [perTx, setPerTx] = useState(agentPermissions.perTxLimit.toString())
  const [perSvc, setPerSvc] = useState((agentPermissions.perServiceLimit ?? 1).toString())
  const [autoApprove, setAutoApprove] = useState(agentPermissions.autoApproveUnder.toString())
  const [approvalAbove, setApprovalAbove] = useState((agentPermissions.requireApprovalAbove ?? 5).toString())
  const [saved, setSaved] = useState(false)
  const categories = CATEGORIES.filter(c => c.id !== 'all')

  const handleSave = () => {
    setAgentPermissions({
      dailyLimit: Math.max(0, parseFloat(daily) || 0),
      perTxLimit: Math.max(0, parseFloat(perTx) || 0),
      perServiceLimit: Math.max(0, parseFloat(perSvc) || 0),
      autoApproveUnder: Math.max(0, parseFloat(autoApprove) || 0),
      requireApprovalAbove: Math.max(0, parseFloat(approvalAbove) || 0),
    })
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }
  const toggleCat = (id: string) => {
    const cats = agentPermissions.allowedCategories
    setAgentPermissions({ allowedCategories: cats.includes(id) ? cats.filter(c=>c!==id) : [...cats, id] })
  }

  const row = (label: string, hint: string, value: string, setter: (v:string)=>void, suffix: string) => (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 0', borderBottom:`1px solid ${BORDER}` }}>
      <div>
        <span style={{ fontSize:13, color:BLACK, fontWeight:500 }}>{label}</span>
        <div style={{ fontSize:11, color:TEXT3, marginTop:1 }}>{hint}</div>
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
        <input type="number" min="0" value={value} onChange={e => setter(e.target.value)}
          style={{ width:70, padding:'6px 8px', border:`1px solid ${BORDER}`, borderRadius:8, fontFamily:F, fontSize:13, fontWeight:600, textAlign:'right', outline:'none', color:BLACK, background:SURFACE }} />
        <span style={{ fontSize:11, color:TEXT2, fontWeight:500, minWidth:55 }}>{suffix}</span>
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
            <div style={{ fontSize:11, color:TEXT2 }}>Allow agent to discover and call services</div>
          </div>
        </div>
        <button onClick={() => setAgentPermissions({ enabled:!agentPermissions.enabled })} style={{ background:'none', border:'none', cursor:'pointer', padding:0 }}>
          {agentPermissions.enabled ? <ToggleRight size={28} color={BLUE} /> : <ToggleLeft size={28} color={TEXT3} />}
        </button>
      </div>

      {/* Spending limits */}
      <div style={{ background:SURF, border:`1px solid ${BDR}`, borderRadius:14, padding:'0 14px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'14px 0 10px', borderBottom:`1px solid ${BORDER}` }}>
          <Shield size={14} color={BLACK} />
          <span style={{ fontSize:13, fontWeight:700, color:BLACK }}>Spending policy</span>
        </div>
        {row('Daily limit', 'Total agent spend per day', daily, setDaily, 'USDC/day')}
        {row('Per transaction', 'Max per purchase', perTx, setPerTx, 'USDC')}
        {row('Per service call', 'Max per API/service call', perSvc, setPerSvc, 'USDC')}
        {row('Auto-approve under', 'Skip confirmation below this', autoApprove, setAutoApprove, 'USDC')}
        {row('Always ask above', 'Require approval above this', approvalAbove, setApprovalAbove, 'USDC')}
        <div style={{ padding:'10px 0', fontSize:11, color:TEXT3 }}>Agent never has unrestricted financial authority. All payments pass through NAN wallet.</div>
      </div>

      {/* Require approval */}
      <div style={{ background:WHITE, border:`1px solid ${BORDER}`, borderRadius:14, padding:14, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontSize:13, fontWeight:700, color:BLACK }}>Always require approval</div>
          <div style={{ fontSize:11, color:TEXT2 }}>Agent asks before every service call</div>
        </div>
        <button onClick={() => setAgentPermissions({ requireApproval:!agentPermissions.requireApproval })} style={{ background:'none', border:'none', cursor:'pointer', padding:0 }}>
          {agentPermissions.requireApproval ? <ToggleRight size={28} color={BLUE} /> : <ToggleLeft size={28} color={TEXT3} />}
        </button>
      </div>

      {/* Allowed categories */}
      <div style={{ background:WHITE, border:`1px solid ${BORDER}`, borderRadius:14, padding:14 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
          <ShoppingBag size={14} color={BLACK} />
          <span style={{ fontSize:13, fontWeight:700, color:BLACK }}>Allowed categories</span>
        </div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
          {categories.map(cat => {
            const on = agentPermissions.allowedCategories.includes(cat.id)
            return (
              <button key={cat.id} onClick={() => toggleCat(cat.id)} style={{ height:32, padding:'0 12px', borderRadius:20, border:`1px solid ${on?BLUE:BDR}`, background:on?BLUE:SURF, color:on?'#fff':TEXT, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:F, display:'flex', alignItems:'center', gap:4 }}>
                {on && <Check size={11} />}{cat.label}
              </button>
            )
          })}
        </div>
      </div>

      <button onClick={handleSave} style={{ width:'100%', height:48, background:BLUE, color:'#fff', border:'none', borderRadius:14, fontSize:14, fontWeight:600, cursor:'pointer', fontFamily:F, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
        {saved ? <><Check size={16} /> Saved</> : 'Save policy'}
      </button>
    </div>
  )
}

// ── Execution Log Tab ─────────────────────────────────────────────────────────

function ExecutionLogTab() {
  const { agentExecutionLog, clearExecutionLog, activity } = useAppStore()
  const agentActivity = activity.filter(a => a.agentInitiated)

  const statusColor = (s: string) => {
    if (s === 'complete') return SUCCESS
    if (s === 'blocked_by_policy') return DANGER
    if (s === 'awaiting_confirmation') return '#FF9500'
    if (s === 'failed') return DANGER
    return TEXT3
  }
  const statusLabel = (s: string) => {
    if (s === 'complete') return 'Complete'
    if (s === 'blocked_by_policy') return 'Blocked'
    if (s === 'awaiting_confirmation') return 'Awaiting'
    if (s === 'no_service_found') return 'No service'
    if (s === 'failed') return 'Failed'
    return s
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
        <div style={{ fontSize:15, fontWeight:700, color:BLACK }}>Execution log</div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <span style={{ fontSize:12, fontWeight:600, color:TEXT2 }}>{agentExecutionLog.length} runs</span>
          {agentExecutionLog.length > 0 && (
            <button onClick={clearExecutionLog} style={{ fontSize:11, color:TEXT3, background:'none', border:'none', cursor:'pointer', padding:0, textDecoration:'underline', fontFamily:F }}>Clear</button>
          )}
        </div>
      </div>

      {agentExecutionLog.length === 0 && agentActivity.length === 0 ? (
        <div style={{ textAlign:'center', padding:'48px 0', color:TEXT3 }}>
          <Bot size={28} color={TEXT3} style={{ margin:'0 auto 10px' }} />
          <div style={{ fontSize:13 }}>No agent executions yet</div>
          <div style={{ fontSize:11, marginTop:4 }}>Ask the agent to find something — service calls appear here</div>
        </div>
      ) : (
        <>
          {agentExecutionLog.map(entry => (
            <div key={entry.id} style={{ background:SURF, border:`1px solid ${BDR}`, borderRadius:14, padding:14 }}>
              <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
                <div style={{ width:32, height:32, borderRadius:9, background:'rgba(0,102,255,0.1)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <Bot size={14} color={BLUE} />
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight:600, color:TEXT, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{entry.userRequest}</div>
                  {entry.serviceName && <div style={{ fontSize:11, color:TEXT2, marginTop:2 }}>via {entry.serviceName}</div>}
                  {entry.result && <div style={{ fontSize:11, color:TEXT3, marginTop:4, lineHeight:1.4 }}>{entry.result.slice(0, 100)}{entry.result.length > 100 ? '…' : ''}</div>}
                </div>
                <div style={{ flexShrink:0, textAlign:'right' }}>
                  <div style={{ fontSize:11, fontWeight:700, color:statusColor(entry.status) }}>{statusLabel(entry.status)}</div>
                  {entry.cost > 0 && <div style={{ fontSize:11, color:TEXT3, marginTop:2 }}>−{entry.cost} USDC</div>}
                </div>
              </div>
            </div>
          ))}
          {agentActivity.map(item => (
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
                <div style={{ fontSize:10, fontWeight:600, color:TEXT3, marginTop:2 }}>{item.status}</div>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
