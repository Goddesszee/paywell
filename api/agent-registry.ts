import type { VercelRequest, VercelResponse } from '@vercel/node'
import { SERVICE_REGISTRY } from '../src/lib/agent-registry'

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'public, s-maxage=60')
  return res.status(200).json({ services: SERVICE_REGISTRY, count: SERVICE_REGISTRY.length })
}
