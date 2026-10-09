/* eslint-disable react/purity */
import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
  Bot, Send, X, Check, Zap, Shield, ShoppingBag,
  ToggleLeft, ToggleRight, Coins, Loader2, Plus,
  Play,
  Search, Globe, Cpu, FileText, AlertTriangle, CheckCircle2,
  Clock, ChevronRight, Sparkles, Network, Activity,
  UserCheck, TrendingUp, PackageCheck
} from 'lucide-react'
import { useWriteContract, useAccount } from 'wagmi'
import { useCircleTransaction } from '../../hooks/useCircleTransaction'
import { sendFromPasskeyWallet } from '../CirclePasskeyLogin'
import { parseUnits } from 'viem'

import { useAppStore } from '../../store/appStore'
import type { AgentMessage } from '../../store/appStore'

import { formatUSDC, formatRelativeTime } from '../../utils/format'
import { nanChat, backendConfigured } from '../../lib/api'
import type { MarketplaceServiceCard } from '../../lib/api'
import {
  BalanceCard, SpendingCard, TransactionCard,
  AddressRevealCard, ErrorCard,
  PurchaseApprovalCard,
} from './NanFinancialCards'
import { ServiceDiscoveryCard } from '../ServiceDiscoveryCard'
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
import {
  parseAction, describeAction, requiresConfirmation, executeAction,
  type NanAction,
} from '../../lib/agent-actions'
import { AgentWalletExperience } from './AgentWalletExperience'

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

// ── MoreMenu — slides up from header when user taps ⋮ ────────────────────────
function MoreMenu({ active, onSelect, onClose }: {
  active: AgentTab
  onSelect: (t: AgentTab) => void
  onClose: () => void
}) {
  const items: { id: AgentTab; label: string; icon: React.ElementType }[] = [
    { id: 'wallet',   label: 'Agent Wallet',    icon: Coins },
    { id: 'discover', label: 'Services',         icon: Globe },
    { id: 'network',  label: 'Agent Network',    icon: Network },
    { id: 'policy',   label: 'Spending Policy',  icon: Shield },
    { id: 'log',      label: 'Execution Log',    icon: Activity },
  ]
  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:200 }} />
      <div style={{
        position: 'absolute', top: '100%', right: 10, zIndex: 201,
        background: SURF, border: `1px solid ${BDR}`,
        borderRadius: 14, overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        minWidth: 200,
      }}>
        {items.map(item => {
          const Icon = item.icon
          const isActive = active === item.id
          return (
            <button
              key={item.id}
              onClick={() => { onSelect(item.id); onClose() }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '11px 16px', border: 'none',
                background: isActive ? 'rgba(0,102,255,0.08)' : 'transparent',
                cursor: 'pointer', fontFamily: F, textAlign: 'left',
                borderBottom: `1px solid ${BDR}`,
              }}
            >
              <Icon size={14} color={isActive ? BLUE : TEXT2} />
              <span style={{ fontSize: 13, fontWeight: isActive ? 700 : 500, color: isActive ? BLUE : TEXT }}>{item.label}</span>
            </button>
          )
        })}
      </div>
    </>
  )
}

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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

// ── NAN Action confirmation card ──────────────────────────────────────────────

interface ActionConfirmProps {
  action: NanAction
  onConfirm: () => void
  onCancel: () => void
  executing: boolean
  result?: string
  error?: string
}

function ActionConfirmCard({ action, onConfirm, onCancel, executing, result, error }: ActionConfirmProps) {
  const desc = describeAction(action)
  const needsConfirm = requiresConfirmation(action)
  return (
    <div style={{ background: SURF, border: `1px solid ${BDR}`, borderRadius: 16, padding: 16, marginBottom: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: TEXT3, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Zap size={11} color={BLUE} /> {desc.title}
      </div>
      {desc.lines.map(({ label, value }) => (
        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '6px 0', borderBottom: `1px solid ${BDR}`, gap: 8 }}>
          <span style={{ fontSize: 12, color: TEXT2, flexShrink: 0 }}>{label}</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: TEXT, textAlign: 'right', wordBreak: 'break-all' }}>{value}</span>
        </div>
      ))}
      {result && (
        <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(0,200,83,0.07)', border: '1px solid rgba(0,200,83,0.2)', borderRadius: 10, fontSize: 12, color: '#00C853', display: 'flex', alignItems: 'center', gap: 6 }}>
          <CheckCircle2 size={12} color="#00C853" /> {result}
        </div>
      )}
      {error && (
        <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(255,59,59,0.07)', border: '1px solid rgba(255,59,59,0.2)', borderRadius: 10, fontSize: 12, color: DANGER }}>
          {error}
        </div>
      )}
      {!result && needsConfirm && (
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button onClick={onConfirm} disabled={executing}
            style={{ flex: 1, height: 40, background: executing ? 'rgba(0,102,255,0.35)' : BLUE, color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: executing ? 'not-allowed' : 'pointer', fontFamily: F, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            {executing ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={13} />}
            {executing ? 'Working…' : 'Confirm'}
          </button>
          <button onClick={onCancel} disabled={executing}
            style={{ flex: 1, height: 40, background: SURF, color: TEXT, border: `1px solid ${BDR}`, borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: F }}>
            Cancel
          </button>
        </div>
      )}
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



export function AgentPage() {
  const [tab, setTab] = useState<AgentTab>('chat')
  const [menuOpen, setMenuOpen] = useState(false)
  const { setActiveView } = useAppStore()

  return (
    /* Fill 100% of AppShell's <main> with no padding — chat manages its own insets */
    <div style={{
      fontFamily: F,
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      minHeight: 0,
      overflow: 'hidden',
      position: 'relative',
    }}>

      {/* ── WhatsApp-style fixed conversation header ── */}
      <div style={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 12px',
        paddingTop: 'max(8px, env(safe-area-inset-top))',
        borderBottom: `1px solid ${BDR}`,
        background: SURF,
        position: 'relative',
        zIndex: 10,
      }}>
        {/* ← back to Home */}
        <button
          onClick={() => setActiveView('home')}
          style={{
            width: 36, height: 36, borderRadius: '50%',
            background: 'transparent', border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', flexShrink: 0, padding: 0,
          }}
          aria-label="Back"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={TEXT2} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        {/* Avatar */}
        <div style={{
          width: 38, height: 38, borderRadius: '50%',
          background: `linear-gradient(135deg, ${BLUE} 0%, #5B9FFF 100%)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
          boxShadow: '0 2px 8px rgba(0,102,255,0.2)',
        }}>
          <Bot size={19} color="#fff" />
        </div>

        {/* Name + status */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: TEXT, letterSpacing: '-0.01em', lineHeight: 1.2 }}>
            NAN Agent
          </div>
          <AgentStatusLine />
        </div>

        {/* Back to chat pill — only when on a non-chat tab */}
        {tab !== 'chat' && (
          <button
            onClick={() => setTab('chat')}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              height: 28, padding: '0 10px',
              background: 'rgba(0,102,255,0.1)',
              border: '1px solid rgba(0,102,255,0.25)',
              borderRadius: 20, cursor: 'pointer',
              fontSize: 11, fontWeight: 600, color: BLUE,
              fontFamily: F, flexShrink: 0,
            }}
          >
            ← Chat
          </button>
        )}

        {/* ⋮ menu button */}
        <button
          onClick={() => setMenuOpen(v => !v)}
          style={{
            width: 36, height: 36, borderRadius: '50%',
            background: menuOpen ? 'rgba(0,102,255,0.08)' : 'transparent',
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 20, color: TEXT2, lineHeight: 1, letterSpacing: 2, fontWeight: 700 }}>⋮</span>
        </button>

        {/* Dropdown */}
        {menuOpen && (
          <MoreMenu
            active={tab}
            onSelect={t => { setTab(t); setMenuOpen(false) }}
            onClose={() => setMenuOpen(false)}
          />
        )}
      </div>

      {/* ── Content area — chat fills the remaining height; other tabs scroll ── */}
      <div style={{
        flex: 1,
        minHeight: 0,
        overflow: tab === 'chat' ? 'hidden' : 'auto',
        display: 'flex',
        flexDirection: 'column',
        ...(tab !== 'chat' && {
          padding: '12px 16px',
          paddingBottom: 'max(80px, calc(env(safe-area-inset-bottom) + 80px))',
        }),
        scrollbarWidth: 'none',
        WebkitOverflowScrolling: 'touch' as React.CSSProperties['WebkitOverflowScrolling'],
      }}>
        {tab === 'chat'     && <AgentChat onNavigate={(page, _query) => { setActiveView(page); setTab('chat') }} />}
        {tab === 'wallet'   && <AgentWalletExperience />}
        {tab === 'discover' && <DiscoverTab />}
        {tab === 'network'  && <NetworkTab />}
        {tab === 'policy'   && <PolicyTab />}
        {tab === 'log'      && <ExecutionLogTab />}
      </div>
    </div>
  )
}

function AgentStatusLine() {
  const { agentPermissions, agentDailyUsed } = useAppStore()
  const remaining = agentPermissions.dailyLimit - agentDailyUsed
  if (!agentPermissions.enabled) return (
    <div style={{ fontSize: 11, color: DANGER, display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: DANGER, display: 'inline-block', flexShrink: 0 }} />
      <span>Offline</span>
    </div>
  )
  return (
    <div style={{ fontSize: 11, color: SUCCESS, display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: SUCCESS, display: 'inline-block', flexShrink: 0 }} />
      <span>Your financial assistant · {formatUSDC(remaining)} USDC today</span>
    </div>
  )
}

// ── Service Execution Flow ─────────────────────────────────────────────────────
// Handles the full "Use service" pipeline:
// inspect → balance/policy check → confirmation card → pay → execute → result
// Never fabricates prices or results — everything comes from the backend.

type ServiceExecState =
  | { phase: 'idle' }
  | { phase: 'checking'; label: string }
  | { phase: 'awaiting_confirmation'; cost_usdc: number; real_balance: string; service: MarketplaceServiceCard | null; svcId: string | null; endpoint: string | null; query: string }
  | { phase: 'paying' }
  | { phase: 'executing' }
  | { phase: 'done'; result: string; cost_usdc: number; tx_ref?: string }
  | { phase: 'error'; reason: string }

interface ServiceExecResult {
  ok: boolean
  awaiting_confirmation?: boolean
  executed?: boolean
  blocked?: boolean
  execute_error?: boolean
  reason?: string
  cost_usdc?: number
  real_balance?: string
  tx_ref?: string
  result?: string
  service?: MarketplaceServiceCard | null
  message?: string
}

function ServiceExecutionFlow({ state, onConfirm, onCancel }: {
  state: ServiceExecState
  onConfirm: () => void
  onCancel: () => void
}) {
  if (state.phase === 'idle') return null

  if (state.phase === 'checking') {
    return (
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 14px', background:SURF, border:`1px solid ${BDR}`, borderRadius:14 }}>
        <Loader2 size={14} color={BLUE} style={{ animation:'spin 1s linear infinite', flexShrink:0 }} />
        <span style={{ fontSize:13, color:TEXT2, fontFamily:F }}>{state.label}</span>
      </div>
    )
  }

  if (state.phase === 'awaiting_confirmation') {
    const { cost_usdc, real_balance, service } = state
    const bal = parseFloat(real_balance || '0')
    const insufficient = bal < cost_usdc
    const providerName = service?.provider ?? state.svcId ?? 'Service'
    return (
      <div style={{ background:SURF, border:`1px solid ${BDR}`, borderRadius:16, padding:16 }}>
        <div style={{ fontSize:11, fontWeight:700, color:TEXT3, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:12 }}>
          Ready to Use
        </div>
        {[
          { label:'Service',        value: providerName },
          { label:'What it will do',value: service?.description?.slice(0,90) ?? 'Call this service on your behalf' },
          { label:'Cost',           value: cost_usdc === 0 ? 'Free' : `${cost_usdc.toFixed(cost_usdc < 0.01 ? 6 : 4)} USDC` },
          { label:'Agent Wallet',   value: `${bal.toFixed(4)} USDC available` },
          { label:'Payment',        value: service?.payment_scheme === 'x402' ? 'Circle x402 nanopayment' : cost_usdc === 0 ? 'No payment required' : 'USDC from Agent Wallet' },
          { label:'Spending policy',value: insufficient ? 'Insufficient balance' : 'Payment permitted' },
        ].map(({ label, value }) => (
          <div key={label} style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', padding:'7px 0', borderBottom:`1px solid ${BDR}`, gap:8 }}>
            <span style={{ fontSize:12, color:TEXT2, flexShrink:0 }}>{label}</span>
            <span style={{ fontSize:12, fontWeight:600, color: label === 'Spending policy' ? (insufficient ? DANGER : SUCCESS) : TEXT, textAlign:'right', wordBreak:'break-word', maxWidth:'60%' }}>{value}</span>
          </div>
        ))}
        {insufficient && (
          <div style={{ marginTop:10, padding:'8px 12px', background:'rgba(255,59,59,0.07)', border:'1px solid rgba(255,59,59,0.2)', borderRadius:10, fontSize:12, color:DANGER }}>
            Your Agent Wallet doesn't have enough USDC. Fund it first in the Agent Wallet tab.
          </div>
        )}
        <div style={{ display:'flex', gap:8, marginTop:14 }}>
          <button
            onClick={onConfirm}
            disabled={insufficient}
            style={{ flex:1, height:40, background:insufficient?'rgba(0,102,255,0.35)':BLUE, color:'#fff', border:'none', borderRadius:10, fontSize:13, fontWeight:700, cursor:insufficient?'not-allowed':'pointer', fontFamily:F, display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}
          >
            <Check size={13} /> Continue
          </button>
          <button
            onClick={onCancel}
            style={{ flex:1, height:40, background:SURF, color:TEXT, border:`1px solid ${BDR}`, borderRadius:10, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:F }}
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  if (state.phase === 'paying') {
    return (
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 14px', background:SURF, border:`1px solid ${BDR}`, borderRadius:14 }}>
        <Loader2 size={14} color={BLUE} style={{ animation:'spin 1s linear infinite', flexShrink:0 }} />
        <span style={{ fontSize:13, color:TEXT2, fontFamily:F }}>Processing payment...</span>
      </div>
    )
  }

  if (state.phase === 'executing') {
    return (
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 14px', background:SURF, border:`1px solid ${BDR}`, borderRadius:14 }}>
        <Loader2 size={14} color={BLUE} style={{ animation:'spin 1s linear infinite', flexShrink:0 }} />
        <span style={{ fontSize:13, color:TEXT2, fontFamily:F }}>Connecting to the service...</span>
      </div>
    )
  }

  if (state.phase === 'error') {
    return (
      <div style={{ background:'rgba(255,59,59,0.06)', border:'1px solid rgba(255,59,59,0.22)', borderRadius:14, padding:'12px 14px' }}>
        <div style={{ fontSize:13, fontWeight:700, color:DANGER, marginBottom:4 }}>I couldn't complete that request.</div>
        <div style={{ fontSize:12, color:TEXT2 }}>{state.reason}</div>
      </div>
    )
  }

  // phase === 'done' — never shown inline here; result goes to chat as a message
  return null
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

// ── InlineChatSwap — swap flow embedded directly in the conversation ─────────

interface InlineSwapProps {
  fromToken: string
  toToken: string
  amount: string
  agentUserToken: string
  agentAddress: string
  agentBalance: string
  onDone: (msg: string) => void
  onCancel: () => void
}

function InlineChatSwap({ fromToken, toToken, amount, agentUserToken, agentAddress, agentBalance, onDone, onCancel }: InlineSwapProps) {
  type Phase = 'quoting' | 'quoted' | 'swapping' | 'done' | 'error'
  const [phase, setPhase]   = useState<Phase>('quoting')
  const [quote, setQuote]   = useState<{ fromAmount: string; toAmount: string; rate: string; fee?: string; provider: string } | null>(null)
  const [errMsg, setErrMsg] = useState('')
  const [txHash, setTxHash] = useState('')
  const balance = parseFloat(agentBalance || '0')
  const gross   = parseFloat(amount) || 0
  const canAfford = gross <= balance && gross > 0

  // Auto-fetch quote on mount
  useEffect(() => {
    let cancelled = false
    const go = async () => {
      try {
        const r = await fetch('/api/agent-wallet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'swap-quote', fromToken, toToken, fromChain: 'Arc Testnet', toChain: 'Arc Testnet', amount, agentAddress }),
        })
        const d = await r.json() as { ok?: boolean; error?: string; not_configured?: boolean; quote?: { fromAmount: string; toAmount: string; rate: string; fee?: string; provider: string } }
        if (cancelled) return
        if (d.not_configured) { setErrMsg('Swap backend not configured. Set CIRCLE_API_KEY, AGENT_WALLET_ID in Vercel environment variables.'); setPhase('error'); return }
        if (!r.ok || d.error || !d.quote) throw new Error(d.error ?? 'Could not get a quote right now.')
        setQuote(d.quote); setPhase('quoted')
      } catch (e) {
        if (!cancelled) { setErrMsg(e instanceof Error ? e.message : 'Could not get a quote.'); setPhase('error') }
      }
    }
    void go()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const executeSwap = async () => {
    if (!quote || !canAfford) return
    setPhase('swapping')
    try {
      const r = await fetch('/api/agent-wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-token': agentUserToken },
        body: JSON.stringify({ action: 'swap', userToken: agentUserToken, fromToken, toToken, fromChain: 'Arc Testnet', toChain: 'Arc Testnet', amount, agentAddress }),
      })
      const d = await r.json() as { ok?: boolean; error?: string; not_configured?: boolean; txHash?: string; toAmount?: string }
      if (d.not_configured) { setErrMsg('Swap backend not configured.'); setPhase('error'); return }
      if (!r.ok || d.error) throw new Error(d.error ?? 'Swap failed.')
      setTxHash(d.txHash ?? '')
      setPhase('done')
      onDone(`Swap complete — ${amount} ${fromToken} → ${d.toAmount ?? quote.toAmount} ${toToken}${d.txHash ? ` · tx: ${d.txHash.slice(0,10)}…` : ''}`)
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : 'Swap failed.')
      setPhase('error')
    }
  }

  const BLUE = '#0066FF'; const GREEN = '#00C853'

  if (phase === 'quoting') return (
    <div style={{ background: SURF, border: `1px solid ${BDR}`, borderRadius: 16, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10, fontFamily: F }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: TEXT3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Swap Quote</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: TEXT2 }}>
        <div style={{ width: 14, height: 14, border: `2px solid ${BLUE}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
        Getting the best rate for {amount} {fromToken} → {toToken}…
      </div>
    </div>
  )

  if (phase === 'error') return (
    <div style={{ background: 'rgba(255,59,59,0.06)', border: '1px solid rgba(255,59,59,0.2)', borderRadius: 16, padding: '16px 18px', fontFamily: F }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#FF3B3B', marginBottom: 6 }}>Couldn't complete the swap.</div>
      <div style={{ fontSize: 12, color: TEXT2, marginBottom: 12 }}>{errMsg}</div>
      <button onClick={onCancel} style={{ padding: '7px 16px', background: SURF, border: `1px solid ${BDR}`, borderRadius: 10, fontSize: 12, fontWeight: 600, color: TEXT, cursor: 'pointer', fontFamily: F }}>Dismiss</button>
    </div>
  )

  if (phase === 'swapping') return (
    <div style={{ background: SURF, border: `1px solid ${BDR}`, borderRadius: 16, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 10, fontFamily: F }}>
      <div style={{ width: 14, height: 14, border: `2px solid ${BLUE}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
      <span style={{ fontSize: 13, color: TEXT2 }}>Processing your swap…</span>
    </div>
  )

  if (phase === 'done') return (
    <div style={{ background: 'rgba(0,200,83,0.06)', border: '1px solid rgba(0,200,83,0.2)', borderRadius: 16, padding: '16px 18px', fontFamily: F }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>
        <span style={{ fontSize: 13, fontWeight: 700, color: GREEN }}>Swap complete</span>
      </div>
      {txHash && <div style={{ fontSize: 11, color: BLUE, fontFamily: "'JetBrains Mono',monospace" }}>{txHash.slice(0, 18)}…</div>}
    </div>
  )

  // phase === 'quoted'
  return (
    <div style={{ background: SURF, border: `1px solid ${BDR}`, borderRadius: 16, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12, fontFamily: F }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: TEXT3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Swap Quote</div>

      {/* Big visual rate */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: TEXT, fontFamily: "'JetBrains Mono',monospace" }}>{quote?.fromAmount} {fromToken}</div>
        <div style={{ fontSize: 13, color: TEXT3 }}>↓</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: BLUE, fontFamily: "'JetBrains Mono',monospace" }}>{quote?.toAmount} {toToken}</div>
      </div>

      {/* Details */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, borderTop: `1px solid ${BDR}`, paddingTop: 10 }}>
        {[
          { label: 'Rate', value: quote?.rate ?? '—' },
          { label: 'Fee', value: quote?.fee ?? 'None' },
          { label: 'Provider', value: quote?.provider ?? '—' },
          { label: 'Agent Wallet balance', value: `${balance.toFixed(4)} USDC` },
        ].map(row => (
          <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
            <span style={{ fontSize: 11, color: TEXT2 }}>{row.label}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: TEXT }}>{row.value}</span>
          </div>
        ))}
      </div>

      {!canAfford && <div style={{ fontSize: 12, color: '#FF9500', background: 'rgba(255,149,0,0.08)', borderRadius: 8, padding: '7px 10px' }}>Your Agent Wallet doesn't have enough USDC for this swap.</div>}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => void executeSwap()}
          disabled={!canAfford}
          style={{ flex: 2, height: 42, background: canAfford ? BLUE : SURF2, color: canAfford ? '#fff' : TEXT3, border: 'none', borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: canAfford ? 'pointer' : 'not-allowed', fontFamily: F }}
        >
          Confirm swap
        </button>
        <button
          onClick={onCancel}
          style={{ flex: 1, height: 42, background: 'transparent', color: TEXT2, border: `1px solid ${BDR}`, borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: F }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Main chat tab ─────────────────────────────────────────────────────────────

function AgentChat({ onNavigate }: { onNavigate?: (page: string, query?: string) => void }) {
  const {
    agentMessages, addAgentMessage, agentPermissions, agentDailyUsed,
    approveAgentPurchase, rejectAgentPurchase, clearAgentMessages,
    auth,
    addExecutionLog, addAgentSpend,
    agentWallet,
  } = useAppStore()

  const { address, chainId } = useAccount()
  const { writeContractAsync } = useWriteContract()
  const circleTx = useCircleTransaction()
  const isCircleUcwUser = !!(auth?.userToken && !auth?.isPasskeyUser)
  const isPasskeyUser = !!auth?.isPasskeyUser

  // Universal send callback — handles all 3 login types
  const triggerCircleSend = useCallback(async ({ toAddress, amount, note: _note }: { toAddress: string; amount: string; note?: string }) => {
    if (isPasskeyUser) {
      const clientKey = import.meta.env.VITE_CLIENT_KEY as string | undefined
      if (!clientKey) throw new Error('VITE_CLIENT_KEY is not configured.')
      const rawAmount = BigInt(Math.round(parseFloat(amount) * 1e6))
      const hash = await sendFromPasskeyWallet({ clientKey, to: toAddress as `0x${string}`, amount: rawAmount })
      return hash ?? ''
    }
    if (isCircleUcwUser) {
      const hash = await circleTx.sendTransfer({ destinationAddress: toAddress, amount, blockchain: 'ARC-TESTNET' })
      return hash ?? ''
    }
    return ''
  }, [isPasskeyUser, isCircleUcwUser, circleTx])

  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const [_loadingMessage, setLoadingMessage] = useState('Let me check on that...')
  const [x402Paying, setX402Paying] = useState(false)
  const [orchSteps, setOrchSteps] = useState<OrchestratorStep[]>([])
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false)
  const [pendingConfirmCb, setPendingConfirmCb] = useState<(() => void) | null>(null)
  // NAN action state
  const [pendingAction, setPendingAction] = useState<NanAction | null>(null)
  const [actionExecuting, setActionExecuting] = useState(false)
  const [actionResult, setActionResult]   = useState<string | undefined>()
  const [actionError,  setActionError]    = useState<string | undefined>()
  const endRef    = useRef<HTMLDivElement>(null)
  const listRef   = useRef<HTMLDivElement>(null)
  const [showNewMsg, setShowNewMsg] = useState(false)
  const isNearBottom = useRef(true)
  const sellerAddress = import.meta.env.VITE_X402_SELLER_ADDRESS as string | undefined
  const [serviceExecState, setServiceExecState] = useState<ServiceExecState>({ phase: 'idle' })
  // Inline swap state — drives InlineChatSwap rendered at bottom of message list
  const [inlineSwap, setInlineSwap] = useState<{ fromToken: string; toToken: string; amount: string } | null>(null)
  // Pending confirmation params — stored so confirm button can re-call with confirmed=1
  const pendingServiceRef = useRef<{ svcId: string | null; endpoint: string | null; query: string } | null>(null)

  // Track whether the user is near the bottom of the list
  const handleScroll = useCallback(() => {
    const el = listRef.current
    if (!el) return
    const threshold = 80
    isNearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold
    if (isNearBottom.current) setShowNewMsg(false)
  }, [])

  // When messages or typing change: scroll if near bottom, else show indicator
  useEffect(() => {
    if (isNearBottom.current) {
      endRef.current?.scrollIntoView({ behavior: 'smooth' })
      setShowNewMsg(false)
    } else {
      setShowNewMsg(true)
    }
  }, [agentMessages, typing, orchSteps])

  // When user sends a message always scroll to bottom
  const scrollToBottom = useCallback(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
    setShowNewMsg(false)
    isNearBottom.current = true
  }, [])

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

  // ── Service execution via backend execute-service route ──────────────────
  const runServiceExecution = async (opts: {
    svcId: string | null
    endpoint: string | null
    query: string
    confirmed?: boolean
  }) => {
    const { svcId, endpoint, query, confirmed } = opts
    pendingServiceRef.current = { svcId, endpoint, query }

    // Show appropriate loading state
    setServiceExecState(confirmed
      ? { phase: 'paying' }
      : { phase: 'checking', label: 'Let me check the service and your Agent Wallet...' }
    )
    if (confirmed) {
      // Brief delay so user sees the "Processing payment..." state
      await new Promise(r => setTimeout(r, 600))
      setServiceExecState({ phase: 'executing' })
      await new Promise(r => setTimeout(r, 400))
    }

    const storeSnap = useAppStore.getState()
    const aw = storeSnap.agentWallet
    const perms = storeSnap.agentPermissions

    try {
      const body: Record<string, string> = {
        action: 'execute-service',
        query,
        dailyLimit: String(perms.dailyLimit),
        dailyUsed: String(storeSnap.agentDailyUsed),
        perServiceLimit: String(perms.perServiceLimit ?? 5),
        requireApproval: String(perms.requireApproval),
        requireApprovalAbove: String(perms.requireApprovalAbove ?? 5),
      }
      if (svcId) body.service_id = svcId
      if (endpoint) body.endpoint = endpoint
      if (confirmed) body.confirmed = '1'

      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (aw.userToken) headers['x-user-token'] = aw.userToken

      const r = await fetch('/api/agent-wallet', { method: 'POST', headers, body: JSON.stringify(body) })
      const d = await r.json() as ServiceExecResult

      // ── Blocked by policy or balance ───────────────────────────────────────
      if (d.blocked || (!d.ok && !d.awaiting_confirmation)) {
        const friendlyReason = (() => {
          const msg = d.reason ?? ''
          if (/insufficient|not enough|doesn't have/i.test(msg)) return "Your Agent Wallet doesn't have enough USDC for this payment."
          if (/per.service limit|service limit/i.test(msg)) return `This payment exceeds your per-service spending limit.`
          if (/daily|budget/i.test(msg)) return `You've reached your daily spending limit.`
          if (/policy/i.test(msg)) return `This payment isn't permitted by your current spending policy.`
          return msg || "I couldn't complete that request."
        })()
        setServiceExecState({ phase: 'error', reason: friendlyReason })
        addAgentMessage({ role: 'agent', content: `I couldn't complete that request. ${friendlyReason}`, action: 'info' })
        return
      }

      // ── Awaiting confirmation ──────────────────────────────────────────────
      if (d.awaiting_confirmation) {
        setServiceExecState({
          phase: 'awaiting_confirmation',
          cost_usdc: d.cost_usdc ?? 0,
          real_balance: d.real_balance ?? '0',
          service: d.service ?? null,
          svcId, endpoint, query,
        })
        return
      }

      // ── Execute error ──────────────────────────────────────────────────────
      if (d.execute_error) {
        setServiceExecState({ phase: 'error', reason: "I couldn't retrieve the results from that service right now." })
        addAgentMessage({ role: 'agent', content: "I couldn't retrieve the results right now. The service may be temporarily unavailable.", action: 'info' })
        return
      }

      // ── Success ────────────────────────────────────────────────────────────
      if (d.executed && d.result) {
        setServiceExecState({ phase: 'idle' })
        const providerName = d.service?.provider ?? svcId ?? 'the service'
        const costNote = (d.cost_usdc ?? 0) > 0
          ? ` · ${(d.cost_usdc ?? 0).toFixed(4)} USDC deducted from Agent Wallet`
          : ''
        addAgentMessage({
          role: 'agent',
          content: `Done — here's what I found.\n\n${d.result}`,
          action: 'info',
          serviceSource: providerName + costNote,
        })
        // Record activity
        storeSnap.addExecutionLog({
          taskId: `svc-${Date.now()}`,
          userRequest: query,
          serviceId: svcId ?? d.service?.id ?? '',
          serviceName: providerName,
          status: 'complete',
          cost: d.cost_usdc ?? 0,
          result: d.result.slice(0, 200),
        })
        if ((d.cost_usdc ?? 0) > 0) {
          storeSnap.addAgentSpend({
            id: `spend-${Date.now()}`,
            service_id: svcId ?? d.service?.id ?? '',
            service_name: providerName,
            amount_usdc: d.cost_usdc ?? 0,
            txId: d.tx_ref ?? `nan-${Date.now().toString(36)}`,
            paid: true,
            timestamp: new Date().toISOString(),
          })
        }
        return
      }

      // Free service executed but no result body
      if (d.ok && !d.result) {
        setServiceExecState({ phase: 'idle' })
        addAgentMessage({ role: 'agent', content: "The service completed but returned no data. Try rephrasing your request.", action: 'info' })
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : 'Unknown error'
      setServiceExecState({ phase: 'error', reason: "I couldn't reach the backend right now. Please check your connection." })
      addAgentMessage({ role: 'agent', content: `I couldn't reach the backend right now. (${errMsg})`, action: 'info' })
    }
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

  // ── Action confirm / execute ────────────────────────────────────────────────
  const handleActionConfirm = async () => {
    if (!pendingAction) return
    setActionExecuting(true); setActionError(undefined); setActionResult(undefined)
    try {
      const store = useAppStore.getState()
      const result = await executeAction(pendingAction, {
        store,
        navigate: (page: string, query?: string) => {
          if (onNavigate) onNavigate(page, query)
        },
        agentWalletUserToken: agentWallet.userToken,
        writeContractAsync,
        connectedAddress: address,
        chainId: chainId ?? 5042002,
        isCircleUcwUser,
        isPasskeyUser,
        triggerCircleSend,
      })
      // Handle special signal strings from agent-actions executor
      if (result?.startsWith('__AGENT_WALLET_CHALLENGE__:')) {
        const [, rest] = result.split('__AGENT_WALLET_CHALLENGE__:')
        const [challengeId, toAddr, amt, note] = rest.split('::')
        addAgentMessage({ role: 'agent', content: `Ready to send **${amt} USDC** to ${toAddr.slice(0,6)}...${toAddr.slice(-4)} via your Agent Wallet. A Circle PIN popup will open to sign the transaction.`, action: 'info' })
        // Use the module-level agent SDK from AgentWalletExperience via store
        const aw = useAppStore.getState().agentWallet
        const sdk = (window as unknown as Record<string, unknown>)._nanAgentSdk as { setAuthentication: (a: { userToken: string; encryptionKey: string }) => void; execute: (id: string, cb: (err: unknown, res: unknown) => void) => void } | undefined
        if (sdk && aw.userToken && aw.encryptionKey) {
          sdk.setAuthentication({ userToken: aw.userToken, encryptionKey: aw.encryptionKey })
          sdk.execute(challengeId, (err, res) => {
            if (err) {
              addAgentMessage({ role: 'agent', content: `Transaction signing failed: ${(err as { message?: string })?.message ?? 'Unknown error'}`, action: 'info' })
            } else {
              const tx = (res as { txHash?: string })?.txHash ?? ''
              addAgentMessage({ role: 'agent', content: `Sent **${amt} USDC** to ${toAddr.slice(0,6)}...${toAddr.slice(-4)}!${tx ? ` [View on explorer](https://explorer.testnet.arc.io/tx/${tx})` : ''}${note ? ` — "${note}"` : ''}`, action: 'info' })
              useAppStore.getState().addActivity({ type: 'sent', description: `Agent Send → ${toAddr.slice(0,8)}…${toAddr.slice(-4)}`, amount: parseFloat(amt), sign: '-', status: 'confirmed', counterparty: toAddr, txHash: tx || undefined, agentInitiated: true })
            }
          })
        } else {
          addAgentMessage({ role: 'agent', content: 'Please open the Agent Wallet tab and re-authenticate to restore signing access, then try again.', action: 'info' })
        }
        setActionExecuting(false)
        setPendingAction(null)
        return
      }
      if (result === '__AGENT_WALLET_FUND__') {
        if (onNavigate) onNavigate('agent-wallet')
        addAgentMessage({ role: 'agent', content: 'Opening your Agent Wallet funding screen.', action: 'info' })
        setActionExecuting(false)
        setPendingAction(null)
        return
      }
      setActionResult(result)
      addAgentMessage({ role: 'agent', content: `Done — ${result}`, action: 'info' })
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setActionExecuting(false)
    }
  }

  const send = async () => {
    const text = input.trim()
    if (!text) return
    setInput('')
    // Reset any pending action from last turn
    setPendingAction(null); setActionResult(undefined); setActionError(undefined)
    if (sellerAddress && address) {
      const paid = await payX402()
      if (!paid) { addAgentMessage({ role:'agent', content:'Payment of 0.001 USDC required. Approve in your wallet.', action:'info' }); return }
    }
    addAgentMessage({ role:'user', content:text })
    scrollToBottom()

    // Choose a contextual loading message
    const lower = text.toLowerCase()
    if (/balance|wallet|usdc|fund/.test(lower))      setLoadingMessage('Checking your balance...')
    else if (/swap|quote|rate|convert/.test(lower))   setLoadingMessage('Getting the latest quote...')
    else if (/send|transfer|pay/.test(lower))         setLoadingMessage('Checking your Agent Wallet...')
    else if (/policy|limit|spending/.test(lower))     setLoadingMessage('Checking your spending policy...')
    else if (/bridge|cctp/.test(lower))               setLoadingMessage('Connecting to the bridge...')
    else if (/service|search|find|research/.test(lower)) setLoadingMessage('Finding the right service...')
    else                                               setLoadingMessage('Let me check on that...')

    setTyping(true)
    setOrchSteps([])

    // LLM first — handles all general questions including flights, rates, research
    // Allow for both Circle email users (auth) and wagmi/passkey users (address)
    try {
      if (backendConfigured()) {
        const msgs: Array<{role:'user'|'assistant';content:string}> = [
          ...agentMessages.filter(m=>m.role==='user'||m.role==='agent').slice(-10).map<{role:'user'|'assistant';content:string}>(m=>({role:(m.role==='agent'?'assistant':'user'),content:m.content})),
          {role:'user',content:text},
        ]
        const storeSnap = useAppStore.getState()
        // Build cross-chain summary string for the LLM
        const crossChainEntries = Object.entries(storeSnap.crossChainBalances)
          .filter(([, bal]) => parseFloat(bal) > 0)
        const crossChainSummary = crossChainEntries.length > 0
          ? crossChainEntries.map(([chain, bal]) => `${chain}: ${bal} USDC`).join(', ')
          : 'no balances on other chains yet'
        const totalCrossChain = crossChainEntries
          .reduce((sum, [, bal]) => sum + parseFloat(bal), 0)
          .toFixed(2)

        // Build rich context — NAN Agent now sees the full platform state
        const recentActivity = storeSnap.activity.slice(0, 10).map(a => ({
          type: a.type,
          amount: a.amount,
          sign: a.sign,
          description: a.description,
          counterparty: a.counterparty,
          timestamp: a.timestamp instanceof Date ? a.timestamp.toISOString() : String(a.timestamp),
          status: a.status,
          txHash: a.txHash,
        }))
        const recurringTasks = storeSnap.recurringTasks.map(t => ({
          name: t.name,
          recipient: t.recipient,
          amount: t.amount,
          frequency: t.frequency,
          active: t.active,
          nextRunAt: t.nextRunAt,
          runCount: t.runCount,
        }))
        const openPaymentRequests = storeSnap.paymentRequests
          .filter(p => p.status === 'pending' || p.status === 'viewed')
          .slice(0, 10)
          .map(p => ({ refNumber: p.refNumber, title: p.title, amount: p.amount, status: p.status, dueDate: p.dueDate }))
        const recentInvoices = storeSnap.invoices.slice(0, 5).map(inv => ({
          number: inv.number,
          customerName: inv.customerName,
          total: inv.total,
          status: inv.status,
          dueDate: inv.dueDate,
          amountDue: inv.amountDue,
        }))
        const recentAgentActions = storeSnap.agentExecutionLog.slice(0, 5).map(e => ({
          userRequest: e.userRequest,
          serviceName: e.serviceName,
          status: e.status,
          cost: e.cost,
          timestamp: e.timestamp instanceof Date ? e.timestamp.toISOString() : String(e.timestamp),
        }))

        const res = await nanChat({
          messages: msgs,
          usdcBal: storeSnap.mainWalletBalance,
          userAddress: address ?? auth?.walletAddress ?? '',
          sessionToken: auth?.sessionToken,
          context: {
            mainBalance: storeSnap.mainWalletBalance,
            mainAddress: address ?? auth?.walletAddress ?? '',
            isPasskeyUser: auth?.isPasskeyUser ?? false,
            isCircleUcwUser: !!(auth?.userToken && !auth?.isPasskeyUser),
            agentBalance: agentWallet.balance_usdc ?? '0',
            agentAddress: agentWallet.address,
            agentWalletProvisioned: agentWallet.provisioned,
            agentWalletId: agentWallet.walletId,
            agentWalletBlockchain: agentWallet.blockchain,
            agentWalletAccountType: agentWallet.accountType,
            dailyLimit: agentPermissions.dailyLimit,
            perTxLimit: agentPermissions.perTxLimit,
            perServiceLimit: agentPermissions.perServiceLimit,
            remainingToday: Math.max(0, agentPermissions.dailyLimit - agentDailyUsed),
            agentEnabled: agentPermissions.enabled,
            requireApproval: agentPermissions.requireApproval,
            requireApprovalAbove: agentPermissions.requireApprovalAbove,
            autoApproveUnder: agentPermissions.autoApproveUnder,
            agentDailyUsed,
            crossChainBalances: storeSnap.crossChainBalances,
            crossChainSummary,
            totalCrossChainBalance: totalCrossChain,
            recentActivity,
            recurringTasks,
            openPaymentRequests,
            recentInvoices,
            recentAgentActions,
            displayName: storeSnap.profile.displayName || undefined,
            unreadNotifications: storeSnap.unreadCount,
          },
        })
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
        addAgentMessage({
          role: 'agent',
          content: clean || res.reply,
          action: 'info',
          serviceSource: serviceLabel,
          marketplaceServices: res.marketplace_services,
        })
        // "Use it" / "use the service" — trigger service execution on last discovered service
        const lowerInput = text.toLowerCase()
        if (/^(use it|use the service|use this service|yes use|proceed|go ahead|use that)\.?$/i.test(lowerInput.trim()) || /use (it|the service|this service)$/i.test(lowerInput)) {
          // Find the last marketplace service from previous messages
          const lastSvcMsg = [...agentMessages].reverse().find(m => m.marketplaceServices && m.marketplaceServices.length > 0)
          const lastSvc = lastSvcMsg?.marketplaceServices?.[0]
          if (lastSvc) {
            const lastUserQ = agentMessages.filter(m => m.role === 'user').slice(-3)[0]?.content ?? text
            void runServiceExecution({ svcId: null, endpoint: lastSvc.endpoint, query: lastUserQ })
          }
        }

        // Parse and handle action block
        if (res.action) {
          const parsed = parseAction(res.action)
          if (parsed) {
            // swap_start → inline swap flow in chat (never navigate away)
            if (parsed.action === 'swap_start') {
              setInlineSwap({
                fromToken: parsed.params.fromToken ?? 'USDC',
                toToken:   parsed.params.toToken   ?? 'USDC',
                amount:    parsed.params.amount     ?? '',
              })
            } else if (!requiresConfirmation(parsed)) {
              // Execute immediately (navigate, toggle, search, balance, receipts, qr, etc.)
              try {
                const store = useAppStore.getState()
                const result = await executeAction(parsed, {
                  store,
                  navigate: (page: string, query?: string) => { if (onNavigate) onNavigate(page, query) },
                  agentWalletUserToken: agentWallet.userToken,
                  writeContractAsync,
                  connectedAddress: address,
                  chainId: chainId ?? 5042002,
                  isCircleUcwUser,
                  isPasskeyUser,
                  triggerCircleSend,
                })
                // Handle special signal strings
                if (result === '__AGENT_WALLET_FUND__') {
                  if (onNavigate) onNavigate('agent-wallet')
                  addAgentMessage({ role: 'agent', content: 'Opening your Agent Wallet funding screen.', action: 'info' })
                } else if (result?.startsWith('__SHOW_QR__:')) {
                  const [, rest] = result.split('__SHOW_QR__:')
                  const [addr] = rest.split('::')
                  addAgentMessage({ role: 'agent', content: `Opening your receive QR code${addr ? ` for address ${addr.slice(0,6)}...${addr.slice(-4)}` : ''}.`, action: 'info' })
                  if (onNavigate) onNavigate('wallet')
                } else {
                  addAgentMessage({ role:'agent', content: result, action:'info' })
                }
              } catch (e) {
                addAgentMessage({ role:'agent', content: `Action failed: ${e instanceof Error ? e.message : 'Unknown error'}`, action:'info' })
              }
              setTimeout(scrollToBottom, 50)
            } else {
              // Show confirmation card
              setPendingAction(parsed)
              setTimeout(scrollToBottom, 50)
            }
          }
        }
        return
      }
    } catch (chatErr) {
      // LLM call failed — try orchestration for service-like queries, then
      // show an inline keyword-based reply so the user never sees an error card
      const needsService = /flight|hotel|search|research|find|book|supplier|price|compare|weather|news|data|job|career|invoice|translate|image|video|check|lookup/i.test(text)
      if (needsService && agentPermissions.enabled) {
        setTyping(false)
        const handled = await runOrchestration(text)
        if (handled) return
      }
      setTyping(false)

      // Inline keyword fallback — answers balance, activity, recurring directly from store
      const lower = text.toLowerCase()
      const storeSnap2 = useAppStore.getState()
      const mainBal = parseFloat(storeSnap2.mainWalletBalance || '0').toFixed(2)
      const agentBal2 = parseFloat(agentWallet.balance_usdc || '0').toFixed(2)

      if (/balance|how much|my usdc/.test(lower)) {
        addAgentMessage({ role: 'agent', content: `Your main wallet has **${mainBal} USDC** on Arc Testnet. Your Agent Wallet has **${agentBal2} USDC**.`, action: 'info' })
      } else if (/recent|activity|transaction|history/.test(lower)) {
        const acts = storeSnap2.activity.slice(0, 5)
        if (acts.length > 0) {
          const lines = acts.map((a, i) => `${i + 1}. ${a.sign}${a.amount.toFixed ? a.amount.toFixed(2) : a.amount} USDC — ${a.description} (${a.status})`).join('\n')
          addAgentMessage({ role: 'agent', content: `Here are your last ${acts.length} transactions:\n\n${lines}`, action: 'info' })
        } else {
          addAgentMessage({ role: 'agent', content: "You don't have any transactions yet.", action: 'info' })
        }
      } else if (/recurring|scheduled/.test(lower)) {
        const tasks = storeSnap2.recurringTasks
        if (tasks.length > 0) {
          const lines = tasks.map((t, i) => `${i + 1}. "${t.name}" — ${t.amount} USDC ${t.frequency} (${t.active ? 'active' : 'paused'})`).join('\n')
          addAgentMessage({ role: 'agent', content: `You have ${tasks.length} recurring payment${tasks.length > 1 ? 's' : ''}:\n\n${lines}`, action: 'info' })
        } else {
          addAgentMessage({ role: 'agent', content: "No recurring payments set up yet. Say \"add a weekly payment of 5 USDC to 0x...\" to create one.", action: 'info' })
        }
      } else if (/statement|download.*statement|export|csv|pdf/.test(lower)) {
        addAgentMessage({ role: 'agent', content: "You can download your full transaction statement from the **Exports** page. Tap the menu and go to **Exports** to download a CSV or PDF of your activity.", action: 'info' })
      } else if (/send|pay|transfer/.test(lower)) {
        // Try to parse address and amount from the message
        const addrMatch = text.match(/0x[a-fA-F0-9]{40}/)
        const amtMatch = text.match(/(\d+(?:\.\d+)?)\s*usdc/i) ?? text.match(/(\d+(?:\.\d+)?)\s+usdc/i) ?? text.match(/send\s+(\d+(?:\.\d+)?)/i)
        if (addrMatch && amtMatch) {
          const toAddress = addrMatch[0]
          const amount = amtMatch[1]
          addAgentMessage({ role: 'agent', content: `Sending **${amount} USDC** to ${toAddress.slice(0,6)}...${toAddress.slice(-4)}. Please confirm below.`, action: 'info' })
          setPendingAction({ action: 'send_usdc', params: { toAddress, amount } })
          setTimeout(scrollToBottom, 50)
        } else {
          addAgentMessage({ role: 'agent', content: "To send USDC, tell me the address and amount — for example: \"Send 10 USDC to 0x...\"", action: 'info' })
        }
      } else if (/bridge/.test(lower)) {
        addAgentMessage({ role: 'agent', content: "You can bridge USDC to other chains from the **Bridge** page. Tell me the chain and amount — for example: \"Bridge 20 USDC to Base Sepolia\"", action: 'info' })
      } else if (/swap/.test(lower)) {
        addAgentMessage({ role: 'agent', content: "You can swap tokens from the **Swap** page. Tell me what you want to swap — for example: \"Swap 10 USDC to ETH\"", action: 'info' })
      } else if (/payment request|invoice/.test(lower)) {
        addAgentMessage({ role: 'agent', content: "You can create and manage payment requests from the **Payment Requests** page. Tell me the amount and I'll set one up — for example: \"Create a payment request for 50 USDC\"", action: 'info' })
      } else if (/hello|hi|hey|good morning|good afternoon|good evening/.test(lower)) {
        addAgentMessage({ role: 'agent', content: `Hey! I'm NAN, your financial assistant. Your main wallet has **${mainBal} USDC**. What can I help you with today?`, action: 'info' })
      } else {
        const errMsg = chatErr instanceof Error ? chatErr.message : 'Unknown error'
        console.warn('NAN chat fallback triggered:', errMsg)
        addAgentMessage({ role: 'agent', content: `I can help you with your balance, recent transactions, recurring payments, sending USDC, bridging, swapping, payment requests, and downloading statements. What would you like to do?`, action: 'info' })
      }
      return
    }
  }

  const QUICK = [
    "What's my balance?",
    'Show my recent transactions',
    'Show my recurring payments',
    'Bridge 10 USDC to Base Sepolia',
    'Set my daily spending limit to 50 USDC',
    'Create a payment request for 25 USDC',
    'What is the current Bitcoin price?',
    'Find me a web research service',
    'Enable the NAN Agent',
  ]

  return (
    /* Full-height flex column — fills whatever AgentPage gives it */
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>

      {/* ── x402 notice (shrinks, never pushes layout) ── */}
      {sellerAddress && (
        <div style={{ flexShrink: 0, display:'flex', alignItems:'center', gap:8, padding:'7px 14px', background:SURFACE, borderBottom:`1px solid ${BORDER}` }}>
          <Coins size={13} color={BLACK} />
          <span style={{ fontSize:11, color:TEXT2, fontFamily:F }}>
            <strong style={{ color:BLACK }}>x402</strong> · 0.001 USDC per message · paid onchain
          </span>
          {x402Paying && <Loader2 size={11} color={BLACK} style={{ marginLeft:'auto', animation:'spin 1s linear infinite' }} />}
        </div>
      )}

      {/* ── Scrollable message list (the ONLY scrollable area) ── */}
      <div
        ref={listRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          padding: '10px 12px 6px',
          scrollbarWidth: 'none',
          WebkitOverflowScrolling: 'touch' as React.CSSProperties['WebkitOverflowScrolling'],
          msOverflowStyle: 'none',
        }}
      >
        {/* Quick-action chips — only shown when conversation is fresh */}
        {agentMessages.length <= 2 && (
          <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:4 }}>
            {QUICK.map(p => (
              <button key={p} onClick={() => setInput(p)} style={{ fontSize:11, fontWeight:500, padding:'6px 10px', background:SURFACE, border:`1px solid ${BORDER}`, borderRadius:20, cursor:'pointer', color:TEXT2, fontFamily:F }}>
                {p}
              </button>
            ))}
          </div>
        )}

        {agentMessages.map(msg => (
          <MsgBubble
            key={msg.id}
            msg={msg}
            onApprove={approveAgentPurchase}
            onReject={rejectAgentPurchase}
            onUseService={(s) => {
              addAgentMessage({ role: 'user', content: `Use ${s.provider}` })
              addAgentMessage({ role: 'agent', content: `Sure — let me check the service details and your Agent Wallet.`, action: 'info' })
              scrollToBottom()
              // Derive a reasonable query from the last user message
              const lastUserMsg = agentMessages.filter(m => m.role === 'user').slice(-2)[0]?.content ?? `use ${s.provider}`
              void runServiceExecution({
                svcId: null,
                endpoint: s.endpoint,
                query: lastUserMsg,
              })
            }}
            onInspectService={(s) => {
              addAgentMessage({ role: 'user', content: `Inspect ${s.provider}` })
              addAgentMessage({
                role: 'agent',
                content: `**${s.provider}**\n\nCategory: ${s.category_label}\n${s.description}\n\nEndpoint: ${s.method} ${s.endpoint}\nPricing: ${s.pricing}\nPayment: ${s.payment_scheme === 'x402' ? 'Circle x402 Nanopayment (Base network)' : s.payment_scheme}\n${s.payment_address ? `Payment address: ${s.payment_address.slice(0, 8)}...${s.payment_address.slice(-6)}` : ''}${s.provider_docs ? `\nDocs: ${s.provider_docs}` : ''}`,
                action: 'info',
              })
            }}
          />
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
        {/* Service execution flow — shown when user taps "Use service" */}
        {serviceExecState.phase !== 'idle' && (
          <ServiceExecutionFlow
            state={serviceExecState}
            onConfirm={() => {
              const p = pendingServiceRef.current
              if (!p) return
              void runServiceExecution({ ...p, confirmed: true })
            }}
            onCancel={() => {
              setServiceExecState({ phase: 'idle' })
              addAgentMessage({ role:'agent', content:'Cancelled — I didn\'t send any payment.', action:'info' })
            }}
          />
        )}
        {pendingAction && (
          <ActionConfirmCard
            action={pendingAction}
            executing={actionExecuting}
            result={actionResult}
            error={actionError}
            onConfirm={() => void handleActionConfirm()}
            onCancel={() => {
              setPendingAction(null); setActionResult(undefined); setActionError(undefined)
              addAgentMessage({ role:'agent', content:'Action cancelled.', action:'info' })
            }}
          />
        )}
        {typing && (
          <div style={{ display:'flex', alignItems:'flex-end', gap:7 }}>
            {/* NAN avatar */}
            <div style={{ width:28, height:28, borderRadius:'50%', background:`linear-gradient(135deg,${BLUE} 0%,#5B9FFF 100%)`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <Bot size={13} color="#fff" />
            </div>
            {/* Typing bubble */}
            <div style={{ background:SURF, border:`1px solid ${BDR}`, borderRadius:18, borderBottomLeftRadius:4, padding:'11px 16px', display:'flex', alignItems:'center', gap:5 }}>
              <span style={{ width:7, height:7, borderRadius:'50%', background:TEXT3, display:'inline-block', animation:'nanTyping 1.2s ease-in-out infinite', animationDelay:'0s' }} />
              <span style={{ width:7, height:7, borderRadius:'50%', background:TEXT3, display:'inline-block', animation:'nanTyping 1.2s ease-in-out infinite', animationDelay:'0.2s' }} />
              <span style={{ width:7, height:7, borderRadius:'50%', background:TEXT3, display:'inline-block', animation:'nanTyping 1.2s ease-in-out infinite', animationDelay:'0.4s' }} />
            </div>
          </div>
        )}
        {/* ── Inline swap UI — appears in conversation after swap_start ── */}
        {inlineSwap && !agentWallet.provisioned && (
          // Passkey/wagmi users: navigate to Swap tab instead of inline swap
          (() => {
            // Navigate immediately and clear
            if (onNavigate) {
              useAppStore.getState().setSwapPrefill({ fromToken: inlineSwap.fromToken, toToken: inlineSwap.toToken, amount: inlineSwap.amount })
              onNavigate('swap')
            }
            setTimeout(() => setInlineSwap(null), 100)
            return null
          })()
        )}
        {inlineSwap && agentWallet.provisioned && (
          <div style={{ paddingLeft:36, paddingRight:4 }}>
            <InlineChatSwap
              fromToken={inlineSwap.fromToken}
              toToken={inlineSwap.toToken}
              amount={inlineSwap.amount}
              agentUserToken={agentWallet.userToken ?? ''}
              agentAddress={agentWallet.address ?? ''}
              agentBalance={agentWallet.balance_usdc ?? '0'}
              onDone={(msg) => {
                setInlineSwap(null)
                addAgentMessage({ role:'agent', content: msg, action:'info' })
                const store = useAppStore.getState()
                store.addAgentSpend({ id:`spend-${Date.now()}`, service_id:'agent-swap', service_name:`Swap ${inlineSwap.amount} ${inlineSwap.fromToken} → ${inlineSwap.toToken}`, amount_usdc: parseFloat(inlineSwap.amount)||0, paid:true, timestamp:new Date().toISOString() })
                store.addActivity({ type:'swap', description:`Agent Swap: ${inlineSwap.amount} ${inlineSwap.fromToken} → ${inlineSwap.toToken}`, amount:parseFloat(inlineSwap.amount)||0, sign:'-', status:'confirmed', counterparty:inlineSwap.toToken })
              }}
              onCancel={() => {
                setInlineSwap(null)
                addAgentMessage({ role:'agent', content:'Swap cancelled.', action:'info' })
              }}
            />
          </div>
        )}
        {/* Scroll anchor */}
        <div ref={endRef} style={{ height: 1 }} />
      </div>

      {/* ── "New message" indicator — appears when user has scrolled up ── */}
      {showNewMsg && (
        <button
          onClick={scrollToBottom}
          style={{
            position: 'absolute',
            bottom: 72, /* sits above composer */
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 16px',
            borderRadius: 20,
            background: BLUE,
            border: 'none',
            color: '#fff',
            fontSize: 12, fontWeight: 700,
            cursor: 'pointer',
            fontFamily: F,
            boxShadow: '0 4px 16px rgba(0,102,255,0.4)',
            zIndex: 10,
            whiteSpace: 'nowrap',
          }}
        >
          ↓ New message
        </button>
      )}

      {/* ── WhatsApp-style fixed composer ── */}
      <div style={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
        background: SURF,
        borderTop: `1px solid ${BORDER}`,
      }}>
        {/* Clear button */}
        <button
          onClick={clearAgentMessages}
          style={{
            width: 40, height: 40, borderRadius: '50%',
            background: SURF2, border: `1px solid ${BORDER}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', flexShrink: 0,
          }}
          title="Clear chat"
        >
          <X size={15} color={TEXT2} />
        </button>

        {/* Pill input */}
        <div style={{
          flex: 1, minWidth: 0,
          display: 'flex', alignItems: 'center',
          background: SURF2,
          border: `1.5px solid ${BORDER}`,
          borderRadius: 24,
          padding: '0 14px',
          height: 44,
        }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }}
            placeholder="Ask NAN anything about your money…"
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              boxShadow: 'none',
              WebkitAppearance: 'none',
              WebkitTapHighlightColor: 'transparent',
              background: 'transparent',
              fontFamily: F, fontSize: 14, color: BLACK,
              minWidth: 0,
            }}
          />
          {x402Paying && <Loader2 size={13} color={TEXT3} style={{ flexShrink:0, animation:'spin 1s linear infinite' }} />}
        </div>

        {/* Send button — round, blue, glows when active */}
        <button
          onClick={() => void send()}
          disabled={!input.trim() || typing || x402Paying}
          style={{
            width: 44, height: 44, borderRadius: '50%',
            background: input.trim() && !typing && !x402Paying ? BLUE : SURF2,
            border: `1.5px solid ${input.trim() && !typing && !x402Paying ? BLUE : BORDER}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: input.trim() && !typing ? 'pointer' : 'default',
            flexShrink: 0,
            transition: 'background 0.15s, border-color 0.15s',
            boxShadow: input.trim() && !typing && !x402Paying ? '0 2px 12px rgba(0,102,255,0.35)' : 'none',
          }}
        >
          <Send size={16} color={input.trim() && !typing && !x402Paying ? '#fff' : TEXT3} style={{ marginLeft: 2 }} />
        </button>
      </div>
    </div>
  )
}

// ── Pattern detection helpers ─────────────────────────────────────────────────

// Detects patterns like "main wallet balance: 0 usdc" or "main wallet\n0.00 usdc"
function extractBalances(text: string): { main?: string; agent?: string } | null {
  const lower = text.toLowerCase()
  // Must mention both wallets to count as a dual-balance message
  if (!lower.includes('main') && !lower.includes('agent')) return null
  if (!lower.includes('usdc')) return null
  const mainMatch = lower.match(/main[^0-9]*(\d+(?:\.\d+)?)\s*usdc/)
  const agentMatch = lower.match(/agent[^0-9]*(\d+(?:\.\d+)?)\s*usdc/)
  if (!mainMatch && !agentMatch) return null
  return { main: mainMatch?.[1], agent: agentMatch?.[1] }
}

function isAddressRequest(text: string): boolean {
  const lower = text.toLowerCase()
  return lower.includes('address') && (lower.includes('agent wallet') || lower.includes('wallet address') || lower.includes('my address'))
}

function extractAddress(text: string): { label: string; address: string } | null {
  const match = text.match(/0x[0-9a-fA-F]{40}/)
  if (!match) return null
  const lower = text.toLowerCase()
  const label = lower.includes('agent') ? 'Agent Wallet Address' : lower.includes('main') ? 'Main Wallet Address' : 'Wallet Address'
  return { label, address: match[0] }
}

function isErrorMessage(text: string): boolean {
  const lower = text.toLowerCase()
  return lower.startsWith('error') || lower.includes('failed') || lower.includes("couldn't") || lower.includes('could not') || lower.includes('unable to')
}

function isSuccessMessage(text: string): boolean {
  const lower = text.toLowerCase()
  return (lower.includes('done') || lower.includes('complete') || lower.includes('sent') || lower.includes('succeeded') || lower.includes('payment went through')) && lower.includes('usdc')
}

// Strip raw financial technical text the LLM may leak
function sanitiseContent(text: string): string {
  return text
    // "Main Wallet Balance: 0 USDC (address: 0x...)"
    .replace(/main wallet balance:\s*\d+(?:\.\d+)?\s*usdc\s*\(address:\s*0x[0-9a-fA-F]+\)/gi, '')
    // "Agent Wallet Balance: 149.167003 USDC (address: 0x...)"
    .replace(/agent wallet balance:\s*\d+(?:\.\d+)?\s*usdc\s*\(address:\s*0x[0-9a-fA-F]+\)/gi, '')
    // "Your current balances are as follows:" intro line
    .replace(/your current balances are as follows[:\s]*/gi, '')
    // Bare wallet addresses (only strip if not at start of message where user asked)
    .replace(/\(address:\s*0x[0-9a-fA-F]{40}\)/gi, '')
    // "Network: arc-testnet / chain id: 5042002" etc.
    .replace(/network:\s*[^\n]+/gi, '')
    .replace(/chain\s*id:\s*\d+/gi, '')
    // Remove double blank lines left by substitutions
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function MsgBubble({ msg, onApprove, onReject, onUseService, onInspectService }: {
  msg: AgentMessage
  onApprove: (id: string) => void
  onReject: (id: string) => void
  onUseService?: (s: MarketplaceServiceCard) => void
  onInspectService?: (s: MarketplaceServiceCard) => void
}) {
  const { agentPermissions, agentDailyUsed, agentWallet, setActiveView, crossChainBalances } = useAppStore()

  if (msg.role === 'user') return (
    <div style={{ display:'flex', justifyContent:'flex-end', paddingLeft: 48 }}>
      <div style={{
        background: BLUE, color:'#fff', fontSize:14,
        borderRadius:20, borderTopRightRadius:4,
        padding:'10px 14px', maxWidth:'82%', lineHeight:1.55,
        wordBreak:'break-word',
      }}>{msg.content}</div>
    </div>
  )

  const clean = sanitiseContent(msg.content)
  const balances = extractBalances(msg.content)
  const addressInfo = isAddressRequest(msg.content) ? extractAddress(msg.content) : null
  const showError = isErrorMessage(clean)
  const showSuccess = isSuccessMessage(clean)

  // Determine a friendly display text (stripped of raw technical content)
  let displayText = clean

  // If it was a balance response, replace the stripped content with a friendly intro
  if (balances && (balances.main !== undefined || balances.agent !== undefined)) {
    displayText = "Here's your current balance."
  } else if (addressInfo) {
    displayText = ''
  }

  return (
    <div style={{ display:'flex', alignItems:'flex-end', gap:7, paddingRight: 48 }}>
      {/* NAN avatar — only shown on last bubble in a run */}
      <div style={{
        width:28, height:28, borderRadius:'50%',
        background:`linear-gradient(135deg,${BLUE} 0%,#5B9FFF 100%)`,
        display:'flex', alignItems:'center', justifyContent:'center',
        flexShrink:0,
      }}>
        <Bot size={13} color="#fff" />
      </div>
      <div style={{ flex:1, display:'flex', flexDirection:'column', gap:6 }}>

        {/* Main text bubble — hide if empty or fully replaced by a card */}
        {displayText.length > 0 && !showError && (
          <div style={{
            background:SURF, border:`1px solid ${BDR}`,
            borderRadius:20, borderBottomLeftRadius:4,
            padding:'10px 14px', fontSize:14, color:BLACK,
            lineHeight:1.6, whiteSpace:'pre-wrap', wordBreak:'break-word',
          }}>
            {displayText}
          </div>
        )}

        {/* Balance card — rendered when backend sends balance info */}
        {balances && (balances.main !== undefined || balances.agent !== undefined) && (
          <BalanceCard data={{
            mainBalance: balances.main ?? '0',
            agentBalance: balances.agent ?? agentWallet.balance_usdc ?? '0',
            crossChainBalances,
            onViewWallet: () => setActiveView('wallet'),
          }} />
        )}

        {/* Address reveal — only shown when user explicitly asked */}
        {addressInfo && (
          <AddressRevealCard data={addressInfo} />
        )}

        {/* Spending card — when message is about spending / daily limit */}
        {/spending|daily limit|remaining today|usdc remaining/i.test(msg.content) && !balances && (
          <SpendingCard data={{
            dailyLimit: agentPermissions.dailyLimit,
            dailyUsed: agentDailyUsed,
          }} />
        )}

        {/* Success transaction card */}
        {showSuccess && (() => {
          const amtMatch = msg.content.match(/(\d+(?:\.\d+)?)\s*usdc/i)
          const amount = amtMatch ? parseFloat(amtMatch[1]) : 0
          return (
            <TransactionCard data={{
              type: 'Agent Payment',
              amount,
              status: 'completed',
              showTxId: false,
            }} />
          )
        })()}

        {/* Error card */}
        {showError && (
          <ErrorCard data={{
            message: (() => {
              const lower = clean.toLowerCase()
              if (lower.includes('insufficient') || lower.includes('not enough')) return "Your Agent Wallet doesn't have enough USDC for this payment."
              if (lower.includes('not set up') || lower.includes('not provisioned')) return "Your Agent Wallet isn't set up yet."
              if (lower.includes('policy') || lower.includes('limit exceeded')) return "This request was blocked by your spending policy."
              if (lower.includes('wallet not connected')) return "Please connect your wallet to continue."
              return "I couldn't complete that request."
            })(),
            technical: clean.length > 20 ? clean : undefined,
          }} />
        )}

        {/* Purchase approval card */}
        {msg.action === 'purchase_request' && (
          <PurchaseApprovalCard data={{
            description: msg.content,
            amount: (() => { const m = msg.content.match(/(\d+(?:\.\d+)?)\s*usdc/i); return m ? parseFloat(m[1]) : 0 })(),
            approved: msg.approved,
            onApprove: () => onApprove(msg.id),
            onReject:  () => onReject(msg.id),
          }} />
        )}

        {/* Live marketplace results */}
        {msg.marketplaceServices && msg.marketplaceServices.length >= 0 && onUseService && onInspectService && (
          <div>
            <ServiceDiscoveryCard
              services={msg.marketplaceServices}
              onUseService={onUseService}
              onInspectService={onInspectService}
            />
          </div>
        )}

        {/* Timestamp + service tag */}
        <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
          <div style={{ fontSize:10, color:TEXT3 }}>{formatRelativeTime(msg.timestamp)}</div>
          {msg.serviceSource && (
            <div style={{ fontSize:10, fontWeight:600, color:'#0066FF', background:'rgba(0,102,255,0.08)', border:'1px solid rgba(0,102,255,0.2)', borderRadius:6, padding:'1px 7px', display:'flex', alignItems:'center', gap:3 }}>
              <Zap size={9} color='#0066FF' /> {msg.serviceSource}
            </div>
          )}
          {msg.marketplaceServices && msg.marketplaceServices.length > 0 && (
            <div style={{ fontSize:10, fontWeight:600, color:'#10B981', background:'rgba(16,185,129,0.08)', border:'1px solid rgba(16,185,129,0.2)', borderRadius:6, padding:'1px 7px', display:'flex', alignItems:'center', gap:3 }}>
              <Zap size={9} color='#10B981' /> Circle Marketplace
            </div>
          )}
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
