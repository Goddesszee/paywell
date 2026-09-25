import React, { useState } from 'react'
import { Wallet, Bot, Shield, HelpCircle, ExternalLink, ChevronRight, LogOut, Save } from 'lucide-react'
import { useAccount, useDisconnect } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { useAppStore } from '../../store/appStore'
import { formatAddress } from '../../utils/format'
import { requireChain } from '@/onchain-facts'

const ARC_TESTNET_ID = 5042002
const MONO = 'JetBrains Mono, monospace'
const SANS = 'Space Grotesk, sans-serif'

export function SettingsPage() {
  const { address, isConnected } = useAccount()
  const { disconnect } = useDisconnect()
  const { agentPermissions, setAgentPermissions, setOnboarding, setActiveView } = useAppStore()
  const chain = requireChain(ARC_TESTNET_ID)

  const [editingLimits, setEditingLimits] = useState(false)
  const [daily, setDaily] = useState(String(agentPermissions.dailyLimit))
  const [perTx, setPerTx] = useState(String(agentPermissions.perTxLimit))
  const [saved, setSaved] = useState(false)

  const saveLimits = () => {
    setAgentPermissions({
      dailyLimit: parseFloat(daily) || agentPermissions.dailyLimit,
      perTxLimit: parseFloat(perTx) || agentPermissions.perTxLimit,
    })
    setEditingLimits(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleReset = () => {
    if (window.confirm('Reset onboarding? This will take you back to the welcome screen.')) {
      setOnboarding({ completed: false, step: 0 })
      setActiveView('landing')
    }
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6 pb-28 lg:pb-8 space-y-6">
      <h1 className="text-xl font-bold text-[#0D0D0D]" style={{ fontFamily: SANS }}>
        Settings
      </h1>

      {!isConnected && (
        <Card padding="md">
          <p className="text-sm text-[#6B6B6B] mb-3">Connect a wallet to use Paywell.</p>
          <ConnectKitButton />
        </Card>
      )}

      {/* Wallet section */}
      <div>
        <p className="text-xs font-bold text-[#A0A0A0] uppercase tracking-wider mb-2 px-1">Wallet</p>
        <Card padding="none">
          <div className="px-4 py-3.5 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#F5F5F5] flex items-center justify-center flex-shrink-0">
              <Wallet size={17} className="text-[#0D0D0D]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-[#0D0D0D]">Connected wallet</div>
              <div className="text-xs text-[#6B6B6B] font-mono truncate">
                {isConnected ? formatAddress(address!) : 'Not connected'}
              </div>
            </div>
            {isConnected
              ? <Badge variant="success" size="sm">Connected</Badge>
              : null}
          </div>
          <div className="px-4 py-3.5 flex items-center gap-3 border-t border-black/5">
            <div className="w-8 h-8 rounded-lg bg-[#F5F5F5] flex items-center justify-center flex-shrink-0">
              <Shield size={17} className="text-[#0D0D0D]" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold text-[#0D0D0D]">Network</div>
              <div className="text-xs text-[#6B6B6B]">{chain.name}</div>
            </div>
            <Badge variant="default" size="sm">Testnet</Badge>
          </div>
        </Card>
      </div>

      {/* Agent limits — editable */}
      <div>
        <div className="flex items-center justify-between mb-2 px-1">
          <p className="text-xs font-bold text-[#A0A0A0] uppercase tracking-wider">Agent Limits</p>
          {!editingLimits ? (
            <button
              onClick={() => setEditingLimits(true)}
              className="text-xs font-semibold text-[#0D0D0D] underline underline-offset-2"
            >Edit</button>
          ) : (
            <button
              onClick={saveLimits}
              className="flex items-center gap-1 text-xs font-semibold text-[#0D0D0D]"
            >
              <Save size={12} /> Save
            </button>
          )}
        </div>
        <Card padding="none">
          <div className="px-4 py-3.5 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#F5F5F5] flex items-center justify-center flex-shrink-0">
              <Bot size={17} className="text-[#0D0D0D]" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold text-[#0D0D0D]">Daily spending limit</div>
              {editingLimits ? (
                <input
                  type="number"
                  value={daily}
                  onChange={e => setDaily(e.target.value)}
                  className="mt-1 w-full border border-black/10 rounded-lg px-3 py-1.5 text-sm font-mono text-[#0D0D0D] bg-white outline-none focus:border-black/30"
                  placeholder="USDC amount"
                />
              ) : (
                <div className="text-xs text-[#6B6B6B] font-mono">{agentPermissions.dailyLimit} USDC/day</div>
              )}
            </div>
          </div>
          <div className="px-4 py-3.5 flex items-center gap-3 border-t border-black/5">
            <div className="w-8 h-8 rounded-lg bg-[#F5F5F5] flex items-center justify-center flex-shrink-0">
              <Shield size={17} className="text-[#0D0D0D]" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold text-[#0D0D0D]">Per-transaction limit</div>
              {editingLimits ? (
                <input
                  type="number"
                  value={perTx}
                  onChange={e => setPerTx(e.target.value)}
                  className="mt-1 w-full border border-black/10 rounded-lg px-3 py-1.5 text-sm font-mono text-[#0D0D0D] bg-white outline-none focus:border-black/30"
                  placeholder="USDC amount"
                />
              ) : (
                <div className="text-xs text-[#6B6B6B] font-mono">{agentPermissions.perTxLimit} USDC/tx</div>
              )}
            </div>
          </div>
          {saved && (
            <div className="px-4 py-2 bg-[#F0FDF4] text-[#1a8047] text-xs font-semibold text-center border-t border-black/5">
              ✓ Limits saved
            </div>
          )}
        </Card>
      </div>

      {/* Support */}
      <div>
        <p className="text-xs font-bold text-[#A0A0A0] uppercase tracking-wider mb-2 px-1">Support</p>
        <Card padding="none">
          {[
            { icon: <HelpCircle size={17} />, label: 'Arc documentation', value: 'docs.arc.io', url: 'https://docs.arc.io' },
            { icon: <ExternalLink size={17} />, label: 'Arc Testnet explorer', value: chain.explorerBase, url: chain.explorerBase },
          ].map((item, idx) => (
            <button
              key={idx}
              onClick={() => window.open(item.url, '_blank')}
              className={`w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-[#F9F9F9] transition-colors ${idx > 0 ? 'border-t border-black/5' : ''}`}
            >
              <div className="w-8 h-8 rounded-lg bg-[#F5F5F5] flex items-center justify-center flex-shrink-0 text-[#6B6B6B]">
                {item.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-[#0D0D0D]">{item.label}</div>
                <div className="text-xs text-[#6B6B6B] truncate">{item.value}</div>
              </div>
              <ChevronRight size={15} className="text-[#A0A0A0]" />
            </button>
          ))}
        </Card>
      </div>

      {/* Account */}
      <div>
        <p className="text-xs font-bold text-[#A0A0A0] uppercase tracking-wider mb-2 px-1">Account</p>
        <Card padding="none">
          {isConnected && (
            <button
              onClick={() => disconnect()}
              className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-[#FEF2F2] transition-colors text-left"
            >
              <div className="w-8 h-8 rounded-lg bg-[#FEE2E2] flex items-center justify-center flex-shrink-0">
                <LogOut size={17} className="text-[#DC2626]" />
              </div>
              <span className="text-sm font-semibold text-[#DC2626]">Disconnect wallet</span>
            </button>
          )}
          <button
            onClick={handleReset}
            className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-[#F9F9F9] transition-colors border-t border-black/5 text-left"
          >
            <div className="w-8 h-8 rounded-lg bg-[#F5F5F5] flex items-center justify-center flex-shrink-0">
              <LogOut size={17} className="text-[#6B6B6B]" />
            </div>
            <span className="text-sm font-semibold text-[#334155]">Reset onboarding</span>
          </button>
        </Card>
      </div>

      <p className="text-center text-xs text-[#A0A0A0]" style={{ fontFamily: MONO }}>
        Paywell · Arc Testnet · Powered by Circle USDC
      </p>
    </div>
  )
}
