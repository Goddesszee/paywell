/**
 * NAN email templates — sent via Resend for OTP login.
 * New users get a welcome + feature summary.
 * Returning users get a clean sign-in notification.
 */

const NAN_BLUE  = '#0066FF'
const BG        = '#0A0C10'
const CARD_BG   = '#13151A'
const TEXT      = '#F2F3F5'
const TEXT2     = '#8A8F9E'
const BORDER    = 'rgba(255,255,255,0.08)'

/** NAN logo as inline SVG (blue circle + white "N") */
const logoSvg = `<svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="24" cy="24" r="24" fill="${NAN_BLUE}"/>
  <text x="24" y="31" text-anchor="middle" font-family="'Inter',Arial,sans-serif"
    font-size="22" font-weight="800" fill="white" letter-spacing="-1">N</text>
</svg>`

function wrapper(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>NAN</title>
</head>
<body style="margin:0;padding:0;background:${BG};font-family:'Inter',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:${CARD_BG};border-radius:20px;border:1px solid ${BORDER};overflow:hidden;">
        <!-- Header -->
        <tr><td style="padding:32px 40px 24px;border-bottom:1px solid ${BORDER};text-align:center;">
          ${logoSvg}
          <p style="margin:12px 0 0;font-size:22px;font-weight:800;color:${TEXT};letter-spacing:-0.03em;">NAN</p>
          <p style="margin:4px 0 0;font-size:13px;color:${TEXT2};">The Intelligent Payment Network</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px 40px 40px;">
          ${content}
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:20px 40px;border-top:1px solid ${BORDER};text-align:center;">
          <p style="margin:0;font-size:12px;color:${TEXT2};">
            © 2026 NAN · <a href="https://nanarc.xyz" style="color:${NAN_BLUE};text-decoration:none;">nanarc.xyz</a>
          </p>
          <p style="margin:6px 0 0;font-size:11px;color:rgba(138,143,158,0.6);">
            If you didn't request this, you can safely ignore this email.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function otpBox(code: string): string {
  return `
    <div style="margin:24px 0;text-align:center;">
      <div style="display:inline-block;background:rgba(0,102,255,0.1);border:2px solid rgba(0,102,255,0.35);
        border-radius:14px;padding:16px 40px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:600;letter-spacing:0.08em;color:${NAN_BLUE};text-transform:uppercase;">
          Your verification code
        </p>
        <p style="margin:0;font-size:38px;font-weight:800;letter-spacing:0.12em;color:${TEXT};font-variant-numeric:tabular-nums;">
          ${code}
        </p>
        <p style="margin:6px 0 0;font-size:11px;color:${TEXT2};">Valid for 10 minutes</p>
      </div>
    </div>`
}

/** ── New user welcome email ────────────────────────────────────────────── */
export function newUserEmail(email: string, code: string): { subject: string; html: string } {
  const subject = `${code} — Welcome to NAN, your intelligent payment wallet`

  const features = [
    ['💸', 'Send & Receive USDC', 'Instant payments to anyone, anywhere on Arc Testnet'],
    ['🌉', 'Bridge', 'Move USDC across chains with CCTP V2 in seconds'],
    ['🔄', 'Swap', 'Exchange tokens directly from your wallet'],
    ['🏦', 'Gateway', 'Unified cross-chain USDC balance — one pool, all chains'],
    ['🤖', 'AI Agent', 'Your personal finance assistant powered by Groq'],
    ['🛍️', 'Shop', 'Buy and sell goods using USDC escrow — trustless commerce'],
  ]

  const featureRows = features.map(([icon, title, desc]) => `
    <tr>
      <td style="padding:10px 0;vertical-align:top;">
        <table cellpadding="0" cellspacing="0"><tr>
          <td style="width:36px;font-size:20px;vertical-align:top;padding-top:2px;">${icon}</td>
          <td>
            <p style="margin:0;font-size:14px;font-weight:700;color:${TEXT};">${title}</p>
            <p style="margin:2px 0 0;font-size:13px;color:${TEXT2};line-height:1.45;">${desc}</p>
          </td>
        </tr></table>
      </td>
    </tr>`).join('')

  const html = wrapper(`
    <h1 style="margin:0 0 6px;font-size:24px;font-weight:800;color:${TEXT};letter-spacing:-0.03em;">
      Welcome to NAN 👋
    </h1>
    <p style="margin:0 0 4px;font-size:14px;color:${TEXT2};">
      Your account is being created for <strong style="color:${TEXT};">${email}</strong>.
    </p>
    <p style="margin:0 0 20px;font-size:14px;color:${TEXT2};line-height:1.55;">
      Use the code below to verify your email and set up your Circle wallet — it only takes a few seconds.
    </p>

    ${otpBox(code)}

    <div style="margin:28px 0 8px;padding:20px 24px;background:rgba(255,255,255,0.03);border-radius:14px;border:1px solid ${BORDER};">
      <p style="margin:0 0 14px;font-size:13px;font-weight:700;color:${TEXT};letter-spacing:0.02em;text-transform:uppercase;">
        What you can do with NAN
      </p>
      <table width="100%" cellpadding="0" cellspacing="0">
        ${featureRows}
      </table>
    </div>

    <a href="https://nanarc.xyz" style="display:block;margin-top:24px;padding:14px;background:${NAN_BLUE};
      color:#fff;text-align:center;border-radius:12px;font-size:15px;font-weight:700;
      text-decoration:none;letter-spacing:-0.01em;">
      Open NAN →
    </a>
  `)

  return { subject, html }
}

/** ── Returning user sign-in email ──────────────────────────────────────── */
export function returningUserEmail(email: string, code: string): { subject: string; html: string } {
  const subject = `${code} — Your NAN sign-in code`

  const html = wrapper(`
    <h1 style="margin:0 0 6px;font-size:24px;font-weight:800;color:${TEXT};letter-spacing:-0.03em;">
      Welcome back 👋
    </h1>
    <p style="margin:0 0 20px;font-size:14px;color:${TEXT2};line-height:1.55;">
      Here's your sign-in code for <strong style="color:${TEXT};">${email}</strong>.
      Your wallet and balances are exactly where you left them.
    </p>

    ${otpBox(code)}

    <p style="margin:20px 0 0;font-size:13px;color:${TEXT2};line-height:1.55;text-align:center;">
      Good to have you back. Your Circle wallet on Arc Testnet is ready.
    </p>

    <a href="https://nanarc.xyz" style="display:block;margin-top:20px;padding:14px;background:${NAN_BLUE};
      color:#fff;text-align:center;border-radius:12px;font-size:15px;font-weight:700;
      text-decoration:none;letter-spacing:-0.01em;">
      Sign in to NAN →
    </a>
  `)

  return { subject, html }
}
