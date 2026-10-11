# Mainnet Readiness Review — Paywell / NAN
**Date:** October 11, 2026  
**Target chain:** Arc Mainnet (chain ID 5042, USDC as native gas token)  
**Scope:** PaywellEscrow.sol, NANNameRegistry.sol, Express backend (server/index.ts), frontend config (src/config.ts, onchain-facts.ts), env / deployment config

---

## Overall Verdict: NOT READY FOR MAINNET

There are **2 Critical** and **5 High** blockers that must be resolved and independently audited before any mainnet deployment. 10 further medium/low issues should be addressed. No funds should be risked until every Critical and High item is resolved.

---

## SMART CONTRACTS

### Critical

#### C-1: `emergencyWithdraw` can drain active escrow funds (PaywellEscrow.sol:216)
**What it does:** `emergencyWithdraw(token, to, amount)` transfers any token to any address with no accounting check. Since the USDC address IS the escrow asset, the owner can drain the contract of all escrowed buyer funds at any time, regardless of open orders.  
**Impact:** All buyer funds at immediate risk from a compromised or malicious owner key.  
**Fix required:** Track total locked obligations (`lockedBalance`). Restrict `emergencyWithdraw` so it can only withdraw `IERC20(token).balanceOf(address(this)) - lockedBalance` for the escrow asset. For non-escrow tokens, allow full withdrawal.

#### C-2: `cctpBurnAndTransfer` can burn escrowed USDC cross-chain (PaywellEscrow.sol:176)
**What it does:** Owner can call `cctpBurnAndTransfer(amount, ...)` to CCTP-bridge an arbitrary amount of USDC out of the contract with no check against open order obligations.  
**Impact:** Same as C-1: escrowed buyer funds can be bridged away permanently and irreversibly.  
**Fix required:** Add the same `lockedBalance` accounting. Require `amount <= contractUsdcBalance - lockedBalance` before calling `depositForBurn`.

---

### High

#### H-1: Disputed orders can be locked forever (PaywellEscrow.sol:108–174)
**What it is:** Once an order enters `Disputed` state, only the owner can resolve it. There is no deadline-based fallback path.  
**Impact:** If the owner loses their key, goes offline, or is compromised, disputed orders are permanently frozen. Buyers cannot recover their funds via any non-owner path.  
**Fix required:** Add a `DISPUTE_RESOLUTION_TIMEOUT` (e.g. 14 days from dispute). After the deadline, allow the buyer to call a `claimRefundAfterTimeout()` function that auto-refunds them. This ensures liveness without owner involvement.

#### H-2: Name registration is front-runnable (NANNameRegistry.sol:38)
**What it is:** `register(name, duration)` is single-step and exposes the target name in the mempool. Any searcher/validator can copy the transaction and front-run it to claim valuable names before the legitimate registrant.  
**Impact:** On Arc mainnet, users who broadcast high-value name registrations can have them sniped. This harms UX and creates financial loss for users who paid gas on a failed registration.  
**Fix required:** Implement commit-reveal: first `commit(keccak256(abi.encodePacked(name, salt, msg.sender)))`, then after N blocks, `reveal(name, salt, duration)`. The reveal checks the commitment and registers atomically.

#### H-3: `_ownedNames` array grows unboundedly (NANNameRegistry.sol:119, 175–200)
**What it is:** `_addToOwner` appends to `_ownedNames[addr]` and never prunes expired entries. The `_removeFromOwner` loop is O(n) over the whole array. A user who registers and expires many names builds an unboundedly large array.  
**Impact:** `getNamesForAddress` returns stale expired entries. The O(n) removal loop can run out of gas on large arrays, permanently bricking `register`/`renew` for that address. On mainnet, this is a denial-of-service vector.  
**Fix required:** Either (a) cap the maximum number of names per address and enforce it in `_addToOwner`, or (b) use a packed bitmap + separate active index and filter in a view function, so the storage write is O(1).

#### H-4: No admin authentication on admin endpoints (server/index.ts)
**What it is:** Every `GET /api/admin/*` and `POST /api/admin/*` route (analytics, support tickets, FAQs, audit log, transaction report, feedback) is completely unprotected — no auth check of any kind.  
**Impact:** Any user who discovers the API base URL can read the full transaction ledger, all user support tickets and emails, all feedback, and all audit entries. They can also modify FAQs, mark tickets resolved, and change the About content. This is a critical data breach vector.  
**Fix required:** Add an admin auth middleware that checks a time-constant-compared secret token (e.g. from `process.env.ADMIN_SECRET`) or a proper RBAC session. Apply it to all `/api/admin/*` routes before mainnet.

#### H-5: Session store is in-memory only (server/index.ts:74–76)
**What it is:** `sessionStore` is a `Map` that is loaded from disk at startup but only partially persisted. More critically, `activityStore`, `notificationStore`, `otpStore`, `otpRateStore`, and `loginHistory` are purely in-memory — they vanish on any restart.  
**Impact:** On mainnet (Railway or any PaaS with restarts/scaling), sessions are invalidated on deploy/restart. OTP rate limits reset (allowing brute-force after a restart). Notifications and activity history are lost.  
**Fix required:** Move session, OTP, and rate-limit state to the Redis store (already imported as `@upstash/redis`). The `_redis.ts` helper already exists — use it.

---

### Medium

#### M-1: `feeRecipient` in PaywellEscrow is mutable and trust-free
The owner can call `setFeeRecipient(address)` at any time, redirecting all future fee flows. No timelock or multisig protects this. On mainnet, consider a 48-hour timelock for sensitive parameter changes.

#### M-2: `setTokenMessenger` has no validation
The CCTP messenger address can be changed to any address, including a malicious one that steals the approved USDC. Combine with a timelock and emit a warning on-chain.

#### M-3: `NANNameRegistry.withdraw` pulls all USDC with no receipt accounting
The owner can withdraw the entire contract USDC balance at any time. Registration fees belong to the protocol, but there is no minimum-reserve check to ensure outstanding multi-year registrations are honoured. Consider tracking total fees collected vs withdrawn.

#### M-4: OTP uses `Math.random()` which is not cryptographically secure (server/index.ts:211)
`Math.floor(100000 + Math.random() * 900000)` is predictable on V8. On mainnet with real email accounts, use `crypto.randomInt(100000, 999999)` instead.

#### M-5: `deterministicAddress` assigns mock wallet addresses from email SHA-256 hash (server/index.ts:702)
In the absence of Circle credentials, every verified user gets a deterministic fake address derived from their email. On mainnet, this will associate users with addresses they do not control. Real wallets must be created via Circle's API before going live — the mock must be blocked in production.

#### M-6: `mockAgentReply` and mock wallet responses remain reachable on mainnet (server/index.ts)
The server gracefully degrades to mocks whenever credentials are absent. There is no `NODE_ENV === 'production'` guard that **hard-fails** instead of silently mocking. Add explicit startup checks that refuse to start if required credentials are missing.

#### M-7: Circle USDC token ID is hardcoded (server/index.ts:749)
`'f26e2fc3-3fc5-5b11-8fc8-0a5a9a71ad7a'` — this is hardcoded as the Circle-internal UUID for USDC on Arc. If Circle changes or rotates this ID, transfers silently fail. Move to an env var `CIRCLE_ARC_USDC_TOKEN_ID` and document it.

#### M-8: Reward claim issues a fake `txHash` without any actual USDC transfer (server/index.ts:1523)
The claim endpoint records the claim and returns a fabricated `0x` hash without sending any tokens. On mainnet users will see a "claimed" confirmation and a fake hash in their activity feed but receive nothing. Must be wired to a real Circle developer-controlled wallet transfer before launch.

#### M-9: `foundry.toml` uses `evm_version = "paris"` — verify Arc compatibility
Arc is EVM-compatible but confirm it supports Paris opcodes (no PUSH0 from Shanghai). If Arc uses a pre-Merge EVM, switch to `london`. Verify with Arc documentation before deploying.

#### M-10: No CORS restriction on production backend
`cors({ origin: '*' })` is fine for development but exposes all API endpoints to any origin on mainnet. Restrict to your production domain via `ALLOWED_ORIGIN` env var before launch.

---

### Low / Info

#### L-1: No contract source verification workflow documented
The AGENTS.md deploy runbook does not include contract verification on the Arc block explorer after deployment. Unverified contracts are opaque to users and security reviewers. Add `forge verify-contract` steps to `docs/mainnet-deploy.md`.

#### L-2: `feeRecipient` placeholder `0xYOUR_FEE_RECIPIENT` in AGENTS.md deploy command
The documented constructor call for `PaywellEscrow` has a literal placeholder. Deploying with this value will revert (zero-address check). Must be replaced with a real address before any deployment attempt.

#### L-3: `block.timestamp` comparisons in both contracts
Forge-lint flagged multiple `block.timestamp` comparisons. On Arc, validators have limited ability to manipulate timestamps (bounded by chain rules), but 1-hour and 3-day windows are large enough that this is low-risk in practice. Noted for completeness.

#### L-4: `NANNameRegistry` does not support a 3-year or 10-year duration
Only 1, 2, 5 year options — reverts on any other value. Not a security issue, but consider expanding the pricing table to cover common registration periods users will expect.

---

## BACKEND

| Item | Severity | Status |
|---|---|---|
| No admin auth on /api/admin/* | **HIGH** | Not fixed |
| In-memory session/OTP/rate-limit stores | **HIGH** | Not fixed |
| Math.random() for OTP generation | Medium | Not fixed |
| Deterministic mock wallet on missing creds | Medium | Not fixed |
| No startup guard for missing credentials | Medium | Not fixed |
| Hardcoded Circle USDC token ID | Medium | Not fixed |
| Rewards claim is mock only | Medium | Not fixed |
| cors({ origin: '*' }) | Low | Not fixed |

---

## FRONTEND / CONFIG

| Item | Severity | Status |
|---|---|---|
| `src/config.ts` targets Arc Mainnet (chain 5042) — correct | OK | |
| Arc USDC address `0x3600...0000` in onchain-facts.ts — correct | OK | |
| CCTP domain 26 for Arc — verify with Circle docs | Verify | |
| No mainnet `VITE_*` env vars set | Blocker | Not set |
| `CIRCLE_DEVELOPER_CONTROLLED_API_KEY` not set | Blocker | Not set |
| `CIRCLE_ENTITY_SECRET` not set | Blocker | Not set |
| `GROQ_API_KEY` / `OPENAI_API_KEY` not set — AI falls back to mock | Medium | Not set |
| `SELLER_ADDRESS` not set — x402 disabled | Medium | Not set |
| `SMTP_*` not set — OTPs printed to console | **High** | Not set |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` not set — marketplace 503 | High | Not set |

---

## DEPLOYMENT PREREQUISITES CHECKLIST

Before any mainnet deploy, ALL of the following must be true:

- [ ] C-1 fixed: `emergencyWithdraw` guarded by `lockedBalance` accounting
- [ ] C-2 fixed: `cctpBurnAndTransfer` guarded by `lockedBalance` accounting
- [ ] H-1 fixed: dispute resolution timeout path added
- [ ] H-2 fixed: commit-reveal added to NANNameRegistry
- [ ] H-3 fixed: `_ownedNames` array bounded or O(1) removal implemented
- [ ] H-4 fixed: admin endpoints secured with auth middleware
- [ ] H-5 fixed: session/OTP/rate-limit state migrated to Redis
- [ ] M-4 fixed: OTP uses `crypto.randomInt`
- [ ] M-5 fixed: mock wallet path hard-blocked in production
- [ ] M-6 fixed: server refuses to start without required credentials
- [ ] M-8 fixed: reward claim wired to real Circle wallet transfer
- [ ] All contracts re-audited by an independent professional auditor after fixes
- [ ] Contract source verified on Arc block explorer post-deployment
- [ ] `0xYOUR_FEE_RECIPIENT` placeholder replaced with a real controlled address
- [ ] All required env vars set in deployment environment (see table above)
- [ ] Multisig or hardware wallet used as contract owner (not a hot wallet)
- [ ] Owner key stored in hardware wallet or multi-party setup — single EOA owner is high-risk for mainnet
- [ ] Admin secret set and admin routes locked down
- [ ] Redis instance provisioned for session persistence
- [ ] SMTP configured so OTPs are delivered via email (not console)
- [ ] End-to-end test run on Arc Testnet with real Circle credentials and real wallet flows

---

*This review is based on static analysis of the source code as of October 11, 2026. It is not a substitute for an independent professional security audit. Do not deploy to mainnet without completing every item in the checklist above.*
