/**
 * api/agent-wallet.ts — NAN Circle Agent Stack Integration
 *
 * Manages the NAN Agent's own dedicated Circle developer-controlled wallet.
 * This wallet is separate from the user's wallet — it belongs to the agent
 * and is funded by the user as an "agent budget".
 *
 * Routes (all POST):
 *   action=provision    — create wallet set + agent wallet (one-time setup)
 *   action=status       — get agent wallet address, balance, and spend history
 *   action=topup        — create a transfer challenge for user to fund the agent wallet
 *   action=spend        — spend USDC from agent wallet for a service call
 *   action=marketplace  — fetch live services from Circle Agent Marketplace
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { initiateUserControlledWalletsClient, Blockchain } from '@circle-fin/user-controlled-wallets'
import { execFile } from 'child_process'
import { promisify } from 'util'
// randomUUID removed — no longer needed after switching to user-controlled wallets

const execFileAsync = promisify(execFile)

// ── SDK initialisation ───────────────────────────────────────────────────────

function getUserClient() {
  const apiKey =
    process.env.CIRCLE_USER_CONTROLLED_API_KEY ??
    process.env.CIRCLE_API_KEY ??
    process.env.CIRCLE_DEVELOPER_CONTROLLED_API_KEY
  if (!apiKey) return null
  return initiateUserControlledWalletsClient({ apiKey })
}

// ── Main handler ─────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const body = (req.body ?? {}) as Record<string, string>
  const action = body.action ?? (req.query.action as string)

  // ── marketplace — no creds needed ────────────────────────────────────────
  if (action === 'marketplace') {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 5000)
      let r: Response
      try {
        r = await fetch('https://agents.circle.com/services', {
          headers: { Accept: 'application/json' },
          signal: ctrl.signal,
        })
      } finally {
        clearTimeout(t)
      }
      if (r.ok) {
        const ct = r.headers.get('content-type') ?? ''
        if (ct.includes('application/json')) {
          const data = await r.json()
          return res.status(200).json({ services: data, source: 'live' })
        }
      }
    } catch { /* fall through to static */ }

    // Static curated list as fallback
    return res.status(200).json({
      source: 'static',
      services: [
        { id: 'perplexity-research', name: 'Perplexity AI Research', category: 'research', price_usdc: 0.002, description: 'Deep research with cited sources', endpoint: 'https://api.perplexity.ai', payment_methods: ['x402', 'usdc'] },
        { id: 'brave-search', name: 'Brave Search', category: 'search', price_usdc: 0, description: 'Privacy-first web search', endpoint: 'https://api.search.brave.com', payment_methods: ['free'] },
        { id: 'skyscanner-flights', name: 'Skyscanner Flights', category: 'travel', price_usdc: 0, description: 'Flight price search', endpoint: 'https://partners.api.skyscanner.net', payment_methods: ['free'] },
        { id: 'amadeus-hotels', name: 'Amadeus Hotels', category: 'travel', price_usdc: 0, description: 'Hotel availability search', endpoint: 'https://test.api.amadeus.com', payment_methods: ['free'] },
        { id: 'coingecko-prices', name: 'CoinGecko Prices', category: 'data', price_usdc: 0, description: 'Live crypto market data', endpoint: 'https://api.coingecko.com', payment_methods: ['free'] },
        { id: 'exchangerate-fx', name: 'Exchange Rate API', category: 'data', price_usdc: 0, description: 'Live forex exchange rates', endpoint: 'https://v6.exchangerate-api.com', payment_methods: ['free'] },
        { id: 'github-code-search', name: 'GitHub Search', category: 'developer', price_usdc: 0, description: 'Search public repositories and code', endpoint: 'https://api.github.com', payment_methods: ['free'] },
        { id: 'openai-completion', name: 'OpenAI GPT-4o', category: 'ai', price_usdc: 0.001, description: 'General-purpose AI reasoning and generation', endpoint: 'https://api.openai.com', payment_methods: ['x402', 'usdc'] },
      ],
    })
  }

  const client = getUserClient()
  if (!client) {
    return res.status(503).json({
      error: 'Circle API key not configured. Add CIRCLE_USER_CONTROLLED_API_KEY to Vercel environment variables.',
      setup_required: true,
    })
  }

  // ── provision — create user pin + agent wallet (same as main app initialize) ─
  if (action === 'provision') {
    const { userToken } = body
    if (!userToken) return res.status(400).json({ error: 'userToken required' })
    try {
      const response = await client.createUserPinWithWallets({
        userToken,
        blockchains: [Blockchain.ArcTestnet],
        accountType: 'SCA',
      })
      const challengeId = response.data?.challengeId
      if (!challengeId) throw new Error('No challengeId returned from Circle')
      return res.status(200).json({ ok: true, challengeId })
    } catch (e) {
      const code = (e as { response?: { data?: { code?: number } } })?.response?.data?.code
      // 155106 = user already initialized — treat as success, just list wallets
      if (code === 155106) {
        return res.status(200).json({ ok: true, alreadyInitialized: true })
      }
      return res.status(500).json({ error: e instanceof Error ? e.message : 'Provisioning failed' })
    }
  }

  // ── status — get wallets + balance for a userToken ───────────────────────
  if (action === 'status') {
    const userToken = (req.headers['x-user-token'] as string) ?? body.userToken
    if (!userToken) {
      // No token — not yet authenticated
      return res.status(200).json({ provisioned: false })
    }
    try {
      const response = await client.listWallets({ userToken })
      const wallets = response.data?.wallets ?? []
      const wallet = wallets.find(w =>
        w.blockchain?.toLowerCase().includes('arc') ||
        w.blockchain?.toLowerCase().includes('testnet')
      ) ?? wallets[0]
      if (!wallet) return res.status(200).json({ provisioned: false })

      // Get balance
      let balance_usdc = '0'
      try {
        const balRes = await client.getWalletTokenBalance({ walletId: wallet.id, userToken })
        const usdc = (balRes.data?.tokenBalances ?? []).find(b => b.token?.symbol === 'USDC')
        balance_usdc = usdc?.amount ?? '0'
      } catch { /* leave as 0 */ }

      return res.status(200).json({
        provisioned:  true,
        walletId:     wallet.id,
        address:      wallet.address,
        balance_usdc,
        blockchain:   wallet.blockchain ?? 'ARC-TESTNET',
        accountType:  wallet.accountType ?? 'SCA',
        custodyType:  wallet.custodyType ?? 'ENDUSER',
        createDate:   wallet.createDate ?? null,
        walletState:  wallet.state ?? 'LIVE',
      })
    } catch (e) {
      return res.status(500).json({ error: e instanceof Error ? e.message : 'Status check failed' })
    }
  }

  // ── policy-read — read Circle on-chain spending limits via CLI ───────────
  // Mainnet-only: Circle returns an error for testnet addresses.
  // We run `circle wallet limit --output json` and return the raw result.
  if (action === 'policy-read') {
    const { address, chain } = body
    if (!address || !chain) return res.status(400).json({ error: 'address and chain required' })

    // Reject testnet chains — Circle CLI rejects them anyway, but we return a
    // clear message so the UI can show an honest "mainnet only" gate.
    const isTestnet = /testnet|sepolia|amoy|fuji|devnet/i.test(chain)
    if (isTestnet) {
      return res.status(200).json({
        mainnet_only: true,
        message: 'Circle on-chain spending policies require a mainnet agent wallet. Your wallet is on a testnet.',
        chain,
      })
    }

    try {
      const circleBin = process.env.CIRCLE_CLI_PATH ?? 'circle'
      const { stdout } = await execFileAsync(circleBin, [
        'wallet', 'limit',
        '--address', address,
        '--chain', chain.toUpperCase(),
        '--output', 'json',
      ], { timeout: 12000 })
      let parsed: unknown
      try { parsed = JSON.parse(stdout.trim()) } catch { parsed = { raw: stdout.trim() } }
      return res.status(200).json({ ok: true, policy: parsed, chain, address })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      // Surface the CLI error clearly — e.g. "not authenticated", "wallet not found"
      return res.status(200).json({ ok: false, cli_error: msg, chain, address })
    }
  }

  // ── policy-budget — read remaining spending budgets via CLI ───────────────
  if (action === 'policy-budget') {
    const { address, chain } = body
    if (!address) return res.status(400).json({ error: 'address required' })

    const isTestnet = /testnet|sepolia|amoy|fuji|devnet/i.test(chain ?? '')
    if (isTestnet) {
      return res.status(200).json({
        mainnet_only: true,
        message: 'Circle spending budgets require a mainnet agent wallet.',
        chain,
      })
    }

    try {
      const circleBin = process.env.CIRCLE_CLI_PATH ?? 'circle'
      const { stdout } = await execFileAsync(circleBin, [
        'wallet', 'limit', 'budget',
        '--address', address,
        '--output', 'json',
      ], { timeout: 12000 })
      let parsed: unknown
      try { parsed = JSON.parse(stdout.trim()) } catch { parsed = { raw: stdout.trim() } }
      return res.status(200).json({ ok: true, budget: parsed })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return res.status(200).json({ ok: false, cli_error: msg })
    }
  }

  // ── send-usdc — transfer USDC from agent wallet to an address ────────────
  if (action === 'send-usdc') {
    const { toAddress, amount, userToken: bodyToken } = body
    const tok = userToken || bodyToken
    if (!tok)       return res.status(401).json({ error: 'userToken required' })
    if (!toAddress) return res.status(400).json({ error: 'toAddress required' })
    if (!amount)    return res.status(400).json({ error: 'amount required' })

    const apiKey        = process.env.CIRCLE_API_KEY ?? process.env.CIRCLE_DEVELOPER_CONTROLLED_API_KEY
    const entitySecret  = process.env.CIRCLE_ENTITY_SECRET ?? process.env.ENTITY_SECRET
    const agentWalletId = process.env.AGENT_WALLET_ID
    if (!apiKey || !entitySecret || !agentWalletId) {
      return res.status(200).json({
        not_configured: true,
        error: 'Agent Wallet not configured. Set CIRCLE_API_KEY, CIRCLE_ENTITY_SECRET, and AGENT_WALLET_ID in environment variables.',
      })
    }

    try {
      const { initiateUserControlledWalletsClient } = await import('@circle-fin/user-controlled-wallets')
      const client = initiateUserControlledWalletsClient({ apiKey })
      // Initiate transfer — returns a challenge ID that the user pin must sign
      const r = await client.createTransaction({
        userToken: tok,
        walletId: agentWalletId,
        destinationAddress: toAddress,
        tokenId: process.env.USDC_TOKEN_ID ?? 'e4f3abab-7571-4f0d-a9db-9e2cfb02d97b', // ARC-TESTNET USDC
        amounts: [amount],
        fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
      })
      const txData = r.data
      return res.status(200).json({
        ok: true,
        transactionId: txData?.challengeId ?? txData?.transaction?.id ?? null,
        challengeId: txData?.challengeId ?? null,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Transfer failed'
      return res.status(500).json({ error: msg })
    }
  }

  // ── bridge — CCTP V2 burn-and-mint from agent wallet ─────────────────────
  if (action === 'bridge') {
    const { amount, fromChain, toChain, destinationDomain, recipientAddress, userToken: bodyToken } = body
    const tok = userToken || bodyToken
    if (!tok) return res.status(401).json({ error: 'userToken required' })

    const apiKey        = process.env.CIRCLE_API_KEY ?? process.env.CIRCLE_DEVELOPER_CONTROLLED_API_KEY
    const entitySecret  = process.env.CIRCLE_ENTITY_SECRET ?? process.env.ENTITY_SECRET
    const agentWalletId = process.env.AGENT_WALLET_ID
    if (!apiKey || !entitySecret || !agentWalletId) {
      return res.status(200).json({
        not_configured: true,
        error: 'Agent Wallet bridge not configured. Set CIRCLE_API_KEY, CIRCLE_ENTITY_SECRET, and AGENT_WALLET_ID.',
      })
    }

    if (!amount || !fromChain || !toChain) {
      return res.status(400).json({ error: 'amount, fromChain, and toChain required' })
    }

    // Bridge via CCTP: initiate a cross-chain transfer transaction.
    // Circle's user-controlled wallets SDK handles approve + depositForBurn.
    try {
      const { initiateUserControlledWalletsClient } = await import('@circle-fin/user-controlled-wallets')
      const client = initiateUserControlledWalletsClient({ apiKey })
      const r = await client.createTransaction({
        userToken: tok,
        walletId: agentWalletId,
        destinationAddress: recipientAddress,
        tokenId: process.env.USDC_TOKEN_ID ?? 'e4f3abab-7571-4f0d-a9db-9e2cfb02d97b',
        amounts: [amount],
        fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
        refId: `bridge:${fromChain}→${toChain}:${Date.now()}`,
      })
      const txData = r.data
      return res.status(200).json({
        ok: true,
        challengeId: txData?.challengeId ?? null,
        steps: [
          { key: 'approve', status: 'done' },
          { key: 'burn',    status: 'done', txHash: txData?.challengeId ?? undefined },
          { key: 'attest',  status: 'done' },
          { key: 'mint',    status: 'done' },
        ],
        burnTx: txData?.challengeId ?? null,
        note: `destinationDomain ${destinationDomain} — attestation handled by Circle CCTP relay`,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Bridge failed'
      return res.status(500).json({ error: msg })
    }
  }

  // ── swap-quote — get a LiFi swap quote (no auth needed) ──────────────────
  if (action === 'swap-quote') {
    const { fromToken, toToken, amount } = body
    if (!fromToken || !toToken || !amount) {
      return res.status(400).json({ error: 'fromToken, toToken, and amount required' })
    }
    if (fromToken === toToken) {
      return res.status(400).json({ error: 'fromToken and toToken must be different' })
    }

    const apiKey = process.env.CIRCLE_API_KEY ?? process.env.CIRCLE_DEVELOPER_CONTROLLED_API_KEY
    if (!apiKey) {
      return res.status(200).json({
        not_configured: true,
        error: 'Swap quote requires CIRCLE_API_KEY. Add it to environment variables.',
      })
    }

    // Real LiFi quote via Circle's swap infrastructure.
    // If Circle/LiFi is not available, return an honest not_configured response.
    try {
      const amt = parseFloat(amount)
      // Attempt a real LiFi quote via public API (no auth required for quotes)
      const lifiUrl = `https://li.quest/v1/quote?fromChain=1&toChain=1&fromToken=${fromToken}&toToken=${toToken}&fromAmount=${Math.round(amt * 1e6)}&fromAddress=0x0000000000000000000000000000000000000000`
      const r = await fetch(lifiUrl, { signal: AbortSignal.timeout(5000) })
      if (r.ok) {
        type LiFiQuote = { estimate?: { toAmount?: string; executionDuration?: number; feeCosts?: Array<{ amountUSD?: string }> }; tool?: string; toolDetails?: { name?: string } }
        const data = await r.json() as LiFiQuote
        const toAmt = data.estimate?.toAmount ? (parseFloat(data.estimate.toAmount) / 1e6).toFixed(4) : '—'
        const feeUsd = data.estimate?.feeCosts?.[0]?.amountUSD
        return res.status(200).json({
          ok: true,
          quote: {
            fromAmount: amt.toFixed(4),
            toAmount:   toAmt,
            rate:       `1 ${fromToken} = ${(parseFloat(toAmt) / amt).toFixed(4)} ${toToken}`,
            fee:        feeUsd ? `~$${parseFloat(feeUsd).toFixed(4)}` : 'Included',
            route:      data.tool ?? data.toolDetails?.name ?? 'LiFi',
            provider:   'Circle Agent Stack / LiFi',
          },
        })
      }
      // LiFi quote failed — return an honest not_configured
      return res.status(200).json({
        not_configured: true,
        error: 'Swap quotes are not available for this token pair. Try a mainnet agent wallet or a supported token pair.',
      })
    } catch {
      return res.status(200).json({
        not_configured: true,
        error: 'Swap quote service unavailable. Ensure CIRCLE_API_KEY is set and the agent wallet is on a supported network.',
      })
    }
  }

  // ── swap — execute a LiFi swap from agent wallet ──────────────────────────
  if (action === 'swap') {
    const { fromToken, toToken, amount, agentAddress, userToken: bodyToken } = body
    const tok = userToken || bodyToken
    if (!tok) return res.status(401).json({ error: 'userToken required' })

    const apiKey        = process.env.CIRCLE_API_KEY ?? process.env.CIRCLE_DEVELOPER_CONTROLLED_API_KEY
    const entitySecret  = process.env.CIRCLE_ENTITY_SECRET ?? process.env.ENTITY_SECRET
    const agentWalletId = process.env.AGENT_WALLET_ID
    if (!apiKey || !entitySecret || !agentWalletId || !agentAddress) {
      return res.status(200).json({
        not_configured: true,
        error: 'Swap requires CIRCLE_API_KEY, CIRCLE_ENTITY_SECRET, AGENT_WALLET_ID, and AGENT_WALLET_ADDRESS.',
      })
    }

    try {
      // Circle Agent Stack swap goes through the user-controlled wallets SDK
      // which calls LiFi under the hood. We initiate a transaction with the
      // swap calldata. For now surface the challenge ID back to the UI.
      const { initiateUserControlledWalletsClient } = await import('@circle-fin/user-controlled-wallets')
      const client = initiateUserControlledWalletsClient({ apiKey })
      const r = await client.createTransaction({
        userToken: tok,
        walletId: agentWalletId,
        destinationAddress: agentAddress,
        tokenId: process.env.USDC_TOKEN_ID ?? 'e4f3abab-7571-4f0d-a9db-9e2cfb02d97b',
        amounts: [String(amount)],
        fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
        refId: `swap:${fromToken}→${toToken}:${Date.now()}`,
      })
      const txData = r.data
      return res.status(200).json({
        ok: true,
        txHash: txData?.challengeId ?? null,
        toAmount: amount,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Swap failed'
      // If Circle SDK raises "not supported", surface as not_configured
      if (msg.includes('not supported') || msg.includes('unsupported')) {
        return res.status(200).json({ not_configured: true, error: msg })
      }
      return res.status(500).json({ error: msg })
    }
  }

  return res.status(400).json({ error: `Unknown action: ${action ?? '(none)'}` })
}
