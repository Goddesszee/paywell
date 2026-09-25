# Paywell — Intelligent USDC Payment App

Independent app. No dependency on Nan or any external project.

## Deployed Contracts (Arc Testnet — Chain ID 5042002)

| Contract       | Address                                      |
|----------------|----------------------------------------------|
| USDC           | `0x3600000000000000000000000000000000000000` |
| EURC           | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` |
| SWAP           | `0x5cE359b74BE53b1B370641571cBef157dD575c79` |
| PERMIT2        | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |
| FXESCROW       | `0x867650F5eAe8df91445971f14d89fd84F0C9a9f8` |
| LENDING        | `0x4CC84BbEf992439Cb01FeF2E1150B37916d1f2ce` |
| NAME_REGISTRY  | `0x043D072B12CBe488DBA3d2975c42Db3055F2836f` |
| PAYREQ         | `0x1940232f42D4e2083785bC869FbAD8dd43133817` |
| HISTORY        | `0xC64Fad1CFFDE16167d5887211066b47E1df48B4d` |

## Chain Info
- RPC: `https://rpc.testnet.arc.network`
- Explorer: `https://testnet.arcscan.app`

## Environment Variables
- `VITE_API_URL` — optional backend URL (defaults to same origin / relative paths)

## Stack
- Vite + React + TypeScript
- Wagmi v2 + ConnectKit
- Zustand (store: `src/store/appStore.ts`)
- Tailwind CSS + Inter + IBM Plex Mono
- Arc Testnet (Chain ID 5042002), USDC as native gas
