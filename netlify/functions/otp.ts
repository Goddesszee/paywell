import type { Handler } from '@netlify/functions'
import crypto from 'crypto'
import { genToken, otpStore, sessionStore, deterministicAddress } from './_shared'

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' }

  const body = JSON.parse(event.body ?? '{}') as {
    action: string; email: string; otp?: string; token?: string; expiresAt?: number
  }
  const { action, email, otp, token, expiresAt } = body

  if (!email) return { statusCode: 400, body: JSON.stringify({ success: false, error: 'email required' }) }

  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }

  if (action === 'send') {
    const code = Math.floor(100000 + Math.random() * 900000).toString()
    const otpToken = genToken()
    const exp = Date.now() + 1000 * 60 * 10

    otpStore.set(email, { otp: code, token: otpToken, expiresAt: exp })

    // Send email if SMTP configured
    const smtpUser = process.env.SMTP_USER
    if (smtpUser) {
      try {
        await sendOtpEmail(email, code)
      } catch (e) {
        console.error('SMTP error:', e)
      }
    }

    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        success: true,
        token: otpToken,
        expiresAt: exp,
        dev: !smtpUser,
        ...(process.env.NODE_ENV !== 'production' && { _devOtp: code }),
      }),
    }
  }

  if (action === 'verify') {
    if (!otp || !token) return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'otp and token required' }) }

    const stored = otpStore.get(email)
    if (!stored) return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'No OTP found — request a new code' }) }
    if (stored.token !== token) return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'Invalid token' }) }
    if (Date.now() > (expiresAt ?? stored.expiresAt)) {
      otpStore.delete(email)
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'OTP expired — request a new code' }) }
    }
    if (stored.otp !== otp.trim()) return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'Incorrect code' }) }

    otpStore.delete(email)
    const sessionToken = genToken()
    const walletAddress = deterministicAddress(email)
    const walletId = `wallet-${crypto.createHash('sha256').update(email).digest('hex').slice(0, 16)}`

    sessionStore.set(sessionToken, { email, walletAddress, walletId })

    return { statusCode: 200, headers, body: JSON.stringify({ success: true, sessionToken }) }
  }

  return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'Unknown action' }) }
}

async function sendOtpEmail(to: string, code: string) {
  const nodemailer = await import('nodemailer')
  const transporter = nodemailer.default.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_PORT === '465',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  })
  await transporter.sendMail({
    from: `Paywell <${process.env.SMTP_USER}>`,
    to,
    subject: 'Your Paywell verification code',
    html: `<div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:32px"><h2 style="color:#3B82F6">Paywell</h2><p>Your verification code is:</p><div style="font-size:40px;font-weight:700;letter-spacing:8px;color:#1a1a1a;padding:16px 0">${code}</div><p style="color:#666">Expires in 10 minutes. Do not share this code.</p></div>`,
  })
}
