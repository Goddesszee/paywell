import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createAppServerKit } from '@circle-fin/app-kit/server'

// The Circle Onramp Kit is in private beta (@circle-fin/onramp-kit, Cloudsmith).
// Until that package is accessible, @circle-fin/app-kit/server re-exports the
// same onramp session API via createAppServerKit — functionally identical.
// Migrate to createOnrampServerKit + createSessionRouteHandler from
// @circle-fin/onramp-kit/server once Cloudsmith access is configured.

const apiKey = process.env.CIRCLE_STABLECOIN_KIT_API_KEY ?? process.env.CIRCLE_API_KEY

// The referrerDomain must match the origin that serves this route.
// ONRAMP_DOMAIN overrides in production; falls back to Vercel URL or the
// canonical deploy domain.
const domain =
  process.env.ONRAMP_DOMAIN ??
  (process.env.VERCEL_URL ? process.env.VERCEL_URL : 'paywell-puce.vercel.app')

// Lazily initialised — one instance per cold start (Vercel serverless).
let serverKit: ReturnType<typeof createAppServerKit> | null = null

function getServerKit() {
  if (!apiKey) return null
  if (serverKit) return serverKit
  serverKit = createAppServerKit({
    onramp: {
      apiKey,
      referrerDomain: domain,
    },
  })
  return serverKit
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  if (!apiKey) {
    return res.status(503).json({
      error: 'onramp_not_configured',
      message: 'Add CIRCLE_STABLECOIN_KIT_API_KEY to environment variables to activate onramp',
    })
  }

  const kit = getServerKit()
  if (!kit) return res.status(503).json({ error: 'Failed to initialise onramp handler' })

  // Session request fields: userId, destinationAddress, amount, currency, destinationChain, assets
  const {
    destinationAddress,
    amount: amountRaw,
    appUserId,
    paymentMethod: _paymentMethod, // noted but not forwarded — Circle determines available methods
  } = req.body as {
    destinationAddress?: string
    amount?: string | number
    appUserId?: string
    paymentMethod?: string
  }

  if (!destinationAddress) {
    return res.status(400).json({ error: 'destinationAddress is required — connect a wallet first' })
  }

  const amount = amountRaw !== undefined ? String(amountRaw) : '100'
  const userId = appUserId ?? destinationAddress

  try {
    // kit.onramp.createSession() mints a short-lived session.
    // Response shape: { sessionId, sessionToken, widgetUrl, destinationWallet, expiresAt, traceId }
    // The client mounts widgetUrl in an iframe and listens for postMessage lifecycle events:
    //   INITIALIZATION_SUCCESS, INITIALIZATION_ERROR, DEPOSIT_SUBMITTED,
    //   DEPOSIT_SETTLED, DEPOSIT_NOT_COMPLETED
    // IMPORTANT: browser deposit events are optimistic UX — reconcile real balances
    // from server-side webhooks, not from the client postMessage stream.
    const session = await kit.onramp.createSession({
      userId,
      destinationAddress,
      destinationChain: 'ARC-TESTNET',
      amount,
      currency: 'USD',
      assets: {
        tokens: ['USDC'],
        chains: ['ARC-TESTNET'],
      },
    })

    // Return the full session object — the client reads widgetUrl and sessionToken
    return res.status(200).json(session)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Onramp session error'
    console.error('[onramp-session]', message)
    return res.status(500).json({ error: message })
  }
}
