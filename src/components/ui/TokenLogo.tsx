import React, { useState } from 'react'

// Token logo URLs from TrustWallet asset CDN (checksummed addresses)
const LOGOS: Record<string, string> = {
  USDC:  'https://assets.trustwalletapp.com/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png',
  EURC:  'https://assets.trustwalletapp.com/blockchains/ethereum/assets/0x1aBaEA1f7C830bD89Acc67eC4af516284b1bC33c/logo.png',
  USDT:  'https://assets.trustwalletapp.com/blockchains/ethereum/assets/0xdAC17F958D2ee523a2206206994597C13D831ec7/logo.png',
  PYUSD: 'https://assets.trustwalletapp.com/blockchains/ethereum/assets/0x6c3ea9036406852006290770BEdFcAbA0e23A0e8/logo.png',
  DAI:   'https://assets.trustwalletapp.com/blockchains/ethereum/assets/0x6B175474E89094C44Da98b954EedeAC495271d0F/logo.png',
  USDE:  'https://assets.trustwalletapp.com/blockchains/ethereum/assets/0x4c9EDD5852cd905f086C759E8383e09bff1E68B3/logo.png',
  WBTC:  'https://assets.trustwalletapp.com/blockchains/ethereum/assets/0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599/logo.png',
  WETH:  'https://assets.trustwalletapp.com/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
  WSOL:  'https://assets.trustwalletapp.com/blockchains/solana/info/logo.png',
  WAVAX: 'https://assets.trustwalletapp.com/blockchains/avalanchec/info/logo.png',
  WPOL:  'https://assets.trustwalletapp.com/blockchains/polygon/info/logo.png',
  NATIVE:'https://assets.trustwalletapp.com/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png',
}

// Fallback background colours per token
const COLORS: Record<string, string> = {
  USDC:  '#2775CA',
  EURC:  '#0099CC',
  USDT:  '#26A17B',
  PYUSD: '#0070BA',
  DAI:   '#F5AC37',
  USDE:  '#1A1A2E',
  WBTC:  '#F7931A',
  WETH:  '#627EEA',
  WSOL:  '#9945FF',
  WAVAX: '#E84142',
  WPOL:  '#8247E5',
  NATIVE:'#2775CA',
}

export function TokenLogo({
  symbol,
  size = 32,
  radius,
}: {
  symbol: string
  size?: number
  radius?: number
}) {
  const [failed, setFailed] = useState(false)
  const src = LOGOS[symbol.toUpperCase()]
  const bg  = COLORS[symbol.toUpperCase()] ?? '#444'
  const r   = radius ?? size * 0.35

  if (!src || failed) {
    return (
      <div style={{
        width: size, height: size, borderRadius: r, flexShrink: 0,
        background: bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.36, fontWeight: 800, color: '#fff',
        fontFamily: "'Inter',-apple-system,sans-serif",
        userSelect: 'none',
      }}>
        {symbol.slice(0, 2).toUpperCase()}
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={symbol}
      width={size}
      height={size}
      onError={() => setFailed(true)}
      style={{
        width: size, height: size, borderRadius: r,
        flexShrink: 0, objectFit: 'cover',
        display: 'block',
      }}
    />
  )
}
