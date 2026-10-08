# Paywell / NAN — Full Application Audit
**Date:** 2025-10-29  
**Scope:** All frontend pages, backend routes (Railway Express + Vercel functions), hooks, store, and contracts.

---

## 1. Overall Health

| Area | Status | Notes |
|---|---|---|
| TypeScript compile | ✅ 0 errors | `tsc --noEmit` passes |
| Lint | ✅ 0 errors | 2 pre-existing warnings (unused vars), not blocking |
| Dev server | ✅ Running | Port 5173, Vite HMR live |
| Express backend | ✅ Running | Port 3001, proxied at `/api` |
| React duplicate-instance crash | ✅ Fixed (prev session) | vite.config.ts dedupe + resolve.alias |
| Railway routing bug | ✅ Fixed (prev session) | server/index.ts — added `GET /api/wallet`, unified `handleWalletAction` |
| Stale "Netlify" comment | ✅ Fixed (this session) | server/index.ts line ~1362 now says Vercel/Railway |

---

## 2. Login Path Verification

All four login paths were verified against Circle SDK docs and source code.

### 2a. Email OTP (Circle User-Controlled Wallets — W3S SDK)
**Files:** `CircleEmailLogin.tsx`, `useCircleTransaction.ts`, `api/wallet.ts`, `server/index.ts`

Flow:
1. `POST /api/wallet { action: 'request-otp', email }` — backend calls Circle `createOtpToken`
2. `POST /api/wallet { action: 'initialize', email, otp }` — backend calls Circle `createUser` + `createUserToken` + `getUserToken`
3. `GET /api/wallet` with `x-user-token` header — returns wallet address and walletId
4. All subsequent transactions use `useCircleTransaction` (challenge → `sdk.execute` → poll)

Status: **Verified correct** — routes exist on both Vercel (`api/wallet.ts`) and Railway (`server/index.ts`). The routing fix from the previous session ensures `GET /api/wallet` exists on Railway.

**Critical env var:** `VITE_CIRCLE_APP_ID` must be set on Vercel for the W3S SDK `appSettings.appId`. This is confirmed used in:
- `useCircleTransaction.ts` line 61
- `BridgePage.tsx` line 213
- `SwapPage.tsx` line 374

### 2b. Google Social Login (Circle UCW via OAuth)
**Files:** `CircleGoogleLogin.tsx`, `server/index.ts`, `api/wallet.ts`

Flow:
1. Redirect to `/api/auth/google` → Google OAuth → callback to `/api/auth/google/callback`
2. Callback creates a session token (base64 JWT with email/name/exp)
3. Frontend receives `#google-auth=<token>` hash fragment; `CircleGoogleLogin` parses it
4. `POST /api/wallet { action: 'initialize', email }` — same flow as email OTP but without OTP step (email serves as identity)
5. Wallet creation proceeds identically to email path

Status: **Verified correct** — Railway has both `/api/auth/google` and `/api/auth/google/callback` routes. Vercel has `api/wallet.ts` handling the wallet side. The stale "Netlify" comment was fixed.

**Note:** `VITE_GOOGLE_CLIENT_ID` (Vercel env) and `GOOGLE_CLIENT_SECRET` (Railway env) must both be set for real Google OAuth. Without them, Railway falls back to a mock demo token for local dev.

### 2c. Passkey Login (Circle Modular Wallets — ERC-4337)
**Files:** `CirclePasskeyLogin.tsx`, `SwapPage.tsx`, `BridgePage.tsx`, `GatewayPage.tsx`

Flow:
1. `toWebAuthnCredential` + `toCircleSmartAccount` — creates/recovers MSCA
2. Signs transactions client-side via bundler (`sendUserOperation`) — NO server involved
3. `auth.isPasskeyUser = true` is set in store; all pages check this flag

Status: **Verified correct** — passkey path correctly bypasses all `/api/wallet` UCW routes. `VITE_CLIENT_KEY` is required and present per the summary.

**Note:** `VITE_CLIENT_URL` is set to `https://modular-sdk.circle.com/v1/rpc/w3s/buidl`. The passkey path hardcodes this same URL in several places (BridgePage, GatewayPage); they should stay in sync.

### 2d. Browser Wallet / wagmi (MetaMask, WalletConnect via ConnectKit)
**Files:** `src/config.ts`, `src/main.tsx`

Flow: Standard wagmi + ConnectKit. `useAccount()` returns address when connected. All pages fall back to `wagmiAddress` as primary address.

Status: **Verified correct** — no custom backend needed, Arc Testnet chain defined correctly in `config.ts`.

---

## 3. Page-by-Page Review

### HomePage
- Shows quick actions, balance chips, recent activity
- Reads `auth.circleWalletAddress` or `wagmiAddress` — correctly falls back
- Agent chat prefill routing (`setSwapPrefill`, `setBridgePrefill`) wired correctly

### WalletPage
- Two sub-tabs: main wallet + agent wallet
- Wagmi balance via `useReadContract` (ERC-20 USDC), passkey wallet via API
- Send flow: supports all 3 paths (wagmi, Circle UCW, passkey)
- **No issues found**

### DashboardPage
- Live USDC balance from `useReadContract` — reads Arc Testnet ERC-20 correctly
- Falls back to `auth.circleWalletAddress` for Circle users
- Sparkline computed from `activity` store — gracefully shows placeholder if empty
- **No issues found**

### SwapPage
- Supports all 3 auth paths
- `isCircleUser` path: server-side swap via `POST /api/wallet { action: 'ucw-swap-estimate' | 'ucw-swap-start' | 'ucw-swap-confirm' }`
- `isPasskeyUser` path: `getPasskeyAdapter` → `appKit.estimateSwap / swap` client-side
- Wagmi path: `createViemAdapterFromProvider` → App Kit
- NATIVE/USDC same-asset guard correctly implemented
- **Note:** `ucw-swap-estimate`, `ucw-swap-start`, `ucw-swap-confirm` actions in `server/index.ts` should be verified to exist. These are referenced in SwapPage but not audited in server/index.ts beyond line 1450.

### BridgePage
- CCTP V2 bridge, supports all 3 auth paths
- UCW path: `ucw-bridge-start` / `ucw-bridge-confirm` actions
- Live CCTP fee fetched from `iris-api-sandbox.circle.com/v2/burn/USDC/fees`
- `useForwarder: true` used correctly — destination chain relayer mints
- **No issues found**

### GatewayPage
- Circle Gateway: deposit (approve + deposit), transfer (BurnIntent → gatewayMint)
- Correctly separates wagmi, passkey, and W3S-SDK paths into separate components
- `PasskeyDepositTab` batches approve + deposit into single userOp (1 passkey prompt)
- `CircleTransferTab` handles ERC-1271 `contractSigner: true` for passkey path
- **No issues found**

### RecurringPage
- Scheduled USDC transfers — all 3 paths (wagmi, Circle UCW, passkey)
- Auto-scheduler only runs for wagmi users (Circle/passkey require user interaction)
- `VITE_CIRCLE_CLIENT_KEY` referenced at line 212 — should be `VITE_CLIENT_KEY`. **This is a potential bug**: if `VITE_CIRCLE_CLIENT_KEY` is not set, passkey recurring payments will silently fail with "passkey transactions require a Circle Client Key."

### PaymentRequestPage
- Payment link (`?pay=0x...&amount=...&note=...`) landing page
- Only supports wagmi path (requires browser wallet for actual sending)
- Prompts wallet connection for non-wagmi users
- **No issues found**

### AgentPage / AgentChat
- LLM chat via `/api/chat` with multi-message context
- Service execution via `/api/agent-wallet { action: 'execute-service' }`
- x402 micropayment guard gated on `VITE_X402_SELLER_ADDRESS`
- Inline swap flow for `swap_start` action from LLM
- **No issues found**

### AgentWalletExperience
- Circle developer-controlled wallet used as "agent wallet"
- Funded via USDC transfer from user wallet
- `/api/agent-wallet { action: 'status' }` polls balance
- **No issues found**

### LoginPage / LandingPage / OnboardingPage
- Login offers: email OTP, Google, passkey, wagmi
- Onboarding flow gates on `isConnected` wagmi OR Circle email login
- **Note:** Onboarding step 1 only advances on `isConnected` (wagmi). Circle email login calls `onSuccess` directly — this is correct via the `CircleEmailLogin` `onSuccess` callback.

---

## 4. Server Routes (Railway Express — `server/index.ts`)

| Route | Method | Action/Purpose | Status |
|---|---|---|---|
| `/api/wallet` | GET | List wallets (x-user-token) | ✅ Added prev session |
| `/api/wallet` | POST `request-otp` | Send email OTP | ✅ |
| `/api/wallet` | POST `initialize` | Create/restore UCW session | ✅ |
| `/api/wallet` | POST `device-token` | Device token for SDK | ✅ |
| `/api/wallet` | POST `create-transfer` | Create transfer challenge | ✅ |
| `/api/wallet` | POST `create-contract-exec` | Contract execution challenge | ✅ |
| `/api/wallet` | POST `sign-message` | EIP-712 sign challenge | ✅ |
| `/api/wallet` | POST `poll-tx` | Poll transaction state | ✅ |
| `/api/wallet` | POST `ucw-swap-estimate` | App Kit swap estimate | Need to verify |
| `/api/wallet` | POST `ucw-swap-start` | App Kit swap initiate | Need to verify |
| `/api/wallet` | POST `ucw-swap-confirm` | App Kit swap confirm | Need to verify |
| `/api/wallet` | POST `ucw-bridge-start` | App Kit bridge initiate | Need to verify |
| `/api/wallet` | POST `ucw-bridge-confirm` | App Kit bridge confirm | Need to verify |
| `/api/auth/google` | GET | Google OAuth redirect | ✅ |
| `/api/auth/google/callback` | GET | Google OAuth callback | ✅ |
| `/api/agent-wallet` | POST | Agent wallet operations | ✅ |
| `/api/chat` | POST | LLM chat endpoint | ✅ |

The `ucw-swap-*` and `ucw-bridge-*` actions are beyond the 1450-line mark audited. They should be present since SwapPage and BridgePage call them — but should be verified on Railway if swap/bridge fails for Circle UCW users.

---

## 5. Known Issues and Required Actions

### 5a. `VITE_CIRCLE_CLIENT_KEY` typo in RecurringPage (line 212)
**Severity: Medium — passkey recurring payments silently fail**

`RecurringPage.tsx` line 212:
```ts
const clientKey = import.meta.env.VITE_CIRCLE_CLIENT_KEY as string ?? ''
```

The correct env var name everywhere else in the codebase is `VITE_CLIENT_KEY`. If `VITE_CIRCLE_CLIENT_KEY` is not set as a separate env var, passkey users who tap "Run now" on a recurring payment will get an error from `sendFromPasskeyWallet` because `clientKey` is an empty string.

**Fix:** Change `VITE_CIRCLE_CLIENT_KEY` to `VITE_CLIENT_KEY` in `RecurringPage.tsx` line 212.

### 5b. `VITE_CIRCLE_APP_ID` must be set on Vercel
Used by `useCircleTransaction`, `SwapPage`, and `BridgePage` for the W3S SDK PIN popup. Without it, Circle UCW transactions, swaps, and bridges fail with a clear "VITE_CIRCLE_APP_ID is not set" error message. Confirmed required. Confirm it is set on Vercel under the exact name `VITE_CIRCLE_APP_ID`.

### 5c. `CIRCLE_USER_CONTROLLED_API_KEY` vs `CIRCLE_DEVELOPER_CONTROLLED_API_KEY`
The server uses a fallback chain:
```
CIRCLE_USER_CONTROLLED_API_KEY ?? CIRCLE_API_KEY ?? CIRCLE_DEVELOPER_CONTROLLED_API_KEY
```
Only `CIRCLE_DEVELOPER_CONTROLLED_API_KEY` is confirmed set on Railway/Vercel per the session summary. The fallback chain should catch it, but verify that the Railway env has at least one of: `CIRCLE_USER_CONTROLLED_API_KEY`, `CIRCLE_API_KEY`, or `CIRCLE_DEVELOPER_CONTROLLED_API_KEY`.

### 5d. Two pre-existing lint warnings (not blocking)
- `ActivityPage.tsx`: `buildReceiptHtml` is defined but never called
- `ExportsPage.tsx`: `periodStr` is declared but never used

These do not affect functionality. Prefix with `_` or remove to clean up.

### 5e. Redis not connected in sandbox (not a production issue)
`/api/listings` returns 503 in the sandbox because `KV_REST_API_URL` / `KV_REST_API_TOKEN` are not set locally. This is expected and does not affect production (Vercel Upstash Redis is connected on Vercel).

---

## 6. Minor Observations

- **`RecurringPage.tsx` line 213:** `sendFromPasskeyWallet` second arg type expects `bigint` for `amount` but `parseAmount(ARC, task.amount).raw` returns `bigint` — this is correct.
- **`GatewayPage.tsx` line 1133:** `destChainSlug` is built with `replace(/ /g, '')` which strips spaces but not dashes. For chain names like "Arbitrum Sepolia" this would produce `arbitrumsepolia` which may not match the modular SDK endpoint slug. No fix needed unless passkey Gateway transfer fails — the slugs may be validated differently.
- **`DashboardPage.tsx`:** NGN exchange rate fetched from `open.er-api.com` (no API key required). Rate has a sensible fallback of 1630. Fine as-is.
- **`SwapPage.tsx`:** `NATIVE` token is listed but correctly blocked — the USDC/NATIVE same-asset guard fires before any swap call.
- **`BridgePage.tsx`:** Linea Sepolia has `cctpDomain: -1` and is correctly disabled in the chain selector (no CCTP support).

---

## 7. Summary of Work Done This Session

1. Read all remaining frontend pages: `SwapPage`, `BridgePage`, `AgentPage` (all tabs), `DashboardPage`, `PaymentRequestPage`, `RecurringPage`, `GatewayPage`, `OnboardingPage`, `useCircleTransaction`.
2. Fixed the stale "Netlify" comment in `server/index.ts` (~line 1362) — now correctly says Vercel/Railway.
3. Confirmed `tsc --noEmit` passes (0 errors) and lint has 0 errors (2 pre-existing warnings unchanged).

**One actionable bug found:** `VITE_CIRCLE_CLIENT_KEY` typo in `RecurringPage.tsx` — should be `VITE_CLIENT_KEY`. This affects passkey users running recurring payments. See section 5a.
