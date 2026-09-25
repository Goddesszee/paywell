import type { VercelRequest, VercelResponse } from '@vercel/node'
import { PRODUCTS } from '../src/data/products'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()
  return res.status(200).json({ products: PRODUCTS })
}
