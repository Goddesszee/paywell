# Mainnet Deploy Runbook — Arc Mainnet (chain ID 5042)

Both contracts are written, compiled, and staged. Run these commands tomorrow once
you have your mainnet Circle credentials in `.env`.

---

## Prerequisites

Add to `/home/user/app/.env` (never paste values in chat):

```
CIRCLE_DEVELOPER_CONTROLLED_API_KEY=<your mainnet Circle API key>
CIRCLE_ENTITY_SECRET=<your entity secret>
```

**Important:** You need a **mainnet-enabled** Circle account and a **mainnet API key**
from https://console.circle.com — `provision_credentials` only creates testnet keys.
Entity secret registration carries over from testnet (it is account-wide).

---

## 1. Deploy NANNameRegistry

Constructor arg: USDC address on Arc Mainnet = `0x3600000000000000000000000000000000000000`

```bash
cd /home/user/app
bun run deploy:self NANNameRegistry '["0x3600000000000000000000000000000000000000"]'
```

The script will print the deployed address. Save it — you need it below.

---

## 2. Deploy PaywellEscrow

Constructor args:
1. `_usdc` — `0x3600000000000000000000000000000000000000`
2. `_tokenMessenger` — `0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d` (CCTP V2 TokenMessengerV2 mainnet)
3. `_feeRecipient` — YOUR wallet address that collects the 1% escrow fee

```bash
bun run deploy:self PaywellEscrow '["0x3600000000000000000000000000000000000000","0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d","0xYOUR_FEE_RECIPIENT"]'
```

Replace `0xYOUR_FEE_RECIPIENT` with your actual wallet address.

---

## 3. Add addresses to Vercel env vars

After both deploys, add these to Vercel (Project Settings → Environment Variables):

```
VITE_NAME_REGISTRY=<NANNameRegistry address>
VITE_ESCROW_CONTRACT=<PaywellEscrow address>
```

Then redeploy on Vercel for the changes to take effect.

---

## 4. Verify the contracts compile before deploying

```bash
cd /home/user/app && forge build
```

Both `NANNameRegistry` and `PaywellEscrow` should compile with no errors.

---

## What each contract does

| Contract | Purpose |
|---|---|
| `NANNameRegistry` | Onchain @handle registry. Users pay 2–8 USDC to register a short name that resolves to their wallet. Powers the NAN Name page. |
| `PaywellEscrow` | USDC escrow for merchant payments. Buyer locks funds, confirms delivery, 1% fee goes to feeRecipient. |

---

## Explorer links (after deploy)

- NANNameRegistry: `https://explorer.arc.io/address/<address>`
- PaywellEscrow: `https://explorer.arc.io/address/<address>`

## Swap key (required for swaps on mainnet)
Circle App Kit swap needs a key in its config. Set in Vercel:
- `VITE_KIT_KEY` — Circle Console key (LIVE) used by the browser swap paths (connected wallet / passkey / agent). Redeploy after setting.
- Email/Google (server) swaps automatically use your LIVE `CIRCLE_API_KEY`; set `KIT_KEY` only to override.
