/**
 * agent-actions.ts — Typed action definitions and executor for NAN Agent chat (v2).
 *
 * The LLM emits a ```nan-action { ... }``` block. The frontend parses it,
 * shows a confirmation card where needed, and on approval calls executeAction()
 * which dispatches to the correct store mutation or API call.
 *
 * v2 additions:
 *   - ucw_send: Circle UCW (email/Google users) direct USDC send via backend
 *   - ucw_bridge: Bridge via Circle UCW without tab navigation
 *   - ucw_swap: Swap via Circle UCW without tab navigation
 *   - ucw_gateway_deposit: Gateway deposit for UCW users
 *   - ucw_gateway_transfer: Cross-chain transfer via Gateway for UCW users
 *   - cancel_recurring: Cancel a recurring payment by name
 *   - create_payment_request: Create a shareable payment request
 *   - create_invoice: Create a new invoice
 *   - check_balance: Refresh and report wallet balance (no-op, context already has it)
 *
 * SECURITY:
 * - All financial actions require explicit user confirmation.
 * - No action can bypass the spending policy.
 * - No action touches wallet credentials or secrets.
 */

import { parseUnits, getAddress } from 'viem'
import { getUsdc } from '../onchain-facts'
import { buildReceiptHtml } from './receipt'
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
  | 'cancel_recurring'
  | 'set_policy'
  | 'send_usdc'
  | 'agent_send'
  | 'ucw_send'
  | 'ucw_bridge'
  | 'ucw_swap'
  | 'ucw_gateway_deposit'
  | 'ucw_gateway_transfer'
  | 'navigate'
  | 'toggle_agent'
  | 'shop_search'
  | 'bridge_start'
  | 'bridge_info'
  | 'swap_start'
  | 'create_payment_request'
  | 'create_invoice'
  | 'check_balance'
  | 'generate_receipt'
  | 'show_qr'
  | 'show_notifications'
  | 'open_faucet'
  | 'agent_wallet_send'
  | 'agent_wallet_fund'
  | 'agent_wallet_balance'
  | 'agent_service_search'
  | 'agent_service_pay'
  | 'gateway_start'
  | 'update_profile'
  | 'set_theme'
  | 'mark_notifications_read'
  | 'set_recurring_active'

// ── Individual action interfaces ───────────────────────────────────────────────

export interface AddRecurringAction {
  action: 'add_recurring'
  params: { name: string; recipient: string; amount: string; frequency: RecurringFrequency }
}

export interface AddAgentRecurringAction {
  action: 'add_agent_recurring'
  params: { name: string; recipient: string; amount: string; frequency: RecurringFrequency }
}

export interface CancelRecurringAction {
  action: 'cancel_recurring'
  params: { name: string }
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

export interface SendUsdcAction {
  action: 'send_usdc'
  params: { toAddress: string; amount: string; note?: string }
}

export interface AgentSendAction {
  action: 'agent_send'
  params: { toAddress: string; amount: string; note?: string }
}

/** UCW send: Circle User-Controlled Wallet (email/Google login) */
export interface UcwSendAction {
  action: 'ucw_send'
  params: { toAddress: string; amount: string; note?: string }
}

/** Bridge via Circle UCW — calls /api/wallet → bridge-start then opens Bridge tab */
export interface UcwBridgeAction {
  action: 'ucw_bridge'
  params: { amount: string; toChain: string }
}

/** Swap via Circle UCW */
export interface UcwSwapAction {
  action: 'ucw_swap'
  params: { fromToken: string; toToken: string; amount: string }
}

/** Gateway deposit for Circle UCW users */
export interface UcwGatewayDepositAction {
  action: 'ucw_gateway_deposit'
  params: { amount: string }
}

/** Cross-chain transfer via Gateway for Circle UCW users */
export interface UcwGatewayTransferAction {
  action: 'ucw_gateway_transfer'
  params: { amount: string; toChain: string }
}

export interface BridgeStartAction {
  action: 'bridge_start'
  params: { amount?: string; toChain?: string }
}

export interface SwapStartAction {
  action: 'swap_start'
  params: { fromToken?: string; toToken?: string; amount?: string }
}

export interface NavigateAction {
  action: 'navigate'
  params: { page: string }
}

export interface ToggleAgentAction {
  action: 'toggle_agent'
  params: { enabled: boolean }
}

export interface ShopSearchAction {
  action: 'shop_search'
  params: { query: string }
}

export interface BridgeInfoAction {
  action: 'bridge_info'
  params: { fromChain: string; toChain: string; amount: string }
}

export interface CreatePaymentRequestAction {
  action: 'create_payment_request'
  params: { title: string; amount: number; note?: string; dueDate?: string }
}

export interface CreateInvoiceAction {
  action: 'create_invoice'
  params: { customerName: string; amount: number; description: string; dueDate: string }
}

export interface CheckBalanceAction {
  action: 'check_balance'
  params: Record<string, never>
}

export interface GenerateReceiptAction {
  action: 'generate_receipt'
  params: { txHash?: string; index?: number } // index = nth recent activity (0=latest)
}

export interface ShowQrAction {
  action: 'show_qr'
  params: { address?: string; amount?: string; note?: string }
}

export interface ShowNotificationsAction {
  action: 'show_notifications'
  params: Record<string, never>
}

export interface OpenFaucetAction {
  action: 'open_faucet'
  params: Record<string, never>
}

export interface AgentWalletSendAction {
  action: 'agent_wallet_send'
  params: { toAddress: string; amount: string; note?: string }
}

export interface AgentWalletFundAction {
  action: 'agent_wallet_fund'
  params: Record<string, never>
}

export interface AgentWalletBalanceAction {
  action: 'agent_wallet_balance'
  params: Record<string, never>
}

export interface AgentServiceSearchAction {
  action: 'agent_service_search'
  params: { query: string }
}

export interface AgentServicePayAction {
  action: 'agent_service_pay'
  params: { serviceId: string; serviceName: string; amount: string; query: string }
}

export interface GatewayStartAction {
  action: 'gateway_start'
  params: { mode: 'deposit' | 'transfer'; amount?: string; toChain?: string }
}

export interface UpdateProfileAction {
  action: 'update_profile'
  params: { displayName?: string; bio?: string }
}

export interface SetThemeAction {
  action: 'set_theme'
  params: { theme: 'dark' | 'light' }
}

export interface MarkNotificationsReadAction {
  action: 'mark_notifications_read'
  params: Record<string, never>
}

export interface SetRecurringActiveAction {
  action: 'set_recurring_active'
  params: { name: string; active: boolean }
}

// ── Union ─────────────────────────────────────────────────────────────────────

export type NanAction =
  | AddRecurringAction
  | AddAgentRecurringAction
  | CancelRecurringAction
  | SetPolicyAction
  | SendUsdcAction
  | AgentSendAction
  | UcwSendAction
  | UcwBridgeAction
  | UcwSwapAction
  | UcwGatewayDepositAction
  | UcwGatewayTransferAction
  | NavigateAction
  | ToggleAgentAction
  | ShopSearchAction
  | BridgeStartAction
  | BridgeInfoAction
  | SwapStartAction
  | CreatePaymentRequestAction
  | CreateInvoiceAction
  | CheckBalanceAction
  | GenerateReceiptAction
  | ShowQrAction
  | ShowNotificationsAction
  | OpenFaucetAction
  | AgentWalletSendAction
  | AgentWalletFundAction
  | AgentWalletBalanceAction
  | AgentServiceSearchAction
  | AgentServicePayAction
  | GatewayStartAction
  | UpdateProfileAction
  | SetThemeAction
  | MarkNotificationsReadAction
  | SetRecurringActiveAction

// ── Safe string coercion ───────────────────────────────────────────────────────

function s(v: unknown, fallback = ''): string {
  if (v === null || v === undefined) return fallback
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number' || typeof v === 'boolean') return String(v).trim()
  return fallback
}

// ── Parser ────────────────────────────────────────────────────────────────────

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
    case 'cancel_recurring': {
      const name = s(params.name)
      if (!name) return null
      return { action: 'cancel_recurring', params: { name } }
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
      return { action: 'send_usdc', params: { toAddress, amount, note: s(params.note) || undefined } }
    }
    case 'agent_send': {
      const toAddress = s(params.toAddress)
      const amount    = s(params.amount)
      if (!toAddress || !amount) return null
      return { action: 'agent_send', params: { toAddress, amount, note: s(params.note) || undefined } }
    }
    case 'ucw_send': {
      const toAddress = s(params.toAddress)
      const amount    = s(params.amount)
      if (!toAddress || !amount) return null
      return { action: 'ucw_send', params: { toAddress, amount, note: s(params.note) || undefined } }
    }
    case 'ucw_bridge': {
      const amount  = s(params.amount)
      const toChain = s(params.toChain)
      if (!amount || !toChain) return null
      return { action: 'ucw_bridge', params: { amount, toChain } }
    }
    case 'ucw_swap': {
      const fromToken = s(params.fromToken) || 'USDC'
      const toToken   = s(params.toToken)
      const amount    = s(params.amount)
      if (!toToken || !amount) return null
      return { action: 'ucw_swap', params: { fromToken, toToken, amount } }
    }
    case 'ucw_gateway_deposit': {
      const amount = s(params.amount)
      if (!amount) return null
      return { action: 'ucw_gateway_deposit', params: { amount } }
    }
    case 'ucw_gateway_transfer': {
      const amount  = s(params.amount)
      const toChain = s(params.toChain)
      if (!amount || !toChain) return null
      return { action: 'ucw_gateway_transfer', params: { amount, toChain } }
    }
    case 'bridge_start':
      return { action: 'bridge_start', params: { amount: s(params.amount) || undefined, toChain: s(params.toChain) || undefined } }
    case 'swap_start':
      return { action: 'swap_start', params: { fromToken: s(params.fromToken) || undefined, toToken: s(params.toToken) || undefined, amount: s(params.amount) || undefined } }
    case 'navigate': {
      const page = s(params.page)
      if (!page) return null
      return { action: 'navigate', params: { page } }
    }
    case 'toggle_agent':
      return { action: 'toggle_agent', params: { enabled: Boolean(params.enabled) } }
    case 'shop_search': {
      const query = s(params.query)
      if (!query) return null
      return { action: 'shop_search', params: { query } }
    }
    case 'bridge_info':
      return { action: 'bridge_info', params: { fromChain: s(params.fromChain), toChain: s(params.toChain), amount: s(params.amount) } }
    case 'create_payment_request': {
      const title  = s(params.title)
      const amount = Number(params.amount)
      if (!title || !amount) return null
      return { action: 'create_payment_request', params: { title, amount, note: s(params.note) || undefined, dueDate: s(params.dueDate) || undefined } }
    }
    case 'create_invoice': {
      const customerName = s(params.customerName)
      const amount       = Number(params.amount)
      const description  = s(params.description)
      const dueDate      = s(params.dueDate)
      if (!customerName || !amount || !dueDate) return null
      return { action: 'create_invoice', params: { customerName, amount, description: description || customerName, dueDate } }
    }
    case 'check_balance':
      return { action: 'check_balance', params: {} }
    case 'generate_receipt':
      return { action: 'generate_receipt', params: { txHash: s(params.txHash) || undefined, index: params.index !== undefined ? Number(params.index) : undefined } }
    case 'show_qr':
      return { action: 'show_qr', params: { address: s(params.address) || undefined, amount: s(params.amount) || undefined, note: s(params.note) || undefined } }
    case 'show_notifications':
      return { action: 'show_notifications', params: {} }
    case 'open_faucet':
      return { action: 'open_faucet', params: {} }
    case 'agent_wallet_send': {
      const toAddress = s(params.toAddress) || s(params.to)
      const amount = s(params.amount)
      if (!toAddress || !amount) return null
      return { action: 'agent_wallet_send', params: { toAddress, amount, note: s(params.note) || undefined } }
    }
    case 'agent_wallet_fund':
      return { action: 'agent_wallet_fund', params: {} }
    case 'agent_wallet_balance':
      return { action: 'agent_wallet_balance', params: {} }
    case 'agent_service_search': {
      const query = s(params.query) || s(params.search)
      if (!query) return null
      return { action: 'agent_service_search', params: { query } }
    }
    case 'agent_service_pay': {
      const serviceId = s(params.serviceId) || s(params.service_id)
      const serviceName = s(params.serviceName) || s(params.service_name) || serviceId
      const amount = s(params.amount)
      const query = s(params.query)
      if (!serviceId || !amount) return null
      return { action: 'agent_service_pay', params: { serviceId, serviceName, amount, query } }
    }
    case 'gateway_start': {
      const mode = s(params.mode) === 'transfer' ? 'transfer' : 'deposit'
      return { action: 'gateway_start', params: { mode, amount: s(params.amount) || undefined, toChain: s(params.toChain) || undefined } }
    }
    case 'update_profile': {
      const displayName = s(params.displayName) || undefined
      const bio = s(params.bio) || undefined
      if (!displayName && !bio) return null
      return { action: 'update_profile', params: { displayName, bio } }
    }
    case 'set_theme': {
      const theme = s(params.theme).toLowerCase()
      if (theme !== 'dark' && theme !== 'light') return null
      return { action: 'set_theme', params: { theme } }
    }
    case 'mark_notifications_read':
      return { action: 'mark_notifications_read', params: {} }
    case 'set_recurring_active': {
      const name = s(params.name)
      if (!name || params.active === undefined) return null
      return { action: 'set_recurring_active', params: { name, active: Boolean(params.active) } }
    }
    default:
      return null
  }
}

// ── Human-readable confirmation card descriptions ─────────────────────────────

export function describeAction(action: NanAction): { title: string; lines: Array<{ label: string; value: string }> } {
  switch (action.action) {
    case 'add_recurring':
      return { title: 'Add Recurring Payment', lines: [
        { label: 'Name',      value: action.params.name },
        { label: 'To',        value: action.params.recipient },
        { label: 'Amount',    value: `${action.params.amount} USDC` },
        { label: 'Frequency', value: action.params.frequency },
        { label: 'Source',    value: 'Main Wallet' },
      ]}
    case 'add_agent_recurring':
      return { title: 'Add Agent Recurring Payment', lines: [
        { label: 'Name',      value: action.params.name },
        { label: 'To',        value: action.params.recipient },
        { label: 'Amount',    value: `${action.params.amount} USDC` },
        { label: 'Frequency', value: action.params.frequency },
        { label: 'Source',    value: 'Agent Wallet' },
      ]}
    case 'cancel_recurring':
      return { title: 'Cancel Recurring Payment', lines: [
        { label: 'Name', value: action.params.name },
        { label: 'Effect', value: 'This recurring payment will be deleted' },
      ]}
    case 'set_policy': {
      const lines = Object.entries(action.params).map(([k, v]) => ({
        label: k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()),
        value: typeof v === 'boolean' ? (v ? 'Enabled' : 'Disabled') : `${v} USDC`,
      }))
      return { title: 'Update Spending Policy', lines }
    }
    case 'send_usdc':
      return { title: 'Send USDC from Your Wallet', lines: [
        { label: 'To',     value: action.params.toAddress },
        { label: 'Amount', value: `${action.params.amount} USDC` },
        ...(action.params.note ? [{ label: 'Note', value: action.params.note }] : []),
        { label: 'Source', value: 'Main wallet' },
      ]}
    case 'agent_send':
      return { title: 'Send USDC from Agent Wallet', lines: [
        { label: 'To',     value: action.params.toAddress },
        { label: 'Amount', value: `${action.params.amount} USDC` },
        ...(action.params.note ? [{ label: 'Note', value: action.params.note }] : []),
        { label: 'Source', value: 'Agent Wallet' },
      ]}
    case 'ucw_send':
      return { title: 'Send USDC (Circle Wallet)', lines: [
        { label: 'To',     value: action.params.toAddress },
        { label: 'Amount', value: `${action.params.amount} USDC` },
        ...(action.params.note ? [{ label: 'Note', value: action.params.note }] : []),
        { label: 'Source', value: 'Circle User-Controlled Wallet' },
        { label: 'Auth',   value: 'Circle W3S SDK challenge required' },
      ]}
    case 'ucw_bridge':
      return { title: 'Bridge USDC (Circle Wallet)', lines: [
        { label: 'Amount',   value: `${action.params.amount} USDC` },
        { label: 'To Chain', value: action.params.toChain },
        { label: 'Via',      value: 'Circle CCTP V2' },
        { label: 'Source',   value: 'Circle UCW → Bridge tab' },
      ]}
    case 'ucw_swap':
      return { title: 'Swap Tokens (Circle Wallet)', lines: [
        { label: 'From',     value: action.params.fromToken },
        { label: 'To',       value: action.params.toToken },
        { label: 'Amount',   value: `${action.params.amount}` },
        { label: 'Source',   value: 'Circle UCW → Swap tab' },
      ]}
    case 'ucw_gateway_deposit':
      return { title: 'Gateway Deposit (Circle Wallet)', lines: [
        { label: 'Amount', value: `${action.params.amount} USDC` },
        { label: 'Via',    value: 'Circle Gateway' },
        { label: 'Source', value: 'Circle UCW → Gateway tab' },
      ]}
    case 'ucw_gateway_transfer':
      return { title: 'Gateway Cross-Chain Transfer', lines: [
        { label: 'Amount',   value: `${action.params.amount} USDC` },
        { label: 'To Chain', value: action.params.toChain },
        { label: 'Via',      value: 'Circle Gateway (instant ~500ms)' },
        { label: 'Source',   value: 'Circle UCW' },
      ]}
    case 'bridge_start':
      return { title: 'Bridge USDC', lines: [
        ...(action.params.amount  ? [{ label: 'Amount',   value: `${action.params.amount} USDC` }] : []),
        ...(action.params.toChain ? [{ label: 'To Chain', value: action.params.toChain }] : []),
        { label: 'Note', value: 'Opens Bridge tab pre-filled' },
      ]}
    case 'swap_start':
      return { title: 'Swap Tokens', lines: [
        ...(action.params.fromToken ? [{ label: 'From',   value: action.params.fromToken }] : []),
        ...(action.params.toToken   ? [{ label: 'To',     value: action.params.toToken }] : []),
        ...(action.params.amount    ? [{ label: 'Amount', value: `${action.params.amount} USDC` }] : []),
        { label: 'Note', value: 'Opens Swap tab pre-filled' },
      ]}
    case 'navigate':
      return { title: `Navigate to ${action.params.page}`, lines: [{ label: 'Destination', value: action.params.page }] }
    case 'toggle_agent':
      return { title: `${action.params.enabled ? 'Enable' : 'Disable'} NAN Agent`, lines: [{ label: 'New state', value: action.params.enabled ? 'Enabled' : 'Disabled' }] }
    case 'shop_search':
      return { title: 'Search Shop', lines: [{ label: 'Query', value: action.params.query }] }
    case 'bridge_info':
      return { title: 'Bridge USDC', lines: [
        { label: 'From',   value: action.params.fromChain },
        { label: 'To',     value: action.params.toChain },
        { label: 'Amount', value: `${action.params.amount} USDC` },
        { label: 'Note',   value: 'Opens Bridge tab — confirm there' },
      ]}
    case 'create_payment_request':
      return { title: 'Create Payment Request', lines: [
        { label: 'Title',   value: action.params.title },
        { label: 'Amount',  value: `${action.params.amount} USDC` },
        ...(action.params.note    ? [{ label: 'Note',     value: action.params.note }] : []),
        ...(action.params.dueDate ? [{ label: 'Due Date', value: action.params.dueDate }] : []),
      ]}
    case 'create_invoice':
      return { title: 'Create Invoice', lines: [
        { label: 'Customer',     value: action.params.customerName },
        { label: 'Amount',       value: `${action.params.amount} USDC` },
        { label: 'Description',  value: action.params.description },
        { label: 'Due Date',     value: action.params.dueDate },
      ]}
    case 'check_balance':
      return { title: 'Check Balance', lines: [{ label: 'Note', value: 'Refreshes your wallet balances' }] }
    case 'generate_receipt':
      return { title: 'Generate Receipt', lines: [
        { label: 'For', value: action.params.txHash ? `tx: ${action.params.txHash.slice(0,12)}…` : `Transaction #${(action.params.index ?? 0) + 1}` },
      ]}
    case 'show_qr':
      return { title: 'Show QR Code', lines: [
        ...(action.params.address ? [{ label: 'Address', value: action.params.address }] : []),
        ...(action.params.amount  ? [{ label: 'Amount',  value: `${action.params.amount} USDC` }] : []),
      ]}
    case 'show_notifications':
      return { title: 'Notifications', lines: [{ label: 'Action', value: 'Open notifications' }] }
    case 'open_faucet':
      return { title: 'Open Faucet', lines: [{ label: 'Action', value: 'Get free testnet USDC' }] }
    case 'agent_wallet_send':
      return { title: 'Send from Agent Wallet', lines: [
        { label: 'To', value: action.params.toAddress },
        { label: 'Amount', value: `${action.params.amount} USDC` },
        ...(action.params.note ? [{ label: 'Note', value: action.params.note }] : []),
      ]}
    case 'agent_wallet_fund':
      return { title: 'Fund Agent Wallet', lines: [{ label: 'Action', value: 'Open funding screen' }] }
    case 'agent_wallet_balance':
      return { title: 'Agent Wallet Balance', lines: [{ label: 'Action', value: 'Refresh balance' }] }
    case 'agent_service_search':
      return { title: 'Search Agent Services', lines: [{ label: 'Query', value: action.params.query }] }
    case 'agent_service_pay':
      return { title: 'Pay for Service via Agent Wallet', lines: [
        { label: 'Service', value: action.params.serviceName },
        { label: 'Cost', value: `${action.params.amount} USDC` },
        { label: 'Task', value: action.params.query },
      ]}
    case 'gateway_start':
      return { title: action.params.mode === 'deposit' ? 'Gateway Deposit' : 'Gateway Transfer', lines: [
        ...(action.params.amount  ? [{ label: 'Amount',   value: `${action.params.amount} USDC` }] : []),
        ...(action.params.toChain ? [{ label: 'To Chain', value: action.params.toChain }] : []),
        { label: 'Note', value: 'Opens Gateway tab pre-filled' },
      ]}
    case 'update_profile':
      return { title: 'Update Profile', lines: [
        ...(action.params.displayName ? [{ label: 'Name', value: action.params.displayName }] : []),
        ...(action.params.bio ? [{ label: 'Bio', value: action.params.bio }] : []),
      ]}
    case 'set_theme':
      return { title: 'Change Theme', lines: [{ label: 'Theme', value: action.params.theme }] }
    case 'mark_notifications_read':
      return { title: 'Mark Notifications Read', lines: [{ label: 'Action', value: 'Mark all as read' }] }
    case 'set_recurring_active':
      return { title: action.params.active ? 'Resume Recurring Payment' : 'Pause Recurring Payment', lines: [{ label: 'Name', value: action.params.name }] }
  }
}

// ── Confirmation gate ─────────────────────────────────────────────────────────

export function requiresConfirmation(action: NanAction): boolean {
  switch (action.action) {
    case 'add_recurring':
    case 'add_agent_recurring':
    case 'cancel_recurring':
    case 'send_usdc':
    case 'agent_send':
    case 'ucw_send':
    case 'ucw_bridge':
    case 'ucw_swap':
    case 'ucw_gateway_deposit':
    case 'ucw_gateway_transfer':
    case 'set_policy':
    case 'create_payment_request':
    case 'create_invoice':
      return true
    case 'navigate':
    case 'toggle_agent':
    case 'shop_search':
    case 'bridge_start':
    case 'bridge_info':
    case 'swap_start':
    case 'check_balance':
    case 'generate_receipt':
    case 'show_qr':
    case 'show_notifications':
    case 'open_faucet':
    case 'agent_wallet_fund':
    case 'agent_wallet_balance':
    case 'agent_service_search':
    case 'gateway_start':
    case 'update_profile':
    case 'set_theme':
    case 'mark_notifications_read':
      return false
    case 'set_recurring_active':
    case 'agent_wallet_send':
    case 'agent_service_pay':
      return true
  }
}

// ── Executor context ──────────────────────────────────────────────────────────

export type ExecutorContext = {
  store: AppState
  navigate: (page: string, query?: string) => void
  agentWalletUserToken?: string
  writeContractAsync?: (args: {
    address: `0x${string}`
    abi: readonly object[]
    functionName: string
    args: readonly unknown[]
  }) => Promise<`0x${string}`>
  connectedAddress?: string
  chainId?: number
  /** True when user authenticated via Circle email/Google UCW */
  isCircleUcwUser?: boolean
  /** True when user authenticated via passkey/Circle Modular Wallet */
  isPasskeyUser?: boolean
  /** Callback to trigger a Circle SDK challenge for UCW/passkey sends */
  triggerCircleSend?: (params: { toAddress: string; amount: string; note?: string }) => Promise<string>
}

// ── Main executor ─────────────────────────────────────────────────────────────

/** Decide the signing path from the real session, not just from flags the caller passed. */
function loginKind(ctx: ExecutorContext): 'passkey' | 'ucw' | 'wagmi' {
  const a = ctx.store.auth
  if (ctx.isPasskeyUser || a?.isPasskeyUser) return 'passkey'
  if (ctx.isCircleUcwUser || a?.userToken) return 'ucw'
  return 'wagmi'
}

function friendlyWagmiError(e: unknown): string {
  const err = e as { shortMessage?: string; message?: string } | undefined
  const msg = err?.shortMessage ?? err?.message ?? 'Transaction failed'
  if (/internal error/i.test(msg)) return 'Your wallet\'s network returned an internal error. Make sure you are on Arc Testnet and hold USDC for gas, then retry.'
  if (/user rejected|denied/i.test(msg)) return 'Transaction was rejected in your wallet.'
  return msg
}

/** One send path for every login type. Used by both send_usdc and ucw_send. */
async function sendMainWallet(params: { toAddress: string; amount: string; note?: string }, ctx: ExecutorContext): Promise<string> {
  const { toAddress: rawTo, amount, note } = params
  let toAddress: `0x${string}`
  try { toAddress = getAddress(rawTo) } catch { throw new Error(`"${rawTo}" is not a valid wallet address.`) }
  const n = parseFloat(amount)
  if (!Number.isFinite(n) || n <= 0) throw new Error(`"${amount}" is not a valid amount.`)
  const { store } = ctx
  const short = `${toAddress.slice(0, 10)}…`

  if (loginKind(ctx) !== 'wagmi') {
    if (!ctx.triggerCircleSend) {
      ctx.navigate('wallet')
      return `Opening your wallet — ${amount} USDC to ${short}. Confirm the send there.`
    }
    // triggerCircleSend throws on failure, so we never record a send that did not happen
    const txHash = await ctx.triggerCircleSend({ toAddress, amount, note })
    store.addActivity({ type: 'sent', description: note ?? 'Agent send', amount: n, sign: '-', status: 'confirmed', counterparty: short, txHash: txHash || undefined })
    return `Sent ${amount} USDC to ${short}${txHash ? ` — tx: ${txHash.slice(0, 12)}…` : ''}`
  }

  if (!ctx.connectedAddress || !ctx.writeContractAsync) {
    throw new Error('No wallet connected. Connect MetaMask or a browser wallet, or sign in with email or passkey.')
  }
  if (!ctx.chainId) throw new Error('No chain connected.')
  const usdc = getUsdc(ctx.chainId)
  if (!usdc) throw new Error(`USDC is not supported on chain ${ctx.chainId}. Switch to Arc Testnet.`)
  let txHash: `0x${string}`
  try {
    txHash = await ctx.writeContractAsync({
      address: usdc.address as `0x${string}`,
      abi: USDC_TRANSFER_ABI,
      functionName: 'transfer',
      args: [toAddress, parseUnits(amount, usdc.decimals)],
    })
  } catch (e) {
    console.error('[agent send_usdc] wagmi write failed', e)
    throw new Error(friendlyWagmiError(e))
  }
  store.addActivity({ type: 'sent', description: note ?? 'Agent-initiated send', amount: n, sign: '-', status: 'confirmed', counterparty: short, txHash })
  return `Sent ${amount} USDC to ${short} — tx: ${txHash.slice(0, 12)}…`
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
      return `Recurring payment "${name}" created — ${amount} USDC ${frequency} to ${recipient.slice(0, 10)}…`
    }

    case 'add_agent_recurring': {
      const { name, recipient, amount, frequency } = action.params
      const now = new Date()
      let nextRunAt: string | undefined
      if (frequency === 'daily')   nextRunAt = new Date(now.getTime() + 86400000).toISOString()
      if (frequency === 'weekly')  nextRunAt = new Date(now.getTime() + 7 * 86400000).toISOString()
      if (frequency === 'monthly') nextRunAt = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()).toISOString()
      store.addRecurringTask({ name: `agent:${name}`, recipient, amount, active: true, frequency, nextRunAt })
      navigate('agent')
      return `Agent recurring payment "${name}" created — ${amount} USDC ${frequency} from Agent Wallet.`
    }

    case 'cancel_recurring': {
      const { name } = action.params
      const tasks = store.recurringTasks
      // Match by exact name or agent: prefixed name
      const found = tasks.find(t => t.name === name || t.name === `agent:${name}` || t.name.replace(/^agent:/, '') === name)
      if (!found) throw new Error(`No recurring payment named "${name}" found.`)
      store.removeRecurringTask(found.id)
      return `Recurring payment "${found.name.replace(/^agent:/, '')}" cancelled.`
    }

    case 'set_policy': {
      store.setAgentPermissions(action.params)
      const desc = Object.entries(action.params).map(([k, v]) => `${k}: ${v}`).join(', ')
      return `Spending policy updated — ${desc}`
    }

    case 'send_usdc':
      return sendMainWallet(action.params, ctx)

    case 'agent_send': {
      const { toAddress: rawTo2, amount, note } = action.params
      const toAddress = getAddress(rawTo2)
      const userToken = ctx.agentWalletUserToken
      if (!userToken) throw new Error('Agent Wallet session not active. Authenticate in the Agent Wallet tab first.')
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

    case 'ucw_send':
      // Same unified path as send_usdc — routing is decided by the real login type
      return sendMainWallet(action.params, ctx)

    case 'ucw_bridge': {
      store.setBridgePrefill({ amount: action.params.amount, toChain: action.params.toChain })
      navigate('bridge')
      return `Opening Bridge tab — ${action.params.amount} USDC → ${action.params.toChain} via Circle CCTP V2. Complete the transaction there.`
    }

    case 'ucw_swap': {
      store.setSwapPrefill({ fromToken: action.params.fromToken, toToken: action.params.toToken, amount: action.params.amount })
      navigate('swap')
      return `Opening Swap tab — ${action.params.amount} ${action.params.fromToken} → ${action.params.toToken}. Complete the swap there.`
    }

    case 'ucw_gateway_deposit': {
      store.setBridgePrefill({ amount: action.params.amount, toChain: 'gateway' })
      navigate('gateway')
      return `Opening Gateway tab — deposit ${action.params.amount} USDC into your unified cross-chain balance. Complete the deposit there.`
    }

    case 'ucw_gateway_transfer': {
      store.setBridgePrefill({ amount: action.params.amount, toChain: action.params.toChain })
      navigate('gateway')
      return `Opening Gateway tab — transfer ${action.params.amount} USDC to ${action.params.toChain} via Circle Gateway (~500ms). Complete the transfer there.`
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
      return `Opening Bridge tab — bridge ${action.params.amount} USDC from ${action.params.fromChain} to ${action.params.toChain}.`
    }

    case 'swap_start': {
      store.setSwapPrefill({ fromToken: action.params.fromToken, toToken: action.params.toToken, amount: action.params.amount })
      navigate('swap')
      return `Opening Swap tab${action.params.amount ? ` with ${action.params.amount}` : ''}. Complete the swap there.`
    }

    case 'create_payment_request': {
      const { title, amount, note, dueDate } = action.params
      const id = store.addPaymentRequest({
        title,
        amount,
        currency: 'USDC',
        status: 'pending',
        note,
        dueDate,
        creatorAddress: store.auth?.walletAddress ?? store.auth?.circleWalletAddress ?? '',
        creatorName: store.profile.displayName || undefined,
      })
      navigate('payment-requests')
      return `Payment request "${title}" created for ${amount} USDC (ref: ${id.slice(0, 8)}…). Opening Payment Requests tab.`
    }

    case 'create_invoice': {
      const { customerName, amount, description, dueDate } = action.params
      const today = new Date().toISOString().slice(0, 10)
      const item = {
        id: `item-${Date.now()}`,
        name: description,
        quantity: 1,
        unitPrice: amount,
      }
      const inv = store.addInvoice({
        status: 'draft',
        businessName: store.profile.displayName || 'NAN User',
        customerName,
        issueDate: today,
        dueDate,
        currency: 'USDC',
        items: [item],
        subtotal: amount,
        discountTotal: 0,
        taxTotal: 0,
        total: amount,
        payments: [],
        amountPaid: 0,
        amountDue: amount,
      })
      navigate('exports')
      return `Invoice ${inv.number} created — ${amount} USDC for ${customerName}, due ${dueDate}. Opening Exports tab.`
    }

    case 'check_balance': {
      const state = store
      const main = parseFloat(state.mainWalletBalance || '0').toFixed(2)
      const agent = parseFloat(state.agentWallet.balance_usdc || '0').toFixed(2)
      const cross = Object.entries(state.crossChainBalances)
        .filter(([, v]) => parseFloat(v) > 0)
        .map(([chain, bal]) => `${chain}: ${parseFloat(bal).toFixed(2)}`)
        .join(' | ')
      return `Main wallet: ${main} USDC${state.agentWallet.provisioned ? ` | Agent Wallet: ${agent} USDC` : ''}${cross ? ` | Cross-chain: ${cross}` : ''}`
    }

    case 'generate_receipt': {
      const { txHash, index } = action.params
      const activities = store.activity
      let tx = txHash
        ? activities.find(a => a.txHash === txHash)
        : activities[index ?? 0]
      if (!tx && activities.length === 0) return 'No transactions found to generate a receipt for.'
      if (!tx) tx = activities[0]
      const html = buildReceiptHtml({
        amount: tx.amount,
        sign: tx.sign,
        description: tx.description,
        status: tx.status,
        timestamp: tx.timestamp instanceof Date ? tx.timestamp.toISOString() : String(tx.timestamp),
        counterparty: tx.counterparty,
        txHash: tx.txHash,
      })
      const blob = new Blob([html], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
      return `Receipt generated for ${tx.sign}${parseFloat(String(tx.amount)).toFixed(2)} USDC — "${tx.description}". Opening in a new tab.`
    }

    case 'show_qr': {
      const addr = action.params.address ?? ctx.connectedAddress ?? store.auth?.walletAddress ?? ''
      navigate('wallet')
      return `__SHOW_QR__:${addr}::${action.params.amount ?? ''}::${action.params.note ?? ''}`
    }

    case 'show_notifications': {
      navigate('notifications')
      return 'Opening your notifications.'
    }

    case 'open_faucet': {
      navigate('faucet')
      return 'Opening the faucet — you can get free testnet USDC there.'
    }

    case 'agent_wallet_balance': {
      const bal = parseFloat(store.agentWallet.balance_usdc || '0').toFixed(2)
      const addr = store.agentWallet.address ?? ''
      navigate('agent-wallet')
      return `Your Agent Wallet balance is **${bal} USDC**${addr ? ` at ${addr.slice(0,6)}...${addr.slice(-4)}` : ''}.`
    }

    case 'agent_wallet_fund': {
      navigate('agent-wallet')
      return `__AGENT_WALLET_FUND__`
    }

    case 'agent_wallet_send': {
      const { toAddress, amount, note } = action.params
      const userToken = store.agentWallet.userToken
      const walletId  = store.agentWallet.walletId
      if (!store.agentWallet.provisioned) return 'Your Agent Wallet is not set up yet. Go to the Agent Wallet tab to create one first.'
      if (!userToken || !walletId) return 'Your Agent Wallet session has expired. Please re-authenticate in the Agent Wallet tab.'
      const checkedAddress = (() => { try { return getAddress(toAddress) } catch { return null } })()
      if (!checkedAddress) return `Invalid recipient address: ${toAddress}`
      try {
        const r = await fetch('/api/agent-wallet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-user-token': userToken },
          body: JSON.stringify({ action: 'send', userToken, walletId, to: checkedAddress, amount }),
        })
        const d = await r.json() as { ok?: boolean; challengeId?: string; error?: string }
        if (!r.ok || !d.ok || !d.challengeId) throw new Error(d.error ?? 'Send request failed')
        return `__AGENT_WALLET_CHALLENGE__:${d.challengeId}::${checkedAddress}::${amount}::${note ?? ''}`
      } catch(e) {
        return `Agent Wallet send failed: ${e instanceof Error ? e.message : 'Unknown error'}`
      }
    }

    case 'gateway_start': {
      const { mode, amount, toChain } = action.params
      store.setBridgePrefill({ amount, toChain: mode === 'deposit' ? 'gateway' : toChain })
      navigate('gateway')
      return mode === 'deposit'
        ? `Opening Gateway${amount ? ` — deposit ${amount} USDC` : ''}. Confirm the deposit there.`
        : `Opening Gateway${amount ? ` — transfer ${amount} USDC` : ''}${toChain ? ` to ${toChain}` : ''}. Confirm the transfer there.`
    }

    case 'update_profile': {
      const patch: { displayName?: string; bio?: string } = {}
      if (action.params.displayName) patch.displayName = action.params.displayName
      if (action.params.bio) patch.bio = action.params.bio
      store.setProfile(patch)
      return `Profile updated${patch.displayName ? ` — name is now "${patch.displayName}"` : ''}.`
    }

    case 'set_theme': {
      store.setTheme(action.params.theme)
      return `Theme switched to ${action.params.theme}.`
    }

    case 'mark_notifications_read': {
      store.markAllNotificationsRead()
      return 'All notifications marked as read.'
    }

    case 'set_recurring_active': {
      const { name, active } = action.params
      const found = store.recurringTasks.find(t => t.name === name || t.name === `agent:${name}` || t.name.replace(/^agent:/, '') === name)
      if (!found) throw new Error(`No recurring payment named "${name}" found.`)
      store.updateRecurringTask(found.id, { active })
      return `Recurring payment "${found.name.replace(/^agent:/, '')}" ${active ? 'resumed' : 'paused'}.`
    }

    case 'agent_service_search': {
      const { discoverServices, discoverNetworkAgents } = await import('./agent-registry')
      const query = action.params.query
      const agents = discoverNetworkAgents(query).slice(0, 3)
      const services = discoverServices(query, 3)
      const lines: string[] = []
      if (agents.length > 0) {
        lines.push('**Network Agents:**')
        agents.forEach(a => {
          const cap = a.capabilities[0]
          lines.push(`- **${a.name}**: ${cap.description} — ${cap.price_usdc > 0 ? `${cap.price_usdc} USDC` : 'Free'}`)
        })
      }
      if (services.length > 0) {
        lines.push('\n**Services:**')
        services.forEach(r => {
          lines.push(`- **${r.service.name}**: ${r.service.description} — ${r.service.price_usdc > 0 ? `${r.service.price_usdc} USDC` : 'Free'}`)
        })
      }
      if (lines.length === 0) return `No services found for "${query}". Try searching for research, flights, weather, crypto prices, or code.`
      return lines.join('\n')
    }

    case 'agent_service_pay': {
      const { serviceId, serviceName, amount, query } = action.params
      const userToken = store.agentWallet.userToken
      if (!store.agentWallet.provisioned) return 'Your Agent Wallet is not set up yet. Set it up in the Agent Wallet tab first.'
      if (!userToken) return 'Agent Wallet session expired — re-authenticate in the Agent Wallet tab.'
      try {
        const r = await fetch('/api/agent-execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ serviceId, query }),
        })
        if (!r.ok) throw new Error(`Service error ${r.status}`)
        const d = await r.json() as { result?: string }
        const bal = parseFloat(store.agentWallet.balance_usdc || '0') - parseFloat(amount)
        store.setAgentWallet({ balance_usdc: Math.max(0, bal).toFixed(6) })
        return `**${serviceName}** completed:\n\n${d.result ?? 'Task completed.'}\n\n_Agent Wallet charged: ${amount} USDC_`
      } catch(e) {
        return `Service execution failed: ${e instanceof Error ? e.message : 'Unknown error'}`
      }
    }
  }
}
