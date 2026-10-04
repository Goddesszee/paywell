/**
 * agent-actions.ts — Typed action definitions and executor for NAN Agent chat.
 *
 * The LLM emits a ```nan-action { ... }``` block. The frontend parses it,
 * shows a confirmation card, and on approval calls executeAction() which
 * dispatches to the correct store mutation or API call.
 *
 * SECURITY:
 * - All financial actions (send, recurring) require explicit user confirmation.
 * - No action can bypass the spending policy.
 * - No action touches wallet credentials or secrets.
 */

import { parseUnits } from 'viem'
import { getUsdc } from '../onchain-facts'
import type { AppState, RecurringFrequency } from '../store/appStore'

const USDC_TRANSFER_ABI = [{
  name: 'transfer', type: 'function', stateMutability: 'nonpayable',
  inputs: [{ name: 'to', type: 'address' }, { name: 'value', type: 'uint256' }],
  outputs: [{ name: '', type: 'bool' }],
}] as const

// ── Action type union ──────────────────────────────────────────────────────────

export type NanActionType =
  | 'add_recurring'
  | 'add_agent_recurring'
  | 'set_policy'
  | 'send_usdc'
  | 'agent_send'
  | 'navigate'
  | 'toggle_agent'
  | 'shop_search'
  | 'bridge_start'
  | 'bridge_info'
  | 'swap_start'

export interface AddRecurringAction {
  action: 'add_recurring'
  params: {
    name: string
    recipient: string
    amount: string
    frequency: RecurringFrequency
  }
}

export interface AddAgentRecurringAction {
  action: 'add_agent_recurring'
  params: {
    name: string
    recipient: string
    amount: string
    frequency: RecurringFrequency
  }
}

export interface SetPolicyAction {
  action: 'set_policy'
  params: {
    dailyLimit?: number
    perTxLimit?: number
    perServiceLimit?: number
    autoApproveUnder?: number
    requireApprovalAbove?: number
    enabled?: boolean
  }
}

// Send USDC from the user's main connected wallet (wagmi writeContract)
export interface SendUsdcAction {
  action: 'send_usdc'
  params: {
    toAddress: string
    amount: string
    note?: string
  }
}

export interface AgentSendAction {
  action: 'agent_send'
  params: {
    toAddress: string
    amount: string
    note?: string
  }
}

// Navigate to Bridge tab with prefill
export interface BridgeStartAction {
  action: 'bridge_start'
  params: {
    amount?: string
    toChain?: string
  }
}

// Navigate to Swap tab with prefill
export interface SwapStartAction {
  action: 'swap_start'
  params: {
    fromToken?: string
    toToken?: string
    amount?: string
  }
}

export interface NavigateAction {
  action: 'navigate'
  params: {
    page: string
  }
}

export interface ToggleAgentAction {
  action: 'toggle_agent'
  params: {
    enabled: boolean
  }
}

export interface ShopSearchAction {
  action: 'shop_search'
  params: {
    query: string
  }
}

export interface BridgeInfoAction {
  action: 'bridge_info'
  params: {
    fromChain: string
    toChain: string
    amount: string
  }
}

export type NanAction =
  | AddRecurringAction
  | AddAgentRecurringAction
  | SetPolicyAction
  | SendUsdcAction
  | AgentSendAction
  | NavigateAction
  | ToggleAgentAction
  | ShopSearchAction
  | BridgeStartAction
  | BridgeInfoAction
  | SwapStartAction

// ── Parser — converts raw LLM JSON into a typed NanAction ────────────────────

// Safe string coercion from unknown JSON values (avoids no-base-to-string lint)
function s(v: unknown, fallback = ''): string {
  if (v === null || v === undefined) return fallback
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number' || typeof v === 'boolean') return String(v).trim()
  return fallback
}

export function parseAction(raw: Record<string, unknown>): NanAction | null {
  const type = raw.action as string | undefined
  const params = (raw.params ?? {}) as Record<string, unknown>
  if (!type) return null

  switch (type) {
    case 'add_recurring':
    case 'add_agent_recurring': {
      const name = s(params.name)
      const recipient = s(params.recipient)
      const amount = s(params.amount)
      const frequency = (s(params.frequency) || 'manual') as RecurringFrequency
      if (!name || !recipient || !amount) return null
      return { action: type, params: { name, recipient, amount, frequency } }
    }
    case 'set_policy': {
      const p: SetPolicyAction['params'] = {}
      if (params.dailyLimit !== undefined)           p.dailyLimit           = Number(params.dailyLimit)
      if (params.perTxLimit !== undefined)           p.perTxLimit           = Number(params.perTxLimit)
      if (params.perServiceLimit !== undefined)      p.perServiceLimit      = Number(params.perServiceLimit)
      if (params.autoApproveUnder !== undefined)     p.autoApproveUnder     = Number(params.autoApproveUnder)
      if (params.requireApprovalAbove !== undefined) p.requireApprovalAbove = Number(params.requireApprovalAbove)
      if (params.enabled !== undefined)              p.enabled              = Boolean(params.enabled)
      if (Object.keys(p).length === 0) return null
      return { action: 'set_policy', params: p }
    }
    case 'send_usdc': {
      const toAddress = s(params.toAddress)
      const amount    = s(params.amount)
      if (!toAddress || !amount) return null
      const note = s(params.note) || undefined
      return { action: 'send_usdc', params: { toAddress, amount, note } }
    }
    case 'agent_send': {
      const toAddress = s(params.toAddress)
      const amount    = s(params.amount)
      if (!toAddress || !amount) return null
      const note = s(params.note) || undefined
      return { action: 'agent_send', params: { toAddress, amount, note } }
    }
    case 'bridge_start': {
      return { action: 'bridge_start', params: { amount: s(params.amount) || undefined, toChain: s(params.toChain) || undefined } }
    }
    case 'swap_start': {
      return { action: 'swap_start', params: { fromToken: s(params.fromToken) || undefined, toToken: s(params.toToken) || undefined, amount: s(params.amount) || undefined } }
    }
    case 'navigate': {
      const page = s(params.page)
      if (!page) return null
      return { action: 'navigate', params: { page } }
    }
    case 'toggle_agent': {
      return { action: 'toggle_agent', params: { enabled: Boolean(params.enabled) } }
    }
    case 'shop_search': {
      const query = s(params.query)
      if (!query) return null
      return { action: 'shop_search', params: { query } }
    }
    case 'bridge_info': {
      return { action: 'bridge_info', params: { fromChain: s(params.fromChain), toChain: s(params.toChain), amount: s(params.amount) } }
    }
    default:
      return null
  }
}

// ── Human-readable summary for confirmation cards ─────────────────────────────

export function describeAction(action: NanAction): { title: string; lines: Array<{ label: string; value: string }> } {
  switch (action.action) {
    case 'add_recurring':
      return {
        title: 'Add Recurring Payment',
        lines: [
          { label: 'Name',      value: action.params.name },
          { label: 'To',        value: action.params.recipient },
          { label: 'Amount',    value: `${action.params.amount} USDC` },
          { label: 'Frequency', value: action.params.frequency },
          { label: 'Source',    value: 'NAN Main Wallet' },
        ],
      }
    case 'add_agent_recurring':
      return {
        title: 'Add Agent Recurring Payment',
        lines: [
          { label: 'Name',      value: action.params.name },
          { label: 'To',        value: action.params.recipient },
          { label: 'Amount',    value: `${action.params.amount} USDC` },
          { label: 'Frequency', value: action.params.frequency },
          { label: 'Source',    value: 'Agent Wallet' },
        ],
      }
    case 'set_policy': {
      const lines = Object.entries(action.params).map(([k, v]) => ({
        label: k.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()),
        value: typeof v === 'boolean' ? (v ? 'Enabled' : 'Disabled') : `${v} USDC`,
      }))
      return { title: 'Update Spending Policy', lines }
    }
    case 'send_usdc':
      return {
        title: 'Send USDC from Your Wallet',
        lines: [
          { label: 'To',     value: action.params.toAddress },
          { label: 'Amount', value: `${action.params.amount} USDC` },
          ...(action.params.note ? [{ label: 'Note', value: action.params.note }] : []),
          { label: 'Source', value: 'Your Connected Wallet' },
        ],
      }
    case 'agent_send':
      return {
        title: 'Send USDC from Agent Wallet',
        lines: [
          { label: 'To',     value: action.params.toAddress },
          { label: 'Amount', value: `${action.params.amount} USDC` },
          ...(action.params.note ? [{ label: 'Note', value: action.params.note }] : []),
          { label: 'Source', value: 'Agent Wallet' },
        ],
      }
    case 'bridge_start':
      return {
        title: 'Bridge USDC',
        lines: [
          ...(action.params.amount ? [{ label: 'Amount', value: `${action.params.amount} USDC` }] : []),
          ...(action.params.toChain ? [{ label: 'To Chain', value: action.params.toChain }] : []),
          { label: 'Note', value: 'Opens Bridge tab pre-filled — you confirm there' },
        ],
      }
    case 'swap_start':
      return {
        title: 'Swap Tokens',
        lines: [
          ...(action.params.fromToken ? [{ label: 'From', value: action.params.fromToken }] : []),
          ...(action.params.toToken   ? [{ label: 'To',   value: action.params.toToken }] : []),
          ...(action.params.amount    ? [{ label: 'Amount', value: `${action.params.amount} USDC` }] : []),
          { label: 'Note', value: 'Opens Swap tab pre-filled — you confirm there' },
        ],
      }
    case 'navigate':
      return {
        title: `Navigate to ${action.params.page}`,
        lines: [{ label: 'Destination', value: action.params.page }],
      }
    case 'toggle_agent':
      return {
        title: `${action.params.enabled ? 'Enable' : 'Disable'} NAN Agent`,
        lines: [{ label: 'New state', value: action.params.enabled ? 'Enabled' : 'Disabled' }],
      }
    case 'shop_search':
      return {
        title: 'Search Shop',
        lines: [{ label: 'Query', value: action.params.query }],
      }
    case 'bridge_info':
      return {
        title: 'Bridge USDC',
        lines: [
          { label: 'From',   value: action.params.fromChain },
          { label: 'To',     value: action.params.toChain },
          { label: 'Amount', value: `${action.params.amount} USDC` },
          { label: 'Note',   value: 'Opens Bridge tab — you confirm the transaction there' },
        ],
      }
  }
}

// ── Whether this action needs explicit user confirmation ──────────────────────

export function requiresConfirmation(action: NanAction): boolean {
  switch (action.action) {
    case 'add_recurring':
    case 'add_agent_recurring':
    case 'send_usdc':
    case 'agent_send':
    case 'set_policy':
      return true
    case 'navigate':
    case 'toggle_agent':
    case 'shop_search':
    case 'bridge_start':
    case 'bridge_info':
    case 'swap_start':
      return false
  }
}

// ── Executor ──────────────────────────────────────────────────────────────────
// Returns a human-readable result string on success, throws on failure.

export type ExecutorContext = {
  store: AppState
  navigate: (page: string, query?: string) => void
  agentWalletUserToken?: string
  // For send_usdc: caller provides the wagmi writeContractAsync bound to the connected wallet
  writeContractAsync?: (args: {
    address: `0x${string}`
    abi: readonly object[]
    functionName: string
    args: readonly unknown[]
  }) => Promise<`0x${string}`>
  connectedAddress?: string
  chainId?: number
}

export async function executeAction(action: NanAction, ctx: ExecutorContext): Promise<string> {
  const { store, navigate } = ctx

  switch (action.action) {

    case 'add_recurring': {
      const { name, recipient, amount, frequency } = action.params
      const now = new Date()
      let nextRunAt: string | undefined
      if (frequency === 'daily')   nextRunAt = new Date(now.getTime() + 86400000).toISOString()
      if (frequency === 'weekly')  nextRunAt = new Date(now.getTime() + 7 * 86400000).toISOString()
      if (frequency === 'monthly') nextRunAt = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()).toISOString()
      store.addRecurringTask({ name, recipient, amount, active: true, frequency, nextRunAt })
      navigate('recurring')
      return `Recurring payment "${name}" scheduled — ${amount} USDC ${frequency} to ${recipient.slice(0, 10)}…`
    }

    case 'add_agent_recurring': {
      const { name, recipient, amount, frequency } = action.params
      const now = new Date()
      let nextRunAt: string | undefined
      if (frequency === 'daily')   nextRunAt = new Date(now.getTime() + 86400000).toISOString()
      if (frequency === 'weekly')  nextRunAt = new Date(now.getTime() + 7 * 86400000).toISOString()
      if (frequency === 'monthly') nextRunAt = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()).toISOString()
      // Prefix with 'agent:' so AgentRecurringTab recognises it
      store.addRecurringTask({ name: `agent:${name}`, recipient, amount, active: true, frequency, nextRunAt })
      navigate('agent')
      return `Agent recurring payment "${name}" scheduled — ${amount} USDC ${frequency} from Agent Wallet.`
    }

    case 'set_policy': {
      store.setAgentPermissions(action.params)
      return `Policy updated: ${Object.entries(action.params).map(([k, v]) => `${k}=${v}`).join(', ')}`
    }

    case 'send_usdc': {
      const { toAddress, amount, note } = action.params
      if (!ctx.writeContractAsync) throw new Error('Wallet not connected. Please connect your wallet first.')
      if (!ctx.chainId) throw new Error('No chain connected.')
      const usdc = getUsdc(ctx.chainId)
      if (!usdc) throw new Error(`USDC not supported on chain ${ctx.chainId}.`)
      const txHash = await ctx.writeContractAsync({
        address: usdc.address as `0x${string}`,
        abi: USDC_TRANSFER_ABI,
        functionName: 'transfer',
        args: [toAddress, parseUnits(amount, usdc.decimals)],
      })
      store.addActivity({ type: 'sent', description: note ?? 'Agent-initiated send', amount: parseFloat(amount), sign: '-', status: 'confirmed', counterparty: toAddress.slice(0, 10) + '…', txHash })
      return `Sent ${amount} USDC to ${toAddress.slice(0, 10)}… — tx: ${txHash.slice(0, 12)}…`
    }

    case 'agent_send': {
      const { toAddress, amount, note } = action.params
      const userToken = ctx.agentWalletUserToken
      if (!userToken) throw new Error('Agent Wallet session not active. Please authenticate in the Agent Wallet tab first.')
      const r = await fetch('/api/agent-wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-token': userToken },
        body: JSON.stringify({ action: 'send-usdc', userToken, toAddress, amount }),
      })
      const d = await r.json() as { ok?: boolean; txHash?: string; transactionId?: string; error?: string; not_configured?: boolean }
      if (d.not_configured) throw new Error('Agent Wallet API not configured (CIRCLE_API_KEY missing).')
      if (!r.ok || d.error) throw new Error(d.error ?? 'Transfer failed')
      const txRef = d.txHash ?? d.transactionId
      store.addAgentSpend({ id: `spend-${Date.now()}`, service_id: 'agent-send', service_name: note ?? `Send to ${toAddress.slice(0, 10)}…`, amount_usdc: parseFloat(amount), txId: txRef, paid: true, timestamp: new Date().toISOString() })
      store.addActivity({ type: 'sent', description: note ?? 'Agent send', amount: parseFloat(amount), sign: '-', status: 'confirmed', counterparty: toAddress.slice(0, 10) + '…', txHash: txRef })
      return `Sent ${amount} USDC from Agent Wallet to ${toAddress.slice(0, 10)}…${txRef ? ` (tx: ${txRef.slice(0, 10)}…)` : ''}`
    }

    case 'navigate': {
      navigate(action.params.page)
      return `Navigating to ${action.params.page}.`
    }

    case 'toggle_agent': {
      store.setAgentPermissions({ enabled: action.params.enabled })
      return `NAN Agent ${action.params.enabled ? 'enabled' : 'disabled'}.`
    }

    case 'shop_search': {
      navigate('shop', action.params.query)
      return `Opening shop with search: "${action.params.query}"`
    }

    case 'bridge_start': {
      store.setBridgePrefill({ amount: action.params.amount, toChain: action.params.toChain })
      navigate('bridge')
      return `Opening Bridge tab${action.params.amount ? ` with ${action.params.amount} USDC` : ''}${action.params.toChain ? ` → ${action.params.toChain}` : ''}. Complete the transaction there.`
    }

    case 'bridge_info': {
      navigate('bridge')
      return `Opening Bridge tab — bridge ${action.params.amount} USDC from ${action.params.fromChain} to ${action.params.toChain}. Confirm the transaction in the Bridge tab.`
    }

    case 'swap_start': {
      store.setSwapPrefill({ fromToken: action.params.fromToken, toToken: action.params.toToken, amount: action.params.amount })
      navigate('swap')
      return `Opening Swap tab${action.params.amount ? ` with ${action.params.amount} USDC` : ''}. Complete the swap there.`
    }
  }
}
