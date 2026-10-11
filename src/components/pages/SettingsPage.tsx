import React, { useState } from 'react'
import { Wallet, Bot, Shield, HelpCircle, ExternalLink, ChevronRight, LogOut, Save } from 'lucide-react'
import { useAccount } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { useAppStore } from '../../store/appStore'
import { formatAddress } from '../../utils/format'
import { requireChain } from '@/onchain-facts'
import { Badge } from '../ui/Badge'

const ARC  = 5042002
const MONO = "'JetBrains Mono', Menlo, monospace"
const F    = "'Inter', -apple-system, sans-serif"
const SURF = 'var(--nan-surface)'
const SURF2= 'var(--nan-surface2)'
const BDR  = 'var(--nan-bdr)'
const TEXT = 'var(--nan-text)'
const T2   = 'var(--nan-text2)'
const T3   = 'var(--nan-text3)'
const BLUE = '#0066FF'
const RED  = '#FF3B3B'

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize:11, fontWeight:600, color:T3, textTransform:'uppercase', letterSpacing:'0.07em', padding:'20px 0 8px' }}>
      {children}
    </div>
  )
}

function CardBlock({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background:SURF, border:`1px solid ${BDR}`, borderRadius:14, overflow:'hidden' }}>
      {children}
    </div>
  )
}

function RowItem({
  icon, label, sub, right, onClick, danger = false, noBorder = false,
}: {
  icon: React.ReactNode; label: string; sub?: string; right?: React.ReactNode;
  onClick?: () => void; danger?: boolean; noBorder?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display:'flex', alignItems:'center', gap:12,
        padding:'13px 16px',
        borderBottom: noBorder ? 'none' : `1px solid ${BDR}`,
        cursor: onClick ? 'pointer' : 'default',
        transition: onClick ? 'background 0.12s' : 'none',
      }}
      onMouseEnter={e => { if (onClick) (e.currentTarget).style.background = 'var(--nan-surface2)' }}
      onMouseLeave={e => { if (onClick) (e.currentTarget).style.background = 'transparent' }}
    >
      <div style={{ width:32, height:32, borderRadius:8, background:danger?'rgba(255,59,59,0.10)':SURF2, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
        {React.cloneElement(icon as React.ReactElement, { size:16, color: danger ? RED : T2 })}
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:14, fontWeight:600, color: danger ? RED : TEXT }}>{label}</div>
        {sub && <div style={{ fontSize:12, color:T3, marginTop:1, fontFamily:MONO }}>{sub}</div>}
      </div>
      {right && <div style={{ flexShrink:0 }}>{right}</div>}
      {onClick && !right && <ChevronRight size={14} color={T3} />}
    </div>
  )
}

export function SettingsPage() {
  const { address: wagmiAddress, isConnected: wagmiConnected } = useAccount()
  const { agentPermissions, setAgentPermissions, setOnboarding, setActiveView, auth, mainWalletAddress } = useAppStore()
  // Email / Google / passkey users have a Circle wallet instead of a browser-wallet connection
  const nanWallet = auth?.circleWalletAddress || auth?.walletAddress || mainWalletAddress || ''
  const signedIn = Boolean(nanWallet || auth?.userToken || auth?.isPasskeyUser)
  const address = wagmiAddress ?? (nanWallet as `0x${string}` | '')
  const isConnected = wagmiConnected || signedIn
  const chain = requireChain(ARC)
  const [editingLimits, setEditingLimits] = useState(false)
  const [daily, setDaily] = useState(String(agentPermissions.dailyLimit))
  const [perTx, setPerTx] = useState(String(agentPermissions.perTxLimit))
  const [saved, setSaved] = useState(false)

  const saveLimits = () => {
    setAgentPermissions({ dailyLimit:parseFloat(daily)||agentPermissions.dailyLimit, perTxLimit:parseFloat(perTx)||agentPermissions.perTxLimit })
    setEditingLimits(false); setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleReset = () => {
    if (window.confirm('Reset onboarding? This will take you back to the welcome screen.')) {
      setOnboarding({ completed:false, step:0 }); setActiveView('landing')
    }
  }

  return (
    <div style={{ width: '100%', minHeight: '100%', fontFamily:F, paddingBottom:80 }}>
      <h1 style={{ fontSize:22, fontWeight:700, letterSpacing:'-0.025em', color:TEXT, marginBottom:2 }}>Settings</h1>
      <p style={{ fontSize:13, color:T3, marginBottom:16 }}>NAN · Arc Testnet · Circle USDC</p>

      {!isConnected && (
        <div style={{ background:SURF, border:`1px solid ${BDR}`, borderRadius:14, padding:'16px', marginTop:16 }}>
          <p style={{ fontSize:13, color:T2, marginBottom:12 }}>Connect a wallet to use NAN.</p>
          <ConnectKitButton />
        </div>
      )}

      <SectionLabel>Wallet</SectionLabel>
      <CardBlock>
        <RowItem
          icon={<Wallet />}
          label={wagmiConnected ? 'Connected wallet' : 'NAN wallet'}
          sub={isConnected ? (address ? formatAddress(address) : (auth?.email ?? 'Signed in')) : 'Not connected'}
          right={isConnected ? <Badge variant="success" size="sm">{wagmiConnected ? 'Connected' : 'Signed in'}</Badge> : null}
        />
        <RowItem
          icon={<Shield />}
          label="Network"
          sub={chain.name}
          right={<Badge variant="default" size="sm">Testnet</Badge>}
          noBorder
        />
      </CardBlock>

      <SectionLabel>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span>Agent Limits</span>
          {!editingLimits ? (
            <button onClick={() => setEditingLimits(true)} style={{ fontSize:12, fontWeight:600, color:BLUE, background:'none', border:'none', cursor:'pointer', padding:'2px 6px', fontFamily:F }}>Edit</button>
          ) : (
            <button onClick={saveLimits} style={{ display:'flex', alignItems:'center', gap:4, fontSize:12, fontWeight:600, color:BLUE, background:'none', border:'none', cursor:'pointer', fontFamily:F }}>
              <Save size={12} /> Save
            </button>
          )}
        </div>
      </SectionLabel>
      <CardBlock>
        <RowItem
          icon={<Bot />}
          label="Daily spending limit"
          sub={editingLimits ? undefined : `${agentPermissions.dailyLimit} USDC/day`}
          right={editingLimits ? (
            <input type="number" value={daily} onChange={e => setDaily(e.target.value)}
              style={{ width:90, padding:'6px 10px', border:`1px solid rgba(0,102,255,0.25)`, borderRadius:8, fontSize:13, fontFamily:MONO, color:TEXT, background:SURF2, outline:'none', textAlign:'right' }}
              placeholder="USDC" />
          ) : undefined}
        />
        <RowItem
          icon={<Shield />}
          label="Per-transaction limit"
          sub={editingLimits ? undefined : `${agentPermissions.perTxLimit} USDC/tx`}
          right={editingLimits ? (
            <input type="number" value={perTx} onChange={e => setPerTx(e.target.value)}
              style={{ width:90, padding:'6px 10px', border:`1px solid rgba(0,102,255,0.25)`, borderRadius:8, fontSize:13, fontFamily:MONO, color:TEXT, background:SURF2, outline:'none', textAlign:'right' }}
              placeholder="USDC" />
          ) : undefined}
          noBorder
        />
        {saved && (
          <div style={{ padding:'10px 16px', background:'rgba(0,200,83,0.08)', borderTop:`1px solid rgba(0,200,83,0.15)`, fontSize:12, fontWeight:600, color:'#00C853', textAlign:'center' }}>
            ✓ Limits saved
          </div>
        )}
      </CardBlock>

      <SectionLabel>Resources</SectionLabel>
      <CardBlock>
        <RowItem icon={<HelpCircle />} label="Arc documentation" sub="docs.arc.io" onClick={() => window.open('https://docs.arc.io','_blank')} />
        <RowItem icon={<ExternalLink />} label="Arc Testnet explorer" sub={chain.explorerBase} onClick={() => window.open(chain.explorerBase,'_blank')} noBorder />
      </CardBlock>

      <SectionLabel>Account</SectionLabel>
      <CardBlock>
        <RowItem icon={<LogOut />} label="Reset onboarding" onClick={handleReset} noBorder />
      </CardBlock>
    </div>
  )
}
