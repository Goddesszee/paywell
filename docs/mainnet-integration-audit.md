# NAN Mainnet Integration Audit
**Date:** October 11, 2026  
**Scope:** All Circle integrations, chain references, and feature readiness for Arc Mainnet (chain ID 5042)

---

## Summary

| Area | Status | Notes |
|---|---|---|
| wagmi chain config | PASS | Arc mainnet (5042) + 10 mainnet chains |
| onchain-facts.ts | FIXED | Removed duplicate Arc entry with wrong isTestnet:true |
| Bridge (CCTP v2) | PASS | Mainnet chains, iris-api.circle.com, correct CCTP addresses |
| Swap (Circle Swap Kit) | PASS | Chain ID 5042, Arc mainnet token addresses |
| Gateway (Circle Gateway) | PASS | gateway-api.circle.com/v1, mainnet contract addresses |
| Onramp (Circle Kit) | PASS | api.circle.com + onramp.arc.io defaults set |
| Send / Receive (Dev-controlled wallets) | FIXED | api/wallet.ts had Blockchain.ArcTestnet → fixed to Blockchain.Arc |
| Send (User-controlled wallets) | PASS | Blockchain.Arc throughout |
| Agent wallet (Dev-controlled wallets) | PASS | Blockchain.Arc throughout |
| CCTP contracts in onchain-facts | PASS | Mainnet TokenMessengerV2, MessageTransmitterV2, TokenMinterV2, MessageV2 |
| Gateway contracts in onchain-facts | PASS | Mainnet GatewayWallet + GatewayMinter addresses |
| USDC addresses | PASS | 0x3600...0000 on Arc, correct mainnet addresses on all other chains |
| USDC tokenId (Circle internal) | PASS | f26e2fc3-3fc5-5b11-8fc8-0a5a9a71ad7a (Arc, same on mainnet) |
| Explorer URLs | PASS | explorer.arc.io for Arc, correct mainnet explorers for all chains |
| Fee collection | PASS | VITE_FEE_WALLET env var; onramp 1%, swap 0.3%, bridge 0.3% |
| AI chat nanopayments (x402) | READY | Activates when SELLER_ADDRESS is set in .env |
| NAN Name Registry | STAGED | Contract ready; deploy to Arc Mainnet + set VITE_NAME_REGISTRY |
| PaywellEscrow | STAGED | Contract ready; deploy to Arc Mainnet + update env vars |

---

## Feature-by-Feature Status

### Bridge (CCTP v2)
- **API:** `https://iris-api.circle.com/v2/burn/USDC/fees` — mainnet
- **CCTP TokenMessengerV2:** `0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d` — mainnet
- **Chains:** Arc, Ethereum, Base, Arbitrum One, OP Mainnet, Polygon, Avalanche, Unichain, Linea, Sei, World Chain
- **cctpDomain values:** Arc=26, ETH=0, AVA=1, OP=2, ARB=3, SOL=5, Base=6, POL=7, UNI=10, Sei=16, World=14
- **Status: READY** — no Circle key needed; uses public CCTP endpoints

### Swap (Circle Swap Kit via App Kit)
- **Chain:** Arc mainnet (5042), CHAIN_KEY='Arc'
- **Tokens:** USDC (0x3600...), EURC (0x89B5...), cirBTC — all correct Arc mainnet addresses
- **Status: READY** — no Circle key needed; uses public Swap Kit

### Gateway (Circle Gateway)
- **API:** `https://gateway-api.circle.com/v1` — mainnet
- **GatewayWallet:** `0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE` — mainnet
- **GatewayMinter:** `0x2222222d7164433c4C09B0b0D809a9b52C04C205` — mainnet
- **Status: READY** — no Circle key needed

### Onramp (Circle Onramp Kit)
- **API base:** `https://api.circle.com` (defaulted)
- **Widget URL:** `https://onramp.arc.io` (defaulted)
- **Key:** `CIRCLE_STABLECOIN_KIT_API_KEY` — must be set to production key
- **NAN fee:** 1% displayed in UI; collected post-settlement
- **Status: READY when `CIRCLE_STABLECOIN_KIT_API_KEY` is set**

### Send / Receive (Developer-controlled wallets)
- **Blockchain enum:** `Blockchain.Arc` — fixed (was ArcTestnet in api/wallet.ts)
- **Token ID:** `f26e2fc3-3fc5-5b11-8fc8-0a5a9a71ad7a` — correct for Arc USDC
- **Key:** `CIRCLE_DEVELOPER_CONTROLLED_API_KEY` + `CIRCLE_ENTITY_SECRET`
- **Status: READY when credentials are set**

### AI Agent + Chat
- **AI model:** GROQ (Llama) via `GROQ_API_KEY`
- **x402 nanopayment gate:** 0.001 USDC/message when `SELLER_ADDRESS` is set
- **Status: READY when GROQ_API_KEY is set; nanopayments activate with SELLER_ADDRESS**

### NAN Names
- **Contract:** `contracts/NANNameRegistry.sol` — compiled, ready to deploy
- **Status: DEPLOY REQUIRED** — run `bun run deploy:self NANNameRegistry '["0x3600000000000000000000000000000000000000"]'` then set `VITE_NAME_REGISTRY`

### PaywellEscrow
- **Contract:** `contracts/PaywellEscrow.sol` — compiled, ready to deploy
- **Status: DEPLOY REQUIRED** (optional — UI not wired yet)

---

## Issues Found and Fixed This Session

| File | Issue | Fix |
|---|---|---|
| `api/wallet.ts:151` | `Blockchain.ArcTestnet` in user wallet creation | Changed to `Blockchain.Arc` |
| `src/onchain-facts.ts` | Duplicate Arc chain ID 5042 entry with `isTestnet: true` | Removed stale entry; added `scpBlockchain: "ARC"` to correct entry |
| `server/index.ts:737` | Comment said "testnet USDC" token ID | Updated comment to "mainnet and testnet share same ID" |
| `api/circle-services.ts:51` | Comment said "Arc => SANDBOX key" | Updated to reference production key |

---

## Environment Variables Required for Launch

```
# Circle Developer-Controlled Wallets (send, receive, agent wallet)
CIRCLE_DEVELOPER_CONTROLLED_API_KEY=your_mainnet_key
CIRCLE_ENTITY_SECRET=your_entity_secret

# Circle Onramp (Buy USDC)
CIRCLE_STABLECOIN_KIT_API_KEY=your_production_kit_key

# AI Chat
GROQ_API_KEY=your_groq_key

# Fee collection
VITE_FEE_WALLET=0xYOUR_WALLET        # swap + bridge fees
SELLER_ADDRESS=0xYOUR_WALLET          # AI chat nanopayments (0.001 USDC/msg)

# After deploying contracts:
VITE_NAME_REGISTRY=0xDEPLOYED_ADDRESS
```

---

## CCTP Domain Reference (Arc Mainnet)

| Chain | Domain |
|---|---|
| Ethereum | 0 |
| Avalanche | 1 |
| OP Mainnet | 2 |
| Arbitrum One | 3 |
| Base | 6 |
| Polygon | 7 |
| Unichain | 10 |
| Sei | 16 |
| World Chain | 14 |
| Arc | 26 |
