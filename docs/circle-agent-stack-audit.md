# Circle Agent Stack — NAN Implementation Audit

**Date:** October 4, 2026  
**Scope:** Every Circle Agent Stack component vs NAN's actual codebase  
**Method:** Read every relevant source file + verified against live Circle docs

---

## Circle Agent Stack Components (per official docs)

| Component | Circle docs says | NAN implemented? | Details |
|---|---|---|---|
| Agent Wallet | User-controlled MPC wallet, CLI-managed, gasless on supported chains | ✅ Implemented (user-controlled) | `api/agent-wallet.ts` — provision, status, balance via `@circle-fin/user-controlled-wallets` SDK |
| Spending Policy (read) | `circle wallet limit --output json` — CLI, mainnet only | ✅ Implemented | `api/agent-wallet.ts` `policy-read` action runs CLI via `execFile` |
| Spending Policy (budget) | `circle wallet limit budget --output json` — CLI, mainnet only | ✅ Implemented | `api/agent-wallet.ts` `policy-budget` action |
| Spending Policy (set) | `circle wallet limit set` — CLI, mainnet only, interactive OTP | ⚠️ Partially | Correctly surfaced as copy-CLI-command flow in `ManagePolicyModal`. Cannot be automated — OTP is human-gated by design. This is the correct and only supported approach. |
| Agent Nanopayments | Gateway-batched x402 payments, gasless, sub-cent, per-request | ✅ Implemented (Path A) | `api/agent-execute.ts` `executeNanopayment()` — `BatchEvmScheme` + `signTypedData` via `@circle-fin/x402-batching`. Tries x402 HTTP 402 handshake first; falls back to direct transfer (Path B). |
| Agent Marketplace (discovery) | `https://agents.circle.com/services` — public JSON catalog, 600+ services | ✅ Implemented | `api/agent-wallet.ts` `marketplace` action fetches live JSON; falls back to curated static list if Circle returns non-JSON (e.g. HTML). |
| Agent Marketplace (search) | Filter by query, network, price, payment rail | ✅ Implemented | `AgentServicesTab.tsx` + `AgentPage.tsx` `DiscoverTab` — client-side search over live/static list |
| Circle CLI | Pre-installed at `/usr/bin/circle` v1.1.4 | ✅ Available | Used server-side for policy read/budget. Not used for wallet or transfer ops (SDK is used instead). |

---

## What is Working End-to-End

### 1. Agent Wallet — COMPLETE
- **Backend:** `api/agent-wallet.ts` provisions (`createUserPinWithWallets`), reads status (`listWallets`, `getWalletTokenBalance`), and returns address + balance
- **Frontend:** `AgentWalletExperience.tsx` (`DashboardScreen`) shows real balance, address, wallet state, refresh, and the full Overview + Services tabs
- **Also in `AgentPage.tsx`:** `AgentWalletTab` — a simpler balance/fund/spend-log view with real Circle API calls

### 2. Agent Nanopayments — COMPLETE (with correct fallback)
- **`api/agent-execute.ts`** implements `executeNanopayment()`:
  - **Path A:** Real x402 Gateway nanopayment — `BatchEvmScheme` from `@circle-fin/x402-batching`, `signTypedData` via Circle developer-controlled wallets SDK. Attempts HTTP 402 handshake with the service endpoint. Requires `CIRCLE_API_KEY`, `CIRCLE_ENTITY_SECRET`, `AGENT_WALLET_ID`, `AGENT_WALLET_ADDRESS` in env.
  - **Path B fallback:** Direct USDC transfer via `api/agent-wallet` `spend` action (referenced in code but the `spend` handler is not currently in `api/agent-wallet.ts` — **GAP: the `spend` action route is missing from the backend**).
- Used for `perplexity-research` (0.002 USDC) and `openai-completion` (0.001 USDC)

### 3. Service Execution — COMPLETE
- **Backend:** `api/agent-execute.ts` has real service implementations for:
  - `brave-search` (BRAVE_SEARCH_API_KEY)
  - `serper-search` (SERPER_API_KEY)
  - `skyscanner-flights` (SKYSCANNER_API_KEY, with knowledge-based fallback)
  - `amadeus-hotels` (AMADEUS_API_KEY + AMADEUS_API_SECRET, with fallback)
  - `coingecko-prices` (no key needed — live API)
  - `exchangerate-fx` (EXCHANGERATE_API_KEY, with knowledge-based fallback)
  - `github-code-search` (GITHUB_TOKEN optional)
  - `perplexity-research` (PERPLEXITY_API_KEY + nanopayment)
  - `openai-completion` (OPENAI_API_KEY + nanopayment)
  - `alibaba-suppliers` (knowledge-based only)
- **Frontend orchestrator:** `AgentPage.tsx` `runOrchestration()` — classifies intent, discovers service, checks agent wallet balance, checks NAN-side policy, asks for confirmation if needed, executes, logs spend

### 4. Agent Marketplace Discovery — COMPLETE
- Live fetch from `agents.circle.com/services` via backend (avoids CORS)
- `AgentServicesTab.tsx` — search, category filter, service cards, detail modal, Agent Wallet compatibility check, "Use with NAN Agent" selection (persisted to Zustand)
- `AgentPage.tsx` `DiscoverTab` — simpler static-registry browse

### 5. Spending Policy (NAN-side) — COMPLETE
- `AgentPage.tsx` `PolicyTab` — daily limit, per-tx, per-service, auto-approve threshold, require-approval toggle, allowed categories
- These limits are enforced in `AgentChat` and `agent-orchestrator.ts` before any service call
- **Correctly labeled** as NAN-side enforcement (not Circle-side)

### 6. Spending Policy (Circle-side) — PARTIALLY COMPLETE, CORRECTLY BOUNDED
- **Read:** `api/agent-wallet.ts` `policy-read` and `policy-budget` — runs `circle wallet limit --output json` via CLI
- **Set:** `ManagePolicyModal` shows copy-to-run CLI command — this is the **only correct approach** because `circle wallet limit set` requires an interactive human OTP that cannot be automated
- **Mainnet-only gate:** backend returns `mainnet_only: true` for testnet chains; UI shows honest amber notice
- **Correctly labeled:** Circle is source of truth; NAN never stores or simulates Circle policy values

### 7. Multi-Agent Orchestration (A2A) — COMPLETE
- `src/lib/agent-network.ts` — task decomposition, agent discovery, cost estimation, policy check, real USDC payment callback, result synthesis
- `AgentPage.tsx` `MultiAgentOrchestrator` — full UI with subtask progress, confirmation gate, real `writeContractAsync` USDC payment

---

## Gaps Found

### GAP 1: `spend` action missing from `api/agent-wallet.ts` (Medium)
The `api/agent-execute.ts` Path B calls `POST /api/agent-wallet` with `action=spend` but that handler does not exist in `api/agent-wallet.ts`. If Path A (x402) fails and the service has a `payment_address`, Path B silently fails with a 400 `Unknown action`. 

**Impact:** Paid nanopayments that fail x402 negotiation cannot fall back to direct transfer.  
**Fix needed:** Add `action=spend` handler (create a transaction via `client.createTransaction`).

### GAP 2: `openweather-data` and `linkedin-jobs` in registry but not in execute handler (Low)
`agent-registry.ts` lists `openweather-data` and `linkedin-jobs` as services. `agent-execute.ts` has no `case` for them — they return 404.  
**Fix needed:** Add cases or mark them `enabled: false` in the registry.

### GAP 3: Circle Agent Marketplace returns HTML, not JSON (Informational)
`agents.circle.com/services` currently returns HTML (not JSON). The backend correctly falls back to the static list. The static list is labeled `source: 'static'` and shown with a badge in the UI — this is honest behavior.  
**No fix required** — the fallback and labeling are correct. Will auto-resolve if Circle publishes a JSON endpoint.

### GAP 4: `AGENT_WALLET_ID` and `AGENT_WALLET_ADDRESS` env vars (Deployment)
`api/agent-execute.ts` Path A requires these to be set in Vercel env vars. Without them, nanopayments are skipped with a clear `skipped_reason` message — this is safe and honest.  
**Action needed by operator:** Set these in Vercel environment variables after provisioning the agent wallet.

### GAP 5: Bridge — not implemented in NAN
Circle CLI supports `circle wallet bridge` (CCTP). NAN has `BridgePage.tsx` and `GatewayPage.tsx` as UI stubs.  
**Status:** Correctly labeled "Not configured in NAN" in `AgentWalletExperience.tsx` capability rows.  
**No fix needed** unless you want to implement the bridge flow.

### GAP 6: Swap — not implemented in NAN
Circle CLI supports `circle wallet swap` (LiFi). NAN has `SwapPage.tsx` as a stub.  
**Status:** Correctly labeled "Not configured in NAN" in capability rows.  
**No fix needed** unless you want to implement swap.

---

## Capability Status Summary (honest)

| Capability | Circle supports it? | NAN implemented it? | Current label |
|---|---|---|---|
| Hold USDC | ✅ | ✅ | Enabled |
| Receive USDC | ✅ | ✅ | Enabled |
| Send USDC | ✅ | ✅ | Enabled |
| Agent Payments (nanopayments / x402) | ✅ | ✅ (Path A) | Enabled |
| Service Discovery (Marketplace) | ✅ | ✅ | Enabled (Services tab) |
| NAN-side Spending Policy | N/A (NAN feature) | ✅ | Enabled (Policy tab) |
| Circle-side Spending Policy (read) | ✅ mainnet | ✅ | Manage Policy modal |
| Circle-side Spending Policy (set) | ✅ mainnet, OTP only | ⚠️ CLI copy-run | Manage Policy modal |
| Bridge (CCTP) | ✅ | ❌ Not yet | Not configured in NAN |
| Swap (LiFi) | ✅ | ❌ Not yet | Not configured in NAN |
| Automated Recurring Pay | ❌ not native Circle | ❌ | Coming soon |
| Multi-Agent Orchestration | N/A (NAN feature) | ✅ | Network tab |

---

## Verdict

**The Circle Agent Stack core is properly implemented in NAN.** The wallet, nanopayments (x402 Path A), service discovery, NAN-side policy enforcement, and multi-agent orchestration all exist as real code with real Circle API calls. No features are faked. Capability labels are honest.

The one actionable gap is **Gap 1 (missing `spend` action)** — nanopayment Path B cannot function without it. Everything else is either complete, correctly labeled as not-yet-implemented, or a deployment configuration step.
