# Bridge / Swap / Gateway — Circle Docs Compliance Audit
_Date: Oct 12, 2026_

---

## Summary

| Feature | Status | Critical issues |
|---------|--------|----------------|
| Bridge  | PASS   | None |
| Swap    | PASS with 1 warning | USDC↔NATIVE guard needed |
| Gateway | PASS   | None |

---

## Bridge (BridgePage.tsx)

### What it does
Uses `@circle-fin/app-kit` + `@circle-fin/adapter-viem-v2` — the recommended Stack per Circle docs. Executes the full CCTP V2 lifecycle: approve → burn → fetchAttestation → mint.

### Compliance check

| Requirement | Status |
|-------------|--------|
| Uses AppKit (recommended) | PASS |
| Uses `createViemAdapterFromProvider` for browser wallets | PASS |
| String chain names (e.g. `'Arc'`, `'Base'`) in `kit.bridge()` | PASS |
| CCTP domain IDs match Circle docs | PASS — Arc=26, Eth=0, Base=6, Arb=3, OP=2, Polygon=7, Avax=1, Uni=10 |
| 4-step tracker (approve/burn/fetchAttestation/mint) | PASS |
| Does NOT auto-invoke bridge() on render | PASS — triggered by explicit button tap |
| try/catch + result saved for recovery | PASS |
| Live fee fetch from `iris-api.circle.com/v2/burn/USDC/fees` | PASS |
| Mainnet only (testnet not shown) | Note: app defaults to mainnet Arc; testnet bridge would need Arc_Testnet |

### Issues
**None.** Bridge implementation matches Circle docs exactly.

---

## Swap (SwapPage.tsx)

### What it does
Uses `@circle-fin/app-kit` + `@circle-fin/adapter-viem-v2`. Same-chain swaps on Arc Mainnet via LiFi aggregator. Shows estimate before executing. Slippage configurable.

### Compliance check

| Requirement | Status |
|-------------|--------|
| Uses AppKit | PASS |
| `estimateSwap()` before executing | PASS |
| String chain name `'Arc'` | PASS |
| Does NOT auto-invoke swap() | PASS |
| `kitKey` kept off browser (omitted) | PASS — keyless/permissionless mode |
| try/catch wrapping | PASS |
| Informs user about LiFi aggregator routing | PARTIAL — fees shown, LiFi not named explicitly |
| Slippage configurable | PASS — default 300 bps, UI toggle |

### Warning: USDC ↔ NATIVE no-op check (IMPORTANT)
Circle docs state: _"On Arc, NATIVE and USDC are the same asset. A USDC↔NATIVE swap is a same-asset no-op. Detect and reject it BEFORE estimateSwap."_

The swap page includes `NATIVE` in the token list with the note "Native Gas (USDC)" — but there is **no guard** preventing a user from selecting USDC as input and NATIVE as output (or vice versa). This would route to LiFi as a real swap, waste gas, and likely fail or return 1:1 with fees deducted.

**Fix needed:** Add a check before `estimateSwap`:
```ts
if ((tokenIn === 'USDC' && tokenOut === 'NATIVE') || (tokenIn === 'NATIVE' && tokenOut === 'USDC')) {
  setError('USDC and native gas are the same asset on Arc — no swap needed.')
  return
}
```

### Issues
1. **USDC↔NATIVE not guarded** — should reject before estimation per Circle docs.
2. LiFi not named explicitly in the UI (best practice, not blocking).

---

## Gateway (GatewayPage.tsx)

### What it does
Direct contract integration (no SDK — correct per Gateway docs which state "there is no SDK to install"). Implements the full flow: deposit (approve + `GatewayWallet.deposit()`), burn intent (EIP-712 signed), POST to Gateway API, mint via `gatewayMint()`.

### Compliance check

| Requirement | Status |
|-------------|--------|
| Contract addresses from `onchain-facts.ts` (`getProtocolContractByName`) | PASS |
| Gateway Wallet mainnet: `0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE` | PASS (via onchain-facts) |
| Gateway Minter mainnet: `0x2222222d7164433c4C09B0b0D809a9b52C04C205` | PASS (via onchain-facts) |
| Gateway REST API: `https://gateway-api.circle.com/v1` | PASS |
| EIP-712 typed data — BurnIntent struct fields match Circle reference exactly | PASS — all 12 TransferSpec fields present in correct order |
| `sourceDomain` + `destinationDomain` always specified | PASS |
| Domain IDs match Circle docs | PASS — Arc=26, Eth=0, Base=6, Arb=3, Avax=1, Polygon=7, OP=2, Uni=10 |
| USDC parsed with 6 decimals (`parseUnits(amount, 6)`) | PASS |
| `toBytes32()` used for address fields | PASS |
| bigints serialised as decimal strings in JSON | PASS — custom JSON replacer |
| Forwarding Service support (`?enableForwarder=true`) | PASS |
| `contractSigner=true` for SCA/passkey wallets | PASS |
| ERC-20 approve before deposit | PASS |
| Does NOT auto-execute transfers | PASS — explicit button tap required |

### Issues
**None.** Gateway implementation matches Circle docs exactly.

---

## Recommended fix (Swap only)

Add the USDC↔NATIVE guard to `SwapPage.tsx` before calling `estimateSwap`. This is a one-line check. Everything else is compliant.
