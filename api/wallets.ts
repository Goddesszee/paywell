import type { VercelRequest, VercelResponse } from '@vercel/node'
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets'
import { v4 as uuidv4 } from 'uuid'

function getClient() {
  const apiKey = process.env.CIRCLE_DEVELOPER_CONTROLLED_API_KEY
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET
  if (!apiKey || !entitySecret) return null
  return initiateDeveloperControlledWalletsClient({ apiKey, entitySecret })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const sdk = getClient()
  if (!sdk) {
    return res.status(503).json({
      error: 'Circle developer wallets not configured',
      hint: 'Add CIRCLE_DEVELOPER_CONTROLLED_API_KEY and CIRCLE_ENTITY_SECRET to environment variables'
    })
  }

  const { action, walletSetId, walletId, amount, destinationAddress, tokenId } = req.body as {
    action: string
    walletSetId?: string
    walletId?: string
    amount?: string
    destinationAddress?: string
    tokenId?: string
  }

  try {
    if (action === 'create-wallet-set') {
      const result = await sdk.createWalletSet({
        idempotencyKey: uuidv4(),
        name: `Paywell User ${Date.now()}`,
      })
      return res.json({ walletSetId: result.data?.walletSet?.id })
    }

    if (action === 'create-wallet') {
      if (!walletSetId) return res.status(400).json({ error: 'walletSetId required' })
      const result = await sdk.createWallets({
        idempotencyKey: uuidv4(),
        walletSetId,
        blockchains: ['ARC-TESTNET'],
        count: 1,
        accountType: 'EOA',
      })
      return res.json({ wallet: result.data?.wallets?.[0] })
    }

    if (action === 'get-balance') {
      if (!walletId) return res.status(400).json({ error: 'walletId required' })
      const result = await sdk.listWalletBalance({ id: walletId })
      return res.json({ balances: result.data?.tokenBalances })
    }

    if (action === 'transfer') {
      if (!walletId || !amount || !destinationAddress || !tokenId) {
        return res.status(400).json({ error: 'walletId, amount, destinationAddress, tokenId required' })
      }
      const result = await sdk.createTransaction({
        idempotencyKey: uuidv4(),
        walletId,
        tokenId,
        destinationAddress,
        amounts: [amount],
        fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
      })
      return res.json({ transactionId: result.data?.transaction?.id })
    }

    return res.status(400).json({ error: `Unknown action: ${action}` })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return res.status(500).json({ error: msg })
  }
}
