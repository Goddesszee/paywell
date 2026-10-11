/**
 * agent-resolve.ts — turn a human recipient ("@aunty", "aunty", "Ada") into a wallet address
 * BEFORE the agent shows its confirmation card, so the user always confirms the real address.
 *
 * Lookup order: 0x address → saved contact (by name) → NAN name registry.
 */
import { getAddress } from 'viem'
import type { AppState } from '../store/appStore'
import { readRegistry, NAME_REGISTRY } from '../hooks/useNanName'
import type { NanAction } from './agent-actions'

const ZERO = '0x0000000000000000000000000000000000000000'
const isHexAddr = (v: string) => /^0x[a-fA-F0-9]{40}$/.test(v.trim())

export async function resolveRecipient(
  input: string,
  store: Pick<AppState, 'contacts'>,
): Promise<{ address: string; label?: string }> {
  const raw = input.trim()
  if (isHexAddr(raw)) return { address: getAddress(raw) }

  const q = raw.replace(/^@/, '').toLowerCase()
  if (!q) throw new Error('No recipient given.')

  // 1) saved contacts (exact name first, then prefix)
  const contacts = store.contacts ?? []
  const exact = contacts.find(c => c.name.toLowerCase() === q)
  const prefix = exact ?? contacts.find(c => c.name.toLowerCase().startsWith(q))
  if (prefix) return { address: getAddress(prefix.address), label: prefix.name }

  // 2) NAN name registry (@handle)
  if (NAME_REGISTRY && /^[a-z0-9-]{2,32}$/.test(q)) {
    try {
      const addr = await readRegistry(null, 'resolve', [q]) as string
      if (addr && addr !== ZERO) return { address: getAddress(addr), label: `@${q}` }
    } catch { /* fall through to not-found */ }
  }

  throw new Error(`I couldn't find "${raw}" in your contacts or among NAN names. Use a 0x address, a saved contact name, or a registered @name.`)
}

/** Rewrites name-style recipients on send / recurring actions into addresses (adds `toLabel`). */
export async function resolveActionRecipients(action: NanAction, store: Pick<AppState, 'contacts'>): Promise<NanAction> {
  switch (action.action) {
    case 'send_usdc':
    case 'agent_send':
    case 'ucw_send': {
      const r = await resolveRecipient(action.params.toAddress, store)
      return { ...action, params: { ...action.params, toAddress: r.address, toLabel: r.label } }
    }
    case 'add_recurring':
    case 'add_agent_recurring': {
      const r = await resolveRecipient(action.params.recipient, store)
      return { ...action, params: { ...action.params, recipient: r.address, toLabel: r.label } }
    }
    case 'add_contact': {
      const r = await resolveRecipient(action.params.address, store)
      return { ...action, params: { ...action.params, address: r.address } }
    }
    default:
      return action
  }
}
