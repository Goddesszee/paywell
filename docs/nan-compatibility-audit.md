# NAN App — Circle vs Wagmi User Compatibility Audit
_Date: 2026-10-01_

## Summary
| Feature | Wagmi (MetaMask/ConnectKit) | Circle User (email/OTP) | Notes |
|---|---|---|---|
| Landing page | ✅ | ✅ | No auth needed |
| Login / OTP | ✅ | ✅ | Separate paths, both wired |
| Dashboard balance | ✅ | ✅ | Falls back to `circleWalletAddress` |
| Wallet balance | ✅ | ✅ | Falls back to `circleWalletAddress` |
| Send USDC | ✅ | ✅ | `useCircleTransaction` challenge-popup path |
| Receive / QR | ✅ | ✅ | Uses `address ?? circleWalletAddress` |
| Swap balance | ✅ | ✅ (fixed this session) | Now uses Circle address in `useTokenBalance` |
| Swap execute | ✅ | ⚠️ Conditional | Works only if `CIRCLE_DEVELOPER_CONTROLLED_API_KEY` + `CIRCLE_ENTITY_SECRET` are set in env |
| Bridge | ✅ | ⚠️ Partial | Circle users get a "Connect a browser wallet" gate for non-Arc→other bridges; Arc→other via CCTP uses `useCircleTransaction` |
| Onramp (Buy USDC) | ✅ | ❌ Missing | `OnrampPage` checks `isConnected && address` (wagmi only); Circle wallet address ignored |
| Gateway deposit | ✅ | ✅ | `useCircleTransaction` path exists |
| Gateway withdraw | ✅ | ✅ | `useCircleTransaction` path exists |
| Recurring payments | ✅ | ❌ Missing | Uses `useAccount().address` only — no Circle fallback; form shows blank, run button disabled |
| Marketplace / Shop | ✅ | ✅ | Uses store `auth` for wallet address |
| Agent page | ✅ | ✅ | Uses store `auth.circleWalletAddress` |
| Payment requests | ✅ | ✅ | Store-based |
| Activity feed | ✅ | ✅ | Store-based |
| Settings / Profile | ✅ | ✅ | Store-based |
| Notifications | ✅ | ✅ | Session token from store |

---

## Issues Found

### 🔴 HIGH — Onramp broken for Circle users
**File:** `src/components/pages/OnrampPage.tsx` line 38  
```ts
if (!isConnected || !address) { setError('Connect your wallet first'); return }
```
`isConnected` is wagmi only. A Circle user who just logged in has `auth.circleWalletAddress` set but `isConnected === false`, so the Buy USDC button always errors with "Connect your wallet first".

**Fix:** Use `auth?.circleWalletAddress ?? address` as the destination and check for either.

---

### 🔴 HIGH — Recurring payments broken for Circle users
**File:** `src/components/pages/RecurringPage.tsx` line 46  
```ts
const { address, chainId } = useAccount()
```
Only `address` from wagmi is used for sending the transfer — no Circle wallet fallback. Circle users see no "run" button (it's gated on `!!address`) and recurring tasks that fire automatically will silently fail to send.

**Fix:** Read `auth?.circleWalletAddress` as fallback address and use `useCircleTransaction` for the send path when `isCircleUser`.

---

### 🟡 MEDIUM — Bridge: Circle users can't bridge from non-Arc chains
**File:** `src/components/pages/BridgePage.tsx`  
The `getAdapter()` call requires an EIP-1193 provider. When source chain is not Arc, a Circle user is blocked. When source IS Arc, the `useCircleTransaction` path works correctly.

**Fix:** For non-Arc source chains, show a clear message: "Bridging from [chain] requires a browser wallet (MetaMask). Your Circle wallet can only bridge from Arc Testnet."

---

### 🟡 MEDIUM — Swap for Circle users needs server creds
**File:** `api/wallet.ts`  
The `estimate-swap` and `swap` actions return 503 if `CIRCLE_DEVELOPER_CONTROLLED_API_KEY` or `CIRCLE_ENTITY_SECRET` are not set. The frontend shows "credentials not configured" — this is a clear message, but functionally swap is unavailable for Circle users until those env vars are added to the deployment.

**Action required:** Add `CIRCLE_DEVELOPER_CONTROLLED_API_KEY` and `CIRCLE_ENTITY_SECRET` to Vercel/Netlify env vars.

---

### 🟢 LOW — Onramp also needs CIRCLE_STABLECOIN_KIT_API_KEY
The onramp session endpoint returns 503 with a clear message if this key is missing. Not a code bug, just a deployment config item.

---

## What works perfectly for both user types
- Login, OTP, Google OAuth
- Dashboard (balance, sparkline, deposit/receive modal)  
- Wallet (balance, send via Circle challenge popup, receive QR)  
- Swap UI, balance display, quote flow (Circle path needs env vars to execute)  
- Gateway deposit + withdraw  
- Marketplace, shop, cart, orders, offers  
- Agent chat, payment requests, activity feed  
- Settings, profile, notifications, favorites, search  
