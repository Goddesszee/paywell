import type { Handler } from '@netlify/functions'
import { activityStore } from './_shared'

export const handler: Handler = async (event) => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' }

  const wallet = event.queryStringParameters?.wallet
  if (!wallet) return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'wallet required' }) }

  const activities = activityStore.get(wallet) ?? []
  return { statusCode: 200, headers, body: JSON.stringify({ success: true, activities }) }
}
