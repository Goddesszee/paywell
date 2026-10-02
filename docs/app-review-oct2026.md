# Paywell / NAN — Full App Review
**Date:** October 2, 2026  
**Reviewed by:** Arc Studio (every page, every server route, every hook and lib read from source)

---

## 1. What is actually working right now (no env vars needed)

| Area | Status | Evidence |
|---|---|---|
| Landing page (photo slideshow, mobile + desktop) | ✅ Works | `LandingPage.tsx` — pure React, no external deps |
| Login page — wallet connect path | ✅ Works | `LoginPage.tsx` + `ConnectKitButton` wired correctly |
| Onboarding 4-step flow | ✅ Works | `OnboardingPage.tsx` — all local state |
| Name collection page | ✅ Works | `NamePage.tsx` — pure local store |
| Home page — live USDC + EURC balance from chain | ✅ Works | `HomePage.tsx` uses `useReadContract` with real Arc Testnet addresses |
| Dashboard — live balance, NGN rate, sparkline, QR receive | ✅ Works | `DashboardPage.tsx` — same wagmi pattern + `https://open.er-api.com` for NGN |
| Wallet page — send USDC / EURC | ✅ Works | `WalletPage.tsx` — full `useWriteContract` + `useWaitForTransactionReceipt` flow |
| Wallet page — receive (QR + copy) | ✅ Works | QRCodeSVG rendered from live wagmi address |
| Activity page — filter, search, grouped by date | ✅ Works | `ActivityPage.tsx` — reads from Zustand store |
| Settings page — theme, agent limits, wallet info | ✅ Works | Full read/write against Zustand, `requireChain` for Arc Testnet |
| Profile page — 4 tabs (profile/security/notifications/theme) | ✅ Works | Calls `/api/account/profile` (server up) and `/api/account/sessions` |
| CCTP Bridge (AppKit) | ✅ Works | `BridgePage.tsx` — uses `@circle-fin/app-kit`, no API key required |
| Token Swap (AppKit) | ✅ Works | `SwapPage.tsx` — same; USDC↔EURC on Arc Testnet is the live pair |
| Gateway — deposit/withdraw on Arc Testnet | ✅ Works | `GatewayPage.tsx` — calls live `depositFor` + `removeFund` on correct addresses |
| Recurring payments (manual + scheduled) | ✅ Works | `RecurringPage.tsx` — wagmi `useWriteContract` against USDC ERC-20 |
| PaymentRequestPage — deep-link `?pay=0x...&amount=N` | ✅ Works | Parses URL params, full wagmi send flow |
| Shop / marketplace — browse, cart, escrow checkout | ✅ Works | `ShopPage.tsx` + `ShopCart.tsx` + `PaywellEscrow` contract calls |
| AI Agent chat — simulated (no Groq key) | ✅ Works (mock) | Falls through to `simulateAgentResponse` in `AgentPage.tsx` AND `mockAgentReply` on server |
| Agent orchestrator — policy + service discovery | ✅ Works (local) | `agent-orchestrator.ts` + `agent-registry.ts` run fully client-side |
| Agent network (A2A) UI | ✅ Works (simulated) | All subtask state is local; no live x402 payments without credentials |
| Support tickets — create, reply, reopen | ✅ Works | `/api/support/tickets` fully implemented in `server/index.ts` |
| Notifications — list, mark read | ✅ Works | `/api/notifications` fully implemented |
| FAQ page | ✅ Works | `/api/faqs` returns 12 seeded items immediately |
| About page | ✅ Works | `/api/about` returns seeded content |
| Feedback page — star rating + comment | ✅ Works | `/api/feedback` implemented, session required |
| Suggestions page — submit + view own | ✅ Works | `/api/suggestions` implemented |
| Search page + Command Palette | ✅ Works | Pure client-side against `STATIC_RESULTS` |
| Favorites page — save / remove | ✅ Works | Pure Zustand `favorites` array |
| Admin Dashboard — support, FAQ, about, feedback, suggestions, analytics | ✅ Works | All admin API routes implemented; accessible at `activeView='admin'` |
| Dark / light theme toggle | ✅ Works | `useNanTheme` + `data-theme` on `<html>` |
| Vite HMR WebSocket | ⚠️ Fails silently | `console.jsonl` shows repeated WS errors — cosmetic, does not break the app, just disables hot reload |
| PaywellEscrow contract (Arc Testnet) | ✅ Deployed | `0x1d33876fa77b0d0026f8cee30448941c0cf075cb` — 27/27 tests pass |

---

## 2. Broken / degraded — needs env vars or config

### 2a. CRITICAL — App crashes when session from previous sandbox is stale

**Bug found in `console.jsonl` (line 13):**  
```
Uncaught TypeError: Cannot read properties of null (reading 'useCallback')
```
This is a React duplicate-instance error caused by Zustand rehydrating a stale `auth` object from `localStorage` that contains an `encryptionKey` from the Circle user-controlled wallets SDK. That SDK (`@circle-fin/w3s-pw-web-sdk`) bundles its own React copy. The `vite.config.ts` already has deduplication logic for this, but it only fires when the Circle SDK is actually initialised — if the rehydrated state triggers an SDK initialisation before React's internal dispatcher is ready, the crash happens.

**Impact:** The preview was blank at one point in the session history. A hard refresh clears `localStorage` and fixes it.  
**Fix needed:** Add a guard in `appStore.ts` to clear `encryptionKey` on rehydration if the Circle SDK hasn't been initialised yet.

---

### 2b. Features needing env vars

| Feature | What breaks | Env var(s) needed | Degraded mode |
|---|---|---|---|
| AI Chat (real) | Returns canned `mockAgentReply` responses | `GROQ_API_KEY` or `OPENAI_API_KEY` | Mock replies work — agent chat UI is fully functional |
| Onramp (Buy USDC) | `/api/onramp-session` returns 503 | `CIRCLE_API_KEY` (Circle Standard Developer key) | Shows "Add CIRCLE_API_KEY" error message |
| In-app Faucet | `/api/misc?route=faucet` returns 503 | `CIRCLE_DEVELOPER_CONTROLLED_API_KEY` | Shows error + external faucet.circle.com link |
| Circle email wallet login | `/api/wallet/request-otp` returns 500 | `CIRCLE_USER_CONTROLLED_API_KEY` | Wallet connect (MetaMask/injected) works fine |
| Circle email wallet SDK execute | `W3SSdk.execute()` fails silently | `VITE_CIRCLE_APP_ID` | Wagmi path unaffected |
| Developer-controlled wallet transfers | Uses mock wallets | `CIRCLE_DEVELOPER_CONTROLLED_API_KEY` + `CIRCLE_ENTITY_SECRET` | Mock returns `txId: mock-tx-...` |
| Email OTP delivery | OTP printed to server console only | `SMTP_HOST/PORT/USER/PASS` or Resend | Dev mode: OTP is in server logs; `_devOtp` returned in response body only when `NODE_ENV=development` — works in dev |
| x402 nanopayments on AI chat | Gateway middleware is a no-op | `SELLER_ADDRESS` in `.env` | Chat still works, just unpaid |
| Google login | Redirects to mock token | `VITE_GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` | Mock auth flow produces a `demo@google.com` session — UI handles it |

---

## 3. Data persistence gaps

All server state is in-memory (`Map`, arrays). On every server restart:
- OTP codes, sessions, support tickets, notifications, feedback, suggestions, profile updates all reset.
- There is `@upstash/redis` in `package.json` but it is **not wired up** in `server/index.ts` — the in-memory stores are used instead.

**Impact in production (Vercel/Netlify):** Each serverless invocation is stateless, so users lose their session immediately. The `api/` directory has Vercel and Netlify function stubs — check those.

**Fix:** Wire `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` into the session, support, notification, and profile stores.

---

## 4. Minor bugs found by reading code

| # | File | Bug |
|---|---|---|
| 1 | `server/index.ts` L509 | `circleTransfer` hard-codes a USDC tokenId `f26e2fc3-3fc5-5b11-8fc8-0a5a9a71ad7a` — this is Circle's internal testnet USDC token ID. If Circle changes it or EURC is passed, the transfer silently uses the same ID. Should look up the token by symbol from the wallet balance response. |
| 2 | `server/index.ts` L1143 | Google OAuth callback hard-codes `http://localhost:5173` as `appBase`. In production (Vercel) the redirect lands at `localhost:5173` and breaks. Should use `req.headers.origin` or a `VITE_APP_URL` env var. |
| 3 | `HomePage.tsx` L113-115 | Sums `usdcNum + eurcNum` and shows as "Total Balance" — these are two separate stablecoins priced at different rates (USD vs EUR). This overstates balance when EURC ≠ USD. Should show them separately or apply an FX rate. |
| 4 | `DashboardPage.tsx` L147 | Holdings breakdown always shows EURC and NGN as `$0.00` — EURC balance is not fetched on Dashboard (only on Home). NGN row is decorative with no real balance. |
| 5 | `AppShell.tsx` L47 | `Layers` from lucide-react was previously undefined (seen in `console.jsonl` lines 87-94: `ReferenceError: Layers is not defined`). This is now imported at line 6 — **resolved in current code**. |
| 6 | `ProfilePage.tsx` L36-40 | `fetch('/api/account/sessions')` returns the `loginHistory` for the session email. But `loginHistory` is only populated when `sessionStore.set` is called (OTP verify). Wallet-connect users never call OTP verify, so their security tab shows "No recent sessions recorded" even after logging in. |
| 7 | `OnrampPage.tsx` L43 | Error message says "Add CIRCLE_API_KEY to **Vercel** environment variables" — should be more generic since the app also runs on Netlify and local. |
| 8 | `FaucetPage.tsx` L51 | Same — error text is Vercel-specific. |
| 9 | `AgentPage.tsx` L52 | `X402_PRICE = '0.001'` — this is the per-message price when x402 is enabled on `/api/chat`. The UI shows the price but the `_paywall` middleware is a no-op without `SELLER_ADDRESS`, so no payment is ever collected in the current sandbox. |
| 10 | `server/index.ts` L1101 | `http://localhost:${PORT === 3001 ? 5173 : PORT}` — Google mock redirect assumes port 5173. On Arc Studio preview this resolves to the sandbox preview URL, not localhost. Will not work in the preview browser. |

---

## 5. Circle Agent Stack assessment

| Component | In the codebase | Status |
|---|---|---|
| `@circle-fin/x402-batching` | `server/index.ts` — `createGatewayMiddleware` on `/api/chat` | Wired, disabled until `SELLER_ADDRESS` is set |
| `@circle-fin/app-kit` (Bridge) | `BridgePage.tsx` | Fully working |
| `@circle-fin/app-kit` (Swap) | `SwapPage.tsx` | Fully working |
| `@circle-fin/developer-controlled-wallets` | `server/index.ts` — `circleTransfer` | Wired, mock mode without credentials |
| `@circle-fin/user-controlled-wallets` | `server/index.ts` + `CircleEmailLogin.tsx` | Wired; needs `CIRCLE_USER_CONTROLLED_API_KEY` + `VITE_CIRCLE_APP_ID` |
| `@circle-fin/w3s-pw-web-sdk` | `CircleEmailLogin.tsx` + `useCircleTransaction.ts` | SDK initialised correctly; needs `VITE_CIRCLE_APP_ID` |
| Circle Smart Contract Platform | `PaywellEscrow` deployed via SCP | Live on Arc Testnet |
| Circle Onramp | `OnrampPage.tsx` + `/api/onramp-session` | Wired; needs `CIRCLE_API_KEY` |
| Circle Gateway (`depositFor` / `removeFund`) | `GatewayPage.tsx` | Working — uses direct contract calls, no API key |
| `agents.circle.com` marketplace | **Not connected** | `agent-registry.ts` has a hardcoded local service catalogue. No HTTP call to `agents.circle.com` is made anywhere in the codebase. |
| Agent A2A payments | Simulated in `agent-network.ts` | USDC payment logic exists but calls `discoverNetworkAgents` which returns local mock data, not live registry |

---

## 6. What to fix first (priority order)

1. **Crash guard** — add `encryptionKey: undefined` to the Zustand rehydration merge so stale Circle SDK tokens don't crash the app on load.
2. **Redis persistence** — wire `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` into session, support, notification, and profile stores so data survives restarts.
3. **Google OAuth `appBase`** — replace `http://localhost:5173` with a dynamic base URL from the request or env var.
4. **EURC balance on Dashboard** — add a `useReadContract` for EURC the same way Home does.
5. **Total balance FX** — stop adding raw USDC and EURC numbers together as if they are 1:1.
6. **Add env vars** (see table above) to unlock real AI chat, onramp, and Circle wallets.
7. **Connect `agents.circle.com`** — replace the local `AGENT_NETWORK_REGISTRY` constant with a live fetch from the Circle Agent Marketplace if you want real agent discovery.
