import { Layers, RefreshCw } from 'lucide-react'
import { useAccount, useReadContract } from 'wagmi'
import { erc20Abi } from 'viem'
import { getUsdc } from '@/onchain-facts'
import { Amount, usdcDecimalsFor } from '@/onchain-money'

const F = "'Inter', -apple-system, sans-serif"
const BLACK = '#0D0D0D'
const WHITE = '#FFFFFF'
const SURFACE = '#F7F7F8'
const BORDER = 'rgba(0,0,0,0.08)'
const TEXT2 = '#5C5C6B'
const TEXT3 = '#9898A6'

const ARC_TESTNET_ID = 5042002

export function GatewayPage() {
  const { address } = useAccount()
  const usdcFact = getUsdc(ARC_TESTNET_ID)

  const { data: rawBalance, isLoading, refetch } = useReadContract({
    address: usdcFact?.address as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address as `0x${string}`] : undefined,
    chainId: ARC_TESTNET_ID,
    query: { enabled: !!address && !!usdcFact },
  })

  const balance = rawBalance !== undefined
    ? Amount.fromRaw(rawBalance, usdcDecimalsFor(ARC_TESTNET_ID)).toFixed(2)
    : null

  return (
    <div style={{ fontFamily: F, maxWidth: 520, margin: '0 auto', padding: '0 0 88px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 0 20px' }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: BLACK, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Layers size={18} color={WHITE} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: BLACK, letterSpacing: '-0.02em' }}>Gateway</div>
          <div style={{ fontSize: 12, color: TEXT2 }}>Unified USDC balance · Arc Testnet</div>
        </div>
        <button
          onClick={() => { void refetch() }}
          style={{ width: 36, height: 36, borderRadius: 10, background: SURFACE, border: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          aria-label="Refresh balance"
        >
          <RefreshCw size={15} color={TEXT2} />
        </button>
      </div>

      {/* Balance card */}
      <div style={{ background: BLACK, borderRadius: 20, padding: '28px 24px', color: WHITE, marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 10, fontFamily: 'JetBrains Mono, Menlo, monospace' }}>
          Gateway Balance
        </div>
        {!address ? (
          <div style={{ fontSize: 32, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '-1px', fontFamily: 'JetBrains Mono, Menlo, monospace' }}>
            —
          </div>
        ) : isLoading ? (
          <div style={{ height: 44, width: 160, background: 'rgba(255,255,255,0.08)', borderRadius: 10 }} />
        ) : (
          <div style={{ fontSize: 40, fontWeight: 700, color: WHITE, letterSpacing: '-1.5px', fontFamily: 'JetBrains Mono, Menlo, monospace' }}>
            {balance ?? '0.00'} <span style={{ fontSize: 18, color: 'rgba(255,255,255,0.45)' }}>USDC</span>
          </div>
        )}
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
          {address
            ? `${address.slice(0, 8)}...${address.slice(-6)} · Arc Testnet`
            : 'Connect a wallet to view your balance'}
        </div>
      </div>

      {/* Not connected */}
      {!address && (
        <div style={{ textAlign: 'center', padding: '32px 0', color: TEXT3 }}>
          <Layers size={28} color={TEXT3} style={{ margin: '0 auto 10px' }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: BLACK }}>Connect your wallet</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Connect to view your Gateway USDC balance</div>
        </div>
      )}

      {/* Powered by line */}
      <div style={{ textAlign: 'center', fontSize: 11, color: TEXT3, marginTop: 8 }}>
        Powered by Circle Gateway · Built on Arc
      </div>
    </div>
  )
}
