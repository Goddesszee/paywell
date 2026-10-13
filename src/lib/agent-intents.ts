/**
 * agent-intents.ts — deterministic, offline command recognition for the NAN Agent.
 *
 * Pure functions (no network, no node-only APIs) shared by the server (api/chat.ts) and the app
 * (AgentPage), so transaction commands like "send 5 USDC to @ada" are recognised instantly on the
 * device and keep working even if the chat service is slow, rate-limited or gated.
 */

const SWAP_TOKENS: Record<string, string> = { usdc: 'USDC', eurc: 'EURC', cirbtc: 'cirBTC' }

function normalizeChain(raw: string): string | null {
  const c = raw.toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!c) return null
  if (/\bbase\b/.test(c)) return 'Base Sepolia'
  if (/\barb/.test(c)) return 'Arbitrum Sepolia'
  if (/\boptimism\b|\bop\b/.test(c)) return 'OP Sepolia'
  if (/\bpolygon\b|\bamoy\b|\bpol\b/.test(c)) return 'Polygon Amoy'
  if (/\bavalanche\b|\bfuji\b|\bavax\b/.test(c)) return 'Avalanche Fuji'
  if (/\bunichain\b/.test(c)) return 'Unichain Sepolia'
  if (/\blinea\b/.test(c)) return 'Linea Sepolia'
  if (/\bsei\b/.test(c)) return 'Sei Testnet'
  if (/\bworld\b/.test(c)) return 'World Chain Sepolia'
  if (/\barc\b/.test(c)) return 'Arc'
  if (/\bethereum\b|\beth\b|\bsepolia\b/.test(c)) return 'Ethereum'
  return null
}

export function detectDirectAction(message: string): { reply: string; action: Record<string, unknown> } | null {
  const text = message.trim()
  const lower = text.toLowerCase()
  const isQuestion = /^(how|what|why|where|when|can|could|is|are|does|do|which)\b/.test(lower)

  // Payment request: "create a payment request for John Fatolu, he bought 2000 usdc worth of children clothing"
  if (!isQuestion && /\bpayment request\b/.test(lower) && /\b(create|make|generate|set up|raise|new|send)\b/.test(lower)) {
    const amt = lower.match(/(\d[\d,]*(?:\.\d+)?)\s*(?:usdc|usd|dollars?)\b|\$\s*(\d[\d,]*(?:\.\d+)?)/) ?? lower.match(/(\d[\d,]*(?:\.\d+)?)/)
    const amount = amt ? Number((amt[1] ?? amt[2]).replace(/,/g, '')) : NaN
    if (Number.isFinite(amount) && amount > 0) {
      const payer = text.match(/\bfor\s+([A-Z][A-Za-z'’.-]+(?:\s+[A-Z][A-Za-z'’.-]+){0,3})/)?.[1]
      const thing = lower.match(/\bworth of\s+(.+?)[.!?]*$/)?.[1] ?? lower.match(/\bfor\s+(?!\d)([a-z][a-z' -]{2,60}?)[.!?]*$/)?.[1]
      const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
      const title = thing && !(payer && thing === payer.toLowerCase()) ? cap(thing.trim()) : payer ? `Payment request - ${payer}` : 'Payment request'
      return {
        reply: `Creating a payment request for ${amount} USDC${payer ? ` for ${payer}` : ''}…`,
        action: { action: 'create_payment_request', params: { title, amount, ...(payer ? { payerName: payer } : {}) } },
      }
    }
  }

  // Recurring payment: "send 50 usdc to 0x... every week", "set up a monthly payment of 20 usdc to 0x..."
  const recurAddr = text.match(/0x[a-fA-F0-9]{40}\b/)
  const freqMatch = lower.match(/\b(daily|every day|each day|weekly|every week|each week|monthly|every month|each month)\b/)
  if (!isQuestion && recurAddr && freqMatch && /\b(send|pay|transfer|recurring|subscription|schedule|set up|standing)\b/.test(lower)) {
    const noAddr = lower.replace(recurAddr[0].toLowerCase(), ' ')
    const amt = noAddr.match(/(\d[\d,]*(?:\.\d+)?)\s*(?:usdc|usd|dollars?)?/)
    const amount = amt ? amt[1].replace(/,/g, '') : ''
    if (amount && Number(amount) > 0) {
      const f = freqMatch[1]
      const frequency = /day|daily/.test(f) ? 'daily' : /week/.test(f) ? 'weekly' : 'monthly'
      const short = `${recurAddr[0].slice(0, 6)}…${recurAddr[0].slice(-4)}`
      const name = `${frequency.charAt(0).toUpperCase() + frequency.slice(1)} payment to ${short}`
      return {
        reply: `Ready to set up a ${frequency} payment of ${amount} USDC to ${short}. Please confirm below.`,
        action: { action: 'add_recurring', params: { name, recipient: recurAddr[0], amount, frequency } },
      }
    }
  }

  const swap = lower.match(/\b(?:swap|convert|exchange)\s+(\d+(?:\.\d+)?)\s*([a-z]{3,6})\s+(?:to|for|into|->|→)\s+([a-z]{3,6})\b/)
  if (swap) {
    const from = SWAP_TOKENS[swap[2]], to = SWAP_TOKENS[swap[3]]
    if (from && to && from !== to) {
      const source = /agent wallet/.test(lower) ? 'agent' : 'main'
      return {
        reply: `Ready to swap ${swap[1]} ${from} to ${to} from your ${source} wallet. Please confirm below.`,
        action: { action: 'swap_start', params: { fromToken: from, toToken: to, amount: swap[1], source } },
      }
    }
  }

  const bridge = lower.match(/\bbridge\s+(\d+(?:\.\d+)?)/)
  if (bridge) {
    const dest = text.match(/(?:\bto\b|->|→)\s+(.+?)[.!?\s]*$/i)
    const chain = dest ? normalizeChain(dest[1]) : null
    if (chain) {
      return {
        reply: `Ready to bridge ${bridge[1]} USDC from Arc to ${chain}. Please confirm below.`,
        action: { action: 'bridge_start', params: { amount: bridge[1], toChain: chain } },
      }
    }
  }

  const addr = text.match(/0x[a-fA-F0-9]{40}\b/)
  // Amount can appear before OR after the address: "send 10 USDC to 0x..." or "send to 0x... 10 USDC" or "0x... 10 USDC"
  const amtAnywhere = lower.replace(/0x[a-f0-9]{40}/gi, ' ').match(/\b(\d+(?:\.\d+)?)\s*(?:usdc|usd|dollars?)?/)
  const send = lower.match(/\b(?:send|transfer|pay)\b/)
  if (addr && send && amtAnywhere && Number(amtAnywhere[1]) > 0) {
    const fromAgent = /agent wallet/.test(lower)
    const short = `${addr[0].slice(0, 6)}…${addr[0].slice(-4)}`
    return {
      reply: `Ready to send ${amtAnywhere[1]} USDC to ${short} from your ${fromAgent ? 'Agent Wallet' : 'main wallet'}. Please confirm below.`,
      action: { action: fromAgent ? 'agent_wallet_send' : 'send_usdc', params: { toAddress: addr[0], amount: amtAnywhere[1] } },
    }
  }
  // Address given but no amount — let OpenAI ask for the amount naturally
  if (addr && send && !amtAnywhere) return null

  // Buy USDC with card/bank (Circle onramp) — amount optional
  if (!/^(how|what|why|where|when|can|could|is|are|does|do|which)\b/.test(lower) && /\b(buy|purchase|top ?up|onramp|on-ramp)\b/.test(lower) && /\b(usdc|usd|dollars?|crypto|funds|card|bank)\b/.test(lower) && !/\b(service|agent|shop|swap|bridge)\b/.test(lower)) {
    const amt = lower.match(/\$\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*(?:usdc|usd|dollars?)\b/)
    const amount = amt ? Number(amt[1] ?? amt[2]) : undefined
    return {
      reply: amount ? `Opening Buy USDC with $${amount} filled in.` : 'Opening Buy USDC — pick an amount to continue.',
      action: { action: 'buy_usdc', params: amount ? { amount } : {} },
    }
  }

  // Testnet faucet
  if (!/^(how|what|why|where|when|can|could|is|are|does|do|which)\b/.test(lower) && /\bfaucet\b|\bfree (?:test(?:net)? )?usdc\b|\b(?:get|claim|request)\b.*\btest(?:net)?\b.*\b(usdc|funds|tokens?)\b/.test(lower)) {
    return { reply: 'Requesting testnet USDC for your wallet…', action: { action: 'claim_faucet', params: {} } }
  }

  // Export activity as CSV
  if (/\b(export|download)\b.*\b(activity|transactions?|history|csv)\b/.test(lower)) {
    return { reply: 'Exporting your activity as CSV…', action: { action: 'export_activity', params: {} } }
  }

  // Plain navigation: "open settings", "go to the bridge page", "show my activity"
  const nav = lower.match(/^(?:please\s+)?(?:open|go to|take me to|navigate to|show me|show)\s+(?:the\s+|my\s+)?([a-z -]{3,24}?)(?:\s+(?:page|tab|screen))?[.!?]*$/)
  if (nav) {
    const target = nav[1].trim().replace(/\s+/g, '-')
    const pages: Record<string, string> = {
      home: 'home', dashboard: 'dashboard', wallet: 'wallet', send: 'send', receive: 'receive', agent: 'agent',
      'agent-wallet': 'agent-wallet', bridge: 'bridge', swap: 'swap', gateway: 'gateway', onramp: 'onramp',
      activity: 'activity', history: 'activity', transactions: 'activity', settings: 'settings', recurring: 'recurring',
      notifications: 'notifications', support: 'support', faq: 'faq', about: 'about', feedback: 'feedback',
      suggestions: 'suggestions', profile: 'profile', favorites: 'favorites', exports: 'exports', invoices: 'exports',
      'payment-requests': 'payment-requests', requests: 'payment-requests',
    }
    const page = pages[target]
    if (page) return { reply: `Opening ${page.replace('-', ' ')}.`, action: { action: 'navigate', params: { page } } }
  }

  // Send to a @nanname or contact: "send 5 usdc to @aunty"
  {
    const m = text.match(/\b(?:send|pay|transfer)\s+\$?(\d+(?:\.\d+)?)\s*(?:usdc|usd|dollars?)?\s+to\s+(@[A-Za-z0-9-]{2,32})\b/i)
    if (!isQuestion && m) {
      return { reply: `Preparing to send ${m[1]} USDC to ${m[2]}…`, action: { action: 'send_usdc', params: { toAddress: m[2], amount: m[1] } } }
    }
  }

  // Referral
  if (!/^(how|why|where|when|can|could|does|do|which)\b/.test(lower) && /\b(referral|refer)\b.*\b(link|code)\b|\b(my|get|share|show)\b.*\breferral\b/.test(lower)) {
    return { reply: 'Here is your referral info…', action: { action: 'get_referral', params: {} } }
  }

  // NAN name availability: "is @ada available", "check if ada is available"
  {
    const m = lower.match(/(?:\bis\s+@?([a-z0-9-]{2,32})\s+(?:available|taken|free)\b|\bcheck\s+(?:if\s+)?(?:@([a-z0-9-]{2,32})\b|([a-z0-9-]{2,32})\s+(?:is\s+)?(?:available|free)\b))/)
    if (m && !/\b(usdc|balance|price|transaction)\b/.test(lower)) {
      return { reply: 'Checking the NAN name registry…', action: { action: 'check_name', params: { name: (m[1] ?? m[2] ?? m[3]) } } }
    }
  }

  // Register a NAN name: "register @ada", "claim @ada for 2 years"
  {
    const m = text.match(/\b(?:register|claim|get)\s+(?:the\s+)?(?:nan\s+name\s+)?@([A-Za-z0-9-]{2,32})(?:\s+for\s+(1|2|5)\s*years?)?/i)
    if (!isQuestion && m) {
      return { reply: `Setting up @${m[1].toLowerCase()}…`, action: { action: 'register_name', params: { name: m[1].toLowerCase(), ...(m[2] ? { years: Number(m[2]) } : {}) } } }
    }
  }

  // Contacts
  if (!isQuestion && /\b(show|list|see)\b.*\b(my\s+)?contacts\b/.test(lower)) {
    return { reply: 'Here are your contacts…', action: { action: 'list_contacts', params: {} } }
  }

  // Payment requests overview
  if (!isQuestion && /\b(show|list|see)\b.*\bpayment requests\b/.test(lower)) {
    return { reply: 'Here are your payment requests…', action: { action: 'list_payment_requests', params: {} } }
  }

  // Recent transactions: "last 5 transactions", "what did I send this week"
  if (/\b(last|recent|latest)\s*(\d+)?\s*(transactions?|payments?|transfers?)\b|\bwhat\s+did\s+i\s+(send|receive|spend)\b|\bhow much\s+(did\s+i|have\s+i)\s+(send|sent|receive|received|spend|spent)\b/.test(lower)) {
    const n = lower.match(/\b(?:last|recent|latest)\s*(\d+)/)
    const period = /\btoday\b/.test(lower) ? 'today' : /\bweek\b/.test(lower) ? 'week' : /\bmonth\b/.test(lower) ? 'month' : undefined
    return { reply: 'Looking at your activity…', action: { action: 'list_activity', params: { ...(n ? { limit: Number(n[1]) } : {}), ...(period ? { period } : {}) } } }
  }

  // Logout
  if (/^(please\s+)?(log\s*out|sign\s*out|logout)[.!]*$/.test(lower)) {
    return { reply: 'Ready to log you out — please confirm.', action: { action: 'logout', params: {} } }
  }

  return null
}

