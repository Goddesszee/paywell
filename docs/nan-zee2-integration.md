# Zee² × Nan Integration Guide

## What you have

| Project | Stack | Auth | Wallet | Storage | Deploy |
|---|---|---|---|---|---|
| **Nan** | Vanilla HTML/JS + Express (Node) | Email OTP → Circle Programmable Wallets | Developer-Controlled (Circle SDK) | Upstash Redis (KV) | Railway (backend) + Vercel (frontend) |
| **Zee²** | React + Vite + TypeScript | ConnectKit (browser wallet) | External wallet (wagmi) | Zustand → localStorage | Vercel (static) |

They are **complementary, not competing**. Nan has a production backend, real Circle wallet management, escrow, marketplace orders, KV persistence, CCTP, and email auth. Zee² has a polished React UI, AI agent workspace, onboarding flow, and product shopping UX. The integration strategy is to **bring Zee²'s frontend into Nan as its premium React UI layer**, calling Nan's existing API routes instead of making direct onchain calls.

---

## Integration Strategy: Zee² as Nan's React Frontend

Replace Nan's current `app.html` + `app.js` + `ui.js` (plain JS SPA) with Zee²'s React app, wired to Nan's existing `/api/*` backend routes.

### Three phases

---

## Phase 1 — Wire Zee² to Nan's auth system

**Current state:** Zee² uses ConnectKit (browser wallet connect). Nan uses email OTP → Circle developer-controlled wallets.

**What to do:**

Replace Zee²'s `OnboardingPage.tsx` wallet connect step with Nan's email OTP flow.

```
User enters email
  → POST /api/otp  { email }        (Nan route: sends OTP)
  → User enters code
  → POST /api/otp  { email, otp }   (Nan route: verifies)
  → Nan returns { token, walletAddress, walletId }
  → Store in Zustand: { email, token, walletAddress }
```

**Nan API routes to call:**
- `POST /api/otp` — send OTP
- `POST /api/otp` with `{ email, otp }` — verify OTP

**What to remove from Zee²:**
- `ConnectKitButton` import and usage in `WalletPage.tsx` and `OnboardingPage.tsx`
- wagmi `useAccount`, `useReadContract`, `useWriteContract` hooks (replace with Nan API calls)

**Add to Zee²'s Zustand store:**
```ts
auth: {
  email: string | null
  token: string | null
  walletAddress: string | null
  walletId: string | null
}
setAuth: (auth) => void
clearAuth: () => void
```

---

## Phase 2 — Wire wallet balance + send/receive to Nan's Circle API

**Current state:** Zee² calls `erc20.balanceOf` directly on-chain via wagmi. Nan has `POST /api/circle-wallets` with action `getWallet` and `transfer`.

**What to do:**

Replace the `useUSDCBalance` hook in `WalletPage.tsx` with a fetch to Nan's backend:

```ts
// Replace useReadContract with:
const res = await fetch('/api/circle-wallets', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-User-Token': token },
  body: JSON.stringify({ action: 'getWallet', email })
})
const { wallet, balances } = await res.json()
// wallet.address → display address
// balances[0].amount → USDC balance
```

**Send flow** — replace `useWriteContract` with:
```ts
await fetch('/api/circle-wallets', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-User-Token': token },
  body: JSON.stringify({
    action: 'transfer',
    email,
    to: recipientAddress,
    amount: amountInUsdc,   // human-readable string e.g. "25.00"
    tokenSymbol: 'USDC'
  })
})
```

**Nan API routes to call:**
- `POST /api/circle-wallets` `{ action: 'getWallet', email }` — balance + address
- `POST /api/circle-wallets` `{ action: 'transfer', email, to, amount, tokenSymbol }` — send
- `POST /api/circle-wallets` `{ action: 'bridge', ... }` — cross-chain (bonus)

---

## Phase 3 — Wire Zee²'s shop + agent to Nan's marketplace + orders

**Current state:** Zee²'s ShopPage has demo products in-memory. Nan has a full marketplace API with escrow wallets, real orders, and Upstash Redis persistence.

**What to do:**

**Products:** Replace Zee²'s `products` array in the store with a fetch from Nan:
```ts
// In ShopPage.tsx useEffect:
const res = await fetch('/api/marketplace?action=listings')
const { listings } = await res.json()
// Map listings to Zee²'s Product shape
```

**Checkout:** Replace Zee²'s simulated checkout with a real order via Nan:
```ts
await fetch('/api/marketplace', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-User-Token': token },
  body: JSON.stringify({
    action: 'buy',
    email,
    listingId: product.id,
    quantity: 1
  })
})
```

**Agent purchases:** Zee²'s AgentPage sends agent-approved purchases. Wire those to Nan's `execute-orders` route:
```ts
// On approveAgentPurchase:
await fetch('/api/execute-orders', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-User-Token': token },
  body: JSON.stringify({ email, orderId, agentApproved: true })
})
```

**Activity feed:** Replace Zee²'s in-memory activity with Nan's persistent feed:
```ts
const res = await fetch(`/api/activity-feed?wallet=${walletAddress}`)
const { activities } = await res.json()
```

**Nan API routes to call:**
- `GET /api/marketplace?action=listings` — product list
- `POST /api/marketplace` `{ action: 'buy' }` — place order
- `POST /api/execute-orders` — execute agent-approved order
- `GET /api/activity-feed?wallet=0x...` — transaction history
- `GET /api/orders?wallet=0x...` — order history

---

## Deployment: Monorepo on Vercel

After integration, the combined project deploys cleanly to Vercel:

```
/                    ← Nan's current root (index.html landing page)
/app                 ← Zee² React build output (replaces app.html)
/api/*               ← Nan's serverless API routes (already structured for Vercel)
/_server/index.js    ← Express fallback for Railway
```

Update `vercel.json`:
```json
{
  "rewrites": [
    { "source": "/app/(.*)", "destination": "/app/index.html" },
    { "source": "/app",      "destination": "/app/index.html" },
    { "source": "/",         "destination": "/index.html" }
  ]
}
```

Build step: add to `package.json`:
```json
"scripts": {
  "build:zee2": "cd zee2 && bun run build && cp -r dist ../app",
  "build": "npm run build:zee2"
}
```

---

## What each project contributes

| Feature | Who owns it |
|---|---|
| Email OTP auth | Nan (`/api/otp`) |
| Circle developer-controlled wallets | Nan (`/api/circle-wallets`) |
| USDC balance + send + bridge | Nan (`/api/circle-wallets`) |
| Escrow + marketplace orders | Nan (`/api/marketplace`, `/api/orders`) |
| Upstash Redis persistence | Nan |
| CCTP cross-chain | Nan (`/api/cctp-attest`, `/api/gateway`) |
| AI agent chat UI | Zee² (`AgentPage.tsx`) |
| Agent spending permissions | Zee² (Zustand store) |
| Shopping UI + product cards | Zee² (`ShopPage.tsx`) |
| Home dashboard | Zee² (`HomePage.tsx`) |
| Landing page | Nan (`index.html`) or Zee² (`LandingPage.tsx`) |
| Onboarding flow | Zee² (`OnboardingPage.tsx`) + Nan auth |
| Activity history UI | Zee² (`ActivityPage.tsx`) + Nan feed |
| Responsive mobile UI | Zee² |

---

## Effort estimate

| Phase | Work | Difficulty |
|---|---|---|
| Phase 1 (auth) | Replace ConnectKit with OTP flow | ~2 hours |
| Phase 2 (wallet) | Replace wagmi hooks with fetch calls | ~2 hours |
| Phase 3 (commerce) | Wire shop + agent to Nan marketplace | ~3 hours |
| Vercel deploy config | Update vercel.json + build scripts | ~30 min |

**Total: roughly one focused day of work.**

---

## Quick start recommendation

The fastest path to a working integrated app:

1. Copy Zee²'s `src/` into a `zee2/` subfolder inside your Nan repo
2. Add a `zee2/src/api/nan.ts` client module with typed wrappers for each Nan API route
3. Replace `useUSDCBalance` and `useWriteContract` usages with `nan.getBalance()` and `nan.transfer()`
4. Add `zee2/vite.config.ts` proxy: `'/api' → 'http://localhost:3000'` (points at Nan's Express server during dev)
5. Replace `ConnectKitButton` in OnboardingPage with an email input + OTP form
6. Deploy: Zee² builds to `dist/`, Nan serves it at `/app`

That gives you Nan's production backend + Zee²'s polished UI in a single Vercel deployment.
