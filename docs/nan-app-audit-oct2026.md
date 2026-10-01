# NAN App — Comprehensive Audit Report
**Date:** October 1, 2026  
**Scope:** Full codebase review against Circle developer docs, integration completeness, UX gaps, and improvement areas.

---

## Overall Rating: 7.8 / 10

NAN is a well-architected, production-quality USDC payment and agentic commerce app. The Circle integrations are largely correct and use official SDKs. The main gaps are incomplete features (Gateway withdraw, onramp kit key, recurring schedule engine), a few missing Circle SDK calls, and the Agent Network using placeholder payment addresses.

---

## Feature-by-Feature Audit

---

### 1. BRIDGE (BridgePage.tsx) — Score: 9/10 ✅ Excellent

**What's correct:**
- Uses `@circle-fin/app-kit` `appKit.bridge()` — correct SDK
- CCTP V2 Fast Transfer with live fee fetch from `iris-api-sandbox.circle.com/v2/burn/USDC/fees`
- Correct `maxFee` calculation: `cctpProtocolFee × 1.2` per Circle docs
- All 11 CCTP testnet domains correct (Arc=26, ETH=0, Base=6, ARB=3, OP=2, Polygon=7, Avax=1, Uni=10, Sei=16, World=14)
- Chain-switch before bridging
- 4-step progress (approve → burn → attestation → mint)
- Platform fee recorded via `fees.ts`
- Paymaster notes for ERC-4337 chains are accurate

**Minor issues:**
- `Linea_Sepolia` has `cctpDomain: -1` — Linea is not CCTP-supported; should be hidden or clearly marked "No CCTP"
- Step tx-hash explorer links all use `fromChain.explorer` — the mint tx is on the *destination* chain, so mint step should use `toChain.explorer`
- No minimum bridge amount check (Circle CCTP min is ~$0.10)

---

### 2. SWAP (SwapPage.tsx) — Score: 9/10 ✅ Excellent

**What's correct:**
- Uses `appKit.estimateSwap()` and `appKit.swap()` — correct SDK calls
- Slippage in bps passed correctly via `config: { slippageBps }`
- USDC ↔ NATIVE guard (same asset on Arc) — correct Arc-specific rule
- Token logos from TrustWallet CDN with initials fallback
- Live ERC-20 balance via `useReadContract` (USDC, EURC)
- Native balance via `useBalance` for NATIVE
- 20%/50%/MAX chips parse live balance correctly
- Fee recorded via `fees.ts`
- `slippageBps > 200` warning shown

**Issues:**
- Many tokens (USDT, PYUSD, DAI, WBTC, WETH, WSOL, WAVAX, WPOL) have `address: null` — Circle App Kit Swap on Arc Testnet only supports USDC↔EURC. Showing these tokens as selectable but failing at estimate is confusing. They should be marked "Mainnet only" or hidden on testnet.
- EURC address `0x89B5...D72a` is correct for Arc Testnet ✅
- USDC address `0x3600...0000` correct ✅
- Explorer URL on success: `https://explorer.testnet.arc.io/tx/` — correct ✅

---

### 3. GATEWAY (GatewayPage.tsx) — Score: 6/10 ⚠️ Incomplete

**What's correct:**
- Gateway wallet address `0x0077777d7EBA4688BDeF3E311b846F25870A19B9` — matches `onchain-facts.ts` ✅
- Deposit flow: approve → ERC-20 transfer to Gateway wallet — correct pattern
- CCTP domain 26 for Arc is correct

**Critical issues:**
- **Gateway balance always shows `0.00`** — the balance card is hardcoded to `0.00` and never reads the actual Gateway unified balance. The real Gateway balance is held in the Circle Gateway contract and needs to be read via the `@circle-fin/unified-balance-kit` `getBalances()` call or a direct contract read against the GatewayWallet contract, not just the user's ERC-20 balance.
- **Withdraw tab is a stub** — shows "Requires Circle Kit Key" but does nothing. A real withdraw needs `@circle-fin/unified-balance-kit` with a `CIRCLE_STABLECOIN_KIT_API_KEY` and calls `spend()` or `removeFund()`.
- **Deposit pattern is wrong** — Circle Gateway deposit is `depositFor(address beneficiary, uint256 amount)` on the GatewayWallet contract, not a plain ERC-20 `transfer`. A plain transfer to the Gateway wallet address does not credit your unified balance.

**What to fix:**
```
1. Use @circle-fin/unified-balance-kit depositFor() for deposits
2. Use getBalances() to read real unified balance
3. Implement withdraw via spend() / removeFund()
4. Add CIRCLE_STABLECOIN_KIT_API_KEY to env
```

---

### 4. ONRAMP (OnrampPage.tsx) — Score: 7/10 ⚠️ Missing env

**What's correct:**
- Calls `/api/onramp-session` → Circle Onramp Kit session → `widgetUrl` → `window.open` — correct pattern
- `appUserId` and `destinationAddress` sent correctly
- Graceful 503 error when `CIRCLE_API_KEY` is missing

**Issues:**
- Payment method selector (Debit/ApplePay/GooglePay/Bank Transfer) is purely UI — it is not passed to the session API call. Circle Onramp session creation supports `paymentMethod` parameter. It should be passed.
- No `blockchain` / `chain` parameter sent — should specify `ARC` to land on Arc Testnet directly.
- The onramp widget opens in a new tab — Circle's embedded iframe approach (`mountIframe`) would give a better in-app UX.
- No webhook handling for `DEPOSIT_SETTLED` / `DEPOSIT_SUBMITTED` events — user has no in-app confirmation that USDC arrived.

---

### 5. RECURRING PAYMENTS (RecurringPage.tsx) — Score: 5/10 ⚠️ Major gap

**What's correct:**
- On-demand "Run now" button works — real `erc20.transfer()` via wagmi ✅
- Chain validation (must be Arc Testnet) ✅
- Address validation via viem `isAddress()` ✅
- Tx hash stored, linked to explorer ✅
- Activity log entry on success ✅

**Critical issues:**
- **No scheduling engine** — tasks are marked "Active/Paused" but there is no cron, interval, or scheduled execution. "Run now" is the only way to trigger a payment. The UI says "scheduled USDC payment" but nothing is actually scheduled.
- **Tasks are ephemeral** — stored in local component `useState`, not in `appStore` or any persistence layer. Refreshing the page loses all tasks.
- **No frequency/interval field** — you can't set "every week" or "every month". There is no schedule configuration at all.
- **No next-run display** — because there's no schedule, there's nothing to show.
- **Explorer URL is wrong**: `https://explorer.arc.testnet/tx/` should be `https://explorer.testnet.arc.io/tx/` (the correct Arc Testnet explorer from `onchain-facts.ts`)

**What to fix (priority order):**
1. Persist tasks to `appStore` (localStorage via zustand persist) — immediately fixes data loss
2. Add frequency field: Daily / Weekly / Monthly / Custom interval
3. Add a scheduler: use `setInterval` on app load to check due tasks, or use Circle developer-controlled wallet API to queue transactions server-side
4. Fix explorer URL
5. Add "next run" timestamp display

---

### 6. AGENT SYSTEM (AgentPage.tsx) — Score: 8/10 ✅ Strong

**What's correct:**
- Full orchestration pipeline: classify → discover → policy check → confirm → execute
- `api/agent-execute.ts` calls real APIs (Brave Search, CoinGecko, GitHub) ✅
- Policy engine enforces daily/per-service limits ✅
- A2A payments via real `writeContractAsync` → USDC ERC-20 transfer ✅
- Idempotency keys on payment records ✅
- Network tab: Marketplace, Orchestrate, Register, Provider sub-tabs ✅
- Multi-agent task decomposition and cost estimation ✅
- Execution log + A2A payment history ✅

**Issues:**
- **Agent payment addresses are all the same** (`0x5B12...Ef42`) — testnet placeholder. Real providers need real wallets.
- **`api/agent-execute.ts` service execution is mock for paid services** — when `BRAVE_API_KEY` is absent, it returns a generic mock response. The payment still goes through. This could be confusing — if a paid service can't execute, the payment should be blocked, not taken.
- **Agent Registry REST endpoint** (`api/agent-registry.ts`) stores in memory only — resets on every serverless cold start. For persistence, needs Redis/KV (already have `api/_redis.ts`).
- Policy tab `allowedCategories` is tied to the old shopping categories (`CATEGORIES` from `data/products`) — should use the agent service categories instead.

---

### 7. WALLET / SEND (WalletPage.tsx) — Score: 8/10 ✅ Good

**What's correct:**
- USDC + EURC token selection ✅
- Live ERC-20 balance reads ✅
- Real `erc20.transfer()` ✅
- Mobile step flow fixed ✅
- Token logos ✅

**Issues:**
- EURC send: uses hardcoded `0x89B5...D72a` — correct for Arc Testnet ✅
- No ENS / address book — users must type full 0x addresses every time
- No QR code scan for recipient address
- No confirmation of recipient name/identity before sending

---

### 8. HOME (HomePage.tsx) — Score: 8/10 ✅ Good

**What's correct:**
- Total balance = USDC + EURC summed ✅
- Live EURC balance from contract ✅
- Token logos ✅

**Issues:**
- NGN conversion rate is hardcoded (`1 USDC = 1,580 NGN`) — should fetch a live FX rate
- Portfolio performance chart is static/demo — not based on real transaction history
- USDC balance card uses `useBalance` (native view on Arc) — correct for Arc but label says "USDC" which is accurate since native IS USDC on Arc ✅

---

### 9. AUTHENTICATION (CircleEmailLogin / CircleGoogleLogin) — Score: 7/10

**What's correct:**
- OTP flow via `/api/otp` ✅
- Google OAuth callback via Netlify function ✅
- Session token stored in appStore ✅

**Issues:**
- Using Circle user-controlled wallets (MPC SDK) but `CIRCLE_ENTITY_SECRET` is not configured by default — wallet creation fails silently
- No biometric/passkey option — Circle Modular Wallets with WebAuthn would be stronger
- Session expiry handling is missing — token never refreshes

---

### 10. CIRCLE SDK / API USAGE — Compliance Check

| Feature | SDK Used | Correct? |
|---|---|---|
| Bridge | `@circle-fin/app-kit` `appKit.bridge()` | ✅ Yes |
| Swap | `@circle-fin/app-kit` `appKit.estimateSwap/swap()` | ✅ Yes |
| Onramp | Circle Onramp Kit session API via server | ✅ Yes (missing `paymentMethod` param) |
| Gateway deposit | Plain ERC-20 transfer | ❌ Should use `depositFor()` |
| Gateway balance | Hardcoded `0.00` | ❌ Should use `getBalances()` |
| Gateway withdraw | Stub | ❌ Needs `spend()`/`removeFund()` |
| CCTP addresses | From `onchain-facts.ts` | ✅ All correct |
| USDC addresses | From `onchain-facts.ts` | ✅ All correct |
| Recurring payments | `erc20.transfer()` via wagmi | ✅ On-demand correct; ❌ No scheduling |
| Agent payments | `erc20.transfer()` via `writeContractAsync` | ✅ Real on-chain |

---

## Priority Improvement List

### P0 — Fix immediately (broken or wrong)

1. **Gateway deposit** — replace `erc20.transfer(GATEWAY_WALLET)` with proper `depositFor()` call on the GatewayWallet contract. The current deposit doesn't credit the unified balance.
2. **Recurring tasks persistence** — move tasks from `useState` to `appStore` with `persist`. Users lose all tasks on refresh.
3. **Recurring explorer URL** — fix `https://explorer.arc.testnet/tx/` → `https://explorer.testnet.arc.io/tx/`

### P1 — High value, needed for production

4. **Recurring schedule engine** — add frequency field + interval-based auto-execution (Daily/Weekly/Monthly). Without this, "Recurring Payments" is just a saved contacts list.
5. **Gateway real balance** — wire `@circle-fin/unified-balance-kit` `getBalances()` to show actual unified balance.
6. **Gateway withdraw** — implement via `@circle-fin/unified-balance-kit` `spend()` or `removeFund()` using a kit key.
7. **Swap token availability** — mark tokens without Arc Testnet addresses as "Not available on testnet" instead of letting them fail at estimate.
8. **Onramp payment method** — pass `paymentMethod` to the session API.

### P2 — Improvements

9. **Agent Registry persistence** — connect `api/agent-registry.ts` to Redis (already have `api/_redis.ts`) so registered agents survive cold starts.
10. **Agent policy categories** — replace shopping `CATEGORIES` in PolicyTab with agent service categories.
11. **Live FX rate on Home** — fetch NGN/USD rate from a public FX API (e.g. ExchangeRate-API) instead of hardcoding 1,580.
12. **Bridge mint explorer** — show mint tx on destination chain explorer, not source.
13. **Bridge Linea** — either remove Linea from bridge UI (not CCTP supported) or clearly mark it unsupported.
14. **Onramp embedded iframe** — use `mountIframe` for in-app experience instead of `window.open`.
15. **Onramp webhook** — handle `DEPOSIT_SETTLED` to confirm arrival in-app.

### P3 — Nice to have

16. Address book / recent recipients in Send
17. QR code scanning for recipient addresses
18. Portfolio chart based on real activity history
19. Passkey / WebAuthn auth via Circle Modular Wallets
20. Session token refresh / expiry handling

---

## Recurring Payments — Detailed Assessment

The page has solid on-demand execution but is missing the core "recurring" functionality:

| Capability | Status |
|---|---|
| Create a task | ✅ Working |
| Run on demand | ✅ Working (real on-chain tx) |
| Pause / resume | ✅ Working (UI state only) |
| Delete task | ✅ Working |
| Persist across refreshes | ❌ Lost on refresh |
| Set frequency (daily/weekly/monthly) | ❌ Missing |
| Auto-execute on schedule | ❌ Missing |
| "Next run" display | ❌ Missing |
| Run history (beyond last run) | ❌ Only last run stored |
| Email/push notification on execution | ❌ Missing |
| Explorer URL correct | ❌ Wrong domain |

**Recommended implementation for scheduling:**
- Client-side: use `appStore` persisted tasks + a `useEffect` that checks `Date.now() >= task.nextRunAt` on a 60s interval. Simple and works without a backend.
- Server-side (better): use Circle developer-controlled wallets to queue and execute payments via the API, eliminating the need for the user's browser to be open.
