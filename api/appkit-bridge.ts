/**
 * /api/appkit/bridge — Vercel serverless function
 * Server-side CCTP V2 bridge via Circle App Kit + Circle developer-controlled wallets adapter.
 *
 * POST body: { walletAddress, destChain, destAddr, amount }
 *
 * Requires:
 *   CIRCLE_API_KEY or CIRCLE_DEVELOPER_CONTROLLED_API_KEY
 *   CIRCLE_ENTITY_SECRET
 *
 * Uses Circle's Orbit Forwarder (useForwarder: true) so the function does not
 * need to stay alive for attestation + mint — Circle's relayer handles that.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { AppKit } from '@circle-fin/app-kit'
import { createCircleWalletsAdapter } from '@circle-fin/adapter-circle-wallets'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

let kit: AppKit | null = null
function getKit(): AppKit {
  if (!kit) kit = new AppKit()
  return kit
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v))
  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  if (req.method !== 'POST')   { res.status(405).json({ success: false, error: 'Method not allowed' }); return }

  const apiKey       = process.env.CIRCLE_API_KEY ?? process.env.CIRCLE_DEVELOPER_CONTROLLED_API_KEY
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET
  if (!apiKey || !entitySecret) {
    res.status(500).json({ success: false, error: 'Circle developer-controlled wallet credentials not configured.' })
    return
  }

  const { walletAddress, destChain, destAddr, amount } = req.body as {
    walletAddress?: string
    destChain?: string
    destAddr?: string
    amount?: string
  }

  if (!walletAddress || !destChain || !destAddr || !amount) {
    res.status(400).json({ success: false, error: 'walletAddress, destChain, destAddr, and amount are required' })
    return
  }

  const amtFloat = parseFloat(amount)
  if (!amtFloat || amtFloat <= 0) {
    res.status(400).json({ success: false, error: 'amount must be a positive number' })
    return
  }

  try {
    const adapter = createCircleWalletsAdapter({ apiKey, entitySecret })

    const result = await getKit().bridge({
      from: {
        adapter,
        chain:   'Arc_Testnet' as const,
        address: walletAddress,
      },
      to: {
        chain:            destChain as Parameters<AppKit['bridge']>[0]['to']['chain'],
        recipientAddress: destAddr,
        useForwarder:     true,
      },
      amount,
    })

    // result.state === 'success' per Circle docs
    const topState   = (result as { state?: string }).state
    const burnTxHash = result.steps?.find(s => s.name === 'burn')?.txHash

    res.json({
      success:     topState === 'success' || topState === 'pending',
      pending:     topState === 'pending',
      state:       topState,
      burnTxHash:  burnTxHash ?? null,
      steps:       result.steps ?? [],
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Bridge failed'
    console.error('[appkit-bridge]', msg)
    res.status(500).json({ success: false, error: msg.slice(0, 200) })
  }
}
