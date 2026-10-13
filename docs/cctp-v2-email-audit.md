# CCTP V2 — Email/UCW Bridge Implementation Review
_Reviewed: October 2026_

---

## Scope

This review covers the full stack for email (UCW) users calling the CCTP V2 bridge:

| File | Role |
|---|---|
| `src/components/pages/BridgePage.tsx` | Main bridge UI + UCW branch |
| `api/wallet.ts` — `ucw-bridge-stream` | Server-side App Kit call + streaming NDJSON |
| `api/wallet.ts` — `ucw-bridge-start` (legacy) | Old single-challenge path (kept for compat) |
| `src/components/pages/AgentBridgeTab.tsx` | Agent Wallet bridge (separate UCW flow) |
| `src/lib/circle-session.ts` | Session helpers (`ensureCircleCreds`) |

---

## What Works Well

### 1. Streaming multi-challenge protocol (BridgePage + ucw-bridge-stream)
The original single-challenge approach couldn't handle the two PIN challenges CCTP V2 needs (approve + burn). The streaming NDJSON path is the right solution: the server keeps the HTTP connection open, fires one JSON line per challenge, and the browser shows the Circle PIN popup for each in sequence. The step-tracking UI maps correctly: `approve → burn → fetchAttestation → mint`.

### 2. On-demand wallet creation on foreign chains
When an email user bridges **from** a non-Arc chain the code correctly checks whether they have a UCW on that chain, creates one with a single PIN challenge if they don't, then pauses with a clear message asking the user to fund it. Same logic on the **destination** side: a destination UCW is created on demand and the `recipientAddress` is passed to the Forwarding Service so the mint lands in the right wallet.

### 3. Forwarding Service usage
For `Arc → other chain` the server passes `useForwarder: true, recipientAddress` to App Kit, which means Circle handles attestation and mint server-side. The user pays only one gas (the burn), and never needs ETH or any gas token on the destination. This is the correct pattern for UCW users who can't sign a destination transaction.

### 4. Transient RPC error retry
The server retries `kit.bridge()` up to twice on `"exceeds defined timeout"` style errors, **but only before any PIN challenge has been sent** (`stepIndex === 0`). This prevents double-spend while tolerating the Arc RPC slowness that trips up many UCW flows.

### 5. Session freshness — ensureCircleCreds
`ensureCircleCreds()` tries a silent token refresh before returning `SESSION_EXPIRED_MSG`. This significantly reduces false "session expired" errors when the tab has been open for hours.

---

## Issues Found

### ISSUE 1 — MEDIUM: `ucw-bridge-start` (legacy path) is still reachable but broken for cross-chain
**Location:** `api/wallet.ts` lines 537–605

The old `ucw-bridge-start` action still handles the first challenge only. For cross-chain CCTP V2 there are always two challenges (approve + burn), so after the user approves the first one the second challenge fires into a resolved promise that nobody is listening to, and the bridge silently completes burn without a user-visible step tracker. No client currently calls `ucw-bridge-start` directly (BridgePage uses `ucw-bridge-stream`), but if it gets invoked — for example from an agent script or a future AgentBridgeTab variant — the user will see no burn step and may get a hung spinner.

**Fix:** Add a clear warning comment that this path is legacy/broken for two-challenge flows, or remove it if nothing calls it.

```ts
// ⚠ LEGACY: only handles the first challenge (approve).
// For a full CCTP V2 bridge (approve + burn = 2 challenges) use ucw-bridge-stream instead.
// This action is kept only to avoid breaking old callers; do NOT use it for new code.
if (action === 'ucw-bridge-start') {
```

---

### ISSUE 2 — MEDIUM: AgentBridgeTab attestation/mint steps are faked
**Location:** `src/components/pages/AgentBridgeTab.tsx` lines 177–183

After the burn challenge completes, the code does:
```ts
updateStep('attest', { status: 'active' })
await new Promise(r => setTimeout(r, 3000))
updateStep('attest', { status: 'done' })
updateStep('mint',   { status: 'done' })
```

There is no actual attestation poll or mint confirmation. The UI shows "Bridge complete" 3 seconds after the burn tx is submitted — even if the Iris API hasn't produced an attestation yet and the mint never happened. On a busy network the attestation can take 20+ seconds. The `mintTx` shown in the success card is `burnExec.txHash ?? ''` which is the **burn** hash, not a mint hash, so the explorer link on the destination chain will show nothing.

**Fix:** After the burn, the backend should either:
  - Use `useForwarder: true` in `app-kit.bridge()` (the easiest fix — let the SDK handle attestation + mint and return a proper result), or
  - Poll `https://iris-api.circle.com/v2/messages/{srcDomain}?transactionHash={burnTxHash}` until `status === 'complete'`, then call `receiveMessage` on the destination chain.

The quick fix — reuse the same streaming NDJSON bridge endpoint (`ucw-bridge-stream`) instead of the manual approve + burn round-trips — brings the Agent Wallet flow in line with the main UCW flow at zero extra code.

---

### ISSUE 3 — LOW: `W3SSdk.execute()` result has no `txHash` in AgentBridgeTab
**Location:** `src/components/pages/AgentBridgeTab.tsx` line 146 and 173

```ts
const approveExec = await agentSdk.execute(approveData.challengeId)
updateStep('approve', { status: 'done', txHash: approveExec.txHash })
```

`executeWithGuard` calls the W3S SDK `sdk.execute()` callback but the callback result carries no `txHash` — it is a Circle challenge callback, not a transaction receipt. `approveExec.txHash` will always be `undefined`, so the step tracker never shows a clickable tx link even when the transaction succeeded.

**Fix:** After `execute()` succeeds, call `getChallengeTransactionId()` from `circle-session.ts` to poll for the transaction ID, then resolve the tx hash from there.

---

### ISSUE 4 — LOW: UCW bridge on same chain (Arc → Arc) is an allowed no-op
**Location:** `BridgePage.tsx` line 594 / `api/wallet.ts` `ucw-bridge-stream`

The UI does not disable the Bridge button when `fromIdx === toIdx` (both chains are Arc). The server `useFwd` flag is false for same-chain, but `kit.bridge()` with Arc-to-Arc is a wasted round trip that charges the CCTP fee for zero cross-chain value. The fee summary correctly shows "Free (same domain)" but the user can still submit.

**Fix:** Disable the Bridge button and show an inline error when `fromChain.chainId === toChain.chainId`.

---

### ISSUE 5 — LOW: Missing `fromChain` guard when email user picks Linea/Sei/World Chain
**Location:** `BridgePage.tsx` lines 694–696

```ts
const bc = UCW_CHAIN_ENUM[fromChain.chainId]
if (!bc) {
  setErrMsg(`Bridging from ${fromChain.label} with an email wallet isn't supported yet…`)
```

This guard exists for **source** chain. But `UCW_CHAIN_ENUM` (keys: 1, 8453, 42161, 10, 137, 43114, 130) is missing Linea (59144), Sei (1329), and World Chain (480), which all appear in `CHAINS`. A user who picks one of these as the **destination** chain then gets a confusing backend error (`blockchain` not in `ALLOWED`) rather than a friendly UI message.

**Fix:** Add a symmetric guard for the destination chain selection for UCW users. Either filter those chains from the dropdown for email users or show the same amber warning.

---

## Summary Table

| # | Severity | Location | Description |
|---|---|---|---|
| 1 | MEDIUM | `api/wallet.ts:ucw-bridge-start` | Legacy path broken for two-challenge CCTP V2; should be guarded/removed |
| 2 | MEDIUM | `AgentBridgeTab.tsx:177-183` | Attestation + mint steps faked — mint is never confirmed, success shows burn tx |
| 3 | LOW | `AgentBridgeTab.tsx:146,173` | `sdk.execute()` callback carries no `txHash`; step tracker never shows tx link |
| 4 | LOW | `BridgePage.tsx` | Same-chain bridge (Arc → Arc) is not blocked in the UI |
| 5 | LOW | `BridgePage.tsx:694-733` | Linea/Sei/World Chain missing from `UCW_CHAIN_ENUM`; no friendly error on destination |

---

## What Does NOT Need Changing

- The streaming NDJSON `ucw-bridge-stream` path is structurally correct for a two-challenge UCW CCTP V2 flow.
- `ensureCircleCreds` + `refreshCircleToken` session refresh is properly integrated.
- Forwarding Service usage (`useForwarder: true, recipientAddress`) is correct for UCW users on all tested routes.
- Live CCTP fee fetch from `iris-api.circle.com/v2/burn/USDC/fees` (including the forwarding fee variant) is accurate.
- The `RecoverBridge` component correctly reads `decodedMessage.destinationDomain` via `destinationDomainOf()` and decodes the burn message before minting.
- `MESSAGE_TRANSMITTER_V2` address `0x81D40F21F12A8F0E3252Bccb954D722d4c464B64` matches Circle's published CCTP V2 contract address.
