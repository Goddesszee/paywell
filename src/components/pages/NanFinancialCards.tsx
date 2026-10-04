/**
 * NanFinancialCards.tsx
 *
 * Polished, reusable financial card components for NAN Agent chat.
 * - Addresses are NEVER shown by default — only on explicit user request.
 * - All amounts come from live store / backend data; nothing is hardcoded.
 * - Language is friendly and conversational, never technical.
 */
import { useState } from 'react'
import {
  Wallet, ArrowRight, CheckCircle2, AlertCircle,
  Copy, Check, ChevronDown, ChevronUp, Loader2, X,
  TrendingUp, Zap,
} from 'lucide-react'

// ── design tokens (matches existing AgentPage tokens) ─────────────────────────
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

// ── helpers ───────────────────────────────────────────────────────────────────

function fmt2(n: string | number | undefined | null): string {
  const v = parseFloat(String(n ?? '0'))
  if (isNaN(v)) return '0.00'
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try { await navigator.clipboard.writeText(value) } catch { /* ignore */ }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      onClick={() => void copy()}
      style={{ display:'flex', alignItems:'center', gap:4, height:28, padding:'0 10px', border:`1px solid ${BDR}`, borderRadius:8, background:SURF2, cursor:'pointer', fontSize:11, fontWeight:600, color:copied?SUCCESS:TEXT2, fontFamily:F, flexShrink:0 }}
      title="Copy to clipboard"
    >
      {copied ? <Check size={11} color={SUCCESS} /> : <Copy size={11} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

// ── BalanceCard ───────────────────────────────────────────────────────────────

export interface BalanceCardData {
  mainBalance: string      // human-readable e.g. "42.50"
  agentBalance: string
  onViewWallet?: () => void
}

export function BalanceCard({ data }: { data: BalanceCardData }) {
  return (
    <div style={{ background:SURF, border:`1px solid ${BDR}`, borderRadius:16, overflow:'hidden', marginBottom:2 }}>
      {/* header label */}
      <div style={{ padding:'10px 14px 0', display:'flex', alignItems:'center', gap:6 }}>
        <Wallet size={12} color={TEXT3} />
        <span style={{ fontSize:11, fontWeight:700, color:TEXT3, textTransform:'uppercase', letterSpacing:'0.07em' }}>Your balances</span>
      </div>

      {/* balance rows */}
      <div style={{ padding:'8px 14px 2px', display:'flex', flexDirection:'column', gap:1 }}>
        <BalanceRow label="Main Wallet" amount={data.mainBalance} />
        <div style={{ height:1, background:BDR, margin:'4px 0' }} />
        <BalanceRow label="Agent Wallet" amount={data.agentBalance} accent />
      </div>

      {/* footer action */}
      {data.onViewWallet && (
        <button
          onClick={data.onViewWallet}
          style={{ width:'100%', padding:'10px 14px', background:'transparent', border:'none', borderTop:`1px solid ${BDR}`, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:5, fontSize:12, fontWeight:600, color:BLUE, fontFamily:F }}
        >
          View wallet details <ArrowRight size={11} />
        </button>
      )}
    </div>
  )
}

function BalanceRow({ label, amount, accent }: { label: string; amount: string; accent?: boolean }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 0' }}>
      <span style={{ fontSize:13, color:TEXT2, fontWeight:500 }}>{label}</span>
      <span style={{ fontSize:15, fontWeight:700, color:accent ? BLUE : TEXT, fontFamily:F, fontVariantNumeric:'tabular-nums' }}>
        {fmt2(amount)} <span style={{ fontSize:12, fontWeight:500, color:TEXT3 }}>USDC</span>
      </span>
    </div>
  )
}

// ── SpendingCard ──────────────────────────────────────────────────────────────

export interface SpendingCardData {
  dailyLimit: number
  dailyUsed: number
}

export function SpendingCard({ data }: { data: SpendingCardData }) {
  const remaining = Math.max(0, data.dailyLimit - data.dailyUsed)
  const pct = data.dailyLimit > 0 ? Math.min(100, (data.dailyUsed / data.dailyLimit) * 100) : 0
  const low = remaining < data.dailyLimit * 0.2
  return (
    <div style={{ background:SURF, border:`1px solid ${BDR}`, borderRadius:16, padding:'12px 14px' }}>
      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:10 }}>
        <TrendingUp size={12} color={TEXT3} />
        <span style={{ fontSize:11, fontWeight:700, color:TEXT3, textTransform:'uppercase', letterSpacing:'0.07em' }}>Agent spending today</span>
      </div>
      <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom:8 }}>
        <div>
          <div style={{ fontSize:22, fontWeight:800, color:low?DANGER:TEXT, fontVariantNumeric:'tabular-nums', lineHeight:1 }}>
            {fmt2(remaining)} <span style={{ fontSize:13, fontWeight:500, color:TEXT3 }}>USDC remaining</span>
          </div>
          <div style={{ fontSize:11, color:TEXT3, marginTop:3 }}>
            {fmt2(data.dailyUsed)} used of {fmt2(data.dailyLimit)} daily limit
          </div>
        </div>
      </div>
      {/* progress bar */}
      <div style={{ height:4, background:SURF2, borderRadius:99, overflow:'hidden' }}>
        <div style={{ height:'100%', width:`${pct}%`, background: low ? DANGER : BLUE, borderRadius:99, transition:'width 0.4s' }} />
      </div>
    </div>
  )
}

// ── PaymentCard ───────────────────────────────────────────────────────────────

export interface PaymentCardData {
  serviceName: string
  amount: number          // USDC amount
  agentBalance: string    // current agent wallet balance
  policyLabel?: string
  onConfirm: () => void
  onCancel: () => void
  executing?: boolean
}

export function PaymentCard({ data }: { data: PaymentCardData }) {
  const bal = parseFloat(data.agentBalance || '0')
  const insufficient = bal < data.amount
  return (
    <div style={{ background:SURF, border:`1px solid ${BDR}`, borderRadius:16, overflow:'hidden' }}>
      <div style={{ padding:'10px 14px 0', display:'flex', alignItems:'center', gap:6 }}>
        <Zap size={12} color={BLUE} />
        <span style={{ fontSize:11, fontWeight:700, color:TEXT3, textTransform:'uppercase', letterSpacing:'0.07em' }}>Payment ready</span>
      </div>

      <div style={{ padding:'8px 14px 12px', display:'flex', flexDirection:'column', gap:1 }}>
        <PayRow label="Service"         value={data.serviceName} />
        <PayRow label="Amount"          value={`${fmt2(data.amount)} USDC`} highlight />
        <PayRow label="Agent Wallet"    value={`${fmt2(bal)} USDC available`} />
        {data.policyLabel && <PayRow label="Policy" value={data.policyLabel} success />}
        <PayRow label="Status"          value="Ready for confirmation" />
      </div>

      {insufficient && (
        <div style={{ margin:'0 14px 12px', padding:'8px 12px', background:'rgba(255,59,59,0.06)', border:'1px solid rgba(255,59,59,0.18)', borderRadius:10, fontSize:12, color:DANGER }}>
          Your Agent Wallet doesn't have enough USDC for this payment.
        </div>
      )}

      <div style={{ display:'flex', gap:8, padding:'0 14px 14px' }}>
        <button
          onClick={data.onCancel}
          disabled={data.executing}
          style={{ flex:1, height:42, background:SURF2, color:TEXT, border:`1px solid ${BDR}`, borderRadius:11, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:F }}
        >
          Cancel
        </button>
        <button
          onClick={data.onConfirm}
          disabled={insufficient || data.executing}
          style={{ flex:2, height:42, background:insufficient?'rgba(0,102,255,0.3)':BLUE, color:'#fff', border:'none', borderRadius:11, fontSize:13, fontWeight:700, cursor:insufficient||data.executing?'not-allowed':'pointer', fontFamily:F, display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}
        >
          {data.executing
            ? <><Loader2 size={13} style={{ animation:'spin 1s linear infinite' }} /> Processing...</>
            : <><Check size={13} /> Continue</>
          }
        </button>
      </div>
    </div>
  )
}

function PayRow({ label, value, highlight, success }: { label: string; value: string; highlight?: boolean; success?: boolean }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'7px 0', borderBottom:`1px solid ${BDR}` }}>
      <span style={{ fontSize:12, color:TEXT2 }}>{label}</span>
      <span style={{ fontSize:12, fontWeight:600, color: success ? SUCCESS : highlight ? BLUE : TEXT }}>{value}</span>
    </div>
  )
}

// ── TransactionCard ───────────────────────────────────────────────────────────

export type TxStatus = 'pending' | 'confirmed' | 'failed' | 'completed'

export interface TransactionCardData {
  type: string           // e.g. "Agent Payment", "USDC Transfer", "Swap"
  amount: number | string
  status: TxStatus
  service?: string
  txId?: string          // shown only if explicitly requested / confirmed
  showTxId?: boolean     // opt-in to showing the tx id
}

export function TransactionCard({ data }: { data: TransactionCardData }) {
  const statusColor = data.status === 'confirmed' || data.status === 'completed' ? SUCCESS
    : data.status === 'failed' ? DANGER : BLUE
  const statusLabel = data.status === 'confirmed' || data.status === 'completed' ? 'Completed'
    : data.status === 'failed' ? 'Failed' : 'Pending'
  const StatusIcon = data.status === 'confirmed' || data.status === 'completed' ? CheckCircle2
    : data.status === 'failed' ? AlertCircle : Loader2
  return (
    <div style={{ background: data.status==='failed' ? 'rgba(255,59,59,0.04)' : 'rgba(0,200,83,0.04)', border:`1px solid ${data.status==='failed'?'rgba(255,59,59,0.18)':'rgba(0,200,83,0.18)'}`, borderRadius:16, padding:'12px 14px' }}>
      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:10 }}>
        <StatusIcon size={13} color={statusColor} style={data.status==='pending'?{ animation:'spin 1s linear infinite' }:undefined} />
        <span style={{ fontSize:12, fontWeight:700, color:statusColor }}>
          {data.status === 'confirmed' || data.status === 'completed' ? 'Payment complete' : data.status === 'failed' ? 'Payment failed' : 'Processing...'}
        </span>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:1 }}>
        <TxRow label="Type"   value={data.type} />
        <TxRow label="Amount" value={`${fmt2(data.amount)} USDC`} bold />
        {data.service && <TxRow label="Service" value={data.service} />}
        <TxRow label="Status" value={statusLabel} color={statusColor} />
        {data.showTxId && data.txId && (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'7px 0' }}>
            <span style={{ fontSize:12, color:TEXT2 }}>Reference</span>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ fontSize:11, fontFamily:'monospace', color:TEXT3 }}>{data.txId.slice(0, 10)}…{data.txId.slice(-6)}</span>
              <CopyButton value={data.txId} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function TxRow({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'5px 0', borderBottom:`1px solid ${BDR}` }}>
      <span style={{ fontSize:12, color:TEXT2 }}>{label}</span>
      <span style={{ fontSize:12, fontWeight:bold?700:600, color:color??TEXT }}>{value}</span>
    </div>
  )
}

// ── AddressRevealCard ─────────────────────────────────────────────────────────
// Only rendered when the user explicitly asks for an address.

export interface AddressRevealData {
  label: string        // e.g. "Agent Wallet Address"
  address: string
}

export function AddressRevealCard({ data }: { data: AddressRevealData }) {
  return (
    <div style={{ background:SURF, border:`1px solid ${BDR}`, borderRadius:16, padding:'12px 14px' }}>
      <div style={{ fontSize:11, fontWeight:700, color:TEXT3, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8 }}>
        {data.label}
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <span style={{ fontSize:12, fontFamily:'monospace', color:TEXT, wordBreak:'break-all', flex:1 }}>{data.address}</span>
        <CopyButton value={data.address} />
      </div>
    </div>
  )
}

// ── QuoteCard ─────────────────────────────────────────────────────────────────
// Used for swap / bridge quote preview.

export interface QuoteCardData {
  fromAmount: string
  fromSymbol: string
  toAmount: string     // real quoted amount — never hardcode
  toSymbol: string
  rate?: string        // e.g. "1 USDC = 0.94 EURC"
  fee?: string
  onReview?: () => void
}

export function QuoteCard({ data }: { data: QuoteCardData }) {
  return (
    <div style={{ background:SURF, border:`1px solid ${BDR}`, borderRadius:16, padding:'12px 14px' }}>
      <div style={{ fontSize:11, fontWeight:700, color:TEXT3, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:10 }}>
        Quote
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
        <div style={{ flex:1, background:SURF2, borderRadius:12, padding:'10px 12px', textAlign:'center' }}>
          <div style={{ fontSize:18, fontWeight:800, color:TEXT, fontVariantNumeric:'tabular-nums' }}>{fmt2(data.fromAmount)}</div>
          <div style={{ fontSize:12, fontWeight:600, color:TEXT3, marginTop:2 }}>{data.fromSymbol}</div>
        </div>
        <ArrowRight size={16} color={TEXT3} style={{ flexShrink:0 }} />
        <div style={{ flex:1, background:'rgba(0,102,255,0.06)', border:'1px solid rgba(0,102,255,0.15)', borderRadius:12, padding:'10px 12px', textAlign:'center' }}>
          <div style={{ fontSize:18, fontWeight:800, color:BLUE, fontVariantNumeric:'tabular-nums' }}>{fmt2(data.toAmount)}</div>
          <div style={{ fontSize:12, fontWeight:600, color:TEXT3, marginTop:2 }}>{data.toSymbol}</div>
        </div>
      </div>
      {(data.rate || data.fee) && (
        <div style={{ display:'flex', flexDirection:'column', gap:1 }}>
          {data.rate && <TxRow label="Rate" value={data.rate} />}
          {data.fee  && <TxRow label="Fee"  value={data.fee} />}
        </div>
      )}
      {data.onReview && (
        <button
          onClick={data.onReview}
          style={{ width:'100%', height:40, marginTop:12, background:BLUE, color:'#fff', border:'none', borderRadius:11, fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:F }}
        >
          Review swap
        </button>
      )}
    </div>
  )
}

// ── ErrorCard ─────────────────────────────────────────────────────────────────

export interface ErrorCardData {
  message: string       // friendly message shown by default
  technical?: string    // hidden behind "Details" — only shown on request
  onRetry?: () => void
}

export function ErrorCard({ data }: { data: ErrorCardData }) {
  const [showDetails, setShowDetails] = useState(false)
  return (
    <div style={{ background:'rgba(255,59,59,0.04)', border:'1px solid rgba(255,59,59,0.18)', borderRadius:14, padding:'12px 14px' }}>
      <div style={{ display:'flex', alignItems:'flex-start', gap:8 }}>
        <AlertCircle size={14} color={DANGER} style={{ flexShrink:0, marginTop:1 }} />
        <div style={{ flex:1 }}>
          <div style={{ fontSize:13, fontWeight:600, color:DANGER }}>{data.message}</div>
          {data.technical && (
            <button
              onClick={() => setShowDetails(v => !v)}
              style={{ background:'none', border:'none', cursor:'pointer', padding:0, fontSize:11, color:TEXT3, fontFamily:F, display:'flex', alignItems:'center', gap:3, marginTop:4 }}
            >
              {showDetails ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
              {showDetails ? 'Hide details' : 'Details'}
            </button>
          )}
          {showDetails && data.technical && (
            <div style={{ marginTop:6, padding:'8px 10px', background:SURF2, borderRadius:8, fontSize:11, color:TEXT3, fontFamily:'monospace', wordBreak:'break-all' }}>
              {data.technical}
            </div>
          )}
        </div>
        {data.onRetry && (
          <button
            onClick={data.onRetry}
            style={{ height:28, padding:'0 10px', background:SURF, border:`1px solid ${BDR}`, borderRadius:8, fontSize:12, fontWeight:600, color:TEXT, cursor:'pointer', fontFamily:F, flexShrink:0 }}
          >
            Try again
          </button>
        )}
      </div>
    </div>
  )
}

// ── LoadingCard ───────────────────────────────────────────────────────────────

export function LoadingCard({ message }: { message: string }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 14px', background:SURF, border:`1px solid ${BDR}`, borderRadius:14 }}>
      <Loader2 size={14} color={BLUE} style={{ animation:'spin 1s linear infinite', flexShrink:0 }} />
      <span style={{ fontSize:13, color:TEXT2, fontWeight:500 }}>{message}</span>
    </div>
  )
}

// ── InlineAddress ─────────────────────────────────────────────────────────────
// For use inside other components when an address must be shown (e.g. payment dest).

export function InlineAddress({ label, address }: { label?: string; address: string }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 0', borderBottom:`1px solid ${BDR}` }}>
      {label && <span style={{ fontSize:12, color:TEXT2, flexShrink:0 }}>{label}</span>}
      <span style={{ fontSize:11, fontFamily:'monospace', color:TEXT3, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
        {address}
      </span>
      <CopyButton value={address} />
    </div>
  )
}

// ── PurchaseApprovalCard ──────────────────────────────────────────────────────
// Replaces the old inline approve/decline buttons.

export interface PurchaseApprovalData {
  description: string
  amount: number
  currency?: string
  approved?: boolean
  onApprove: () => void
  onReject: () => void
}

export function PurchaseApprovalCard({ data }: { data: PurchaseApprovalData }) {
  if (data.approved === true) {
    return (
      <div style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 12px', background:'rgba(0,200,83,0.06)', border:'1px solid rgba(0,200,83,0.18)', borderRadius:12, fontSize:12, fontWeight:600, color:SUCCESS }}>
        <CheckCircle2 size={13} color={SUCCESS} /> Approved
      </div>
    )
  }
  if (data.approved === false) {
    return (
      <div style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 12px', background:SURF, border:`1px solid ${BDR}`, borderRadius:12, fontSize:12, color:TEXT3 }}>
        <X size={13} /> Declined
      </div>
    )
  }
  return (
    <div style={{ background:SURF, border:`1px solid ${BDR}`, borderRadius:14, padding:'12px 14px' }}>
      <div style={{ fontSize:12, color:TEXT2, marginBottom:8, lineHeight:1.5 }}>{data.description}</div>
      <div style={{ fontSize:16, fontWeight:800, color:TEXT, fontVariantNumeric:'tabular-nums', marginBottom:12 }}>
        {fmt2(data.amount)} <span style={{ fontSize:13, fontWeight:500, color:TEXT3 }}>{data.currency ?? 'USDC'}</span>
      </div>
      <div style={{ display:'flex', gap:8 }}>
        <button
          onClick={data.onApprove}
          style={{ flex:2, height:40, background:BLUE, color:'#fff', border:'none', borderRadius:10, fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:F, display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}
        >
          <Check size={12} /> Approve
        </button>
        <button
          onClick={data.onReject}
          style={{ flex:1, height:40, background:SURF2, color:TEXT, border:`1px solid ${BDR}`, borderRadius:10, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:F }}
        >
          Decline
        </button>
      </div>
    </div>
  )
}
