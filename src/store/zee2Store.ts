import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ── Nan session ───────────────────────────────────────────────────────────────
export interface NanAuth {
  email: string
  sessionToken: string
  walletAddress: string
  walletId: string
  pendingOtpToken?: string
  pendingOtpExpiry?: number
}

export type ActivityType = 'received' | 'sent' | 'purchase' | 'agent_purchase' | 'request'

export interface ActivityItem {
  id: string
  type: ActivityType
  description: string
  amount: number
  sign: '+' | '-'
  timestamp: Date
  status: 'confirmed' | 'pending' | 'failed'
  counterparty?: string
  txHash?: string
  agentInitiated?: boolean
}

export interface AgentPermissions {
  enabled: boolean
  dailyLimit: number
  perTxLimit: number
  allowedCategories: string[]
  requireApproval: boolean
  autoApproveUnder: number
}

export interface AgentMessage {
  id: string
  role: 'user' | 'agent'
  content: string
  timestamp: Date
  action?: 'info'
  approved?: boolean
}

export interface OnboardingState {
  completed: boolean
  step: number
  useCases: string[]
  agentConfigured: boolean
}

interface Zee2State {
  nanAuth: NanAuth | null
  setNanAuth: (auth: NanAuth | null) => void
  setNanWallet: (walletAddress: string, walletId: string) => void

  onboarding: OnboardingState
  setOnboarding: (update: Partial<OnboardingState>) => void

  activity: ActivityItem[]
  addActivity: (item: Omit<ActivityItem, 'id' | 'timestamp'>) => void

  agentPermissions: AgentPermissions
  setAgentPermissions: (update: Partial<AgentPermissions>) => void
  agentDailyUsed: number
  agentMessages: AgentMessage[]
  addAgentMessage: (msg: Omit<AgentMessage, 'id' | 'timestamp'>) => void
  clearAgentMessages: () => void
  resetDailyUsage: () => void

  activeView: string
  setActiveView: (view: string) => void
  previousView: string | null
}

export const useZee2Store = create<Zee2State>()(
  persist(
    (set) => ({
      nanAuth: null,
      setNanAuth: (auth) => set({ nanAuth: auth }),
      setNanWallet: (walletAddress, walletId) =>
        set((s) => ({
          nanAuth: s.nanAuth ? { ...s.nanAuth, walletAddress, walletId } : null,
        })),

      onboarding: { completed: false, step: 0, useCases: [], agentConfigured: false },
      setOnboarding: (update) =>
        set((s) => ({ onboarding: { ...s.onboarding, ...update } })),

      activity: [],
      addActivity: (item) =>
        set((s) => ({
          activity: [
            { ...item, id: `act-${Date.now()}-${Math.random().toString(36).slice(2,7)}`, timestamp: new Date() },
            ...s.activity,
          ],
        })),

      agentPermissions: {
        enabled: true, dailyLimit: 20, perTxLimit: 10,
        allowedCategories: ['tech', 'digital', 'home'],
        requireApproval: false, autoApproveUnder: 10,
      },
      setAgentPermissions: (update) =>
        set((s) => ({ agentPermissions: { ...s.agentPermissions, ...update } })),
      agentDailyUsed: 0,
      agentMessages: [],
      addAgentMessage: (msg) =>
        set((s) => ({
          agentMessages: [
            ...s.agentMessages,
            { ...msg, id: `msg-${Date.now()}-${Math.random().toString(36).slice(2,7)}`, timestamp: new Date() },
          ],
        })),
      clearAgentMessages: () => set({ agentMessages: [] }),
      resetDailyUsage: () => set({ agentDailyUsed: 0 }),

      activeView: 'landing',
      setActiveView: (view) => set((s) => ({ previousView: s.activeView, activeView: view })),
      previousView: null,
    }),
    {
      name: 'zee2-state',
      partialize: (s) => ({
        nanAuth: s.nanAuth,
        onboarding: s.onboarding,
        agentPermissions: s.agentPermissions,
        agentDailyUsed: s.agentDailyUsed,
        agentMessages: s.agentMessages,
        activity: s.activity,
      }),
      merge: (persisted, current) => {
        const p = persisted as Partial<Zee2State>
        return {
          ...current, ...p,
          activity: (p.activity ?? current.activity).map((a) => ({ ...a, timestamp: new Date(a.timestamp) })),
          agentMessages: (p.agentMessages ?? current.agentMessages).map((m) => ({ ...m, timestamp: new Date(m.timestamp) })),
        }
      },
    }
  )
)
