import { useState, useEffect, useRef } from 'react'
import { W3SSdk } from '@circle-fin/w3s-pw-web-sdk'
import { useAppStore } from '../store/appStore'

const SANS = "'Inter', -apple-system, sans-serif"
const CIRCLE_APP_ID = import.meta.env.VITE_CIRCLE_APP_ID as string | undefined

interface LoginResult { userToken: string; encryptionKey: string }
interface OtpTokens { deviceToken: string; deviceEncryptionKey: string; otpToken: string }

type Step = 'email' | 'verify' | 'creating' | 'done' | 'error'

interface Props { onSuccess: (address: string, userToken: string) => void }

export function CircleEmailLogin({ onSuccess }: Props) {
  const setAuth = useAppStore(s => s.setAuth)
  const sdkRef = useRef<W3SSdk | null>(null)
  const [deviceId, setDeviceId] = useState('')
  const [email, setEmail] = useState('')
  const [otpTokens, setOtpTokens] = useState<OtpTokens | null>(null)
  const [loginResult, setLoginResult] = useState<LoginResult | null>(null)
  const [step, setStep] = useState<Step>('email')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Initialise SDK once
  useEffect(() => {
    if (!CIRCLE_APP_ID) return
    const onLoginComplete = (err: unknown, result: unknown) => {
      if (err) { setError('OTP verification failed'); setStep('error'); return }
      const r = result as LoginResult
      setLoginResult(r)
      setStep('creating')
      void initUser(r.userToken, r.encryptionKey)
    }
    const sdk = new W3SSdk({ appSettings: { appId: CIRCLE_APP_ID } }, onLoginComplete)
    sdkRef.current = sdk
    sdk.getDeviceId().then(id => {
      setDeviceId(id)
      localStorage.setItem('pw_deviceId', id)
    }).catch(() => setError('Failed to init Circle SDK'))
  }, [])

  const initUser = async (userToken: string, encryptionKey: string) => {
    setLoading(true)
    try {
      const res = await fetch('/api/wallet/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userToken }),
      })
      const data = await res.json() as { challengeId?: string; code?: number; error?: string }

      if (data.code === 155106) {
        // already initialized — load wallets
        await loadWallets(userToken)
        return
      }
      if (data.error) { setError(data.error); setStep('error'); return }

      // execute challenge to create wallet
      const sdk = sdkRef.current
      if (!sdk || !data.challengeId) return
      sdk.setAuthentication({ userToken, encryptionKey })
      sdk.execute(data.challengeId, async (err) => {
        if (err) { setError('Wallet creation failed'); setStep('error'); return }
        await loadWallets(userToken)
      })
    } catch {
      setError('Network error'); setStep('error')
    } finally {
      setLoading(false)
    }
  }

  const loadWallets = async (userToken: string) => {
    const res = await fetch('/api/wallet/wallets', {
      headers: { 'x-user-token': userToken },
    })
    const data = await res.json() as { wallets?: { address: string }[] }
    const address = data.wallets?.[0]?.address ?? ''
    setAuth({ email, userToken, circleWalletAddress: address })
    setStep('done')
    onSuccess(address, userToken)
  }

  // Step 1 — send OTP
  const handleSendOtp = async () => {
    if (!email || !deviceId) return
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/wallet/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, email }),
      })
      const data = await res.json() as OtpTokens & { error?: string }
      if (data.error) { setError(data.error); return }
      setOtpTokens(data)
      sdkRef.current?.updateConfigs({
        appSettings: { appId: CIRCLE_APP_ID! },
        loginConfigs: {
          deviceToken: data.deviceToken,
          deviceEncryptionKey: data.deviceEncryptionKey,
          otpToken: data.otpToken,
        },
      })
      setStep('verify')
    } catch { setError('Network error') }
    finally { setLoading(false) }
  }

  // Step 2 — verify OTP (opens Circle hosted UI)
  const handleVerifyOtp = () => {
    if (!sdkRef.current || !otpTokens) return
    sdkRef.current.verifyOtp()
  }

  if (!CIRCLE_APP_ID) {
    return (
      <div style={{ fontFamily: SANS, textAlign: 'center', padding: 16 }}>
        <div style={{ fontSize: 13, color: '#6B6B6B', lineHeight: 1.6 }}>
          <strong>Circle email login</strong> requires <code>VITE_CIRCLE_APP_ID</code> to be set.<br />
          Add it in Vercel → Environment Variables, then redeploy.
        </div>
      </div>
    )
  }

  if (step === 'done') return (
    <div style={{ fontFamily: SANS, textAlign: 'center', padding: 16 }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
      <div style={{ fontWeight: 700, fontSize: 16 }}>Wallet ready</div>
      <div style={{ fontSize: 13, color: '#6B6B6B', marginTop: 4 }}>Circle wallet created via {email}</div>
    </div>
  )

  return (
    <div style={{ fontFamily: SANS }}>
      {step === 'email' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 13, color: '#6B6B6B', marginBottom: 4 }}>
            Enter your email to create a Circle wallet — no MetaMask needed.
          </div>
          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && void handleSendOtp()}
            style={{
              width: '100%', height: 48, padding: '0 14px',
              border: '1.5px solid rgba(0,0,0,0.12)', borderRadius: 10,
              fontSize: 15, fontFamily: SANS, outline: 'none', boxSizing: 'border-box',
            }}
          />
          <button
            onClick={() => void handleSendOtp()}
            disabled={loading || !email}
            style={{
              width: '100%', height: 48,
              background: loading || !email ? '#D0D0D0' : '#0D0D0D',
              color: '#fff', border: 'none', borderRadius: 10,
              fontSize: 15, fontWeight: 700, fontFamily: SANS, cursor: 'pointer',
            }}
          >
            {loading ? 'Sending…' : 'Send code →'}
          </button>
          {error && <div style={{ color: '#C00', fontSize: 13 }}>{error}</div>}
        </div>
      )}

      {step === 'verify' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 13, color: '#6B6B6B', marginBottom: 4 }}>
            A code was sent to <strong>{email}</strong>. Tap below to verify it.
          </div>
          <button
            onClick={handleVerifyOtp}
            style={{
              width: '100%', height: 48,
              background: '#0D0D0D', color: '#fff',
              border: 'none', borderRadius: 10,
              fontSize: 15, fontWeight: 700, fontFamily: SANS, cursor: 'pointer',
            }}
          >
            Enter verification code →
          </button>
          <button
            onClick={() => void handleSendOtp()}
            style={{
              width: '100%', height: 40, background: 'transparent',
              color: '#6B6B6B', border: '1px solid rgba(0,0,0,0.1)',
              borderRadius: 10, fontSize: 14, fontFamily: SANS, cursor: 'pointer',
            }}
          >
            Resend code
          </button>
          {error && <div style={{ color: '#C00', fontSize: 13 }}>{error}</div>}
        </div>
      )}

      {step === 'creating' && (
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <div style={{ fontSize: 13, color: '#6B6B6B' }}>
            {loading ? 'Creating your Circle wallet on Arc Testnet…' : 'Approve wallet creation in the popup…'}
          </div>
        </div>
      )}

      {step === 'error' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ color: '#C00', fontSize: 13 }}>{error}</div>
          <button
            onClick={() => { setStep('email'); setError('') }}
            style={{
              width: '100%', height: 40, background: '#0D0D0D', color: '#fff',
              border: 'none', borderRadius: 10, fontSize: 14, fontFamily: SANS, cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      )}
    </div>
  )
}
