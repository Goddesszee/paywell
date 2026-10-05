/**
 * /api/appkit/swap — Vercel serverless function
 * Server-side swap via Circle App Kit + Circle developer-controlled wallets adapter.
 *
 * POST body: { action: 'quote'|'swap', walletAddress, tokenIn, tokenOut, amountIn }
 *
 * Requires:
 *   CIRCLE_API_KEY or CIRCLE_DEVELOPER_CONTROLLED_API_KEY
 *   CIRCLE_ENTITY_SECRET
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { AppKit } from '@circle-fin/app-kit'
import { createCircleWalletsAdapter } from '@circle-fin/adapter-circle-wallets'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

// Singleton kit instance — warm across invocations
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

  const { action, walletAddress, tokenIn, tokenOut, amountIn } = req.body as {
    action?: string
    walletAddress?: string
    tokenIn?: string
    tokenOut?: string
    amountIn?: string
  }

  const fromToken = (tokenIn  ?? 'USDC').toUpperCase()
  const toToken   = (tokenOut ?? 'EURC').toUpperCase()
  const amtIn     = parseFloat(amountIn ?? '0')

  if (!amtIn || amtIn <= 0) {
    res.json({ success: false, error: 'Valid amountIn is required' })
    return
  }

  try {
    const adapter = createCircleWalletsAdapter({ apiKey, entitySecret })

    const swapParams = {
      from: {
        adapter,
        chain: 'Arc_Testnet' as const,
        address: walletAddress ?? '',
      },
      tokenIn:  fromToken,
      tokenOut: toToken,
      amountIn: amtIn.toString(),
      config:   { slippageBps: 300 },
    }

    if (action === 'quote') {
      const estimate = await getKit().estimateSwap(swapParams)
      res.json({
        success:         true,
        estimatedOutput: estimate.estimatedOutput ?? null,
        fees:            estimate.fees ?? [],
      })
      return
    }

    // action === 'swap'
    if (!walletAddress) {
      res.json({ success: false, error: 'walletAddress is required for swap execution' })
      return
    }

    const result = await getKit().swap(swapParams)

    res.json({
      success:    true,
      txHash:     result.txHash ?? null,
      amountOut:  result.amountOut ?? null,
      explorerUrl: result.explorerUrl ?? null,
      status:     result.progress?.status ?? 'DONE',
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Swap failed'
    console.error('[appkit-swap]', msg)
    res.status(500).json({ success: false, error: msg.slice(0, 200) })
  }
}
