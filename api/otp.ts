import type { VercelRequest, VercelResponse } from '@vercel/node'
import nodemailer from 'nodemailer'

const otpStore = new Map<string, { code: string; expires: number }>()

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { email, action, code } = req.body as { email?: string; action?: string; code?: string }
  if (!email) return res.status(400).json({ error: 'email required' })

  // SEND OTP
  if (action === 'send' || !action) {
    const otp = Math.floor(100000 + Math.random() * 900000).toString()
    otpStore.set(email, { code: otp, expires: Date.now() + 10 * 60 * 1000 })

    if (process.env.SMTP_HOST) {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT ?? '465'),
        secure: true,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      })
      await transporter.sendMail({
        from: process.env.SMTP_USER,
        to: email,
        subject: 'Your Paywell code',
        html: `<div style="font-family:Inter,sans-serif;max-width:400px;margin:0 auto">
          <h2 style="font-size:24px;font-weight:700;color:#0D0D0D">Your code</h2>
          <div style="font-size:42px;font-weight:800;letter-spacing:8px;color:#0D0D0D;margin:24px 0">${otp}</div>
          <p style="color:#5C5C6B;font-size:14px">Valid for 10 minutes. Never share this code.</p>
        </div>`,
      })
    } else {
      console.log(`[Paywell OTP] ${email} → ${otp}`)
    }
    return res.status(200).json({ ok: true, ...(process.env.SMTP_HOST ? {} : { code: otp }) })
  }

  // VERIFY OTP
  if (action === 'verify') {
    const entry = otpStore.get(email)
    if (!entry) return res.status(400).json({ error: 'No code found. Request a new one.' })
    if (Date.now() > entry.expires) { otpStore.delete(email); return res.status(400).json({ error: 'Code expired.' }) }
    if (entry.code !== code) return res.status(400).json({ error: 'Incorrect code.' })
    otpStore.delete(email)
    const token = Buffer.from(`${email}:${Date.now()}`).toString('base64')
    return res.status(200).json({ ok: true, token })
  }

  return res.status(400).json({ error: 'Invalid action' })
}
