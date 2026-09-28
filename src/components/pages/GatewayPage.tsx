import React, { useState } from 'react'
import { Layers, ArrowDownToLine, ArrowUpFromLine, Info, ExternalLink, Zap, Shield, Coins } from 'lucide-react'

const F = "'Inter', -apple-system, sans-serif"
const BLACK = '#0D0D0D'
const WHITE = '#FFFFFF'
const SURFACE = '#F7F7F8'
const BORDER = 'rgba(0,0,0,0.08)'
const TEXT2 = '#5C5C6B'
const TEXT3 = '#9898A6'

// Gateway supported chains per Circle docs (testnet)
const GATEWAY_CHAINS = [
  { id: 'Arc_Testnet',      label: 'Arc Testnet',      usdc: true  },
  { id: 'Ethereum_Sepolia', label: 'Ethereum Sepolia', usdc: true  },
  { id: 'Base_Sepolia',     label: 'Base Sepolia',     usdc: true  },
  { id: 'Arbitrum_Sepolia', label: 'Arbitrum Sepolia', usdc: true  },
  { id: 'Optimism_Sepolia', label: 'OP Sepolia',       usdc: true  },
  { id: 'Polygon_Amoy',     label: 'Polygon Amoy',     usdc: true  },
  { id: 'Avalanche_Fuji',   label: 'Avalanche Fuji',   usdc: true  },
  { id: 'Unichain_Sepolia', label: 'Unichain Sepolia', usdc: true  },
  { id: 'Solana_Devnet',    label: 'Solana Devnet',    usdc: true  },
]

type GatewayTab = 'overview' | 'deposit' | 'withdraw'

export function GatewayPage() {
  const [tab, setTab] = useState<GatewayTab>('overview')
  const [fromChain, setFromChain] = useState(0)
  const [toChain, setToChain] = useState(1)
  const [amount, setAmount] = useState('')

  return (
    <div style={{ fontFamily: F, maxWidth: 520, margin: '0 auto', padding: '0 0 88px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 0 16px' }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: BLACK, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Layers size={18} color={WHITE} />
        </div>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, color: BLACK, letterSpacing: '-0.02em' }}>Gateway</div>
          <div style={{ fontSize: 12, color: TEXT2 }}>Unified USDC balance across chains</div>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', background: SURFACE, borderRadius: 12, padding: 3, marginBottom: 16, gap: 2 }}>
        {(['overview', 'deposit', 'withdraw'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: '7px 4px', border: 'none', borderRadius: 9, cursor: 'pointer',
            fontFamily: F, fontSize: 13, fontWeight: tab === t ? 700 : 500,
            background: tab === t ? WHITE : 'transparent',
            color: BLACK,
            boxShadow: tab === t ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
            transition: 'all 0.15s', textTransform: 'capitalize',
          }}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'overview' && <GatewayOverview />}
      {tab === 'deposit' && (
        <GatewayTransferForm
          title="Deposit to Gateway"
          subtitle="Deposit USDC from any chain into your unified Gateway balance"
          actionLabel="Deposit"
          Icon={ArrowDownToLine}
          chains={GATEWAY_CHAINS}
          fromIdx={fromChain}
          setFromIdx={setFromChain}
          toIdx={toChain}
          setToIdx={setToChain}
          amount={amount}
          setAmount={setAmount}
          mode="deposit"
        />
      )}
      {tab === 'withdraw' && (
        <GatewayTransferForm
          title="Withdraw from Gateway"
          subtitle="Withdraw USDC from your Gateway balance to any supported chain"
          actionLabel="Withdraw"
          Icon={ArrowUpFromLine}
          chains={GATEWAY_CHAINS}
          fromIdx={fromChain}
          setFromIdx={setFromChain}
          toIdx={toChain}
          setToIdx={setToChain}
          amount={amount}
          setAmount={setAmount}
          mode="withdraw"
        />
      )}
    </div>
  )
}

function GatewayOverview() {
  const features = [
    { icon: <Zap size={16} color={BLACK} />, title: 'Sub-500ms transfers', desc: 'Instant cross-chain USDC movement — faster than CCTP Fast Transfer.' },
    { icon: <Layers size={16} color={BLACK} />, title: 'Unified balance', desc: 'One USDC balance accessible from any supported chain. No per-chain fragmentation.' },
    { icon: <Coins size={16} color={BLACK} />, title: 'USDC-only fees', desc: 'All transfer fees deducted in USDC. No native gas token required on supported chains.' },
    { icon: <Shield size={16} color={BLACK} />, title: 'Trustless withdrawal', desc: '7-day trustless withdrawal path available. Gateway Minter and Wallet contracts are permissionless.' },
  ]

  const feeRows = [
    { label: 'Cross-chain transfer', value: '0.005% (0.5 bps)' },
    { label: 'Gas fee (Arc)', value: '~$0.001 USDC' },
    { label: 'Gas fee (Ethereum)', value: '~$0.50–$1.00 USDC' },
    { label: 'Forwarding service', value: '$0.05 / transfer' },
    { label: 'Same-chain withdrawal', value: 'No transfer fee' },
  ]

  const chains = ['Arc Testnet', 'Ethereum Sepolia', 'Base Sepolia', 'Arbitrum Sepolia', 'OP Sepolia', 'Polygon Amoy', 'Avalanche Fuji', 'Unichain Sepolia', 'Solana Devnet']

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Hero card */}
      <div style={{ background: BLACK, borderRadius: 16, padding: 20, color: WHITE }}>
        <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 8 }}>Circle Gateway</div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6, marginBottom: 16 }}>
          Gateway lets you hold a single unified USDC balance across 9+ chains and transfer it instantly (&lt;500ms) — without bridging delays or CCTP attestation waits.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <StatCard label="Transfer speed" value="<500ms" />
          <StatCard label="Transfer fee" value="0.5 bps" />
          <StatCard label="Supported chains" value="9+" />
          <StatCard label="Withdrawal" value="7-day trustless" />
        </div>
      </div>

      {/* Features */}
      <div style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: BLACK }}>How it works</div>
        {features.map((f, i) => (
          <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: SURFACE, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {f.icon}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: BLACK }}>{f.title}</div>
              <div style={{ fontSize: 12, color: TEXT2, marginTop: 2, lineHeight: 1.5 }}>{f.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Fee table */}
      <div style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: BLACK, marginBottom: 10 }}>Fee schedule</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {feeRows.map((row, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: i < feeRows.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
              <span style={{ fontSize: 12, color: TEXT2 }}>{row.label}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: BLACK }}>{row.value}</span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: TEXT3, marginTop: 8, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
          <Info size={11} color={TEXT3} style={{ flexShrink: 0, marginTop: 1 }} />
          Gas fees are deducted from your USDC balance — no native token required on most chains.
        </div>
      </div>

      {/* Supported chains */}
      <div style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: BLACK, marginBottom: 10 }}>Supported chains (testnet)</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {chains.map(c => (
            <span key={c} style={{ fontSize: 11, fontWeight: 500, color: TEXT2, background: SURFACE, padding: '4px 10px', borderRadius: 20, border: `1px solid ${BORDER}` }}>{c}</span>
          ))}
        </div>
      </div>

      {/* Notice */}
      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '12px 14px', display: 'flex', gap: 10 }}>
        <Info size={14} color={TEXT2} style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: 12, color: TEXT2, lineHeight: 1.5 }}>
          Gateway integration uses Circle's Unified Balance Kit. To use deposit and withdraw, connect your wallet.{' '}
          <a href="https://developers.circle.com/gateway" target="_blank" rel="noreferrer" style={{ color: BLACK, fontWeight: 600, textDecoration: 'underline' }}>
            Read the docs <ExternalLink size={10} style={{ display: 'inline', verticalAlign: 'middle' }} />
          </a>
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: WHITE }}>{value}</div>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>{label}</div>
    </div>
  )
}

function GatewayTransferForm({
  title, subtitle, actionLabel, Icon, chains, fromIdx, setFromIdx, toIdx, setToIdx, amount, setAmount, mode
}: {
  title: string; subtitle: string; actionLabel: string; Icon: React.ElementType
  chains: typeof GATEWAY_CHAINS; fromIdx: number; setFromIdx: (n: number) => void
  toIdx: number; setToIdx: (n: number) => void; amount: string; setAmount: (s: string) => void
  mode: 'deposit' | 'withdraw'
}) {
  const fee = amount && parseFloat(amount) > 0 ? (parseFloat(amount) * 0.00005).toFixed(6) : '0.000000'
  const net = amount && parseFloat(amount) > 0 ? (parseFloat(amount) - parseFloat(fee)).toFixed(4) : '0.0000'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0 8px' }}>
        <div style={{ width: 32, height: 32, borderRadius: 9, background: SURFACE, border: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={16} color={BLACK} />
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: BLACK }}>{title}</div>
          <div style={{ fontSize: 11, color: TEXT2 }}>{subtitle}</div>
        </div>
      </div>

      {/* Chain selectors */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: TEXT2, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {mode === 'deposit' ? 'From chain' : 'Gateway → Chain'}
          </div>
          <select value={fromIdx} onChange={e => { const v = Number(e.target.value); setFromIdx(v); if (v === toIdx) setToIdx(v === 0 ? 1 : 0) }}
            style={{ width: '100%', padding: '10px 12px', border: `1px solid ${BORDER}`, borderRadius: 10, background: SURFACE, color: BLACK, fontSize: 13, fontFamily: F, appearance: 'none', cursor: 'pointer' }}>
            {chains.map((c, i) => <option key={c.id} value={i}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: TEXT2, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {mode === 'deposit' ? 'To chain' : 'Destination chain'}
          </div>
          <select value={toIdx} onChange={e => { const v = Number(e.target.value); setToIdx(v); if (v === fromIdx) setFromIdx(v === 0 ? 1 : 0) }}
            style={{ width: '100%', padding: '10px 12px', border: `1px solid ${BORDER}`, borderRadius: 10, background: SURFACE, color: BLACK, fontSize: 13, fontFamily: F, appearance: 'none', cursor: 'pointer' }}>
            {chains.map((c, i) => <option key={c.id} value={i} disabled={i === fromIdx}>{c.label}</option>)}
          </select>
        </div>
      </div>

      {/* Amount */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: TEXT2, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Amount (USDC)</div>
        <div style={{ position: 'relative' }}>
          <input type="number" min="0" step="0.01" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)}
            style={{ width: '100%', padding: '12px 56px 12px 14px', border: `1px solid ${BORDER}`, borderRadius: 10, background: WHITE, color: BLACK, fontSize: 16, fontWeight: 600, fontFamily: F, boxSizing: 'border-box', outline: 'none' }} />
          <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 13, fontWeight: 600, color: TEXT2 }}>USDC</span>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          {['1', '5', '10', '25'].map(v => (
            <button key={v} onClick={() => setAmount(v)}
              style={{ flex: 1, padding: '6px 0', border: `1px solid ${BORDER}`, borderRadius: 8, background: amount === v ? BLACK : SURFACE, color: amount === v ? WHITE : BLACK, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: F }}>
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Fee summary */}
      {parseFloat(amount) > 0 && (
        <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '12px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: TEXT3, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Summary</div>
          {[
            { label: 'You send', value: `${amount} USDC` },
            { label: 'Gateway fee (0.005%)', value: `${fee} USDC` },
            { label: 'Transfer speed', value: '<500ms' },
            { label: 'You receive (est.)', value: `${net} USDC`, bold: true },
          ].map(r => (
            <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0' }}>
              <span style={{ fontSize: 12, color: TEXT2 }}>{r.label}</span>
              <span style={{ fontSize: 13, fontWeight: r.bold ? 700 : 600, color: BLACK }}>{r.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Notice */}
      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 14px', display: 'flex', gap: 8 }}>
        <Info size={13} color={TEXT2} style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: 12, color: TEXT2, lineHeight: 1.5 }}>
          Gateway integration is ready for Circle's Unified Balance Kit. Connect your wallet and configure{' '}
          <code style={{ fontSize: 11, background: WHITE, padding: '1px 5px', borderRadius: 4, border: `1px solid ${BORDER}` }}>VITE_CIRCLE_STABLECOIN_KIT_API_KEY</code> to activate live transfers.
        </div>
      </div>

      <button disabled style={{ width: '100%', padding: '14px 0', background: BLACK, color: WHITE, border: 'none', borderRadius: 14, fontSize: 15, fontWeight: 600, cursor: 'not-allowed', fontFamily: F, opacity: parseFloat(amount) > 0 ? 1 : 0.4 }}>
        {actionLabel} {amount || '0.00'} USDC →
      </button>

      <div style={{ fontSize: 11, color: TEXT3, textAlign: 'center' }}>
        Powered by Circle Gateway · Built on Arc
      </div>
    </div>
  )
}
