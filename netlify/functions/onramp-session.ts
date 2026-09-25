import type { Handler } from '@netlify/functions'

// This function mints a short-lived Circle Onramp session.
// Set CIRCLE_STABLECOIN_KIT_API_KEY (your Kit Key from console.circle.com) in
// Netlify → Site settings → Environment variables to activate real onramp.
// Without the key it returns a 503 so the frontend can show a "coming soon" state.

export const handler: Handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }

  const kitKey = process.env.CIRCLE_STABLECOIN_KIT_API_KEY
  if (!kitKey) {
    return {
      statusCode: 503,
      headers,
      body: JSON.stringify({
        error: 'onramp_not_configured',
        message: 'Add CIRCLE_STABLECOIN_KIT_API_KEY to Netlify environment variables to enable fiat onramp.',
      }),
    }
  }

  let body: { destinationAddress?: string; userId?: string; amount?: string } = {}
  try { body = JSON.parse(event.body ?? '{}') } catch {}

  const { destinationAddress, userId, amount } = body
  if (!destinationAddress) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'destinationAddress required' }) }
  }

  try {
    // Call Circle's onramp session API directly (the npm package is in private beta)
    // This uses the same underlying API the kit wraps
    const res = await fetch('https://api.circle.com/v1/w3s/onramp/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${kitKey}`,
      },
      body: JSON.stringify({
        userId: userId ?? destinationAddress,
        destinationWallets: [{ address: destinationAddress, blockchains: ['ARC-TESTNET'] }],
        ...(amount ? { quoteAmount: amount } : {}),
      }),
    })

    const data = await res.json() as Record<string, unknown>
    if (!res.ok) {
      return { statusCode: res.status, headers, body: JSON.stringify({ error: 'circle_error', detail: data }) }
    }

    return { statusCode: 200, headers, body: JSON.stringify(data) }
  } catch (err) {
    return {
      statusCode: 500, headers,
      body: JSON.stringify({ error: 'server_error', message: String(err) }),
    }
  }
}
