# NAN / Paywell — Full Feature Audit
*Date: October 2026 | All Circle starter kits checked*

---

## Circle Kits in Use

| Kit / SDK | Package | Version | Status |
|---|---|---|---|
| App Kit (swap + bridge) | `@circle-fin/app-kit` | 1.15.1 | ✅ Wired, all 3 login paths |
| Adapter: viem v2 | `@circle-fin/adapter-viem-v2` | 1.18.0 | ✅ Wagmi path |
| Adapter: Circle Wallets | `@circle-fin/adapter-circle-wallets` | 1.8.1 | ✅ UCW + dev-controlled server paths |
| Modular Wallets Core | `@circle-fin/modular-wallets-core` | 1.0.16 | ✅ Passkey login, send, swap, bridge, gateway |
| W3S Web SDK | `@circle-fin/w3s-pw-web-sdk` | 1.1.11 | ✅ UCW email/Google PIN popup |
| User-Controlled Wallets | `@circle-fin/user-controlled-wallets` | 10.8.0 | ✅ Login, send, swap, bridge, gateway |
| Developer-Controlled Wallets | `@circle-fin/developer-controlled-wallets` | 10.8.1 | ✅ Agent wallet, server-side AppKit |
| Smart Contract Platform | `@circle-fin/smart-contract-platform` | 10.8.0 | ✅ Available (used selectively) |
| x402 batching | `@circle-fin/x402-batching` | ^3.5.0 | ✅ Agent marketplace nanopayments |

All applicable Circle kits are integrated.

---

## Feature Status

### AI Chat (`/agent` → Chat tab)
- **Backend (Vercel `api/chat.ts`):** Full NAN Agent — OpenAI GPT-4o-mini (primary) → Groq LLaMA 3.3 70B (fallback) → static fallback. Intent classification, live data (CoinGecko, FX, GitHub, Perplexity), marketplace discovery, `nan-action` blocks for navigation/send/swap/bridge/recurring/policy.
- **Backend (Railway `server/index.ts`):** Simple `groqChat` with llama-3.1-8b-instant — no action system, no intent classification, no marketplace. **Degraded vs Vercel.** Acceptable for dev; Vercel handles production.
- **Frontend:** `AgentPage.tsx` has full chat UI, action card rendering (swap/bridge/send/navigate), agent wallet tab, service discovery, network tab, policy, execution log.
- **Status:** ✅ Working on Vercel. ⚠️ Railway chat lacks action system (dev only).

### Send USDC (`/wallet` → Send)
- Wagmi: `useWriteContract` → ERC-20 `transfer` → `useWaitForTransactionReceipt`. ✅
- Circle UCW (email/Google): `useCircleTransaction.sendTransfer` → `create-transfer` action → W3S PIN popup → `poll-tx`. ✅
- Passkey: `sendFromPasskeyWallet` → bundler `sendUserOperation`. ✅
- All 3 paths confirmed wired. Receipt download + share on success. ✅

### Swap (`/swap`)
- Wagmi: `AppKit.estimateSwap` + `AppKit.swap` with viem adapter, slippage config, fee display. ✅
- Circle UCW: `ucw-swap-estimate` → `ucw-swap-start` (onChallenge) → W3S PIN popup → `ucw-swap-confirm` (polls). ✅ (Vercel only before this session; **now fixed for Railway too**.)
- Passkey: `getPasskeyAdapter` → `AppKit.swap` client-side. ✅
- Token registry: USDC, EURC, cirBTC on Arc Testnet. Tokens not on Arc (USDT, DAI, etc.) shown but flagged. ✅
- USDC↔NATIVE same-asset guard. ✅

### Bridge (`/bridge`)
- Wagmi: `AppKit.bridge` with viem adapter + Orbit forwarder (`useForwarder: true`). CCTP V2 fast. ✅
- Circle UCW: `ucw-bridge-start` (onChallenge) → W3S PIN popup → `ucw-bridge-confirm`. ✅ (Vercel only before this session; **now fixed for Railway too**.)
- Passkey: `getPasskeyAdapter` → `AppKit.bridge` client-side. ✅
- 11 chains listed; Linea and chains without CCTP domain are disabled. Live CCTP fee fetched from Circle API. ✅

### Gateway (`/gateway`)
- Balance: fetches from `https://gateway-api-testnet.circle.com/v1/balances` summing all domains. ✅
- Deposit (wagmi): approve ERC-20 → `GatewayWallet.deposit(token, amount)`. ✅
- Deposit (passkey): batched userOp (approve + deposit in one biometric prompt). ✅
- Deposit (UCW/W3S): `useCircleTransaction.executeContract` for approve then deposit. ✅
- Transfer (wagmi): EIP-712 BurnIntent → Gateway API `POST /v1/transfer` → poll attestation → `gatewayMint` on dest chain. ✅
- Transfer (passkey): `account.signTypedData` (ERC-1271, `contractSigner: true`) → same flow. ✅
- Transfer (UCW/W3S): `circleTx.signMessage` → same flow. ✅
- Gateway addresses loaded from `onchain-facts` (canonical). ✅
- **Bug fixed this session:** `fetchArcBlockNumber` was calling `https://rpc.arc-testnet.circle.com` (stale/incorrect). Fixed to `https://rpc.testnet.arc.io`.

### Payment Request + Escrow (`/payment-request`)
- `PaywellEscrow` deployed at `0x1d33876fa77b0d0026f8cee30448941c0cf075cb`. ✅

### Recurring Payments
- `RecurringPage.tsx`: manual/daily/weekly/monthly USDC transfers from all 3 wallet types. Passkey bug fixed in previous session (`VITE_CIRCLE_CLIENT_KEY` → `VITE_CLIENT_KEY`). ✅

### Onramp (Buy)
- `OnrampPage.tsx` + `api/onramp-session.ts` (Vercel) + server route. Circle Onramp Kit session. Requires `KIT_KEY` / configured app. ✅ (depends on env vars being set)

### Faucet
- `FaucetPage.tsx` calls `api/faucet.ts`. ✅

### Activity / History
- `ActivityPage.tsx` reads from appStore (local). ✅

---

## Bugs Fixed This Session

| # | File | Bug | Fix |
|---|---|---|---|
| 1 | `GatewayPage.tsx:137` | `fetchArcBlockNumber` used stale RPC URL `https://rpc.arc-testnet.circle.com` — Gateway Transfer tab's block height call would fail (ERR_NAME_NOT_RESOLVED or wrong chain) | Changed to `https://rpc.testnet.arc.io` |
| 2 | `server/index.ts` | `ucw-swap-estimate`, `ucw-swap-start`, `ucw-swap-confirm`, `ucw-bridge-start`, `ucw-bridge-confirm` were missing from Railway Express server — Circle UCW users (email/Google login) would get "Unknown action" errors on swap and bridge | Added all 5 actions to `handleWalletAction`, mirroring `api/wallet.ts` |

---

## Required Env Vars (Vercel + Railway)

| Var | Used by | Status |
|---|---|---|
| `VITE_CLIENT_KEY` | Passkey login, swap, bridge, gateway | Must be set on Vercel |
| `VITE_CLIENT_URL` | Passkey SDK URL | Fixed value in code |
| `VITE_CIRCLE_APP_ID` | UCW W3S PIN popup (swap, bridge, gateway) | Must be set on Vercel |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth redirect | Must be set on Vercel |
| `CIRCLE_USER_CONTROLLED_API_KEY` or `CIRCLE_API_KEY` | All UCW operations | Must be set on Railway + Vercel |
| `CIRCLE_ENTITY_SECRET` | Developer-controlled wallets, AppKit server | Must be set on Railway |
| `CIRCLE_DEVELOPER_CONTROLLED_API_KEY` | Developer-controlled wallets, AppKit server | Must be set on Railway |
| `GROQ_API_KEY` | AI chat (Railway primary, Vercel fallback) | Set on Vercel |
| `OPENAI_API_KEY` | AI chat (Vercel primary) | Should be set on Vercel |
| `KV_REST_API_URL` + `KV_REST_API_TOKEN` | Redis session store (Upstash) | Set via Vercel Redis integration |

---

## Pre-existing Lint Warnings (not errors, not blocking)

- `ActivityPage.tsx:95` — `buildReceiptHtml` declared but not called (dead code)
- `ExportsPage.tsx:385` — `periodStr` declared but not used in `buildStatementHtml`
