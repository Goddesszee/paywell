import React, { useState } from 'react'
import { createPublicClient, http } from 'viem'
import { arcTestnet } from 'viem/chains'
import {
  type P256Credential,
  createBundlerClient,
  toWebAuthnAccount,
} from 'viem/account-abstraction'
import {
  EIP1193Provider,
  WebAuthnMode,
  toCircleSmartAccount,
  toModularTransport,
  toPasskeyTransport,
  toWebAuthnCredential,
} from '@circle-fin/modular-wallets-core'
import { ArrowLeft, Fingerprint, LogIn } from 'lucide-react'

const F       = "'Inter', -apple-system, sans-serif"
const BLUE    = '#0066FF'
const TEXT    = 'var(--nan-text)'
const TEXT2   = '#8A8F9E'
const TEXT3   = '#50556A'
const SURFACE = 'var(--nan-surface)'
const BORDER  = 'var(--nan-bdr2)'

interface Props {
  onBack: () => void
  onSuccess: (walletAddress: string) => void
}

const CREDENTIAL_KEY = 'nan_passkey_credential'
const CIRCLE_MODULAR_URL = 'https://modular-sdk.circle.com/v1/rpc/w3s/buidl'

function getStoredCredential(): P256Credential | null {
  try {
    const raw = localStorage.getItem(CREDENTIAL_KEY)
    return raw ? (JSON.parse(raw) as P256Credential) : null
  } catch {
    return null
  }
}

export function CirclePasskeyLogin({ onBack, onSuccess }: Props) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  // Initialise directly from storage — avoids a setState inside a useEffect
  const [hasExisting, setHasExisting] = useState(() => !!getStoredCredential())

  const clientKey = import.meta.env.VITE_CLIENT_KEY as string | undefined
  // VITE_CLIENT_URL must be https://modular-sdk.circle.com/v1/rpc/w3s/buidl
  // Fall back to the canonical URL so the env var being wrong/missing doesn't break passkey.
  const clientUrl = (import.meta.env.VITE_CLIENT_URL as string | undefined)
    || 'https://modular-sdk.circle.com/v1/rpc/w3s/buidl'

  async function buildAccount(credential: P256Credential) {
    if (!clientKey) throw new Error('VITE_CLIENT_KEY is not set. Add it in Circle Console → Client Keys.')
    const modularTransport = toModularTransport(`${CIRCLE_MODULAR_URL}/arcTestnet`, clientKey)
    const publicClient = createPublicClient({ chain: arcTestnet, transport: modularTransport })
    const account = await toCircleSmartAccount({
      client: publicClient,
      owner: toWebAuthnAccount({ credential }),
    })
    return account
  }

  async function handleRegister() {
    if (!clientKey || !clientUrl) {
      setErrorMsg('VITE_CLIENT_KEY is not set. Complete the Circle Console setup first.')
      setStatus('error')
      return
    }
    setStatus('loading')
    setErrorMsg('')
    try {
      const passkeyTransport = toPasskeyTransport(CIRCLE_MODULAR_URL, clientKey)
      const credential = await toWebAuthnCredential({
        transport: passkeyTransport,
        mode: WebAuthnMode.Register,
        username: `nan-${Date.now()}`,
      })
      localStorage.setItem(CREDENTIAL_KEY, JSON.stringify(credential))
      const account = await buildAccount(credential)
      setHasExisting(true)
      onSuccess(account.address)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('NotAllowedError') || msg.includes('cancelled')) {
        setErrorMsg('Passkey prompt was cancelled. Try again.')
      } else if (msg.includes('SecurityError') || msg.includes('domain')) {
        setErrorMsg('Passkey domain mismatch. Make sure Circle Console Passkey Domain matches this preview URL.')
      } else if (msg.includes('InvalidStateError')) {
        setErrorMsg('A passkey is already registered. Use "Sign in" instead.')
      } else {
        setErrorMsg(msg)
      }
      setStatus('error')
    }
  }

  async function handleLogin() {
    if (!clientKey || !clientUrl) {
      setErrorMsg('VITE_CLIENT_KEY is not set. Complete the Circle Console setup first.')
      setStatus('error')
      return
    }
    setStatus('loading')
    setErrorMsg('')
    try {
      const passkeyTransport = toPasskeyTransport(CIRCLE_MODULAR_URL, clientKey)
      const credential = await toWebAuthnCredential({
        transport: passkeyTransport,
        mode: WebAuthnMode.Login,
      })
      localStorage.setItem(CREDENTIAL_KEY, JSON.stringify(credential))
      const account = await buildAccount(credential)
      setHasExisting(true)
      onSuccess(account.address)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('NotAllowedError') || msg.includes('cancelled')) {
        setErrorMsg('Passkey prompt was cancelled. Try again.')
      } else {
        setErrorMsg(msg)
      }
      setStatus('error')
    }
  }

  const btnBase: React.CSSProperties = {
    width: '100%', padding: '13px 20px',
    border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 600,
    cursor: status === 'loading' ? 'not-allowed' : 'pointer',
    fontFamily: F, display: 'flex', alignItems: 'center',
    justifyContent: 'center', gap: 9, letterSpacing: '-0.01em',
    opacity: status === 'loading' ? 0.6 : 1, transition: 'opacity 0.15s',
  }

  return (
    <div>
      <button onClick={onBack}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none',
          cursor: 'pointer', color: TEXT2, fontSize: 14, marginBottom: 28, padding: 0, fontFamily: F }}>
        <ArrowLeft size={14} /> Back
      </button>

      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: BLUE,
          display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <Fingerprint size={26} color="#fff" />
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em', marginBottom: 6, color: TEXT }}>
          Passkey Wallet
        </h2>
        <p style={{ fontSize: 14, color: TEXT2, lineHeight: 1.6 }}>
          Your Circle Smart Account secured by biometrics. No seed phrase. Gasless transactions.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Register new passkey */}
        <button
          onClick={() => void handleRegister()}
          disabled={status === 'loading'}
          style={{ ...btnBase, background: BLUE, color: '#fff' }}
        >
          <Fingerprint size={17} />
          <span>{status === 'loading' ? 'Creating wallet...' : 'Create with Passkey'}</span>
        </button>

        {/* Login with existing passkey */}
        {hasExisting && (
          <button
            onClick={() => void handleLogin()}
            disabled={status === 'loading'}
            style={{ ...btnBase, background: SURFACE, color: TEXT, border: `1px solid ${BORDER}` }}
          >
            <LogIn size={17} />
            <span>Sign in with Passkey</span>
          </button>
        )}
      </div>

      {status === 'error' && errorMsg && (
        <div style={{ marginTop: 16, padding: '12px 14px', background: '#FEE2E2',
          borderRadius: 10, fontSize: 13, color: '#B91C1C', lineHeight: 1.5 }}>
          {errorMsg}
        </div>
      )}

      <div style={{ marginTop: 24, padding: '12px 14px',
        background: SURFACE, border: `1px solid ${BORDER}`,
        borderRadius: 10, fontSize: 12, color: TEXT3, lineHeight: 1.6 }}>
        <strong style={{ color: TEXT2 }}>Circle Modular Wallet</strong><br />
        Smart contract account (ERC-4337) on Arc Testnet. Gas is sponsored — no USDC needed to get started.
      </div>
    </div>
  )
}

/**
 * getPasskeyAdapter — returns a viem adapter backed by the stored passkey
 * credential so SwapPage / BridgePage can sign transactions client-side.
 *
 * Follows the Circle-documented pattern:
 * https://developers.circle.com/wallets/modular/use-as-eip-1193-provider
 *
 * Steps per Circle docs:
 *  1. Create a read-only PublicClient on the chain's standard HTTP RPC
 *  2. Create a BundlerClient with the MSCA account + modular transport
 *  3. Wrap both in Circle's EIP1193Provider class
 *  4. Create a viem WalletClient using a `custom` transport that unwraps
 *     response.result from the provider (required per Circle docs)
 *  5. Pass the provider to createViemAdapterFromProvider for App Kit
 */
export async function getPasskeyAdapter({
  clientKey,
}: {
  clientKey: string
}) {
  const { createViemAdapterFromProvider } = await import('@circle-fin/adapter-viem-v2')

  const credential = getStoredCredential()
  if (!credential) throw new Error('No passkey credential found — please log in with your passkey first.')

  // Step 1: read-only public client on Arc Testnet's standard HTTP RPC (not the bundler)
  const arcRpcUrl = (import.meta.env.VITE_ARC_RPC_URL as string | undefined) || 'https://rpc.testnet.arc.io'
  const readClient = createPublicClient({ chain: arcTestnet, transport: http(arcRpcUrl) })

  // Step 2: BundlerClient with MSCA account — modular transport handles sendUserOperation
  const modularTransport = toModularTransport(`${CIRCLE_MODULAR_URL}/arcTestnet`, clientKey)
  const bundlerPublicClient = createPublicClient({ chain: arcTestnet, transport: modularTransport })
  const account = await toCircleSmartAccount({
    client: bundlerPublicClient,
    owner: toWebAuthnAccount({ credential }),
  })
  const bundlerClient = createBundlerClient({
    account,
    chain: arcTestnet,
    transport: modularTransport,
  })

  // Step 3: Circle's EIP1193Provider wrapping bundlerClient + readClient
  const eip1193Provider = new EIP1193Provider(bundlerClient, readClient)

  // Step 4 / 5: createViemAdapterFromProvider with Circle's EIP1193Provider.
  // The provider wraps the bundler client so sendTransaction calls are routed
  // through sendUserOperation automatically — no hand-rolled dispatch needed.
  return createViemAdapterFromProvider({ provider: eip1193Provider })
}

// Standalone hook — call this in WalletPage to send USDC from the passkey wallet
export async function sendFromPasskeyWallet({
  clientKey,
  to,
  amount,
}: {
  clientKey: string
  to: `0x${string}`
  amount: bigint
}): Promise<string> {
  const { encodeTransfer, ContractAddress } = await import('@circle-fin/modular-wallets-core')
  const credential = getStoredCredential()
  if (!credential) throw new Error('No passkey credential found. Please log in first.')

  const modularTransport = toModularTransport(`${CIRCLE_MODULAR_URL}/arcTestnet`, clientKey)
  const publicClient = createPublicClient({ chain: arcTestnet, transport: modularTransport })
  const account = await toCircleSmartAccount({
    client: publicClient,
    owner: toWebAuthnAccount({ credential }),
  })
  const bundlerClient = createBundlerClient({ chain: arcTestnet, transport: modularTransport })
  const callData = encodeTransfer(to, ContractAddress.ArcTestnet_USDC, amount)
  const userOpHash = await bundlerClient.sendUserOperation({
    account,
    calls: [callData],
    paymaster: true,
  })
  const { receipt } = await bundlerClient.waitForUserOperationReceipt({ hash: userOpHash })
  return receipt.transactionHash
}
