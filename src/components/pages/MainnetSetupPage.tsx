import { useState, useCallback } from 'react'
import { CheckCircle, Circle, Copy, ExternalLink, ChevronDown, ChevronUp, Eye, EyeOff, Rocket, Shield, Database, Mail, Cpu, DollarSign, ArrowLeft } from 'lucide-react'
import { useAppStore } from '../../store/appStore'

// ── Types ──────────────────────────────────────────────────────────────────────

interface EnvField {
  key: string
  label: string
  description: string
  placeholder: string
  type?: 'text' | 'password' | 'url'
  required: boolean
  helpUrl?: string
  autoGenerate?: () => string
}

interface EnvGroup {
  id: string
  title: string
  icon: React.ReactNode
  description: string
  fields: EnvField[]
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function randomHex(bytes = 32) {
  const arr = new Uint8Array(bytes)
  crypto.getRandomValues(arr)
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')
}

// ── Env groups ─────────────────────────────────────────────────────────────────

const ENV_GROUPS: EnvGroup[] = [
  {
    id: 'core',
    title: 'Core',
    icon: <Shield size={16} />,
    description: 'Required for any production deploy.',
    fields: [
      {
        key: 'NODE_ENV',
        label: 'Node Environment',
        description: 'Enables production mode — disables mock fallbacks and activates startup guards.',
        placeholder: 'production',
        required: true,
        autoGenerate: () => 'production',
      },
      {
        key: 'ADMIN_SECRET',
        label: 'Admin Secret',
        description: 'Protects all /api/admin/* routes. Use a long random string.',
        placeholder: 'Generate one →',
        type: 'password',
        required: true,
        autoGenerate: () => randomHex(32),
      },
      {
        key: 'ALLOWED_ORIGIN',
        label: 'Allowed Origin (CORS)',
        description: 'Your production frontend URL. Restricts API CORS to only your domain.',
        placeholder: 'https://paywell-puce.vercel.app',
        type: 'url',
        required: true,
      },
    ],
  },
  {
    id: 'circle',
    title: 'Circle Wallets',
    icon: <Cpu size={16} />,
    description: 'Needed for real user wallets, transfers, and the AI agent.',
    fields: [
      {
        key: 'CIRCLE_DEVELOPER_CONTROLLED_API_KEY',
        label: 'Circle API Key',
        description: 'Standard Developer API Key from the Circle Developer Console.',
        placeholder: 'TEST_API_KEY:...',
        type: 'password',
        required: true,
        helpUrl: 'https://console.circle.com/api-keys',
      },
      {
        key: 'CIRCLE_ENTITY_SECRET',
        label: 'Circle Entity Secret',
        description: 'Your registered 32-byte entity secret for developer-controlled wallets.',
        placeholder: '0x...',
        type: 'password',
        required: true,
        helpUrl: 'https://developers.circle.com/w3s/entity-secret-management',
      },
      {
        key: 'REWARDS_WALLET_ID',
        label: 'Rewards Wallet ID',
        description: 'Circle wallet ID that pays out referral rewards to users.',
        placeholder: 'wallet_...',
        required: false,
        helpUrl: 'https://console.circle.com/wallets',
      },
    ],
  },
  {
    id: 'redis',
    title: 'Redis / KV Store',
    icon: <Database size={16} />,
    description: 'Sessions, OTP rate-limits, and notifications require Redis. Use Vercel KV (Upstash-backed) — it auto-injects these vars when connected.',
    fields: [
      {
        key: 'KV_REST_API_URL',
        label: 'KV REST API URL',
        description: 'Auto-injected by Vercel when you connect a KV store. Go to: Storage → Create Database → KV → Connect.',
        placeholder: 'https://...upstash.io',
        type: 'url',
        required: true,
        helpUrl: 'https://vercel.com/docs/storage/vercel-kv',
      },
      {
        key: 'KV_REST_API_TOKEN',
        label: 'KV REST API Token',
        description: 'Auto-injected by Vercel alongside the URL.',
        placeholder: 'AX...',
        type: 'password',
        required: true,
        helpUrl: 'https://vercel.com/docs/storage/vercel-kv',
      },
    ],
  },
  {
    id: 'email',
    title: 'Email (OTP)',
    icon: <Mail size={16} />,
    description: 'Required for email one-time-password login. Resend is the easiest option.',
    fields: [
      {
        key: 'SMTP_HOST',
        label: 'SMTP Host',
        description: 'Use smtp.resend.com for Resend, or your own SMTP provider.',
        placeholder: 'smtp.resend.com',
        required: true,
        helpUrl: 'https://resend.com/settings/api-keys',
      },
      {
        key: 'SMTP_PORT',
        label: 'SMTP Port',
        description: '465 for TLS (Resend), 587 for STARTTLS.',
        placeholder: '465',
        required: true,
        autoGenerate: () => '465',
      },
      {
        key: 'SMTP_USER',
        label: 'SMTP User',
        description: 'For Resend this is always "resend".',
        placeholder: 'resend',
        required: true,
        autoGenerate: () => 'resend',
      },
      {
        key: 'SMTP_PASS',
        label: 'SMTP Password / API Key',
        description: 'Your Resend API key (re_...) or SMTP password.',
        placeholder: 're_...',
        type: 'password',
        required: true,
        helpUrl: 'https://resend.com/settings/api-keys',
      },
    ],
  },
  {
    id: 'ai',
    title: 'AI & Payments',
    icon: <DollarSign size={16} />,
    description: 'Optional but recommended for the AI agent chat and x402 micropayments.',
    fields: [
      {
        key: 'GROQ_API_KEY',
        label: 'Groq API Key',
        description: 'Powers the NAN AI assistant. Get one free at console.groq.com.',
        placeholder: 'gsk_...',
        type: 'password',
        required: false,
        helpUrl: 'https://console.groq.com/keys',
      },
      {
        key: 'OPENAI_API_KEY',
        label: 'OpenAI API Key (alternative)',
        description: 'Use instead of Groq if you prefer GPT-4o-mini.',
        placeholder: 'sk-...',
        type: 'password',
        required: false,
        helpUrl: 'https://platform.openai.com/api-keys',
      },
      {
        key: 'SELLER_ADDRESS',
        label: 'x402 Seller Address',
        description: 'Your EVM wallet address to receive x402 micropayments for AI chat.',
        placeholder: '0x...',
        required: false,
      },
    ],
  },
]

// ── Build Vercel deploy URL ────────────────────────────────────────────────────

function buildVercelDeployUrl(values: Record<string, string>): string {
  const repo = 'Goddesszee/realnan'
  const base = `https://vercel.com/new/clone?repository-url=https://github.com/${repo}&project-name=paywell&repository-name=paywell`

  const envPairs = Object.entries(values)
    .filter(([, v]) => v.trim() !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')

  return envPairs ? `${base}&env=${envPairs}` : base
}

// ── Subcomponents ──────────────────────────────────────────────────────────────

function FieldRow({ field, value, onChange }: {
  field: EnvField
  value: string
  onChange: (v: string) => void
}) {
  const [show, setShow] = useState(false)
  const isPassword = field.type === 'password'
  const filled = value.trim().length > 0

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--nan-text)', fontFamily: "'DM Sans', sans-serif" }}>
          {field.label}
          {field.required && <span style={{ color: '#ff4545', marginLeft: 3 }}>*</span>}
        </label>
        {filled && <CheckCircle size={11} color="#22c55e" />}
        {field.helpUrl && (
          <a href={field.helpUrl} target="_blank" rel="noopener noreferrer"
            style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#0066FF', textDecoration: 'none' }}>
            Get key <ExternalLink size={10} />
          </a>
        )}
      </div>
      <p style={{ fontSize: 11, color: 'var(--nan-text2)', margin: '0 0 6px', lineHeight: 1.45, fontFamily: "'DM Sans', sans-serif" }}>
        {field.description}
      </p>
      <div style={{ display: 'flex', gap: 6 }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <input
            type={isPassword && !show ? 'password' : 'text'}
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={field.placeholder}
            spellCheck={false}
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: isPassword ? '9px 36px 9px 11px' : '9px 11px',
              fontSize: 12, fontFamily: "'JetBrains Mono', 'Menlo', monospace",
              background: filled ? 'rgba(34,197,94,0.06)' : 'var(--nan-bg)',
              border: `1px solid ${filled ? 'rgba(34,197,94,0.3)' : 'var(--nan-bdr)'}`,
              borderRadius: 8, color: 'var(--nan-text)', outline: 'none',
              transition: 'border-color 0.15s, background 0.15s',
            }}
          />
          {isPassword && (
            <button onClick={() => setShow(s => !s)}
              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--nan-text2)' }}>
              {show ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          )}
        </div>
        {field.autoGenerate && (
          <button
            onClick={() => onChange(field.autoGenerate!())}
            style={{
              padding: '0 12px', borderRadius: 8, border: '1px solid var(--nan-bdr)',
              background: 'var(--nan-surface)', color: 'var(--nan-text)', fontSize: 11,
              cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: "'DM Sans', sans-serif",
            }}>
            Generate
          </button>
        )}
      </div>
    </div>
  )
}

function GroupCard({ group, values, onChange }: {
  group: EnvGroup
  values: Record<string, string>
  onChange: (key: string, v: string) => void
}) {
  const [open, setOpen] = useState(true)
  const filled = group.fields.filter(f => values[f.key]?.trim()).length
  const required = group.fields.filter(f => f.required).length
  const requiredFilled = group.fields.filter(f => f.required && values[f.key]?.trim()).length
  const allRequired = requiredFilled === required

  return (
    <div style={{
      background: 'var(--nan-surface)', border: `1px solid ${allRequired ? 'rgba(34,197,94,0.25)' : 'var(--nan-bdr)'}`,
      borderRadius: 16, marginBottom: 12, overflow: 'hidden',
      transition: 'border-color 0.2s',
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
        }}>
        <span style={{ color: allRequired ? '#22c55e' : '#0066FF' }}>{group.icon}</span>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--nan-text)', fontFamily: "'DM Sans', sans-serif" }}>
          {group.title}
        </span>
        <span style={{ fontSize: 11, color: allRequired ? '#22c55e' : 'var(--nan-text2)', fontFamily: "'DM Sans', sans-serif" }}>
          {filled}/{group.fields.length}
        </span>
        {allRequired ? <CheckCircle size={14} color="#22c55e" /> : <Circle size={14} color="var(--nan-text2)" />}
        {open ? <ChevronUp size={14} color="var(--nan-text2)" /> : <ChevronDown size={14} color="var(--nan-text2)" />}
      </button>

      {open && (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--nan-bdr)' }}>
          <p style={{ fontSize: 11, color: 'var(--nan-text2)', margin: '12px 0 14px', fontFamily: "'DM Sans', sans-serif" }}>
            {group.description}
          </p>
          {group.fields.map(f => (
            <FieldRow key={f.key} field={f} value={values[f.key] ?? ''} onChange={v => onChange(f.key, v)} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export function MainnetSetupPage() {
  const { setActiveView } = useAppStore()
  const [values, setValues] = useState<Record<string, string>>(() => {
    const defaults: Record<string, string> = {}
    ENV_GROUPS.forEach(g => g.fields.forEach(f => {
      if (f.autoGenerate && f.key !== 'ADMIN_SECRET') defaults[f.key] = f.autoGenerate()
    }))
    return defaults
  })
  const [copied, setCopied] = useState('')
  const [showEnvFile, setShowEnvFile] = useState(false)

  const set = useCallback((key: string, v: string) => {
    setValues(prev => ({ ...prev, [key]: v }))
  }, [])

  const allRequiredFilled = ENV_GROUPS.every(g =>
    g.fields.every(f => !f.required || values[f.key]?.trim())
  )

  const totalFilled = Object.values(values).filter(v => v.trim()).length
  const totalFields = ENV_GROUPS.reduce((s, g) => s + g.fields.length, 0)

  const envFileContent = ENV_GROUPS
    .flatMap(g => g.fields)
    .filter(f => values[f.key]?.trim())
    .map(f => `${f.key}=${values[f.key]}`)
    .join('\n')

  const vercelDeployUrl = buildVercelDeployUrl(values)

  const copyEnv = () => {
    void navigator.clipboard.writeText(envFileContent).then(() => {
      setCopied('env')
      setTimeout(() => setCopied(''), 2000)
    })
  }

  const copyKey = (key: string) => {
    void navigator.clipboard.writeText(values[key] ?? '').then(() => {
      setCopied(key)
      setTimeout(() => setCopied(''), 2000)
    })
  }

  const progress = Math.round((totalFilled / totalFields) * 100)

  return (
    <div style={{
      minHeight: '100dvh', background: 'var(--nan-bg)', fontFamily: "'DM Sans', sans-serif",
      paddingBottom: 80,
    }}>
      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: 'var(--nan-bg)', borderBottom: '1px solid var(--nan-bdr)',
        padding: '14px 16px 0',
      }}>
        <div style={{ maxWidth: 540, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <button
              onClick={() => setActiveView('admin')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--nan-text2)', display: 'flex' }}>
              <ArrowLeft size={18} />
            </button>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--nan-text)', letterSpacing: '-0.02em' }}>
                Mainnet Setup
              </div>
              <div style={{ fontSize: 11, color: 'var(--nan-text2)', marginTop: 1 }}>
                {totalFilled} of {totalFields} variables configured
              </div>
            </div>
            <div style={{
              padding: '4px 10px', borderRadius: 20,
              background: allRequiredFilled ? 'rgba(34,197,94,0.12)' : 'rgba(0,102,255,0.08)',
              border: `1px solid ${allRequiredFilled ? 'rgba(34,197,94,0.3)' : 'rgba(0,102,255,0.2)'}`,
              fontSize: 11, fontWeight: 600,
              color: allRequiredFilled ? '#22c55e' : '#0066FF',
            }}>
              {allRequiredFilled ? 'Ready' : 'In Progress'}
            </div>
          </div>
          {/* Progress bar */}
          <div style={{ height: 3, background: 'var(--nan-bdr)', borderRadius: 99, marginBottom: 0, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${progress}%`,
              background: allRequiredFilled ? '#22c55e' : '#0066FF',
              borderRadius: 99, transition: 'width 0.3s ease',
            }} />
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 540, margin: '0 auto', padding: '20px 16px 0' }}>

        {/* Step 1 — Fill vars */}
        <div style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--nan-text2)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
            Step 1 — Configure environment variables
          </div>
          {ENV_GROUPS.map(g => (
            <GroupCard key={g.id} group={g} values={values} onChange={set} />
          ))}
        </div>

        {/* Step 2 — Vercel KV notice */}
        <div style={{
          background: 'rgba(0,102,255,0.06)', border: '1px solid rgba(0,102,255,0.18)',
          borderRadius: 14, padding: '14px 16px', marginBottom: 16,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#0066FF', marginBottom: 6 }}>
            Step 2 — Connect Redis (Vercel KV)
          </div>
          <p style={{ fontSize: 12, color: 'var(--nan-text)', margin: '0 0 10px', lineHeight: 1.5 }}>
            Sessions and rate-limits need Redis. In your Vercel project:
          </p>
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--nan-text)', lineHeight: 1.8 }}>
            <li>Go to <strong>Storage</strong> → <strong>Create Database</strong> → <strong>KV</strong></li>
            <li>Click <strong>Connect</strong> to link it to your project</li>
            <li>Vercel injects <code style={{ fontSize: 11, background: 'var(--nan-bg)', padding: '1px 5px', borderRadius: 4 }}>KV_REST_API_URL</code> and <code style={{ fontSize: 11, background: 'var(--nan-bg)', padding: '1px 5px', borderRadius: 4 }}>KV_REST_API_TOKEN</code> automatically</li>
            <li>No copy/paste needed — just redeploy after connecting</li>
          </ol>
          <a
            href="https://vercel.com/dashboard"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 5,
              fontSize: 12, fontWeight: 600, color: '#0066FF', textDecoration: 'none',
            }}>
            Open Vercel Dashboard <ExternalLink size={11} />
          </a>
        </div>

        {/* Step 3 — Deploy */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--nan-text2)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
            Step 3 — Deploy
          </div>

          {/* Option A — One-click deploy */}
          <div style={{
            background: 'var(--nan-surface)', border: '1px solid var(--nan-bdr)',
            borderRadius: 14, padding: '14px 16px', marginBottom: 10,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--nan-text)', marginBottom: 4 }}>
              Option A — One-click Vercel deploy
            </div>
            <p style={{ fontSize: 12, color: 'var(--nan-text2)', margin: '0 0 12px', lineHeight: 1.5 }}>
              Opens Vercel's deploy page with your env vars pre-filled from Step 1. Review them, then click Deploy.
            </p>
            <a
              href={vercelDeployUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '12px 20px', borderRadius: 10, textDecoration: 'none',
                background: allRequiredFilled ? '#0066FF' : 'var(--nan-bdr)',
                color: allRequiredFilled ? '#fff' : 'var(--nan-text2)',
                fontSize: 13, fontWeight: 700, transition: 'background 0.15s',
              }}>
              <Rocket size={14} />
              Deploy to Vercel
              <ExternalLink size={12} />
            </a>
            {!allRequiredFilled && (
              <p style={{ margin: '8px 0 0', fontSize: 11, color: '#f97316', textAlign: 'center' }}>
                Fill in all required fields above to enable this button.
              </p>
            )}
          </div>

          {/* Option B — Push to GitHub */}
          <div style={{
            background: 'var(--nan-surface)', border: '1px solid var(--nan-bdr)',
            borderRadius: 14, padding: '14px 16px', marginBottom: 10,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--nan-text)', marginBottom: 4 }}>
              Option B — Push to GitHub (auto-deploy)
            </div>
            <p style={{ fontSize: 12, color: 'var(--nan-text2)', margin: '0 0 10px', lineHeight: 1.5 }}>
              If Vercel is already connected to your GitHub repo, every push to <code style={{ fontSize: 11, background: 'var(--nan-bg)', padding: '1px 5px', borderRadius: 4 }}>main</code> deploys automatically.
            </p>
            <div style={{
              background: 'var(--nan-bg)', border: '1px solid var(--nan-bdr)',
              borderRadius: 8, padding: '10px 12px', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: 'var(--nan-text)',
              position: 'relative',
            }}>
              <div style={{ color: '#64748b', marginBottom: 2 }}># from your project root</div>
              <div>git add -A</div>
              <div>git commit -m "mainnet hardening"</div>
              <div>git push origin main</div>
            </div>
          </div>

          {/* Option C — .env file */}
          <div style={{
            background: 'var(--nan-surface)', border: '1px solid var(--nan-bdr)',
            borderRadius: 14, padding: '14px 16px',
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--nan-text)', marginBottom: 4 }}>
              Option C — Paste env vars manually into Vercel
            </div>
            <p style={{ fontSize: 12, color: 'var(--nan-text2)', margin: '0 0 10px', lineHeight: 1.5 }}>
              Go to your Vercel project → <strong>Settings</strong> → <strong>Environment Variables</strong> and add each key/value below.
            </p>
            <button
              onClick={() => setShowEnvFile(s => !s)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'none', border: '1px solid var(--nan-bdr)',
                borderRadius: 8, padding: '7px 12px', cursor: 'pointer',
                fontSize: 12, color: 'var(--nan-text)', fontFamily: "'DM Sans', sans-serif",
              }}>
              {showEnvFile ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {showEnvFile ? 'Hide' : 'Show'} .env preview
            </button>
            {showEnvFile && (
              <div style={{ marginTop: 10, position: 'relative' }}>
                <pre style={{
                  background: 'var(--nan-bg)', border: '1px solid var(--nan-bdr)',
                  borderRadius: 8, padding: '12px', fontSize: 11,
                  fontFamily: "'JetBrains Mono', monospace",
                  color: 'var(--nan-text)', overflow: 'auto', maxHeight: 240,
                  margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                }}>
                  {envFileContent || '# Fill in the fields above to see your .env preview here.'}
                </pre>
                {envFileContent && (
                  <button
                    onClick={copyEnv}
                    style={{
                      position: 'absolute', top: 8, right: 8,
                      display: 'flex', alignItems: 'center', gap: 4,
                      padding: '5px 10px', borderRadius: 6, cursor: 'pointer',
                      background: 'var(--nan-surface)', border: '1px solid var(--nan-bdr)',
                      fontSize: 11, color: 'var(--nan-text)', fontFamily: "'DM Sans', sans-serif",
                    }}>
                    <Copy size={11} />
                    {copied === 'env' ? 'Copied!' : 'Copy all'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Step 4 — Contracts */}
        <div style={{
          background: 'rgba(249,115,22,0.06)', border: '1px solid rgba(249,115,22,0.2)',
          borderRadius: 14, padding: '14px 16px', marginBottom: 16,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#f97316', marginBottom: 6 }}>
            Step 4 — Deploy smart contracts to Arc Mainnet
          </div>
          <p style={{ fontSize: 12, color: 'var(--nan-text)', margin: '0 0 8px', lineHeight: 1.5 }}>
            Run these from your machine (not Arc Studio). Replace <code style={{ fontSize: 11, background: 'var(--nan-bg)', padding: '1px 5px', borderRadius: 4 }}>0xYOUR_FEE_RECIPIENT</code> with your wallet address.
          </p>
          {[
            `bun run deploy:self NANNameRegistry '["0x3600000000000000000000000000000000000000"]'`,
            `bun run deploy:self PaywellEscrow '["0x3600000000000000000000000000000000000000","0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d","0xYOUR_FEE_RECIPIENT"]'`,
          ].map((cmd, i) => (
            <div key={i} style={{ position: 'relative', marginBottom: 8 }}>
              <pre style={{
                background: 'var(--nan-bg)', border: '1px solid var(--nan-bdr)',
                borderRadius: 8, padding: '10px 36px 10px 12px', fontSize: 11,
                fontFamily: "'JetBrains Mono', monospace",
                color: 'var(--nan-text)', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
              }}>{cmd}</pre>
              <button
                onClick={() => copyKey(cmd)}
                style={{
                  position: 'absolute', top: 7, right: 7,
                  background: 'var(--nan-surface)', border: '1px solid var(--nan-bdr)',
                  borderRadius: 5, cursor: 'pointer', padding: '3px 6px',
                  display: 'flex', alignItems: 'center',
                }}>
                <Copy size={10} color="var(--nan-text2)" />
              </button>
            </div>
          ))}
          <p style={{ fontSize: 11, color: 'var(--nan-text2)', margin: '6px 0 0' }}>
            Full runbook: <code style={{ fontSize: 11 }}>docs/mainnet-deploy.md</code>
          </p>
        </div>

        {/* Quick-copy individual secrets */}
        {values.ADMIN_SECRET && (
          <div style={{
            background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: 14, padding: '14px 16px', marginBottom: 16,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#ef4444', marginBottom: 6 }}>
              Save your Admin Secret now
            </div>
            <p style={{ fontSize: 12, color: 'var(--nan-text)', margin: '0 0 8px', lineHeight: 1.5 }}>
              This is only shown here. Copy it to a password manager before deploying.
            </p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <code style={{
                flex: 1, fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
                background: 'var(--nan-bg)', border: '1px solid var(--nan-bdr)',
                borderRadius: 8, padding: '8px 10px', color: 'var(--nan-text)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {values.ADMIN_SECRET}
              </code>
              <button
                onClick={() => copyKey('ADMIN_SECRET')}
                style={{
                  flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5,
                  padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
                  background: '#ef4444', border: 'none', color: '#fff',
                  fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
                }}>
                <Copy size={11} />
                {copied === 'ADMIN_SECRET' ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
