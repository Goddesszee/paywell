import type { Handler } from '@netlify/functions'
import { genToken, getSession, addActivityRecord } from './_shared'

export const handler: Handler = async (event) => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' }
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' }

  const session = getSession(event.headers.authorization)
  if (!session) return { statusCode: 401, headers, body: JSON.stringify({ success: false, error: 'Unauthorized' }) }

  const body = JSON.parse(event.body ?? '{}') as {
    action: string; to?: string; amount?: string; tokenSymbol?: string
  }
  const { action, to, amount, tokenSymbol } = body

  const circleKey = process.env.CIRCLE_DEVELOPER_CONTROLLED_API_KEY

  if (action === 'getWallet') {
    if (circleKey) {
      try {
        const res = await fetch(`https://api.circle.com/v1/w3s/wallets/${session.walletId}/balances`, {
          headers: { Authorization: `Bearer ${circleKey}` },
        })
        const data = await res.json() as { data?: { tokenBalances?: Array<{ token: { symbol: string }; amount: string }> } }
        const balances = (data.data?.tokenBalances ?? []).map((b) => ({ symbol: b.token.symbol, amount: b.amount }))
        return { statusCode: 200, headers, body: JSON.stringify({ success: true, wallet: { id: session.walletId, address: session.walletAddress }, balances }) }
      } catch (e) {
        console.error('Circle getWallet failed:', e)
      }
    }
    // Mock
    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        success: true,
        wallet: { id: session.walletId, address: session.walletAddress },
        balances: [{ symbol: 'USDC', amount: '100.00' }, { symbol: 'EURC', amount: '0.00' }],
      }),
    }
  }

  if (action === 'transfer') {
    if (!to || !amount) return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'to and amount required' }) }
    const txId = `mock-tx-${genToken(8)}`
    addActivityRecord(session.walletAddress, {
      type: 'send',
      description: `Sent ${amount} ${tokenSymbol ?? 'USDC'}`,
      amount: `-${amount}`,
      sign: '-',
      status: 'confirmed',
      counterparty: to,
      txHash: txId,
    })
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, txId, txHash: txId }) }
  }

  return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'Unknown action' }) }
}
