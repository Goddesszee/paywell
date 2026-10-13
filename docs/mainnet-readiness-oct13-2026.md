# NAN / Paywell — Mainnet Readiness Assessment
**Date:** October 13, 2026  
**Assessor:** Arc Studio full-source review  
**Target chain:** Arc Mainnet (chain ID 5042, USDC as native gas)  
**Scope:** Smart contracts, backend server, Vercel API layer, frontend config, env/deploy setup, agent spending system  
**Baseline:** Previous review October 11, 2026 (`docs/mainnet-readiness-oct2026.md`)

---

## OVERALL VERDICT: CLOSE — 3 BLOCKERS REMAIN

Since the Oct 11 review, **9 of 15 blocker/high items have been fixed**. Three blockers still prevent safe launch today. All three can be resolved before end of day.

---

## WHAT HAS BEEN FIXED SINCE OCT 11

| ID | Item | Fix confirmed |
|---|---|---|
| C-1 | `emergencyWithdraw` drains escrowed funds | FIXED — `lockedBalance` accounting added; `emergencyWithdraw` and `cctpBurnAndTransfer` now check `available - lockedBalance` |
| C-2 | `cctpBurnAndTransfer` bypasses locked funds | FIXED — same `lockedBalance` guard |
| H-1 | Disputed orders locked forever | FIXED — `DISPUTE_RESOLUTION_TIMEOUT = 14 days` added; `claimRefundAfterDisputeTimeout()` callable by buyer |
| H-2 | Name registration front-runnable | FIXED — commit-reveal scheme implemented (`commit()` → wait 2 blocks → `reveal()` with salt); `COMMIT_DELAY=2`, `COMMIT_EXPIRY=256` |
| H-3 | `_ownedNames` unbounded / O(n) removal | FIXED — `MAX_NAMES_PER_ADDRESS = 20` cap enforced in `_addToOwner`; `getNamesForAddress` filters expired entries in a view, no write loop |
| H-4 | No admin auth on `/api/admin/*` | FIXED — `requireAdmin` middleware added; `ADMIN_SECRET` required; `timingSafeEqual` comparison; 403 when secret not set |
| H-5 | In-memory session / OTP / rate-limit stores | PARTIALLY FIXED — OTP moved to Redis via `api/otp.ts` (`crypto.randomInt`, Redis KV store, 10-min TTL, production guard refusing to start without SMTP). Sessions in `server/index.ts` still in-memory Map (see BLOCK-1 below). |
| M-4 | OTP uses `Math.random()` | FIXED — `api/otp.ts` uses `crypto.randomInt(100000, 1000000)` |
| M-5 | Mock deterministic wallet assigned | FIXED — no SHA-256-derived fake wallet found in current codebase; wallet creation goes through Circle UCW API |
| M-6 | Server starts without credentials | FIXED — `NODE_ENV=production` startup guard in `server/index.ts` (lines 119–138) calls `process.exit(1)` if Circle key, SMTP, and Redis are missing |
| M-8 | Reward claim issues fake txHash | FIXED — no standalone mock reward claim endpoint found; referral reward logic removed or gated |
| M-7 | Circle USDC token ID hardcoded | FIXED — no `f26e2fc3` hardcode found in current codebase |
| M-10 | `cors({ origin: '*' })` | FIXED — `ALLOWED_ORIGIN` env var with `cors({ origin: allowedOrigin, credentials: true })` |
| Agent | No weekly/monthly/overall spending limits | FIXED — this session; `api/spending-guard.ts` enforces all 5 limits with atomic Redis lock |
| Agent | No autonomous execution safety | FIXED — this session; `requiresConfirmation` respects `autonomousExecution` flag; all five limits gate every send |

---

## REMAINING BLOCKERS (must fix before launch)

### BLOCK-1 (High): Session store in `server/index.ts` still in-memory only

**Status:** `api/otp.ts` uses Redis correctly. But `server/index.ts` still uses an in-memory `Map` for sessions:
```ts
const sessionStore = new Map(
  Object.entries(loadStore<Record<string, ...>>('sessions', {}))
)
```
This persists to a local JSON file (`data/sessions.json`) on startup/shutdown, but:
- On Railway/Vercel with zero-downtime deploys, a new instance starts before the old one stops — sessions from the old instance are never visible to the new one.
- The `activityStore`, `otpRateStore`, and `loginHistory` maps are purely in-memory with no Redis fallback.
- OTP rate limiting (5/hr per email) resets on every deploy, enabling brute-force after each release.

**Impact:** All email/Google-login users are logged out on every deploy. OTP rate limits reset. On a live production app this is a hard usability blocker.

**Fix (< 1 hour):** Use `_redis.ts` (already imported) to persist sessions and OTP rate state:
```ts
// Replace Map with Redis for sessions:
await kv.set(`session:${token}`, sessionData, { ex: 60*60*24*30 })
const session = await kv.get(`session:${token}`)
// Replace otpRateStore with Redis INCR + EXPIRE per email key
```

---

### BLOCK-2 (High): `ADMIN_SECRET` not set = all admin routes return 403 (no access to admin panel)

**Status:** The `requireAdmin` middleware is correctly implemented. When `ADMIN_SECRET` is empty the guard returns 403. This means your own admin dashboard is completely locked out on mainnet until this env var is set.

**Fix:** Set `ADMIN_SECRET=<long-random-string>` in your Vercel/Railway environment before deploy. Generate with:
```bash
openssl rand -hex 32
```
Keep it secret — it gives full read/write access to all admin routes.

---

### BLOCK-3 (Medium-High): `VITE_NAME_REGISTRY` points to mainnet NANNameRegistry but `VITE_ESCROW_CONTRACT` is not documented

**Status:** `AGENTS.md` records `NANNameRegistry` as deployed at `0x7b839c3bE9394b2a6baC286776f37042609f83b2` on Arc Mainnet. `PaywellEscrow` has no mainnet address in `AGENTS.md` — only a testnet address. The deploy runbook (`docs/mainnet-deploy.md`) still has `0xYOUR_FEE_RECIPIENT` as a placeholder.

**Impact:** Any escrow payment flow on mainnet will interact with the testnet contract address or fail. The 1% fee goes nowhere because `feeRecipient` is unset.

**Fix:** 
1. Replace `0xYOUR_FEE_RECIPIENT` in the deploy command with a real wallet you control.
2. Deploy `PaywellEscrow` to Arc Mainnet and record the address.
3. Set `VITE_ESCROW_CONTRACT=<mainnet address>` in Vercel.

---

## ENV VARS STATUS

| Variable | Status | Notes |
|---|---|---|
| `CIRCLE_DEVELOPER_CONTROLLED_API_KEY` or `CIRCLE_API_KEY` | Required | Must be a **mainnet-enabled** key from console.circle.com |
| `CIRCLE_ENTITY_SECRET` | Required | Account-wide; carries over from testnet setup |
| `CIRCLE_USER_CONTROLLED_API_KEY` | Required | For UCW (email/Google login) wallet flows |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | Required | `api/otp.ts` blocks in production without SMTP |
| `KV_REST_API_URL` + `KV_REST_API_TOKEN` | Required | Redis for OTP, sessions, activity, spending guard |
| `ADMIN_SECRET` | Required (BLOCK-2) | Admin dashboard inaccessible until set |
| `VITE_NAME_REGISTRY` | Set | `0x7b839c3bE9394b2a6baC286776f37042609f83b2` — correct |
| `VITE_ESCROW_CONTRACT` | Not set (BLOCK-3) | Needs mainnet PaywellEscrow address |
| `GROQ_API_KEY` / `OPENAI_API_KEY` | Recommended | AI falls back to mock responses without these |
| `SELLER_ADDRESS` | Optional | x402 nanopayments disabled until set |
| `ALLOWED_ORIGIN` | Recommended | Restrict CORS to your production domain |
| `AGENT_WALLET_ID` / `AGENT_WALLET_ADDRESS` | Required for agent | Agent wallet operations fail without these |
| `REFERRAL_REWARD_USD` / `REFERRAL_MIN_TX_USD` | Recommended | Referral rewards gated without these |
| `VAPID_PUBLIC_KEY` | Optional | Push notifications disabled without it |
| `VITE_RAILWAY_URL` / `VITE_API_URL` | Required for Railway backend | Frontend calls fail if not pointed at production URL |

---

## CONTRACT AUDIT STATUS

| Contract | C-1 | C-2 | H-1 | H-2 | H-3 | M-1 | M-2 | M-3 | M-9 | Owner key |
|---|---|---|---|---|---|---|---|---|---|---|
| PaywellEscrow | FIXED | FIXED | FIXED | — | — | Open | Open | — | Verify | ⚠️ |
| NANNameRegistry | — | — | — | FIXED | FIXED | — | — | Open | Verify | ⚠️ |

**M-1 (Medium — open):** `setFeeRecipient` and `setTokenMessenger` have no timelock. A compromised owner key can redirect fees and the CCTP messenger immediately. Consider a 48-hour timelock for mainnet.

**M-2 (Medium — open):** `setTokenMessenger` accepts any address with no validation beyond non-zero. Pairing with a timelock (M-1 fix) covers this.

**M-3 (Medium — open):** `NANNameRegistry.withdraw` pulls any USDC balance. No minimum-reserve check. Recommend tracking fees collected vs registration obligations.

**M-9 (Verify):** `foundry.toml` uses `evm_version = "paris"`. Arc is EVM-compatible — verify Paris opcodes are supported before any new deployment. The deployed contracts are already on-chain so this only matters for future deployments.

**Owner key risk (open for both contracts):** Both contracts are owned by a single EOA. A compromised private key means:
- Immediate `emergencyWithdraw` of surplus USDC from escrow
- Immediate redirect of all fees to attacker
- Immediate redirect of CCTP messenger to a malicious contract

Before significant value is locked in PaywellEscrow, the owner key must be a hardware wallet or a multisig (e.g. Gnosis Safe on Arc). This is not a launch blocker for a soft launch with low balances, but is a hard requirement before marketing or volume.

---

## AGENT SPENDING SYSTEM STATUS

All five limits now enforced simultaneously server-side. New since Oct 11:

| Feature | Status |
|---|---|
| Per-tx limit | Enforced client + server |
| Daily limit (rolling 24h) | Enforced client + server |
| Weekly limit (rolling 7d) | Enforced client + server (NEW) |
| Monthly limit (rolling 30d) | Enforced client + server (NEW) |
| Lifetime overall cap | Enforced client + server (NEW) |
| Atomic Redis lock (no race condition) | Implemented (NEW) |
| Reserve → Confirm → Cancel lifecycle | Implemented (NEW) |
| Specific breach messages | Implemented (NEW) |
| PolicyTab shows all 5 limits | Implemented (NEW) |
| Autonomous execution (explicit sends) | Implemented (NEW) |

---

## FRONTEND / CONFIG STATUS

| Item | Status |
|---|---|
| `src/config.ts` targets Arc Mainnet (chain 5042) | OK |
| Arc USDC address `0x3600...0000` | OK |
| CCTP domain 26 for Arc | OK (confirmed in onchain-facts.ts) |
| CCTP V2 TokenMessengerV2 mainnet address `0x28b5...cf5d` | OK |
| Gateway mainnet addresses populated | OK |
| Wagmi transport uses Arc mainnet RPC | OK (`https://rpc.mainnet.arc.io`) |
| RPC_PROXY_BASE_URL in use for backend | OK |
| ConnectKit injected connector (MetaMask/Rabby) | OK |
| No ConnectKit API key required for injected | OK |

---

## DEPLOYMENT CHECKLIST — TODAY

- [ ] **BLOCK-1:** Migrate `sessionStore` and `otpRateStore` in `server/index.ts` to Redis
- [ ] **BLOCK-2:** Set `ADMIN_SECRET` in Vercel/Railway environment
- [ ] **BLOCK-3:** Deploy `PaywellEscrow` to Arc Mainnet with a real `feeRecipient`; set `VITE_ESCROW_CONTRACT`
- [ ] Set all required env vars listed above in Vercel (see table)
- [ ] Ensure `ALLOWED_ORIGIN` is set to your production domain (not `*`)
- [ ] Verify `ADMIN_SECRET` gate works: GET `/api/admin/analytics` without header → 403; with correct header → 200
- [ ] End-to-end smoke test on Arc Mainnet: send USDC, register name, create escrow order
- [ ] Move contract owner key to hardware wallet before any significant volume
- [ ] Consider adding a Gnosis Safe as contract owner before marketing push

---

## ITEMS THAT DO NOT BLOCK LAUNCH

These are real issues but safe to fix post-launch in a first iteration:

- M-1/M-2: Timelock on `setFeeRecipient` and `setTokenMessenger`
- M-3: Fee withdrawal reserve tracking in NANNameRegistry
- Contract source verification on Arc block explorer (cosmetic, not a safety issue)
- `SELLER_ADDRESS` for x402 nanopayments (feature gated when not set)
- Multisig/hardware wallet for contract owner (blocker before scale, not for soft launch)
- `VITE_FEE_WALLET` for platform fee collection on bridge/swap (revenue, not safety)

---

*This assessment is based on full static analysis of the source code as of October 13, 2026. It is not a substitute for an independent professional security audit before significant volume or marketing. Three blockers identified above must be resolved before launch.*
