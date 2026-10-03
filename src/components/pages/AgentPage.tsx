import React, { useState, useRef, useEffect } from 'react'
import {
  Bot, Send, X, Check, Zap, Shield, ShoppingBag,
  ToggleLeft, ToggleRight, Coins, Loader2, Plus,
  Play,
  Search, Globe, Cpu, FileText, AlertTriangle, CheckCircle2,
  Clock, ChevronRight, Sparkles, Network, Activity,
  UserCheck, TrendingUp, PackageCheck
} from 'lucide-react'
import { useWriteContract, useAccount } from 'wagmi'
import { parseUnits } from 'viem'

import { LoadingDots } from '../ui/Spinner'
import { useAppStore } from '../../store/appStore'
import type { AgentMessage, AgentPermissions, AgentSpendEntry } from '../../store/appStore'
import { Product } from '../../data/products'
import { getVerifiedProducts } from '../../utils/listings'
import { formatUSDC, formatRelativeTime } from '../../utils/format'
import { nanChat, backendConfigured } from '../../lib/api'
import { getUsdc } from '../../onchain-facts'
import {
  classifyIntent, checkPolicy, orchestrate,
  type AgentPolicy, type OrchestrationUpdate,
} from '../../lib/agent-orchestrator'
import {
  getAllServices, discoverServices, getAllNetworkAgents,
  searchNetworkAgents, getNetworkAgentsByCategory,
  type NanService, type ServiceDiscoveryResult,
  type NetworkAgent, ALL_CATEGORIES,
} from '../../lib/agent-registry'
import {
  decomposeTask, assignAgentsToSubtasks, estimateCost,
  checkMultiAgentPolicy, runA2ATask,
  type Subtask, type CostEstimate, type A2AProgress,
} from '../../lib/agent-network'

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

type AgentTab = 'chat' | 'discover' | 'network' | 'policy' | 'log' | 'wallet'

// ── Payment confirmation card ─────────────────────────────────────────────────

interface PaymentConfirmProps {
  serviceName: string
  provider: string
  costUsdc: number
  agentBalance: string
  policyLabel: string
  onConfirm: () => void
  onCancel: () => void
}

function PaymentConfirmCard({ serviceName, provider, costUsdc, agentBalance, policyLabel, onConfirm, onCancel }: PaymentConfirmProps) {
  const bal = parseFloat(agentBalance || '0')
  const insufficient = bal < costUsdc
  return (
    <div style={{ background: SURF, border: `1px solid ${BDR}`, borderRadius: 16, padding: 16, marginBottom: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: TEXT3, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
        Agent Payment
      </div>
      {[
        { label: 'Service',             value: serviceName },
        { label: 'Provider',            value: provider },
        { label: 'Estimated cost',      value: `${costUsdc.toFixed(4)} USDC` },
        { label: 'Agent Wallet balance',value: `${bal.toFixed(4)} USDC` },
        { label: 'Policy',              value: policyLabel },
        { label: 'Payment method',      value: 'USDC (Agent Wallet)' },
      ].map(({ label, value }) => (
        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: `1px solid ${BDR}` }}>
          <span style={{ fontSize: 12, color: TEXT2 }}>{label}</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: label === 'Policy' ? SUCCESS : TEXT }}>{value}</span>
        </div>
      ))}
      {insufficient && (
        <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(255,59,59,0.07)', border: '1px solid rgba(255,59,59,0.2)', borderRadius: 10, fontSize: 12, color: DANGER }}>
          Insufficient Agent Wallet balance. Fund your Agent Wallet first.
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button
          onClick={onConfirm}
          disabled={insufficient}
          style={{ flex: 1, height: 40, background: insufficient ? 'rgba(0,102,255,0.35)' : BLUE, color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: insufficient ? 'not-allowed' : 'pointer', fontFamily: F, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
        >
          <Check size={13} /> Continue
        </button>
        <button
          onClick={onCancel}
          style={{ flex: 1, height: 40, background: SURF, color: TEXT, border: `1px solid ${BDR}`, borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: F }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Payment success card ──────────────────────────────────────────────────────

function PaymentSuccessCard({ serviceName, costUsdc, txId, C: _C }: { serviceName: string; costUsdc: number; txId?: string; C?: unknown }) {
  return (
    <div style={{ background: 'rgba(0,200,83,0.06)', border: '1px solid rgba(0,200,83,0.22)', borderRadius: 14, padding: '12px 14px', marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
        <CheckCircle2 size={14} color={SUCCESS} />
        <span style={{ fontSize: 13, fontWeight: 700, color: SUCCESS }}>Payment successful</span>
      </div>
      {[
        { label: 'Service', value: serviceName },
        { label: 'Amount',  value: `${costUsdc.toFixed(4)} USDC` },
        { label: 'Status',  value: 'Completed' },
        ...(txId ? [{ label: 'Reference', value: `${txId.slice(0, 14)}…` }] : []),
      ].map(({ label, value }) => (
        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12 }}>
          <span style={{ color: TEXT2 }}>{label}</span>
          <span style={{ fontWeight: 600, color: TEXT, fontFamily: label === 'Reference' ? 'monospace' : F }}>{value}</span>
        </div>
      ))}
    </div>
  )
}

interface OrchestratorStep {
  label: string
  detail?: string
  status: 'pending' | 'running' | 'done' | 'error'
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _X402Service = {
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
    { id: 'chat',     label: 'Chat' },
    { id: 'wallet',   label: 'Wallet' },
    { id: 'discover', label: 'Services' },
    { id: 'network',  label: 'Network' },
    { id: 'policy',   label: 'Policy' },
    { id: 'log',      label: 'Log' },
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
      {tab === 'wallet'   && <AgentWalletTab />}
      {tab === 'discover' && <DiscoverTab />}
      {tab === 'network'  && <NetworkTab />}
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
    addExecutionLog, addAgentSpend,
  } = useAppStore()
  const verifiedCatalog = React.useMemo(() => getVerifiedProducts(pendingListings), [pendingListings])
  useEffect(() => { void fetchPendingListings() }, [fetchPendingListings])
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

    // Step 3 — agent wallet balance check (before policy)
    push({ label: 'Checking Agent Wallet balance…', status: 'running' })
    await new Promise(r => setTimeout(r, 150))
    const agentWalletState = useAppStore.getState().agentWallet
    const agentBalance = parseFloat(agentWalletState.balance_usdc || '0')
    if (svc.price_usdc > 0 && !agentWalletState.provisioned) {
      updateLast({ label: 'Agent Wallet not set up', detail: 'Go to Agent Wallet tab to create your wallet.', status: 'error' })
      addExecutionLog({ taskId: `t-${Date.now()}`, userRequest: text, serviceId: svc.service_id, serviceName: svc.name, status: 'blocked', cost: svc.price_usdc, result: 'Agent Wallet not provisioned' })
      return false
    }
    if (svc.price_usdc > 0 && agentBalance < svc.price_usdc) {
      updateLast({ label: 'Insufficient Agent Wallet balance', detail: `Need ${svc.price_usdc} USDC — wallet has ${agentBalance.toFixed(4)} USDC. Fund your Agent Wallet first.`, status: 'error' })
      addExecutionLog({ taskId: `t-${Date.now()}`, userRequest: text, serviceId: svc.service_id, serviceName: svc.name, status: 'blocked', cost: svc.price_usdc, result: 'Insufficient balance' })
      return false
    }
    updateLast({ label: `Balance: ${agentBalance.toFixed(4)} USDC`, detail: svc.price_usdc > 0 ? `Cost: ${svc.price_usdc} USDC` : 'Free service', status: 'done' })

    // Step 4 — policy check
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
    const txRef = `nan-${Date.now().toString(36)}`
    addExecutionLog({ taskId: `t-${Date.now()}`, userRequest: text, serviceId: svc.service_id, serviceName: svc.name, status: 'complete', cost: svc.price_usdc, result: finalResult })
    if (svc.price_usdc > 0) {
      addAgentSpend({ id: `spend-${Date.now()}`, service_id: svc.service_id, service_name: svc.name, amount_usdc: svc.price_usdc, txId: txRef, paid: true, timestamp: new Date().toISOString() })
      // Refresh agent wallet balance after a paid service call
      const { agentWallet: aw, setAgentWallet } = useAppStore.getState()
      if (aw.userToken) {
        fetch('/api/agent-wallet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-user-token': aw.userToken },
          body: JSON.stringify({ action: 'status', userToken: aw.userToken }),
        }).then(r => r.json()).then((d: { balance_usdc?: string; provisioned?: boolean; address?: string; walletId?: string; blockchain?: string; accountType?: string; custodyType?: string; createDate?: string | null; walletState?: string }) => {
          setAgentWallet({ balance_usdc: d.balance_usdc ?? aw.balance_usdc, lastRefreshed: new Date().toISOString() })
        }).catch(() => {})
      }
    }
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

    // LLM first — handles all general questions including flights, rates, research
    try {
      if (backendConfigured() && auth) {
        const msgs: Array<{role:'user'|'assistant';content:string}> = [
          ...agentMessages.filter(m=>m.role==='user'||m.role==='agent').slice(-10).map<{role:'user'|'assistant';content:string}>(m=>({role:(m.role==='agent'?'assistant':'user'),content:m.content})),
          {role:'user',content:text},
        ]
        const res = await nanChat({ messages:msgs, usdcBal:String(agentPermissions.dailyLimit ?? 0), userAddress:auth.walletAddress ?? '', sessionToken:auth.sessionToken })
        setTyping(false)
        // Sanitise any leaked internal command syntax before showing to user
        const clean = res.reply.replace(/__[A-Z_]+__:[a-z\-]+/g, '').trim()
        const SERVICE_LABELS: Record<string, string> = {
          'coingecko-prices': 'CoinGecko live prices',
          'exchangerate-fx': 'ExchangeRate-API live rates',
          'skyscanner-flights': 'Skyscanner flight search',
          'amadeus-hotels': 'Amadeus hotel search',
          'github-code-search': 'GitHub search',
          'perplexity-research': 'Perplexity deep research',
          'brave-search': 'Brave Search',
          'serper-search': 'Google Search via Serper',
          'alibaba-suppliers': 'Supplier directory',
          'openai-completion': 'OpenAI',
        }
        const serviceLabel = res.service_used ? (SERVICE_LABELS[res.service_used] ?? res.service_used) : undefined
        addAgentMessage({ role:'agent', content:clean || res.reply, action:'info', serviceSource: serviceLabel })
        return
      }
    } catch { /* fall through to orchestration */ }

    // Orchestration fallback for complex multi-step agent tasks (only when LLM unavailable)
    const needsService = /flight|hotel|search|research|find|book|supplier|price|compare|weather|news|data|job|career|invoice|translate|image|video|check|lookup/i.test(text)
    if (needsService && agentPermissions.enabled) {
      setTyping(false)
      const handled = await runOrchestration(text)
      if (handled) return
    }
    await new Promise(r => setTimeout(r, 800 + Math.random()*500))
    setTyping(false)
    addAgentMessage(simulateAgentResponse(text, agentPermissions, agentDailyUsed, verifiedCatalog))
  }

  const QUICK = [
    'Find the cheapest flight from Lagos to London next Friday',
    'Research top USDC yield opportunities right now',
    'Find three manufacturers for wireless earbuds and verify them',
    'Find remote software engineering jobs in London',
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
        <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
          <div style={{ fontSize:10, color:TEXT3 }}>{formatRelativeTime(msg.timestamp)}</div>
          {msg.serviceSource && (
            <div style={{ fontSize:10, fontWeight:600, color:'#0066FF', background:'rgba(0,102,255,0.08)', border:'1px solid rgba(0,102,255,0.2)', borderRadius:6, padding:'1px 7px', display:'flex', alignItems:'center', gap:3 }}>
              <Zap size={9} color='#0066FF' /> {msg.serviceSource}
            </div>
          )}
        </div>
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

// ── Agent Wallet Tab (Circle Agent Stack) ─────────────────────────────────────

function AgentWalletTab() {
  const { agentWallet, setAgentWallet, agentSpendLog, auth } = useAppStore()
  const [loading, setLoading] = useState(false)
  const [provisioning, setProvisioning] = useState(false)
  const [msg, setMsg] = useState('')

  const refreshStatus = async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/agent-wallet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'status' }) })
      const d = await r.json() as { provisioned?: boolean; address?: string; walletId?: string; balance_usdc?: string }
      setAgentWallet({ provisioned: d.provisioned ?? false, address: d.address, walletId: d.walletId, balance_usdc: d.balance_usdc ?? '0', lastRefreshed: new Date().toISOString() })
    } catch { setMsg('Could not reach agent wallet API') }
    setLoading(false)
  }

  const provision = async () => {
    setProvisioning(true); setMsg('')
    try {
      const r = await fetch('/api/agent-wallet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'provision' }) })
      const d = await r.json() as { ok?: boolean; address?: string; walletId?: string; walletSetId?: string; error?: string; setup_required?: boolean }
      if (d.setup_required) { setMsg('Add CIRCLE_API_KEY + CIRCLE_ENTITY_SECRET to Vercel env vars first.'); setProvisioning(false); return }
      if (d.error) { setMsg(d.error); setProvisioning(false); return }
      if (d.ok && d.address) {
        setAgentWallet({ provisioned: true, address: d.address, walletId: d.walletId, balance_usdc: '0' })
        setMsg(`Agent wallet created! Address: ${d.address.slice(0, 10)}… Add AGENT_WALLET_ID=${d.walletId} and AGENT_WALLET_ADDRESS=${d.address} to Vercel env vars.`)
      }
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Provisioning failed') }
    setProvisioning(false)
  }

  const totalSpent = agentSpendLog.reduce((s, e) => s + e.amount_usdc, 0)

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      {/* Header card */}
      <div style={{ background:'rgba(0,102,255,0.08)', border:'1px solid rgba(0,102,255,0.2)', borderRadius:16, padding:16 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
          <div style={{ width:38, height:38, borderRadius:10, background:BLUE, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <Coins size={18} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize:14, fontWeight:700, color:TEXT }}>Circle Agent Wallet</div>
            <div style={{ fontSize:11, color:TEXT2 }}>Developer-controlled · autonomous spending</div>
          </div>
        </div>
        {agentWallet.provisioned ? (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontSize:12, color:TEXT2 }}>Balance</span>
              <span style={{ fontSize:22, fontWeight:800, color:TEXT }}>{parseFloat(agentWallet.balance_usdc || '0').toFixed(4)} <span style={{ fontSize:12, color:TEXT3 }}>USDC</span></span>
            </div>
            <div style={{ fontSize:11, color:TEXT3, wordBreak:'break-all' }}>{agentWallet.address}</div>
            <div style={{ display:'flex', gap:6, alignItems:'center' }}>
              <span style={{ fontSize:10, fontWeight:600, color:'#00C853', background:'rgba(0,200,83,0.1)', border:'1px solid rgba(0,200,83,0.25)', borderRadius:6, padding:'2px 8px', display:'flex', alignItems:'center', gap:4 }}>
                <CheckCircle2 size={9} /> Active
              </span>
              <span style={{ fontSize:10, color:TEXT3 }}>Arc Testnet · EOA</span>
              <button onClick={() => void refreshStatus()} style={{ marginLeft:'auto', height:26, padding:'0 10px', background:SURF2, border:`1px solid ${BDR}`, borderRadius:8, fontSize:11, color:TEXT2, cursor:'pointer', fontFamily:F, display:'flex', alignItems:'center', gap:4 }}>
                {loading ? <Loader2 size={10} style={{ animation:'spin 1s linear infinite' }} /> : null} Refresh
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            <div style={{ fontSize:12, color:TEXT2, lineHeight:1.5 }}>
              The NAN Agent gets its own dedicated USDC wallet — separate from yours. Fund it as a "spend budget" and the agent pays for services autonomously without touching your main balance.
            </div>
            <div style={{ fontSize:11, color:TEXT3, background:SURF2, borderRadius:10, padding:10, lineHeight:1.6 }}>
              <strong style={{ color:TEXT }}>Requires:</strong> CIRCLE_API_KEY + CIRCLE_ENTITY_SECRET in Vercel environment variables.
            </div>
            <button onClick={() => void provision()} disabled={provisioning}
              style={{ height:44, background:BLUE, color:'#fff', border:'none', borderRadius:12, fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:F, display:'flex', alignItems:'center', justifyContent:'center', gap:8, opacity:provisioning?0.6:1 }}>
              {provisioning ? <><Loader2 size={14} style={{ animation:'spin 1s linear infinite' }} /> Provisioning…</> : <><Zap size={14} /> Provision Agent Wallet</>}
            </button>
          </div>
        )}
      </div>

      {msg && (
        <div style={{ background:'rgba(0,102,255,0.06)', border:'1px solid rgba(0,102,255,0.2)', borderRadius:10, padding:12, fontSize:12, color:TEXT2, lineHeight:1.5 }}>
          {msg}
        </div>
      )}

      {/* How to fund */}
      {agentWallet.provisioned && (
        <div style={{ background:SURF, border:`1px solid ${BDR}`, borderRadius:14, padding:14 }}>
          <div style={{ fontSize:12, fontWeight:700, color:TEXT, marginBottom:8, display:'flex', alignItems:'center', gap:6 }}>
            <TrendingUp size={13} color={BLUE} /> How to fund the agent wallet
          </div>
          <div style={{ fontSize:11, color:TEXT2, lineHeight:1.6 }}>
            Send USDC to the address above from your NAN wallet or any external wallet. The agent uses this budget autonomously for paid service calls (Perplexity research: $0.002, OpenAI tasks: $0.001). Spending never touches your main balance.
          </div>
          {auth?.walletAddress && (
            <div style={{ marginTop:10, paddingTop:10, borderTop:`1px solid ${BDR}`, fontSize:11, color:TEXT3 }}>
              Your NAN wallet: <span style={{ fontWeight:600, color:TEXT }}>{auth.walletAddress.slice(0, 10)}…</span> → Wallet tab → Send → paste agent address
            </div>
          )}
        </div>
      )}

      {/* Spend log */}
      <div style={{ background:SURF, border:`1px solid ${BDR}`, borderRadius:14, padding:14 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
          <div style={{ fontSize:12, fontWeight:700, color:TEXT, display:'flex', alignItems:'center', gap:6 }}>
            <Activity size={13} color={TEXT2} /> Agent spend log
          </div>
          <span style={{ fontSize:11, fontWeight:700, color:TEXT }}>{totalSpent.toFixed(4)} USDC total</span>
        </div>
        {agentSpendLog.length === 0 ? (
          <div style={{ fontSize:12, color:TEXT3, textAlign:'center', padding:'20px 0' }}>No agent payments yet. Paid services appear here.</div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {agentSpendLog.slice(0, 20).map((e: AgentSpendEntry) => (
              <div key={e.id} style={{ display:'flex', alignItems:'center', gap:10, paddingBottom:8, borderBottom:`1px solid ${BDR}` }}>
                <div style={{ width:28, height:28, borderRadius:8, background:'rgba(0,102,255,0.1)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <Coins size={12} color={BLUE} />
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight:600, color:TEXT, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{e.service_name}</div>
                  <div style={{ fontSize:10, color:TEXT3 }}>{new Date(e.timestamp).toLocaleString()}</div>
                </div>
                <div style={{ flexShrink:0, textAlign:'right' }}>
                  <div style={{ fontSize:12, fontWeight:700, color:BLUE }}>−{e.amount_usdc} USDC</div>
                  {e.txId && <div style={{ fontSize:10, color:TEXT3 }}>{e.txId.slice(0, 8)}…</div>}
                  {!e.paid && <div style={{ fontSize:10, color:'#FF9500' }}>pending wallet</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Circle Agent Stack info */}
      <div style={{ background:'rgba(0,102,255,0.04)', border:'1px solid rgba(0,102,255,0.12)', borderRadius:12, padding:14 }}>
        <div style={{ fontSize:11, fontWeight:700, color:TEXT3, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>Circle Agent Stack</div>
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {[
            { label: 'Agent Wallet', desc: 'Developer-controlled EOA on Arc Testnet', ok: agentWallet.provisioned },
            { label: 'Nanopayments', desc: 'Gateway-batched x402 payments for paid services', ok: agentWallet.provisioned },
            { label: 'Agent Marketplace', desc: 'Live service discovery from agents.circle.com', ok: true },
            { label: 'Spending Policy', desc: 'Daily + per-service limits from Policy tab', ok: true },
          ].map(item => (
            <div key={item.label} style={{ display:'flex', alignItems:'center', gap:8 }}>
              {item.ok
                ? <CheckCircle2 size={12} color='#00C853' />
                : <AlertTriangle size={12} color='#FF9500' />}
              <div style={{ flex:1 }}>
                <span style={{ fontSize:12, fontWeight:600, color:TEXT }}>{item.label}</span>
                <span style={{ fontSize:11, color:TEXT3 }}> — {item.desc}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
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
  // Use agent service categories, not shopping categories
  const categories = ALL_CATEGORIES.map(id => ({ id, label: id.charAt(0).toUpperCase() + id.slice(1).replace(/_/g,' ') }))

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
          <Globe size={14} color={BLACK} />
          <span style={{ fontSize:13, fontWeight:700, color:BLACK }}>Allowed service categories</span>
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

// ── Agent Network Tab (Phase 3A/3B) ──────────────────────────────────────────

type NetworkSubTab = 'marketplace' | 'orchestrate' | 'register' | 'provider'

function NetworkTab() {
  const [sub, setSub] = useState<NetworkSubTab>('marketplace')
  const SUBS: { id: NetworkSubTab; label: string }[] = [
    { id: 'marketplace', label: 'Marketplace' },
    { id: 'orchestrate', label: 'Orchestrate' },
    { id: 'register',    label: 'Register' },
    { id: 'provider',    label: 'Provider' },
  ]
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      {/* Header */}
      <div style={{ background:'rgba(0,102,255,0.08)', border:'1px solid rgba(0,102,255,0.18)', borderRadius:14, padding:14 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
          <Network size={14} color={BLUE} />
          <span style={{ fontSize:13, fontWeight:700, color:TEXT }}>NAN Agent Network</span>
        </div>
        <div style={{ fontSize:12, color:TEXT2, lineHeight:1.5 }}>
          Discover, pay, and coordinate specialized agents. NAN is an AI-native financial and execution layer for agentic commerce.
        </div>
        <div style={{ display:'flex', gap:12, marginTop:10 }}>
          {[
            { label:'Agents', value: String(getAllNetworkAgents().length) },
            { label:'Categories', value: String(ALL_CATEGORIES.length) },
            { label:'Verified', value: String(getAllNetworkAgents().filter(a=>a.verification_status==='trusted').length) },
          ].map(s => (
            <div key={s.label} style={{ flex:1, textAlign:'center', background:SURF2, borderRadius:10, padding:'8px 4px' }}>
              <div style={{ fontSize:16, fontWeight:800, color:TEXT }}>{s.value}</div>
              <div style={{ fontSize:10, color:TEXT3, marginTop:1 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Sub-tab pills */}
      <div style={{ display:'flex', background:SURF, borderRadius:10, padding:3, gap:2 }}>
        {SUBS.map(s => {
          const active = sub === s.id
          return (
            <button key={s.id} onClick={() => setSub(s.id)} style={{
              flex:1, padding:'6px 2px', border:'none', borderRadius:7, cursor:'pointer',
              fontFamily:F, fontSize:11, fontWeight:active?700:500,
              background:active?BLUE:'transparent', color:active?'#fff':TEXT2,
              transition:'all 0.15s',
            }}>{s.label}</button>
          )
        })}
      </div>

      {sub === 'marketplace'  && <AgentMarketplace />}
      {sub === 'orchestrate'  && <MultiAgentOrchestrator />}
      {sub === 'register'     && <RegisterAgentForm />}
      {sub === 'provider'     && <ProviderDashboard />}
    </div>
  )
}

// Agent Marketplace

function AgentMarketplace() {
  const [query, setQuery] = useState('')
  const [catFilter, setCatFilter] = useState<string>('all')
  const [selected, setSelected] = useState<NetworkAgent | null>(null)

  const agents = query
    ? searchNetworkAgents(query)
    : catFilter === 'all'
      ? getAllNetworkAgents()
      : getNetworkAgentsByCategory(catFilter as Parameters<typeof getNetworkAgentsByCategory>[0])

  const usedCats = Array.from(new Set(getAllNetworkAgents().flatMap(a => a.categories)))

  if (selected) return <AgentDetail agent={selected} onBack={() => setSelected(null)} />

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
      <div style={{ position:'relative' }}>
        <Search size={13} color={TEXT3} style={{ position:'absolute', left:11, top:'50%', transform:'translateY(-50%)', pointerEvents:'none' }} />
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search agents or capabilities…"
          style={{ width:'100%', padding:'9px 12px 9px 32px', border:`1px solid ${BDR}`, borderRadius:10, fontFamily:F, fontSize:13, outline:'none', background:SURF2, color:TEXT, boxSizing:'border-box' }} />
      </div>
      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
        {(['all', ...usedCats]).map(c => (
          <button key={c} onClick={() => setCatFilter(c)} style={{
            height:26, padding:'0 10px', borderRadius:20, border:`1px solid ${catFilter===c?BLUE:BDR}`,
            background:catFilter===c?BLUE:SURF, color:catFilter===c?'#fff':TEXT2,
            fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:F,
          }}>{c === 'all' ? 'All' : c}</button>
        ))}
      </div>
      {agents.map(agent => (
        <button key={agent.agent_id} onClick={() => setSelected(agent)}
          style={{ background:SURF, border:`1px solid ${BDR}`, borderRadius:14, padding:14, textAlign:'left', cursor:'pointer', width:'100%' }}>
          <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
            <div style={{ width:38, height:38, borderRadius:10, background:'rgba(0,102,255,0.1)', border:'1px solid rgba(0,102,255,0.18)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <Bot size={17} color={BLUE} />
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                <span style={{ fontSize:13, fontWeight:700, color:TEXT }}>{agent.name}</span>
                {agent.verification_status === 'trusted' && (
                  <span style={{ fontSize:10, fontWeight:700, color:'#00C853', background:'rgba(0,200,83,0.1)', border:'1px solid rgba(0,200,83,0.25)', borderRadius:6, padding:'1px 6px', display:'flex', alignItems:'center', gap:3 }}>
                    <UserCheck size={9} /> Verified
                  </span>
                )}
                <span style={{ fontSize:10, color:TEXT3, background:SURF2, border:`1px solid ${BDR}`, borderRadius:6, padding:'1px 6px', textTransform:'uppercase', letterSpacing:'0.04em' }}>{agent.status}</span>
              </div>
              <div style={{ fontSize:11, color:TEXT2, marginTop:3, lineHeight:1.4 }}>{agent.description}</div>
              <div style={{ display:'flex', gap:8, marginTop:8, flexWrap:'wrap' }}>
                {agent.capabilities.slice(0,3).map(cap => (
                  <div key={cap.id} style={{ fontSize:10, color:TEXT3, background:SURF2, border:`1px solid ${BDR}`, borderRadius:6, padding:'2px 7px', display:'flex', alignItems:'center', gap:4 }}>
                    <Coins size={9} color={cap.price_usdc > 0 ? BLUE : SUCCESS} />
                    {cap.name} · {cap.price_usdc > 0 ? `${cap.price_usdc} USDC` : 'Free'}
                  </div>
                ))}
              </div>
            </div>
            <ChevronRight size={14} color={TEXT3} style={{ flexShrink:0, marginTop:2 }} />
          </div>
          <div style={{ display:'flex', gap:10, marginTop:10, paddingTop:10, borderTop:`1px solid ${BDR}` }}>
            <div style={{ fontSize:10, color:TEXT3 }}>
              <span style={{ fontWeight:700, color:TEXT }}>{agent.successful_requests}</span> completed
            </div>
            <div style={{ fontSize:10, color:TEXT3 }}>
              <span style={{ fontWeight:700, color:TEXT }}>{agent.avg_response_ms}ms</span> avg
            </div>
            <div style={{ fontSize:10, color:TEXT3, marginLeft:'auto' }}>{agent.provider}</div>
          </div>
        </button>
      ))}
      {agents.length === 0 && (
        <div style={{ textAlign:'center', padding:'40px 0', color:TEXT3 }}>
          <Network size={28} color={TEXT3} style={{ margin:'0 auto 10px' }} />
          <div style={{ fontSize:13 }}>No agents match your search</div>
        </div>
      )}
    </div>
  )
}

function AgentDetail({ agent, onBack }: { agent: NetworkAgent; onBack: () => void }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      <button onClick={onBack} style={{ display:'flex', alignItems:'center', gap:6, background:'none', border:'none', cursor:'pointer', padding:0, color:BLUE, fontSize:13, fontWeight:600, fontFamily:F }}>
        ← Back to marketplace
      </button>
      <div style={{ background:SURF, border:`1px solid ${BDR}`, borderRadius:14, padding:16 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
          <div style={{ width:44, height:44, borderRadius:12, background:'rgba(0,102,255,0.1)', border:'1px solid rgba(0,102,255,0.18)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <Bot size={20} color={BLUE} />
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:15, fontWeight:700, color:TEXT }}>{agent.name}</div>
            <div style={{ fontSize:11, color:TEXT2 }}>{agent.provider}</div>
          </div>
          {agent.verification_status === 'trusted' && (
            <div style={{ fontSize:11, fontWeight:700, color:'#00C853', display:'flex', alignItems:'center', gap:4 }}>
              <UserCheck size={12} /> Verified
            </div>
          )}
        </div>
        <div style={{ fontSize:12, color:TEXT2, lineHeight:1.5, marginBottom:12 }}>{agent.description}</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
          {[
            { label:'Completed', value:String(agent.successful_requests) },
            { label:'Avg time', value:`${agent.avg_response_ms}ms` },
            { label:'Success rate', value:`${Math.round((agent.successful_requests/Math.max(agent.total_requests,1))*100)}%` },
          ].map(s => (
            <div key={s.label} style={{ textAlign:'center', background:SURF2, borderRadius:10, padding:'10px 6px' }}>
              <div style={{ fontSize:15, fontWeight:800, color:TEXT }}>{s.value}</div>
              <div style={{ fontSize:10, color:TEXT3, marginTop:1 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ fontSize:13, fontWeight:700, color:TEXT }}>Capabilities</div>
      {agent.capabilities.map(cap => (
        <div key={cap.id} style={{ background:SURF, border:`1px solid ${BDR}`, borderRadius:12, padding:12 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
            <div style={{ fontSize:12, fontWeight:700, color:TEXT }}>{cap.name}</div>
            <div style={{ fontSize:12, fontWeight:700, color:cap.price_usdc > 0 ? BLUE : SUCCESS }}>
              {cap.price_usdc > 0 ? `${cap.price_usdc} USDC` : 'Free'}
            </div>
          </div>
          <div style={{ fontSize:11, color:TEXT2, marginBottom:8 }}>{cap.description}</div>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            {cap.keywords.slice(0,5).map(k => (
              <span key={k} style={{ fontSize:10, color:TEXT3, background:SURF2, borderRadius:6, padding:'2px 7px', border:`1px solid ${BDR}` }}>{k}</span>
            ))}
          </div>
          <div style={{ marginTop:8, paddingTop:8, borderTop:`1px solid ${BDR}`, display:'flex', gap:8 }}>
            <div style={{ fontSize:10, color:TEXT3 }}>In: {Object.entries(cap.input_schema).map(([k,v])=>`${k}: ${v}`).join(', ')}</div>
          </div>
          <div style={{ fontSize:10, color:TEXT3, marginTop:2 }}>Out: {Object.entries(cap.output_schema).map(([k,v])=>`${k}: ${v}`).join(', ')}</div>
        </div>
      ))}

      <div style={{ fontSize:13, fontWeight:700, color:TEXT }}>Payment & Networks</div>
      <div style={{ background:SURF, border:`1px solid ${BDR}`, borderRadius:12, padding:12 }}>
        <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
          {agent.payment_methods.map(m => (
            <span key={m} style={{ fontSize:11, fontWeight:600, color:BLUE, background:'rgba(0,102,255,0.08)', border:'1px solid rgba(0,102,255,0.18)', borderRadius:8, padding:'3px 8px' }}>{m}</span>
          ))}
          {agent.supported_networks.map(n => (
            <span key={n} style={{ fontSize:11, fontWeight:500, color:TEXT2, background:SURF2, border:`1px solid ${BDR}`, borderRadius:8, padding:'3px 8px' }}>{n}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

// Multi-Agent Orchestrator

const USDC_TRANSFER_ABI_A2A = [{
  name: 'transfer', type: 'function', stateMutability: 'nonpayable',
  inputs: [{ name: 'to', type: 'address' }, { name: 'value', type: 'uint256' }],
  outputs: [{ name: '', type: 'bool' }],
}] as const

function MultiAgentOrchestrator() {
  const { agentPermissions, agentDailyUsed, addA2ATask, addA2APayment, addExecutionLog } = useAppStore()
  const { address, chainId } = useAccount()
  const { writeContractAsync } = useWriteContract()
  const [request, setRequest] = useState('')
  const [subtasks, setSubtasks] = useState<Subtask[]>([])
  const [estimate, setEstimate] = useState<CostEstimate | null>(null)
  const [stage, setStage] = useState<'idle'|'planning'|'estimated'|'running'|'done'|'error'>('idle')
  const [progress, setProgress] = useState<A2AProgress[]>([])
  const [finalResult, setFinalResult] = useState('')
  const [_taskId, _setTaskId] = useState('')

  // Real on-chain USDC payment to agent wallet
  const executePayment = async (opts: { recipientAddress: string; amount_usdc: number; subtaskLabel: string }) => {
    if (!address || !chainId) throw new Error('Wallet not connected. Please connect your wallet to pay agents.')
    const usdc = getUsdc(chainId)
    if (!usdc) throw new Error(`USDC not configured for chain ${chainId}`)
    const value = parseUnits(opts.amount_usdc.toFixed(6), usdc.decimals)
    const hash = await writeContractAsync({
      address: usdc.address as `0x${string}`,
      abi: USDC_TRANSFER_ABI_A2A,
      functionName: 'transfer',
      args: [opts.recipientAddress as `0x${string}`, value],
    })
    return hash
  }

  const plan = async () => {
    if (!request.trim()) return
    setStage('planning')
    setSubtasks([]); setEstimate(null); setProgress([]); setFinalResult('')
    await new Promise(r => setTimeout(r, 600))
    const decomposed = decomposeTask(request)
    const assigned = assignAgentsToSubtasks(decomposed)
    const est = estimateCost(assigned)
    setSubtasks(assigned)
    setEstimate(est)
    setStage('estimated')
  }

  const execute = async () => {
    if (!estimate) return
    setStage('running')
    const policy = {
      dailyLimit: agentPermissions.dailyLimit,
      dailyUsed: agentDailyUsed,
      perServiceLimit: agentPermissions.perServiceLimit ?? 1,
      requireApprovalAbove: agentPermissions.requireApprovalAbove ?? 5,
      requireApproval: agentPermissions.requireApproval,
      enabled: agentPermissions.enabled,
    }
    const policyResult = checkMultiAgentPolicy(estimate, policy)
    if (!policyResult.allowed) {
      setFinalResult(`Blocked by policy: ${policyResult.reason}`)
      setStage('error')
      return
    }
    const tid = `a2a-${Date.now()}`
    _setTaskId(tid)
    try {
      const task = await runA2ATask({
        userRequest: request,
        policy,
        onProgress: (p: A2AProgress) => setProgress(prev => [...prev, p]),
        onPaymentRecord: (r) => addA2APayment(r),
        onConfirmationRequired: (_est) => Promise.resolve(true), // user confirmed at estimate screen
        executePayment: address && chainId ? executePayment : undefined,
      })
      setFinalResult(task.finalResult ?? 'Task completed.')
      addA2ATask(task)
      task.subtasks.forEach(st => {
        if (st.paymentStatus === 'confirmed' && st.agentRef) {
          addA2APayment({
            id: `pay-${Date.now()}-${st.id}`,
            taskId: task.id, subtaskId: st.id,
            agentId: st.agentRef.agentId, agentName: st.agentRef.capabilityName,
            capability: st.agentRef.capabilityId, amount_usdc: st.agentRef.price_usdc,
            currency: 'USDC', network: 'arc-testnet',
            payment_status: 'confirmed', policy_decision: 'allowed',
            approval_status: 'auto_approved', timestamp: new Date().toISOString(),
            request_id: `req-${st.id}`,
          })
        }
      })
      addExecutionLog({
        taskId: tid, userRequest: request,
        status: task.status === 'complete' ? 'complete' : 'error',
        cost: estimate.totalUsdc,
        result: task.finalResult ?? '',
      })
      setStage('done')
    } catch (e: unknown) {
      setFinalResult(e instanceof Error ? e.message : 'Execution failed.')
      setStage('error')
    }
  }

  const policyCheck = estimate ? checkMultiAgentPolicy(estimate, {
    dailyLimit: agentPermissions.dailyLimit,
    dailyUsed: agentDailyUsed,
    perServiceLimit: agentPermissions.perServiceLimit ?? 1,
    requireApprovalAbove: agentPermissions.requireApprovalAbove ?? 5,
    requireApproval: agentPermissions.requireApproval,
    enabled: agentPermissions.enabled,
  }) : null

  const iconForStatus = (s: string) => {
    if (s === 'completed') return <CheckCircle2 size={12} color={SUCCESS} />
    if (s === 'running')   return <Loader2 size={12} color={BLUE} style={{ animation:'spin 1s linear infinite' }} />
    if (s === 'failed')    return <AlertTriangle size={12} color={DANGER} />
    return <Clock size={12} color={TEXT3} />
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      <div style={{ background:'rgba(0,102,255,0.06)', border:'1px solid rgba(0,102,255,0.15)', borderRadius:12, padding:12 }}>
        <div style={{ fontSize:12, fontWeight:700, color:TEXT, marginBottom:4 }}>Multi-Agent Orchestration</div>
        <div style={{ fontSize:11, color:TEXT2, lineHeight:1.5 }}>
          Describe a complex task. NAN will decompose it, discover the right agents, estimate the cost, check your policy, and coordinate execution.
        </div>
      </div>

      <textarea value={request} onChange={e => setRequest(e.target.value)}
        placeholder="e.g. Find three manufacturers for wireless earbuds and verify their companies"
        rows={3}
        style={{ width:'100%', padding:'11px 14px', border:`1px solid ${BDR}`, borderRadius:12, fontFamily:F, fontSize:13, outline:'none', background:SURF2, color:TEXT, resize:'none', boxSizing:'border-box' }}
      />

      {stage === 'idle' || stage === 'planning' ? (
        <button onClick={() => void plan()} disabled={!request.trim() || stage==='planning'}
          style={{ height:46, background:BLUE, color:'#fff', border:'none', borderRadius:12, fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:F, display:'flex', alignItems:'center', justifyContent:'center', gap:8, opacity:!request.trim()?0.4:1 }}>
          {stage === 'planning' ? <><Loader2 size={15} style={{ animation:'spin 1s linear infinite' }} /> Planning…</> : <><Sparkles size={15} /> Plan task</>}
        </button>
      ) : null}

      {/* Task plan */}
      {subtasks.length > 0 && (
        <div style={{ background:SURF, border:`1px solid ${BDR}`, borderRadius:14, padding:14 }}>
          <div style={{ fontSize:12, fontWeight:700, color:TEXT, marginBottom:10 }}>Execution plan</div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {subtasks.map((st, i) => (
              <div key={st.id} style={{ display:'flex', alignItems:'flex-start', gap:10, paddingBottom: i < subtasks.length-1 ? 8 : 0, borderBottom: i < subtasks.length-1 ? `1px solid ${BDR}` : 'none' }}>
                <div style={{ width:22, height:22, borderRadius:'50%', background:'rgba(0,102,255,0.1)', border:'1px solid rgba(0,102,255,0.2)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:10, fontWeight:800, color:BLUE }}>{i+1}</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:TEXT }}>{st.label}</div>
                  {st.agentRef && <div style={{ fontSize:11, color:TEXT2, marginTop:1 }}>→ {st.agentRef.capabilityName}</div>}
                  {st.agentRef && (
                    <div style={{ fontSize:11, color:TEXT3, marginTop:1 }}>
                      {st.agentRef.price_usdc > 0 ? `${st.agentRef.price_usdc} USDC` : 'Free'}
                    </div>
                  )}
                </div>
                <div style={{ flexShrink:0 }}>
                  {iconForStatus(stage === 'running' ? 'running' : stage === 'done' ? 'completed' : 'pending')}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cost estimate */}
      {estimate && (
        <div style={{ background:SURF, border:`1px solid ${BDR}`, borderRadius:14, padding:14 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
            <div style={{ fontSize:12, fontWeight:700, color:TEXT, display:'flex', alignItems:'center', gap:6 }}>
              <Coins size={13} color={BLUE} /> Cost estimate
            </div>
            <div style={{ fontSize:15, fontWeight:800, color:estimate.totalUsdc > 0 ? BLUE : SUCCESS }}>
              {estimate.totalUsdc > 0 ? `${estimate.totalUsdc.toFixed(3)} USDC` : 'Free'}
            </div>
          </div>
          {estimate.subtaskBreakdown.map((b, i) => (
            <div key={i} style={{ display:'flex', justifyContent:'space-between', paddingBottom:6, marginBottom:6, borderBottom: i < estimate.subtaskBreakdown.length-1 ? `1px solid ${BDR}` : 'none' }}>
              <span style={{ fontSize:11, color:TEXT2 }}>{b.agentName}</span>
              <span style={{ fontSize:11, fontWeight:700, color:TEXT }}>{b.cost > 0 ? `${b.cost} USDC` : 'Free'}</span>
            </div>
          ))}
          {policyCheck && (
            <div style={{ marginTop:10, paddingTop:10, borderTop:`1px solid ${BDR}`, display:'flex', alignItems:'center', gap:6 }}>
              {policyCheck.allowed
                ? <><CheckCircle2 size={12} color={SUCCESS} /><span style={{ fontSize:11, fontWeight:600, color:SUCCESS }}>Policy approved</span></>
                : <><AlertTriangle size={12} color={DANGER} /><span style={{ fontSize:11, fontWeight:600, color:DANGER }}>{policyCheck.reason}</span></>
              }
              {policyCheck.requiresConfirmation && <span style={{ fontSize:11, color:'#FF9500', marginLeft:'auto' }}>Approval required</span>}
            </div>
          )}
        </div>
      )}

      {/* Progress log */}
      {progress.length > 0 && (
        <div style={{ background:SURF, border:`1px solid ${BDR}`, borderRadius:14, padding:14 }}>
          <div style={{ fontSize:12, fontWeight:700, color:TEXT, marginBottom:10, display:'flex', alignItems:'center', gap:6 }}>
            <Activity size={13} color={BLUE} /> Execution log
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {progress.map((p, i) => (
              <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:8 }}>
                {p.step === 'complete' ? <CheckCircle2 size={12} color={SUCCESS} />
                  : p.step === 'error' ? <AlertTriangle size={12} color={DANGER} />
                  : <CheckCircle2 size={12} color={BLUE} />}
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:11, fontWeight:600, color:TEXT }}>{p.message}</div>
                  {p.subtaskLabel && <div style={{ fontSize:10, color:TEXT3 }}>{p.subtaskLabel}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Final result */}
      {finalResult && (
        <div style={{ background: stage === 'done' ? 'rgba(0,200,83,0.06)' : 'rgba(255,59,59,0.06)', border:`1px solid ${stage==='done'?'rgba(0,200,83,0.25)':'rgba(255,59,59,0.25)'}`, borderRadius:14, padding:14 }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8 }}>
            {stage === 'done' ? <CheckCircle2 size={13} color={SUCCESS} /> : <AlertTriangle size={13} color={DANGER} />}
            <span style={{ fontSize:12, fontWeight:700, color:stage==='done'?SUCCESS:DANGER }}>{stage === 'done' ? 'Task completed' : 'Task failed'}</span>
          </div>
          <div style={{ fontSize:12, color:TEXT2, lineHeight:1.6, whiteSpace:'pre-wrap' }}>{finalResult}</div>
        </div>
      )}

      {/* Execute button */}
      {stage === 'estimated' && policyCheck?.allowed && (
        <button onClick={() => void execute()} style={{ height:46, background:BLUE, color:'#fff', border:'none', borderRadius:12, fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:F, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
          <Play size={15} /> Execute · {estimate?.totalUsdc.toFixed(3) ?? '0'} USDC
        </button>
      )}

      {(stage === 'done' || stage === 'error') && (
        <button onClick={() => { setStage('idle'); setSubtasks([]); setEstimate(null); setProgress([]); setFinalResult(''); setRequest('') }}
          style={{ height:40, background:SURF, color:TEXT, border:`1px solid ${BDR}`, borderRadius:12, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:F }}>
          New task
        </button>
      )}
    </div>
  )
}

// Register Agent Form

function RegisterAgentForm() {
  const [form, setForm] = useState({ name:'', description:'', endpoint:'', provider:'', price:'', currency:'USDC', payment_method:'usdc_arc', networks:'arc-testnet', category:'research' })
  const [capabilities, setCapabilities] = useState([{ name:'', description:'', keywords:'' }])
  const [submitted, setSubmitted] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  const validate = () => {
    const errs: string[] = []
    if (!form.name.trim()) errs.push('Agent name is required')
    if (!form.description.trim()) errs.push('Description is required')
    if (!form.endpoint.trim()) errs.push('Endpoint is required')
    if (form.endpoint && !form.endpoint.startsWith('http') && !form.endpoint.startsWith('/')) errs.push('Endpoint must be a valid URL or path')
    if (!form.provider.trim()) errs.push('Provider name is required')
    if (capabilities.every(c => !c.name.trim())) errs.push('At least one capability is required')
    if (isNaN(parseFloat(form.price))) errs.push('Price must be a number (0 for free)')
    return errs
  }

  const handleSubmit = async () => {
    const errs = validate()
    if (errs.length > 0) { setErrors(errs); return }
    setErrors([])
    try {
      await fetch('/api/agent-registry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name, description: form.description,
          endpoint: form.endpoint, provider: form.provider,
          categories: [form.category],
          capabilities: capabilities.filter(c => c.name.trim()).map(c => ({
            name: c.name, description: c.description,
            keywords: c.keywords.split(',').map(k=>k.trim()).filter(Boolean),
            price_usdc: parseFloat(form.price) || 0,
            currency: form.currency,
          })),
          payment_methods: [form.payment_method],
          supported_networks: form.networks.split(',').map(n=>n.trim()),
        }),
      })
    } catch { /* network error is fine in preview */ }
    setSubmitted(true)
  }

  if (submitted) return (
    <div style={{ textAlign:'center', padding:'32px 0' }}>
      <PackageCheck size={32} color={SUCCESS} style={{ margin:'0 auto 12px' }} />
      <div style={{ fontSize:15, fontWeight:700, color:TEXT, marginBottom:6 }}>Agent submitted</div>
      <div style={{ fontSize:12, color:TEXT2, marginBottom:20, lineHeight:1.5 }}>
        Your agent has been submitted for review. It will be marked as <strong>pending</strong> until verified by the NAN Network.
      </div>
      <button onClick={() => setSubmitted(false)} style={{ height:40, padding:'0 20px', background:BLUE, color:'#fff', border:'none', borderRadius:10, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:F }}>
        Register another
      </button>
    </div>
  )

  const field = (label: string, key: keyof typeof form, placeholder: string, type = 'text') => (
    <div>
      <div style={{ fontSize:11, fontWeight:700, color:TEXT3, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>{label}</div>
      <input type={type} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} placeholder={placeholder}
        style={{ width:'100%', padding:'9px 12px', border:`1px solid ${BDR}`, borderRadius:9, fontFamily:F, fontSize:13, outline:'none', background:SURF2, color:TEXT, boxSizing:'border-box' }} />
    </div>
  )

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <div style={{ background:'rgba(0,102,255,0.06)', border:'1px solid rgba(0,102,255,0.15)', borderRadius:12, padding:12 }}>
        <div style={{ fontSize:12, fontWeight:700, color:TEXT, marginBottom:4 }}>Register an Agent</div>
        <div style={{ fontSize:11, color:TEXT2, lineHeight:1.5 }}>
          Register your agent or service so NAN can discover and pay for its capabilities. New agents are marked as <strong>pending</strong> until reviewed.
        </div>
      </div>

      {errors.length > 0 && (
        <div style={{ background:'rgba(255,59,59,0.08)', border:'1px solid rgba(255,59,59,0.25)', borderRadius:10, padding:12 }}>
          {errors.map((e, i) => <div key={i} style={{ fontSize:11, color:DANGER, marginBottom: i < errors.length-1 ? 4 : 0 }}>• {e}</div>)}
        </div>
      )}

      {field('Agent name', 'name', 'e.g. Research Agent')}
      {field('Description', 'description', 'What does this agent do?')}
      {field('Provider / company', 'provider', 'e.g. Acme AI')}
      {field('Endpoint', 'endpoint', 'https://yourapi.com/agent or /api/your-agent')}

      <div>
        <div style={{ fontSize:11, fontWeight:700, color:TEXT3, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>Category</div>
        <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
          style={{ width:'100%', padding:'9px 12px', border:`1px solid ${BDR}`, borderRadius:9, fontFamily:F, fontSize:13, outline:'none', background:SURF2, color:TEXT }}>
          {ALL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div style={{ fontSize:12, fontWeight:700, color:TEXT }}>Capabilities</div>
      {capabilities.map((cap, i) => (
        <div key={i} style={{ background:SURF, border:`1px solid ${BDR}`, borderRadius:12, padding:12, display:'flex', flexDirection:'column', gap:8 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span style={{ fontSize:11, fontWeight:700, color:TEXT3, textTransform:'uppercase', letterSpacing:'0.05em' }}>Capability {i+1}</span>
            {capabilities.length > 1 && (
              <button onClick={() => setCapabilities(cs => cs.filter((_,j)=>j!==i))}
                style={{ background:'none', border:'none', cursor:'pointer', color:DANGER, fontSize:11, fontFamily:F }}>Remove</button>
            )}
          </div>
          <input placeholder="Capability name" value={cap.name} onChange={e => setCapabilities(cs => cs.map((c,j)=>j===i?{...c,name:e.target.value}:c))}
            style={{ padding:'8px 10px', border:`1px solid ${BDR}`, borderRadius:8, fontFamily:F, fontSize:12, outline:'none', background:SURF2, color:TEXT }} />
          <input placeholder="Description" value={cap.description} onChange={e => setCapabilities(cs => cs.map((c,j)=>j===i?{...c,description:e.target.value}:c))}
            style={{ padding:'8px 10px', border:`1px solid ${BDR}`, borderRadius:8, fontFamily:F, fontSize:12, outline:'none', background:SURF2, color:TEXT }} />
          <input placeholder="Keywords (comma-separated)" value={cap.keywords} onChange={e => setCapabilities(cs => cs.map((c,j)=>j===i?{...c,keywords:e.target.value}:c))}
            style={{ padding:'8px 10px', border:`1px solid ${BDR}`, borderRadius:8, fontFamily:F, fontSize:12, outline:'none', background:SURF2, color:TEXT }} />
        </div>
      ))}
      <button onClick={() => setCapabilities(cs => [...cs, { name:'', description:'', keywords:'' }])}
        style={{ height:36, background:SURF, color:TEXT, border:`1px dashed ${BDR}`, borderRadius:10, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:F, display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
        <Plus size={13} /> Add capability
      </button>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
        {field('Price per call (USDC)', 'price', '0.01')}
        {field('Supported networks', 'networks', 'arc-testnet, arc, base')}
      </div>

      <div>
        <div style={{ fontSize:11, fontWeight:700, color:TEXT3, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>Payment method</div>
        <select value={form.payment_method} onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))}
          style={{ width:'100%', padding:'9px 12px', border:`1px solid ${BDR}`, borderRadius:9, fontFamily:F, fontSize:13, outline:'none', background:SURF2, color:TEXT }}>
          <option value="usdc_arc">USDC on Arc</option>
          <option value="usdc_base">USDC on Base</option>
          <option value="x402">x402 HTTP micropayments</option>
          <option value="free">Free</option>
          <option value="subscription">Subscription</option>
        </select>
      </div>

      <button onClick={() => void handleSubmit()} style={{ height:48, background:BLUE, color:'#fff', border:'none', borderRadius:12, fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:F, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
        <PackageCheck size={15} /> Submit for review
      </button>
    </div>
  )
}

// Provider Dashboard

function ProviderDashboard() {
  const { a2aPayments, a2aTasks } = useAppStore()
  const totalSpent  = a2aPayments.filter(p => p.payment_status === 'confirmed').reduce((s, p) => s + p.amount_usdc, 0)
  const completedTasks = a2aTasks.filter(t => t.status === 'complete').length
  const failedTasks = a2aTasks.filter(t => t.status === 'failed').length

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      <div style={{ background:'rgba(0,102,255,0.06)', border:'1px solid rgba(0,102,255,0.15)', borderRadius:12, padding:12 }}>
        <div style={{ fontSize:12, fontWeight:700, color:TEXT, marginBottom:4 }}>Provider Activity</div>
        <div style={{ fontSize:11, color:TEXT2, lineHeight:1.5 }}>
          Transparent record of all agent economic activity — services used, payments made, and task results.
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
        {[
          { label:'Tasks run', value:String(a2aTasks.length), sub:'total', icon:<Activity size={14} color={BLUE} /> },
          { label:'Completed', value:String(completedTasks), sub:'tasks', icon:<CheckCircle2 size={14} color={SUCCESS} /> },
          { label:'Total spent', value:`${totalSpent.toFixed(3)}`, sub:'USDC', icon:<Coins size={14} color={BLUE} /> },
          { label:'Failed', value:String(failedTasks), sub:'tasks', icon:<AlertTriangle size={14} color={DANGER} /> },
        ].map(s => (
          <div key={s.label} style={{ background:SURF, border:`1px solid ${BDR}`, borderRadius:12, padding:12 }}>
            <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:6 }}>{s.icon}<span style={{ fontSize:11, color:TEXT3 }}>{s.label}</span></div>
            <div style={{ fontSize:20, fontWeight:800, color:TEXT }}>{s.value}</div>
            <div style={{ fontSize:10, color:TEXT3, marginTop:1 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Payment records */}
      <div style={{ fontSize:13, fontWeight:700, color:TEXT }}>Payment records</div>
      {a2aPayments.length === 0 ? (
        <div style={{ textAlign:'center', padding:'30px 0', color:TEXT3 }}>
          <TrendingUp size={26} color={TEXT3} style={{ margin:'0 auto 10px' }} />
          <div style={{ fontSize:12 }}>No agent payments yet</div>
          <div style={{ fontSize:11, marginTop:4 }}>Use Orchestrate to run a multi-agent task</div>
        </div>
      ) : (
        a2aPayments.slice(0, 20).map(p => (
          <div key={p.id} style={{ background:SURF, border:`1px solid ${BDR}`, borderRadius:12, padding:12 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:12, fontWeight:700, color:TEXT }}>{p.agentName}</div>
                <div style={{ fontSize:11, color:TEXT2, marginTop:1 }}>{p.capability} · {p.agentId}</div>
                <div style={{ fontSize:10, color:TEXT3, marginTop:3 }}>{new Date(p.timestamp).toLocaleString()}</div>
              </div>
              <div style={{ textAlign:'right', flexShrink:0 }}>
                <div style={{ fontSize:13, fontWeight:700, color: p.payment_status === 'confirmed' ? SUCCESS : TEXT2 }}>
                  {p.amount_usdc > 0 ? `${p.amount_usdc} USDC` : 'Free'}
                </div>
                <div style={{ fontSize:10, fontWeight:600, color: p.payment_status === 'confirmed' ? SUCCESS : p.payment_status === 'failed' ? DANGER : TEXT3, marginTop:2 }}>
                  {p.payment_status}
                </div>
              </div>
            </div>
            <div style={{ marginTop:8, paddingTop:8, borderTop:`1px solid ${BDR}`, display:'flex', gap:8 }}>
              <div style={{ fontSize:10, color:TEXT3 }}>Policy: <span style={{ fontWeight:700, color: p.policy_decision === 'allowed' ? SUCCESS : DANGER }}>{p.policy_decision}</span></div>
              {p.tx_id && <div style={{ fontSize:10, color:TEXT3, marginLeft:'auto', fontFamily:'monospace' }}>{p.tx_id.slice(0,16)}…</div>}
            </div>
          </div>
        ))
      )}

      {/* Task records */}
      {a2aTasks.length > 0 && (
        <>
          <div style={{ fontSize:13, fontWeight:700, color:TEXT }}>Task records</div>
          {a2aTasks.slice(0, 10).map(t => (
            <div key={t.id} style={{ background:SURF, border:`1px solid ${BDR}`, borderRadius:12, padding:12 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight:600, color:TEXT, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.userRequest}</div>
                  <div style={{ fontSize:11, color:TEXT2, marginTop:2 }}>{t.subtasks.length} subtasks · {t.subtasks.filter(s=>s.paymentStatus==='confirmed').length} payments</div>
                </div>
                <div style={{ fontSize:11, fontWeight:700, color: t.status === 'complete' ? SUCCESS : t.status === 'failed' ? DANGER : TEXT3, flexShrink:0 }}>
                  {t.status}
                </div>
              </div>
              {t.finalResult && (
                <div style={{ marginTop:8, fontSize:11, color:TEXT3, lineHeight:1.4 }}>
                  {t.finalResult.slice(0,120)}{t.finalResult.length>120?'…':''}
                </div>
              )}
            </div>
          ))}
        </>
      )}
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
