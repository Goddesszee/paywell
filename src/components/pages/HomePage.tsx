/**
 * HomePage — NAN Agent Command Center
 *
 * Hierarchy:
 *  1. Balance (money humans & agents share)
 *  2. Agent Spending (agent budget + usage)
 *  3. Your Agents (roster + create CTA)
 *  4. Quick Actions (Send / Receive / Swap)
 *  5. Recent Activity
 */
import React, { useState } from 'react'
import { useAccount, useReadContract } from 'wagmi'
import { erc20Abi } from 'viem'
import {
  ArrowUpRight, ArrowDownLeft, ArrowUpDown,
  Bot, ChevronRight, Plus, Pause, Play,
  Zap, Shield, Activity as ActivityIcon,
  Search, Bell, MessageSquare, HelpCircle, Star, Lightbulb, Bookmark,
} from 'lucide-react'
import { useAppStore, ActivityItem } from '../../store/appStore'
import { getUsdc } from '../../onchain-facts'
import { Amount, usdcDecimalsFor } from '../../onchain-money'
import { useNanTheme, NanTheme } from '../../hooks/useNanTheme'

const F    = "'Inter', -apple-system, sans-serif"
const MONO = "'JetBrains Mono', 'SF Mono', Menlo, monospace"
const ARC  = 5042002

// ─── types ────────────────────────────────────────────────────────────────────

interface AgentEntry {
  id: string
  name: string
  mission: string
  dailyBudget: number
  usedToday: number
  active: boolean
  color: string
}

// ─── sub-components ───────────────────────────────────────────────────────────

function QuickAction({
  Icon, label, onClick, primary = false, C,
}: {
  Icon: React.ElementType; label: string; onClick: () => void
  primary?: boolean; C: NanTheme
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        padding: '14px 6px', borderRadius: 14,
        background: primary ? C.blueDim : C.surf,
        border: `1px solid ${primary ? C.blueBd : C.bdr}`,
        cursor: 'pointer', transition: 'all 0.15s', fontFamily: F,
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        background: primary ? C.blue : C.surf2,
        border: `1px solid ${primary ? 'transparent' : C.bdr}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={16} color={primary ? '#fff' : C.t2} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 600, color: primary ? C.blue : C.t2, letterSpacing: '0.02em' }}>
        {label}
      </span>
    </button>
  )
}

function TxRow({ item, C }: { item: ActivityItem; C: NanTheme }) {
  const isIn  = item.sign === '+'
  const isBot = !!item.agentInitiated
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 16px', borderBottom: `1px solid ${C.bdr}`,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
        background: isBot
          ? 'rgba(0,102,255,0.08)'
          : isIn ? 'rgba(0,200,83,0.08)' : 'rgba(255,59,59,0.08)',
        border: `1px solid ${isBot
          ? 'rgba(0,102,255,0.15)'
          : isIn ? 'rgba(0,200,83,0.15)' : 'rgba(255,59,59,0.15)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {isBot
          ? <Bot size={15} color="#0066FF" />
          : isIn
            ? <ArrowDownLeft size={15} color="#00C853" />
            : <ArrowUpRight size={15} color="#FF3B3B" />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {item.description}
        </div>
        <div style={{ fontSize: 11, color: C.t3, marginTop: 2, fontFamily: MONO, display: 'flex', alignItems: 'center', gap: 4 }}>
          {item.counterparty && <span>{item.counterparty}</span>}
          {item.counterparty && <span style={{ opacity: 0.3 }}>·</span>}
          <span>{new Date(item.timestamp).toLocaleDateString('en', { month: 'short', day: 'numeric' })}</span>
        </div>
      </div>
      <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: isIn ? '#00C853' : '#FF3B3B', flexShrink: 0 }}>
        {item.sign}{item.amount} USDC
      </span>
    </div>
  )
}

function AgentCard({
  agent, onToggle, onOpen, C,
}: {
  agent: AgentEntry
  onToggle: (id: string) => void
  onOpen: (id: string) => void
  C: NanTheme
}) {
  const pct = agent.dailyBudget > 0 ? (agent.usedToday / agent.dailyBudget) * 100 : 0
  const remaining = Math.max(0, agent.dailyBudget - agent.usedToday)

  return (
    <div style={{
      background: C.surf,
      border: `1px solid ${C.bdr}`,
      borderRadius: 14,
      padding: '13px 14px',
      transition: 'all 0.15s',
      cursor: 'pointer',
    }}
      onClick={() => onOpen(agent.id)}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Avatar */}
        <div style={{
          width: 34, height: 34, borderRadius: 10, flexShrink: 0,
          background: `${agent.color}18`,
          border: `1px solid ${agent.color}30`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Bot size={15} color={agent.color} />
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{agent.name}</span>
            <span style={{
              fontSize: 10, fontWeight: 600,
              color: agent.active ? '#00C853' : C.t3,
              background: agent.active ? 'rgba(0,200,83,0.08)' : C.surf2,
              border: `1px solid ${agent.active ? 'rgba(0,200,83,0.18)' : C.bdr}`,
              padding: '1px 7px', borderRadius: 20,
            }}>
              {agent.active ? 'Active' : 'Paused'}
            </span>
          </div>
          <div style={{ fontSize: 11, color: C.t3, marginTop: 1 }}>
            ${agent.dailyBudget}/day · {remaining.toFixed(2)} USDC remaining
          </div>
        </div>

        {/* Pause / Play */}
        <button
          onClick={e => { e.stopPropagation(); onToggle(agent.id) }}
          style={{
            width: 30, height: 30, borderRadius: 8, flexShrink: 0,
            background: C.surf2, border: `1px solid ${C.bdr}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          {agent.active
            ? <Pause size={13} color={C.t2} />
            : <Play size={13} color={C.t2} />}
        </button>
      </div>

      {/* Spend bar */}
      {agent.active && (
        <div style={{ marginTop: 10 }}>
          <div style={{ height: 2, background: C.bdr, borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              width: `${Math.min(pct, 100)}%`,
              height: '100%',
              background: pct > 80 ? '#FF3B3B' : agent.color,
              borderRadius: 2,
              transition: 'width 0.5s ease',
            }} />
          </div>
        </div>
      )}
    </div>
  )
}

function CreateAgentCard({ onClick, C }: { onClick: () => void; C: NanTheme }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '13px 14px', borderRadius: 14,
        background: 'transparent',
        border: `1px dashed ${C.bdr2}`,
        cursor: 'pointer', transition: 'all 0.15s', width: '100%', fontFamily: F,
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <div style={{
        width: 34, height: 34, borderRadius: 10, flexShrink: 0,
        background: C.blueDim, border: `1px solid ${C.blueBd}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Plus size={15} color="#0066FF" />
      </div>
      <div style={{ textAlign: 'left' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#0066FF' }}>Create Agent</div>
        <div style={{ fontSize: 11, color: C.t3, marginTop: 1 }}>Fund a new AI agent with USDC</div>
      </div>
    </button>
  )
}

// ─── create agent modal ───────────────────────────────────────────────────────

function CreateAgentModal({
  onClose, onCreate, C,
}: {
  onClose: () => void
  onCreate: (agent: Omit<AgentEntry, 'id' | 'usedToday'>) => void
  C: NanTheme
}) {
  const [name, setName] = useState('')
  const [mission, setMission] = useState('')
  const [budget, setBudget] = useState('20')
  const COLORS = ['#0066FF', '#00C853', '#F0A500', '#FF3B3B', '#A855F7']
  const [color, setColor] = useState(COLORS[0])

  const submit = () => {
    if (!name.trim()) return
    onCreate({ name: name.trim(), mission: mission.trim() || 'General purpose agent', dailyBudget: Math.max(0, parseFloat(budget) || 0), active: true, color })
    onClose()
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480,
          background: C.surf, border: `1px solid ${C.bdr2}`,
          borderRadius: '20px 20px 0 0',
          padding: '24px 20px 40px',
          animation: 'slideUp 0.22s ease both',
        }}
      >
        <div style={{ fontSize: 17, fontWeight: 700, color: C.text, marginBottom: 4 }}>Create Agent</div>
        <div style={{ fontSize: 13, color: C.t3, marginBottom: 20 }}>Define a new AI agent and set its spending rules.</div>

        {/* Name */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: C.t3, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Name</label>
          <input
            value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. Research Agent"
            style={{ width: '100%', padding: '11px 14px', background: C.surf2, border: `1px solid ${C.bdr2}`, borderRadius: 10, fontFamily: F, fontSize: 14, color: C.text, outline: 'none', boxSizing: 'border-box' }}
          />
        </div>

        {/* Mission */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: C.t3, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Mission</label>
          <input
            value={mission} onChange={e => setMission(e.target.value)}
            placeholder="e.g. Research APIs and buy data"
            style={{ width: '100%', padding: '11px 14px', background: C.surf2, border: `1px solid ${C.bdr2}`, borderRadius: 10, fontFamily: F, fontSize: 14, color: C.text, outline: 'none', boxSizing: 'border-box' }}
          />
        </div>

        {/* Daily budget */}
        <div style={{ marginBottom: 18 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: C.t3, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Daily Budget (USDC)</label>
          <div style={{ position: 'relative' }}>
            <input
              type="number" min="0" step="1" value={budget} onChange={e => setBudget(e.target.value)}
              style={{ width: '100%', padding: '11px 52px 11px 14px', background: C.surf2, border: `1px solid ${C.bdr2}`, borderRadius: 10, fontFamily: F, fontSize: 16, fontWeight: 700, color: C.text, outline: 'none', boxSizing: 'border-box' }}
            />
            <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 12, fontWeight: 600, color: C.t3 }}>USDC/day</span>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            {[5, 10, 20, 50].map(v => (
              <button key={v} onClick={() => setBudget(v.toString())}
                style={{ flex: 1, height: 32, borderRadius: 8, border: `1px solid ${budget === v.toString() ? C.blue : C.bdr}`, background: budget === v.toString() ? C.blueDim : C.surf2, color: budget === v.toString() ? C.blue : C.t2, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: F }}>
                ${v}
              </button>
            ))}
          </div>
        </div>

        {/* Color */}
        <div style={{ marginBottom: 22 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: C.t3, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 8 }}>Color</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {COLORS.map(c => (
              <button key={c} onClick={() => setColor(c)} style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: `2px solid ${color === c ? '#fff' : 'transparent'}`, cursor: 'pointer', flexShrink: 0, transition: 'border-color 0.15s' }} />
            ))}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={submit} disabled={!name.trim()}
            style={{ flex: 1, height: 50, background: '#0066FF', color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: name.trim() ? 'pointer' : 'not-allowed', fontFamily: F, opacity: name.trim() ? 1 : 0.4, transition: 'opacity 0.15s' }}>
            Create Agent
          </button>
          <button onClick={onClose}
            style={{ height: 50, padding: '0 20px', background: C.surf2, color: C.t2, border: `1px solid ${C.bdr2}`, borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: F }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── main component ───────────────────────────────────────────────────────────

const DEFAULT_AGENTS: AgentEntry[] = [
  { id: 'ag-research', name: 'Research Agent',  mission: 'Find and purchase data from APIs',    dailyBudget: 5,  usedToday: 0.42, active: true,  color: '#0066FF' },
  { id: 'ag-dev',      name: 'Developer Agent', mission: 'Pay for compute and dev services',    dailyBudget: 10, usedToday: 2.80, active: true,  color: '#00C853' },
  { id: 'ag-biz',      name: 'Business Agent',  mission: 'Handle business expenses and tools',  dailyBudget: 5,  usedToday: 0,    active: false, color: '#F0A500' },
]

export function HomePage() {
  const C = useNanTheme()
  const { address, isConnected } = useAccount()
  const { activity, agentPermissions, agentDailyUsed, setActiveView, auth, profile, notifications, unreadCount } = useAppStore()
  const usdcFact = getUsdc(ARC)

  const { data: rawBalance, isLoading } = useReadContract({
    address: usdcFact?.address as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: ARC,
    query: { enabled: !!address && !!usdcFact },
  })

  const formatted = rawBalance !== undefined
    ? Amount.fromRaw(rawBalance, usdcDecimalsFor(ARC)).toFixed(2)
    : null

  const total     = formatted ? parseFloat(formatted) : 0
  const daily     = agentPermissions.dailyLimit
  const available = Math.max(0, total - daily)
  const pct       = daily > 0 ? (agentDailyUsed / daily) * 100 : 0

  const recent = activity.slice(0, 5)

  // Local agent roster (demo-ready; real agents would persist in store)
  const [agents, setAgents] = useState<AgentEntry[]>(DEFAULT_AGENTS)
  const [showCreate, setShowCreate] = useState(false)

  const toggleAgent = (id: string) => {
    setAgents(prev => prev.map(a => a.id === id ? { ...a, active: !a.active } : a))
  }

  const createAgent = (data: Omit<AgentEntry, 'id' | 'usedToday'>) => {
    setAgents(prev => [...prev, { ...data, id: `ag-${Date.now()}`, usedToday: 0 }])
  }

  // Total agent budget allocated
  const totalAllocated = agents.filter(a => a.active).reduce((s, a) => s + a.dailyBudget, 0)
  const totalUsed      = agents.reduce((s, a) => s + a.usedToday, 0)

  // Greeting
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const firstName = profile.displayName?.split(' ')[0] || auth?.email?.split('@')[0] || null

  // Pinned unread notification (most recent)
  const pinnedNotif = notifications.find(n => !n.read)

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', fontFamily: F, paddingBottom: 32 }}>

      {/* ── 0a. Welcome header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em', color: C.text, lineHeight: 1.1 }}>
            {greeting}{firstName ? `, ${firstName}` : ''}
          </div>
          <div style={{ fontSize: 13, color: C.t3, marginTop: 2 }}>
            {isConnected ? 'Arc Testnet · USDC' : 'Connect wallet to get started'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 7 }}>
          <button onClick={() => setActiveView('search')} aria-label="Search"
            style={{ width: 36, height: 36, borderRadius: 10, background: C.surf, border: `1px solid ${C.bdr}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>
            <Search size={16} color={C.t2} />
          </button>
          <button onClick={() => setActiveView('profile')} aria-label="Profile"
            style={{ width: 36, height: 36, borderRadius: 10, background: C.surf, border: `1px solid ${C.bdr}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', overflow: 'hidden', WebkitTapHighlightColor: 'transparent' }}>
            {profile.avatarUrl
              ? <img src={profile.avatarUrl} alt="avatar" style={{ width: 36, height: 36, objectFit: 'cover' }} />
              : <span style={{ fontSize: 14, fontWeight: 700, color: '#0066FF' }}>{(profile.displayName || auth?.email || 'N').slice(0,1).toUpperCase()}</span>
            }
          </button>
        </div>
      </div>

      {/* ── 0b. Pinned unread notification ── */}
      {pinnedNotif && (
        <div
          onClick={() => setActiveView('notifications')}
          style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(0,102,255,0.07)', border: '1px solid rgba(0,102,255,0.18)', borderRadius: 12, padding: '10px 14px', marginBottom: 12, cursor: 'pointer' }}>
          <Bell size={14} color="#0066FF" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#0066FF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pinnedNotif.title}</div>
            <div style={{ fontSize: 11, color: C.t2, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pinnedNotif.body}</div>
          </div>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: '#0066FF', borderRadius: 20, padding: '1px 7px', flexShrink: 0 }}>{unreadCount}</span>
        </div>
      )}

      {/* ── 0c. Quick shortcuts bar ── */}
      <div style={{ display: 'flex', gap: 7, marginBottom: 16, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 2 }}>
        {[
          { label: 'Support', Icon: MessageSquare, view: 'support', color: '#0066FF' },
          { label: 'FAQ',     Icon: HelpCircle,    view: 'faq',     color: '#F0A500' },
          { label: 'Saved',   Icon: Bookmark,      view: 'favorites', color: '#0066FF' },
          { label: 'Feedback',Icon: Star,          view: 'feedback', color: '#F0A500' },
          { label: 'Ideas',   Icon: Lightbulb,     view: 'suggestions', color: '#00C853' },
        ].map(({ label, Icon, view, color }) => (
          <button key={view} onClick={() => setActiveView(view)}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '9px 14px', borderRadius: 12, background: C.surf, border: `1px solid ${C.bdr}`, cursor: 'pointer', flexShrink: 0, fontFamily: F, WebkitTapHighlightColor: 'transparent', transition: 'all 0.12s' }}>
            <Icon size={16} color={color} />
            <span style={{ fontSize: 10, fontWeight: 600, color: C.t2, whiteSpace: 'nowrap' }}>{label}</span>
          </button>
        ))}
      </div>

      {/* ── 1. Balance card ── */}
      <div style={{
        background: C.isDark
          ? 'linear-gradient(150deg,#0E1014 0%,#111520 60%,#0D0F14 100%)'
          : 'linear-gradient(150deg,#0A0C14 0%,#111520 60%,#0D0F14 100%)',
        border: '1px solid rgba(255,255,255,0.09)',
        borderRadius: 20, padding: '22px 22px 18px',
        marginBottom: 12, position: 'relative', overflow: 'hidden',
      }}>
        {/* Ambient glow */}
        <div style={{ position: 'absolute', top: -40, right: -30, width: 180, height: 180, borderRadius: '50%', background: 'radial-gradient(circle,rgba(0,102,255,0.18) 0%,transparent 65%)', pointerEvents: 'none' }} />

        <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.32)', letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 6, fontFamily: MONO }}>
          Total Balance
        </div>

        {isLoading ? (
          <div style={{ height: 52, width: 180, background: 'rgba(255,255,255,0.06)', borderRadius: 10, marginBottom: 12, animation: 'nan-shimmer 1.4s ease infinite' }} />
        ) : (
          <div style={{ marginBottom: 14 }}>
            <span style={{ fontSize: 44, fontWeight: 700, letterSpacing: '-0.03em', color: '#FFFFFF', fontFamily: F, lineHeight: 1 }}>
              {formatted ?? '0.00'}
            </span>
            <span style={{ fontSize: 18, color: 'rgba(255,255,255,0.36)', fontWeight: 500, marginLeft: 8 }}>USDC</span>
          </div>
        )}

        {!isConnected && (
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.30)', marginBottom: 10, fontFamily: MONO }}>
            Connect wallet to view balance
          </div>
        )}

        {/* Available + Agent split */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[
            { label: 'Available', val: `${available.toFixed(2)} USDC`, color: 'rgba(255,255,255,0.70)' },
            { label: 'Agent budget', val: `${daily.toFixed(2)} USDC`, color: '#0066FF' },
          ].map(({ label, val, color }) => (
            <div key={label} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.36)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color, fontFamily: MONO }}>{val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 2. Agent Spending ── */}
      <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 16, padding: '16px 18px', marginBottom: 12, transition: 'background 0.25s' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: C.blueDim, border: `1px solid ${C.blueBd}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Shield size={13} color="#0066FF" />
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.text, letterSpacing: '-0.01em' }}>Agent Spending</span>
          </div>
          <span style={{ fontSize: 10, fontWeight: 600, color: '#00C853', background: 'rgba(0,200,83,0.08)', border: '1px solid rgba(0,200,83,0.18)', padding: '2px 9px', borderRadius: 20 }}>
            Active
          </span>
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 12 }}>
          {[
            { label: 'Allocated', val: `${totalAllocated.toFixed(2)}` },
            { label: 'Used today', val: `${totalUsed.toFixed(2)}` },
            { label: 'Remaining', val: `${Math.max(0, totalAllocated - totalUsed).toFixed(2)}` },
          ].map(({ label, val }) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.text, fontFamily: MONO, lineHeight: 1 }}>{val}</div>
              <div style={{ fontSize: 9, fontWeight: 600, color: C.t3, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 3 }}>USDC {label}</div>
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div style={{ height: 3, background: C.bdr, borderRadius: 2, overflow: 'hidden', marginBottom: 12 }}>
          <div style={{
            width: `${Math.min(daily > 0 ? (agentDailyUsed / daily) * 100 : 0, 100)}%`,
            height: '100%',
            background: pct > 80 ? '#FF3B3B' : '#0066FF',
            borderRadius: 2, transition: 'width 0.5s ease',
          }} />
        </div>

        <button
          onClick={() => setActiveView('agent')}
          style={{
            width: '100%', padding: '9px', borderRadius: 9,
            background: C.blueDim, border: `1px solid ${C.blueBd}`,
            color: '#0066FF', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', fontFamily: F,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          }}
        >
          <Zap size={13} /> Manage permissions <ChevronRight size={13} />
        </button>
      </div>

      {/* ── 3. Your Agents ── */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Bot size={14} color={C.blue} />
            <span style={{ fontSize: 12, fontWeight: 700, color: C.t2, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Your Agents</span>
          </div>
          <button
            onClick={() => setActiveView('agent')}
            style={{ fontSize: 12, color: C.blue, background: 'none', border: 'none', cursor: 'pointer', fontFamily: F, display: 'flex', alignItems: 'center', gap: 3 }}
          >
            Manage <ChevronRight size={12} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {agents.map(agent => (
            <AgentCard
              key={agent.id}
              agent={agent}
              onToggle={toggleAgent}
              onOpen={() => setActiveView('agent')}
              C={C}
            />
          ))}
          <CreateAgentCard onClick={() => setShowCreate(true)} C={C} />
        </div>
      </div>

      {/* ── 4. Quick Actions ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 12 }}>
        <QuickAction Icon={ArrowUpRight}  label="Send"    onClick={() => setActiveView('send')}    primary C={C} />
        <QuickAction Icon={ArrowDownLeft} label="Receive" onClick={() => setActiveView('receive')} C={C} />
        <QuickAction Icon={ArrowUpDown}   label="Swap"    onClick={() => setActiveView('swap')}    C={C} />
      </div>

      {/* ── 5. Recent Activity ── */}
      <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 16, overflow: 'hidden', transition: 'background 0.25s' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <ActivityIcon size={13} color={C.t3} />
            <span style={{ fontSize: 12, fontWeight: 700, color: C.t2, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Recent Activity</span>
          </div>
          <button
            onClick={() => setActiveView('activity')}
            style={{ fontSize: 12, color: C.blue, background: 'none', border: 'none', cursor: 'pointer', fontFamily: F, display: 'flex', alignItems: 'center', gap: 3 }}
          >
            View all <ChevronRight size={12} />
          </button>
        </div>

        <div>
          {recent.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '28px 20px' }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: C.surf2, border: `1px solid ${C.bdr}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
                <ActivityIcon size={18} color={C.t3} />
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 4 }}>No activity yet</div>
              <div style={{ fontSize: 12, color: C.t3 }}>Your transactions will appear here</div>
            </div>
          ) : (
            recent.map((item, idx) => (
              <div key={item.id} style={{ borderBottom: idx < recent.length - 1 ? undefined : 'none' }}>
                <TxRow item={item} C={C} />
              </div>
            ))
          )}
        </div>
      </div>

      {/* Create Agent Modal */}
      {showCreate && (
        <CreateAgentModal onClose={() => setShowCreate(false)} onCreate={createAgent} C={C} />
      )}

      {/* Slide-up keyframe (injected once) */}
      <style>{`@keyframes slideUp{from{transform:translateY(24px);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>
    </div>
  )
}
