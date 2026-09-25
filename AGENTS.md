# Paywell — Project Memory

## Identity
- App name: Paywell
- Tagline: The Intelligent Payment Layer
- Stack: React + TypeScript + Vite + Tailwind + wagmi + ConnectKit
- Design: Black & white, Inter font, Revolut-style

## Deployed Contracts (Arc Testnet — chain ID 5042002)
- USDC: `0x3600000000000000000000000000000000000000`
- EURC: `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a`
- PaywellEscrow: `0x1d33876fa77b0d0026f8cee30448941c0cf075cb`
  - Explorer: https://explorer.testnet.arc.io/address/0x1d33876fa77b0d0026f8cee30448941c0cf075cb
  - Constructor: USDC=0x3600..., TokenMessenger=0x8c3085..., FeeRecipient=0x5B12Ce46C7194aD57d143bC22847224047b1Ef42
  - Features: escrow purchase, confirm delivery, dispute resolution, CCTP burn+transfer, 1% fee

## Other Known Contracts (Arc Testnet)
- SWAP_CONTRACT: `0x5cE359b74BE53b1B370641571cBef157dD575c79`
- PERMIT2_ADDR: `0x000000000022D473030F116dDEE9F6B43aC78BA3`
- FXESCROW_ADDR: `0x867650F5eAe8df91445971f14d89fd84F0C9a9f8`
- LENDING_CONTRACT: `0x4CC84BbEf992439Cb01FeF2E1150B37916d1f2ce`
- NAME_REGISTRY: `0x043D072B12CBe488DBA3d2975c42Db3055F2836f`
- PAYREQ_CONTRACT: `0x1940232f42D4e2083785bC869FbAD8dd43133817`
- HISTORY_CONTRACT: `0xC64Fad1CFFDE16167d5887211066b47E1df48B4d`
- CCTP TokenMessenger: `0x8c3085D9a554884124C2f5f5c1F787a31f4dD63d`

## Live URLs
- Vercel: https://paywell-puce.vercel.app
- GitHub: https://github.com/Goddesszee/paywell

## Circle Integration Status
| Feature | Status | Env Var Needed |
|---|---|---|
| USDC onchain transfers | Live | — |
| PaywellEscrow contract | Deployed | — |
| CCTP Bridge (AppKit) | Live | — |
| Token Swap (AppKit) | Live | — |
| AI Agent Chat | Ready | GROQ_API_KEY |
| Onramp (Buy USDC) | Ready | CIRCLE_STABLECOIN_KIT_API_KEY |
| x402 micropayments | Ready | VITE_X402_SELLER_ADDRESS |
| Email OTP | Ready | SMTP_HOST/PORT/USER/PASS |
| Developer-controlled wallets | Ready | CIRCLE_DEVELOPER_CONTROLLED_API_KEY + CIRCLE_ENTITY_SECRET |

## Env Vars to Add in Vercel
```
GROQ_API_KEY=
CIRCLE_STABLECOIN_KIT_API_KEY=
VITE_X402_SELLER_ADDRESS=0xYourWalletAddress
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_USER=resend
SMTP_PASS=re_your_key
CIRCLE_DEVELOPER_CONTROLLED_API_KEY=
CIRCLE_ENTITY_SECRET=
VITE_MERCHANT_WALLET=0xYourMerchantWallet
```
