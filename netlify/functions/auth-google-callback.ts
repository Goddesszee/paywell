import type { Handler } from '@netlify/functions'

export const handler: Handler = async (event) => {
  const code = event.queryStringParameters?.code
  const clientId = process.env.VITE_GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = `${process.env.URL}/api/auth/google/callback`

  if (!code || !clientId || !clientSecret) {
    return { statusCode: 400, body: 'Missing params or env vars' }
  }

  try {
    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
    })
    const tokens = await tokenRes.json() as { id_token?: string; access_token?: string }
    if (!tokens.id_token) throw new Error('No id_token')

    // Get user info
    const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    const user = await userRes.json() as { email?: string; name?: string; picture?: string }

    // Build a simple session token and redirect to app with it
    const sessionToken = Buffer.from(JSON.stringify({ email: user.email, name: user.name, exp: Date.now() + 86400000 })).toString('base64')
    const appUrl = (process.env.URL ?? 'http://localhost:5173') + `/#google-auth=${encodeURIComponent(sessionToken)}&email=${encodeURIComponent(user.email ?? '')}`

    return {
      statusCode: 302,
      headers: { Location: appUrl },
      body: '',
    }
  } catch (e) {
    return { statusCode: 500, body: e instanceof Error ? e.message : 'Auth error' }
  }
}
