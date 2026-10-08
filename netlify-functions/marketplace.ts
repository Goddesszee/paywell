import type { Handler } from '@netlify/functions'
import { PRODUCTS, getSession, genToken, addActivityRecord } from './_shared'

export const handler: Handler = async (event) => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }

  // GET /api/marketplace — product list
  if (event.httpMethod === 'GET') {
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, products: PRODUCTS }) }
  }

  // POST /api/marketplace — place order
  if (event.httpMethod === 'POST') {
    const session = getSession(event.headers.authorization)
    if (!session) return { statusCode: 401, headers, body: JSON.stringify({ success: false, error: 'Unauthorized' }) }

    const body = JSON.parse(event.body ?? '{}') as { productId: string; amount: number }
    const product = PRODUCTS.find((p) => p.id === body.productId)
    if (!product) return { statusCode: 404, headers, body: JSON.stringify({ success: false, error: 'Product not found' }) }

    const orderId = `order-${genToken(8)}`
    addActivityRecord(session.walletAddress, {
      type: 'purchase',
      description: `Purchased ${product.name}`,
      amount: `-${body.amount}`,
      sign: '-',
      status: 'confirmed',
      counterparty: product.merchant,
    })

    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        success: true,
        id: orderId,
        productId: body.productId,
        productName: product.name,
        amount: body.amount,
        merchant: product.merchant,
        status: 'complete',
        createdAt: new Date().toISOString(),
      }),
    }
  }

  return { statusCode: 405, body: 'Method Not Allowed' }
}
