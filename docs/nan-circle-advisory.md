# Nan × Circle Requirements — Advisory Report

## Executive Summary

Nan is genuinely impressive. It has real Circle infrastructure running in production:
developer-controlled wallets, CCTP V2 bridging, Gateway, x402 nanopayments, agent wallets,
Ajo (savings circles), escrow, payroll, marketplace, .arc names, and an AI assistant.
The Circle integration is mostly correct. The gaps below are specific — fix them and Nan
becomes a complete, Circle-aligned submission.

---

## What's Already Excellent

- Developer-Controlled Wallets: correct SDK usage, proper `getTransaction` polling, idempotency keys
- CCTP V2: proper burn + attestation + mint flow on Arc Testnet
- Gateway: correct EIP-712 BurnIntent, proper domain mapping, `gatewayMint()` call
- x402 nanopayments: `@circle-fin/x402-batching/server` middleware used correctly
- Ajo (savings circles): on-chain contract interactions via Circle wallets, two-step approve+contribute
- Agent Wallets: separate wallet set per user, Redis persistence, spending policies
- Arc Testnet USDC address is correct (`0x3600000000000000000000000000000000000000`)

---

## Issues to Fix

### 1. CRITICAL — Hardcoded chain references in _server/index.js

In `_server/index.js` line 107-108:
```js
const ARC_CHAIN_ID   = 'ARB-SEPOLIA';   // ← WRONG
const ARC_BLOCKCHAIN = 'ARB-SEPOLIA';   // ← WRONG
```

This says ARB-SEPOLIA but the rest of the codebase correctly uses `ARC-TESTNET`.
These variables look like they're unused (Circle SDK routes in api/ use their own constants)
but any route still referencing them will send transactions to the wrong chain.

**Fix:** Change both to `'ARC-TESTNET'`.

---

### 2. HIGH — Chat AI system prompt leaks wallet context in plain text

`api/chat.js` sends the user's full wallet address, balances, pending orders, and
recent transactions in the system prompt to OpenAI. This data leaves your server.

Circle's requirement: user financial data should never leave your control boundary
unless the user explicitly consents to a third-party AI provider seeing it.

**Fix options:**
- Use **Groq** (you already have `GROQ_API_KEY` in the env) instead of OpenAI — Groq
  does not use inputs to train models. Switch the model to `llama3-70b-8192` or `mixtral-8x7b`.
- Or add a consent banner: "I'm sending your balance to OpenAI to answer this question."
- Or redact the system prompt and only send anonymized context (amounts as ranges, not exact).

---

### 3. HIGH — CORS allows `Access-Control-Allow-Origin: *` on money-moving endpoints

Multiple API files (`ajo.js`, `gateway.js`, `chat.js`, `orders.js`, `marketplace.js`)
set `Access-Control-Allow-Origin: *` unconditionally. This means any website in the
world can call your money-moving endpoints from a user's browser.

The CORS allowed-origins list exists in `circle-wallets.js` and `agent-wallets.js`
but is not applied in the other files.

**Fix:** Apply the same origin-check pattern from `circle-wallets.js` to all API handlers.
For the auth-required actions (transfer, escrow, marketplace buy) this is especially important.

---

### 4. HIGH — KYC is mislabeled and could create compliance risk

`api/kyc.js` is labeled "lightweight verification" and admits it is NOT real KYC.
However the endpoint is named `/api/kyc` and the data it collects (full name, ID
description) could be interpreted as implying compliance coverage.

Circle's requirements for marketplace and payment apps: either do real identity
verification via an approved provider, or be explicit that no KYC is performed and
restrict features that require it (high-value listings, large transfers).

**Fix:**
- Rename the endpoint to `/api/verify` and the UI label to "Team Verified" (not KYC).
- Add a clear disclaimer: "This is community verification, not legal identity verification."
- Gate marketplace listings over 500 USDC behind this check with clear messaging.

---

### 5. MEDIUM — Agent Wallet spending policy is stored in Redis, not enforced on-chain

`api/agent-wallets.js` stores spending policies (`perTx`, `daily`, `weekly` limits)
in Redis. The actual Circle developer-controlled wallet has no spending limit configured —
a rogue request that bypasses your Redis check can send any amount.

Circle Agent Stack supports **on-chain spending policies** via the Circle CLI and
the developer-controlled wallets SDK (`createWallets` with `accountType: SCA` and
spending policy params).

**Fix:** When creating a user's agent wallet, pass spending limits as Circle's
native policy fields — not just as a Redis record you check before calling the SDK.
This way Circle's infrastructure enforces the limit, not just your server logic.

---

### 6. MEDIUM — x402 seller address is hardcoded as a fallback

In `api/x402-arc-price.js`:
```js
const SELLER_ADDR = process.env.X402_SELLER_ADDR || '0x86B245D0B48BBdc58F08cAeA971a24ba377c366a';
```

The hardcoded fallback means if `X402_SELLER_ADDR` is not set in the environment,
x402 revenue goes to whoever controls that hardcoded address — which may not be you
after a deploy to a fresh environment.

**Fix:** Remove the hardcoded fallback. Throw a startup error if `X402_SELLER_ADDR`
is not set, so you can't accidentally deploy without it.

---

### 7. MEDIUM — `_server/index.js` has an in-memory rate limiter that resets on restart

The rate limiter (`_rl Map`) is process-local. Every Railway redeploy (which happens
on every push) resets it, giving attackers a free reset of their rate-limit window.

**Fix:** Move rate limiting to Upstash Redis with a short TTL key per IP. You already
have Upstash wired — add a `rl:ip:{hash}:{window}` key with a 60s TTL.

---

### 8. MEDIUM — Payroll transfers happen client-side with no server audit trail

`api/payroll.js` logs runs but says "actual token transfers still happen client-side."
This means payroll amounts, recipients, and success/failure are self-reported by the
browser — a malicious or buggy client could log a run as successful without sending funds.

**Fix:** Move payroll execution server-side using Circle developer-controlled wallets
(same pattern as `ajo.js` — `createTransaction` per employee, poll to COMPLETE).
The server then writes the audit trail only after confirming on-chain success.

---

### 9. LOW — Redis `kvGet`/`kvSet` is reimplemented in every API file

`ajo.js`, `kyc.js`, `payroll.js`, `marketplace.js`, and others each have their own
copy of the same `kvGet`/`kvSet` functions. `agent-wallets.js` has the best version
(uses command-array format, throws properly) but the others use the URL-path style
that Upstash warns against.

**Fix:** Extract to `api/_lib/redis.js` and import it everywhere. Use the
command-array pattern from `agent-wallets.js` as the canonical version.

---

### 10. LOW — No webhook handler for Circle transaction events

Circle's developer-controlled wallets SDK fires webhooks on transaction state changes
(QUEUED → SENT → COMPLETE / FAILED). Nan currently polls `getTransaction` inside
request handlers — this works for synchronous flows but blocks server responses.

**Fix:** Add a `POST /api/webhooks/circle` handler. On `transactions.inbound`/`transactions.outbound`
events, update the Redis order/activity records and push a notification to the user.
This makes Nan's activity feed real-time instead of polling-on-demand.

---

## Circle Ecosystem Opportunities (Not Yet Built)

These would strengthen Nan as a Circle submission:

### Circle App Kit
You use `@circle-fin/developer-controlled-wallets` for wallets. Adding Circle App Kit
(`@circle-fin/app-kit`) would give you a browser-side wallet UI that connects to
your backend wallets without exposing keys. Your `app.js` currently builds a custom
wallet modal — App Kit replaces that with Circle's production-grade UI component.

### EURC Payroll
Your payroll system only sends USDC. Adding EURC as a payroll token (especially for
European users) is a one-line change to your send logic and aligns with Circle's
multi-stablecoin positioning.

### Circle Agent Stack — Marketplace Listing
Your x402 endpoints (`x402-arc-price.js`, `x402-arc-stats.js`, `x402-wallet-stats.js`,
`x402-ngn-rate.js`, `x402-cctp-status.js`) are exactly what Circle's **Agent Marketplace**
at `agents.circle.com` is designed for. Submit these as paid data services. This puts
Nan on the Circle Agent Marketplace and demonstrates a real agent monetization use case.

### Programmable Wallet Webhooks + Push Notifications
You have `api/notify.js` and `web-push` installed. Wire it to Circle's transaction
webhooks to send users a push notification when USDC arrives — real-time, no polling.

### Spend Controls on the Main Wallet
The main Circle developer-controlled wallet has no spending limits. Using Circle's
SCA account type (smart contract account) would let you enforce daily limits,
require multi-sig for large transfers, and freeze wallets on suspicious activity —
all via Circle's SDK, not just server-side Redis checks.

---

## Effort Estimate to Address Critical + High Items

| Item | Fix | Time |
|---|---|---|
| #1 Chain constant | 2-line edit | 5 min |
| #2 Switch OpenAI to Groq | Model swap in chat.js | 30 min |
| #3 CORS on all routes | Shared origin-check helper | 1 hour |
| #4 KYC relabeling | Rename + add disclaimers | 30 min |
| #5 On-chain spending policies | Update createWallets call | 2 hours |
| #9 Shared Redis helper | Extract + replace in 5 files | 1 hour |

**Total for critical+high: roughly 5 hours.**

---

## Summary

Nan is one of the most complete Circle-ecosystem projects I've seen. The core
infrastructure is correct. The gaps are mostly around hardening (CORS, spending policies,
chain constants) and hygiene (shared Redis helper, server-side payroll execution).

Fix the 4 critical/high items above and Nan is fully Circle-requirement compliant
and ready to be listed on the Agent Marketplace.
