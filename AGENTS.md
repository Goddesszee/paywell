# NAN — Project Memory

## Identity
- App name: NAN (The Intelligent Payment Network)
- Tagline: Your AI-powered money app on Arc
- Stack: React + TypeScript + Vite + Tailwind + wagmi + ConnectKit + Bun/Express backend
- Design: Black / white / electric-blue (#0866F5), Inter font, mobile-first

## Live URLs
- Production: https://nanarc.xyz
- GitHub: https://github.com/Goddesszee/realnan
- Branch: main

## Deployed Contracts (Arc Mainnet — chain ID 5042)
- NANNameRegistry: `0x7b839c3bE9394b2a6baC286776f37042609f83b2`
  - Explorer: https://explorer.arc.io/address/0x7b839c3bE9394b2a6baC286776f37042609f83b2
  - Tx: 0x3405a2786dc5e82ab139a24fd9b0413741843974de373f036ead8f3e8d9559ef
  - Constructor: USDC=0x3600000000000000000000000000000000000000

## Key Addresses (Arc Mainnet)
- USDC ERC-20: `0x3600000000000000000000000000000000000000`
- Permit2: `0x000000000022D473030F116dDEE9F6B43aC78BA3`
- VITE_NAME_REGISTRY: `0x7b839c3bE9394b2a6baC286776f37042609f83b2`

## Deployed Contracts (Arc Testnet — chain ID 5042002)
- PaywellEscrow: `0x1d33876fa77b0d0026f8cee30448941c0cf075cb`
  - Explorer: https://explorer.testnet.arc.io/address/0x1d33876fa77b0d0026f8cee30448941c0cf075cb

## Circle Integration Status
| Feature | Status | Env Var Needed |
|---|---|---|
| USDC onchain transfers | Live (Arc mainnet) | CIRCLE_API_KEY (LIVE key) |
| NAN Name Registry | Live (Arc mainnet) | VITE_NAME_REGISTRY |
| CCTP Bridge (AppKit) | Live | CIRCLE_API_KEY |
| Token Swap (AppKit) | Live | CIRCLE_API_KEY |
| AI Agent Chat | Live | GROQ_API_KEY or OPENAI_API_KEY |
| Onramp (Buy USDC) | Live | CIRCLE_STABLECOIN_KIT_API_KEY |
| x402 micropayments | Ready | VITE_X402_SELLER_ADDRESS |
| Circle OTP email login | Live | CIRCLE_API_KEY + VITE_CIRCLE_APP_ID |
| Agent Wallet (UCW) | Live | CIRCLE_API_KEY + VITE_CIRCLE_APP_ID |
| Push notifications | Ready | VITE_VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY |
| Redis / KV storage | Required | KV_REST_API_URL + KV_REST_API_TOKEN |
| Recurring payments cron | Live | CRON_SECRET (Vercel cron, hourly) |

## Required Vercel Env Vars
```
CIRCLE_API_KEY=LIVE_API_KEY:...
VITE_CIRCLE_APP_ID=<from circle console>
GROQ_API_KEY=gsk_...
OPENAI_API_KEY=sk-...
CIRCLE_STABLECOIN_KIT_API_KEY=...
VITE_X402_SELLER_ADDRESS=0x...
VITE_FEE_WALLET=0x...
VITE_NAME_REGISTRY=0x7b839c3bE9394b2a6baC286776f37042609f83b2
KV_REST_API_URL=https://...upstash.io
KV_REST_API_TOKEN=...
CRON_SECRET=<random string>
VITE_VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
```

## Architecture Notes
- Vite frontend on port 5173; Bun/Express backend on port 3001
- Frontend proxied through Vite /api → localhost:3001 in dev
- Agent Wallet: UCW with refId='agent' — separate address from main NAN wallet
- Both wallets (main + agent) under same Circle user identity but different addresses
- Recurring payments: stored in Redis `rt:<wallet>`, executed hourly by Vercel Cron
- OTP rate limit: 5 per email per 10 minutes (Redis-backed)
- ErrorBoundary wraps all app pages (keyed by activeView — resets on navigation)
