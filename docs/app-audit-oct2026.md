# Paywell Full App Audit — October 8 2026

## Summary
- **Working end-to-end (no credentials needed):** 9 features
- **Working but needs env vars:** 7 features
- **Broken / incomplete:** 5 issues
- **Console errors to fix:** 2 (one critical, one cosmetic)

---

## ✅ Working — No Credentials Needed

| Feature | Notes |
|---|---|
| App shell, routing, navigation | Splash, landing, login, all views wired correctly |
| Wallet connection (wagmi / ConnectKit) | MetaMask/Rabby/etc connect, session persists in Zustand |
| Passkey login (Circle Modular Wallet) | `CirclePasskeyLogin` → `isPasskeyUser: true` stored in auth |
| USDC balance display | `useReadContract` on USDC ERC-20, live from Arc Testnet |
| Send USDC (wagmi path) | `writeContract` on `transfer()`, wagmi user flow complete |
| Send USDC (passkey path) | `sendFromPasskeyWallet` via bundler, user op path wired |
| Receive / QR | Static QR from address, copy-to-clipboard, works |
| Faucet page | Calls `/api/misc?route=faucet`, displays testnet USDC link |
| Gateway — Balance tab | REST API `/v1/balances` summed across all 8 domains |
| Gateway — Deposit (wagmi) | Correct `deposit(token, amount)` ABI, approve → deposit flow |
| Gateway — Deposit (passkey) | Bundler `sendUserOperation` batching approve + deposit |
| Gateway — Transfer (all 3 paths) | Fixed maxBlockHeight, maxFee scale, contractSigner, attestation polling |
| Activity feed | `addActivity` fires on tx, stored in Zustand + reported to server |
| Recurring payments (wagmi) | `useWriteContract` + `useWaitForTransactionReceipt`, scheduler wired |
| Command palette (⌘K) | Search, keyboard nav, recent searches — all working |
| Notifications (local) | In-memory store, bell badge, mark-as-read |
| Favorites, Search, Profile | Pure client-side state, working |
| FAQ, About, Support, Feedback, Suggestions | Static/form pages, work without credentials |
| Dark/light theme | `useNanTheme` + CSS vars, persisted |
| PaywellEscrow contract | Deployed, 27 tests pass, ABI wired in frontend |

---

## ⚠️ Working but Needs Env Vars

| Feature | Missing var | Behaviour without it |
|---|---|---|
| AI Agent Chat (NAN) | `GROQ_API_KEY` | Mock replies returned — chat works but answers are canned |
| Circle Email OTP login | `SMTP_HOST/PORT/USER/PASS` | OTP code printed to server console — usable in dev, broken in prod |
| Circle UCW (email) wallet ops | `CIRCLE_API_KEY` (or `CIRCLE_DEVELOPER_CONTROLLED_API_KEY`) | All `/api/wallet` actions return 503 with clear error message |
| Buy USDC (Onramp) | `CIRCLE_STABLECOIN_KIT_API_KEY` | Returns 503 "Add CIRCLE_API_KEY to Vercel environment variables" |
| x402 nanopayments | `VITE_X402_SELLER_ADDRESS` | Middleware disabled, paid endpoints free — no error shown to user |
| Push notifications | `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` | Service worker registered but push sub silently fails |
| Marketplace / Redis shared state | `KV_REST_API_URL` + `KV_REST_API_TOKEN` | Falls back to in-memory (data lost on restart), shop is local-only |

---

## ❌ Broken / Incomplete

### 1. Circle UCW deposit on Gateway — session error (FIXED this session, but needs API key to fully verify)
The `W3SDepositTab` now correctly routes to `POST /api/wallet` with `action: create-contract-exec`. Without `CIRCLE_API_KEY` set, users see a clear "CIRCLE_API_KEY not configured" message instead of "Circle session expired". The fix is correct but end-to-end verification requires a live Circle API key.

### 2. Google OAuth login incomplete
`CircleGoogleLogin.tsx` exists and is wired into the login page, but the callback route at `/api/auth/google/callback` is a Netlify function only (`netlify-functions/auth-google-callback.ts`) — the Express server has no equivalent route. On local dev / Railway, Google login will fail after the OAuth redirect.
**Fix:** Add `GET /api/auth/google/callback` to `server/index.ts`.

### 3. Onramp page — wagmi-only (Circle users can't use it)
`OnrampPage.tsx` uses `useAccount()` wagmi hook and guards with `if (!isConnected || !address)`. Circle wallet users (`auth.circleWalletAddress`) are blocked by this check even though they have a wallet address.
**Fix:** Fall back to `auth?.circleWalletAddress` same pattern used in WalletPage and GatewayPage.

### 4. Recurring payments — Circle/passkey users unhandled
`RecurringPage.tsx` uses `useWriteContract` (wagmi) only. Circle UCW and passkey users land on the form but clicking "Run" silently does nothing (wagmi address is undefined, the guard exits early).
**Fix:** Add `useCircleTransaction.sendTransfer` / passkey bundler path, same pattern as WalletPage send.

### 5. Agent Wallet (`AgentWalletExperience`) — developer-controlled wallet provisioning
The "provision agent wallet" flow calls `/api/agent-wallet` which requires `CIRCLE_DEVELOPER_CONTROLLED_API_KEY` + `CIRCLE_ENTITY_SECRET`. Without them it returns mock data and shows a fake `0x0000…` wallet address. There is no UI warning to the user that the wallet is not real.
**Fix:** Add a visible banner when `agentWallet.address` matches the mock fallback address.

---

## 🐛 Console Errors

### Critical (from earlier session, now stale in console.jsonl)
`Uncaught ReferenceError: Layers is not defined` — this was from an earlier edit where `Layers` was temporarily removed from `AppShell.tsx` imports. The import is correct now (`Layers` is present in line 5 of `AppShell.tsx`). The error is stale in the log from a previous browser session.

### Cosmetic (persistent)
`[vite] failed to connect to websocket` — HMR over the Arc Studio preview tunnel doesn't support WebSocket upgrades. This is expected behaviour in the sandbox preview and has no effect on the app. It is not a bug.

### Warning (harmless)
`Module "crypto"/"util"/"buffer" has been externalized for browser compatibility` — these come from a server-side dependency being bundled for browser. Does not crash anything but worth watching if a feature starts failing silently.

---

## 🔑 Env Vars Checklist (priority order for production)

```
# Required for Circle UCW login + wallet operations + Gateway deposit for email users
CIRCLE_API_KEY=

# Required for AI Agent chat to give real answers
GROQ_API_KEY=

# Required for Email OTP in production
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_USER=resend
SMTP_PASS=re_your_key

# Required for Buy USDC onramp
CIRCLE_STABLECOIN_KIT_API_KEY=

# Required for agent wallet (developer-controlled)
CIRCLE_ENTITY_SECRET=

# Required for x402 micropayments
VITE_X402_SELLER_ADDRESS=0xYourWallet

# Required for push notifications
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=

# Required for shared marketplace listings (Redis)
KV_REST_API_URL=
KV_REST_API_TOKEN=

# Optional: restrict admin dashboard to one wallet
VITE_ADMIN_ADDRESS=

# Optional: Circle passkey/modular wallet
VITE_CLIENT_KEY=
VITE_CIRCLE_APP_ID=
```

---

## Architecture Notes

- **No `.env` file exists in the sandbox.** All env vars are absent in dev. The backend gracefully mocks everything missing, but all Circle-gated features need real keys to function in production.
- **Dual server architecture:** Vite (5173) + Express (3001). Vite proxies `/api/*` to Express. Works correctly in dev; Railway/Vercel each need their own deploy config (`railway.toml` / `vercel.json` both present).
- **State persistence:** Zustand `persist` middleware with `paywell-state-v2` key. `encryptionKey` correctly wiped on reload (security). `userToken` survives reload (convenience).
- **Contract tests:** 27/27 pass. `PaywellEscrow.sol` compiles clean (2 benign `block.timestamp` warnings).
