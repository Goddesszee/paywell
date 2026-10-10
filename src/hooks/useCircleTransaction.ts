/**
 * useCircleTransaction
 *
 * Universal hook for executing any on-chain operation from a Circle
 * user-controlled wallet. Handles the full challenge-response flow:
 *
 *   1. Backend creates a challenge (transfer or contract-exec)
 *   2. Frontend calls sdk.execute(challengeId) — user approves via Circle UI
 *   3. Hook polls transaction until terminal state (COMPLETE / FAILED / etc.)
 *
 * Usage:
 *   const { sendTransfer, executeContract, status, txHash, error, reset } = useCircleTransaction()
 */

import { useState, useCallback, useRef } from 'react'
import { W3SSdk } from '@circle-fin/w3s-pw-web-sdk'
import { useAppStore } from '../store/appStore'

export type CircleTxStatus =
  | 'idle'
  | 'creating'   // calling backend to create challenge
  | 'approving'  // sdk.execute running — user approves in Circle popup
  | 'polling'    // waiting for on-chain confirmation
  | 'complete'
  | 'failed'
  | 'error'

export interface TransferParams {
  destinationAddress: string
  amount: string
  tokenAddress?: string        // empty string = native (USDC on Arc)
  blockchain?: string          // default: ARC-TESTNET
}

export interface ContractExecParams {
  contractAddress: string
  abiFunctionSignature?: string
  abiParameters?: string[]     // must be serialisable to JSON strings
  callData?: string  // hex-encoded (0x...); mutually exclusive with abiFunctionSignature
  amount?: string              // for payable functions
  /** Circle blockchain identifier for cross-chain execution (e.g. 'BASE-SEPOLIA').
   *  When provided, walletAddress must also be set. Mutually exclusive with walletId. */
  blockchain?: string
  /** Wallet address — required when blockchain is set for cross-chain execution. */
  walletAddress?: string
}


const SESSION_EXPIRED_MSG =
  'Your secure Circle session has expired (this happens after closing or reloading the tab). Please sign out and sign back in, then try again.'

/**
 * The W3S SDK needs the session encryptionKey to sign/execute challenges. It is kept in memory /
 * sessionStorage only, so after a reload it is gone — and passing '' to the SDK makes Circle's popup
 * fail with "encryptedUserSecret, storageKey, and pinCodeUserShare must be provided".
 * If the key is missing the caller shows a clear 'sign in again' error.
 */
async function resolveCircleSession(): Promise<{ userToken?: string; encryptionKey?: string }> {
  const a = useAppStore.getState().auth
  let ek = a?.encryptionKey
  if (!ek) { try { ek = sessionStorage.getItem('circle_ek') ?? undefined } catch { /* ignore */ } }
  // NOTE: for email/social users Circle only refreshes a session with the login refreshToken +
  // deviceId (POST /users/token/refresh), which we don't persist yet — so a missing key means a
  // fresh login is required. We say so clearly instead of opening Circle's popup with an empty key.
  return { userToken: a?.userToken, encryptionKey: ek }
}

const TERMINAL = new Set(['COMPLETE', 'FAILED', 'DENIED', 'CANCELLED'])
const POLL_INTERVAL_MS = 2000
const POLL_TIMEOUT_MS  = 120_000

export function useCircleTransaction() {
  const auth    = useAppStore(s => s.auth)
  const setAuth = useAppStore(s => s.setAuth)
  const [status, setStatus]   = useState<CircleTxStatus>('idle')
  const [txHash, setTxHash]   = useState<string | undefined>()
  const [error,  setErrorState] = useState<string | undefined>()
  // Mirror of `error` readable synchronously by callers (e.g. the AI agent) that
  // await sendTransfer() and need the real failure reason, not stale closure state.
  const errorRef = useRef<string | undefined>(undefined)
  const setError = useCallback((msg: string | undefined) => {
    errorRef.current = msg
    setErrorState(msg)
  }, [])
  const getLastError = useCallback(() => errorRef.current, [])

  /** Calls the backend to create a challenge, then executes it via the SDK */
  const _execute = useCallback(
    async (action: string, extraBody: Record<string, string>): Promise<string | undefined> => {
      let userToken     = auth?.userToken
      // encryptionKey is wiped from the persisted store on reload for security.
      // Restore it from sessionStorage (same-tab only, cleared on tab close).
      const storedEk = (() => { try { return sessionStorage.getItem('circle_ek') ?? undefined } catch { return undefined } })()
      let encryptionKey = auth?.encryptionKey ?? storedEk
      const walletId      = auth?.circleWalletId
      const appId         = import.meta.env.VITE_CIRCLE_APP_ID as string | undefined

      // Only userToken + walletId are required to create the challenge.
      // encryptionKey is required by the Circle SDK to execute the challenge — if it is
      // missing (wiped on reload), the SDK will prompt the user to re-authenticate.
      if (!userToken || !walletId) {
        setError('Circle session expired — please log in again')
        setStatus('error')
        return undefined
      }
      {
        const fresh = await resolveCircleSession()
        if (!fresh.encryptionKey) {
          setError(SESSION_EXPIRED_MSG)
          setStatus('error')
          return undefined
        }
        userToken = fresh.userToken ?? userToken
        encryptionKey = fresh.encryptionKey
      }
      if (!appId) {
        setError('VITE_CIRCLE_APP_ID is not set — add it to .env and restart the dev server')
        setStatus('error')
        return undefined
      }

      // 1. Create challenge on the backend
      setStatus('creating')
      const resp = await fetch('/api/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, userToken, walletId, ...extraBody }),
      })
      const data = await resp.json() as { challengeId?: string; error?: string }
      if (!resp.ok || !data.challengeId) {
        const msg = data.error ?? `Failed to create Circle challenge (HTTP ${resp.status})`
        setError(msg)
        setStatus('error')
        return undefined
      }

      const { challengeId } = data

      // 2. Execute challenge in Circle SDK popup (user approves with PIN / email).
      // Pass encryptionKey only when available; the SDK will handle re-auth if missing.
      setStatus('approving')
      const sdk = new W3SSdk({ appSettings: { appId } })
      // encryptionKey is required by the SDK type but may be absent after a reload.
      // Passing an empty string causes the SDK to prompt re-authentication via its own flow.
      // Only pass encryptionKey when it is genuinely present in memory.
      // Passing '' tells the SDK the key is missing and triggers a re-auth popup
      // even mid-session. When present, pass it so the SDK can sign immediately.
      sdk.setAuthentication({ userToken, encryptionKey: encryptionKey ?? '' })

      // sdk.execute() fires the callback once the user approves or denies.
      // For CREATE_TRANSACTION challenges the result has NO transactionId —
      // it only carries { type, status }. We must fetch the transactionId
      // via get-challenge after the SDK reports success.
      const sdkOk = await new Promise<boolean>(resolve => {
        sdk.execute(challengeId, (err, result) => {
          if (err) {
            setError(err.message ?? 'Challenge failed')
            setStatus('error')
            resolve(false)
          } else {
            // Persist a refreshed encryptionKey if the SDK returned one after re-auth
            const anyResult = result as Record<string, unknown> | undefined
            const refreshedKey = anyResult?.['encryptionKey'] as string | undefined
            if (refreshedKey && auth && !auth.encryptionKey) {
              setAuth({ ...(auth), encryptionKey: refreshedKey })
            }
            resolve(true)
          }
        })
      })
      if (!sdkOk) return undefined

      // Fetch the transactionId from the completed challenge. Circle exposes it as
      // challenge.correlationIds[0] (the server also normalises it to `transactionId`).
      // It can lag the approval by a moment, so retry briefly before giving up.
      type ChallengeResp = {
        transactionId?: string
        error?: string
        challenge?: { status?: string; errorCode?: number; errorMessage?: string; transactionId?: string; correlationIds?: string[] }
      }
      let transactionId: string | undefined
      let lastChallenge: ChallengeResp['challenge']
      for (let attempt = 0; attempt < 10 && !transactionId; attempt++) {
        if (attempt > 0) await new Promise(r => setTimeout(r, 1500))
        const challengeResp = await fetch('/api/wallet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'get-challenge', userToken, challengeId }),
        })
        const challengeData = await challengeResp.json().catch(() => ({})) as ChallengeResp
        lastChallenge = challengeData.challenge
        transactionId = challengeData.transactionId
          ?? lastChallenge?.transactionId
          ?? lastChallenge?.correlationIds?.[0]
        if (!transactionId && lastChallenge?.status === 'FAILED') break
      }
      if (!transactionId) {
        setError(
          lastChallenge?.status === 'FAILED'
            ? `Circle rejected the transaction${lastChallenge.errorMessage ? `: ${lastChallenge.errorMessage}` : ''}`
            : 'Transaction was approved but Circle has not returned a transaction id yet — check your balance in a minute before retrying',
        )
        setStatus('error')
        return undefined
      }
      return transactionId
    },
    [auth, setAuth, setError],
  )

  /** Poll transaction until terminal state, return txHash */
  const _poll = useCallback(
    async (transactionId: string): Promise<string | undefined> => {
      const userToken = auth?.userToken
      if (!userToken) return undefined

      setStatus('polling')
      const deadline = Date.now() + POLL_TIMEOUT_MS

      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
        const resp = await fetch('/api/wallet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'poll-tx', userToken, transactionId }),
        })
        const data = await resp.json() as {
          transaction?: { state?: string; txHash?: string; errorReason?: string }
        }
        const tx = data.transaction
        if (!tx) continue
        if (tx.txHash) setTxHash(tx.txHash)
        if (TERMINAL.has(tx.state ?? '')) {
          if (tx.state === 'COMPLETE') {
            setStatus('complete')
            return tx.txHash
          } else {
            setError(tx.errorReason ?? `Transaction ${tx.state}`)
            setStatus('failed')
            return undefined
          }
        }
      }

      setError('Transaction timed out — check explorer for status')
      setStatus('error')
      return undefined
    },
    [auth, setError],
  )

  /** Send a token transfer */
  const sendTransfer = useCallback(
    async (params: TransferParams): Promise<string | undefined> => {
      setError(undefined); setTxHash(undefined); setStatus('idle')
      const transactionId = await _execute('create-transfer', {
        destinationAddress: params.destinationAddress,
        amount: params.amount,
        tokenAddress: params.tokenAddress ?? '',
        blockchain: params.blockchain ?? 'ARC-TESTNET',
      })
      if (!transactionId) return undefined
      return _poll(transactionId)
    },
    [_execute, _poll, setError],
  )

  /** Execute a contract function */
  const executeContract = useCallback(
    async (params: ContractExecParams): Promise<string | undefined> => {
      setError(undefined); setTxHash(undefined); setStatus('idle')
      const body: Record<string, string> = {
        contractAddress: params.contractAddress,
      }
      if (params.callData) {
        body.callData = params.callData
      } else {
        body.abiFunctionSignature = params.abiFunctionSignature ?? ''
        body.abiParameters = JSON.stringify(params.abiParameters ?? [])
      }
      if (params.amount) body.amount = params.amount
      // Cross-chain execution: pass walletAddress + blockchain instead of walletId
      if (params.blockchain && params.walletAddress) {
        body.blockchain = params.blockchain
        body.walletAddress = params.walletAddress
      }
      const transactionId = await _execute('create-contract-exec', body)
      if (!transactionId) return undefined
      return _poll(transactionId)
    },
    [_execute, _poll, setError],
  )

  /**
   * Sign EIP-712 typed data via Circle SDK signTypedData challenge.
   * This uses eth_signTypedData_v4 under the hood (unlike signMessage which is eth_sign).
   * Required for Gateway BurnIntent signing from UCW wallets.
   * Returns the hex signature string, or undefined on failure.
   */
  const signTypedData = useCallback(
    async (typedDataJson: string): Promise<string | undefined> => {
      setError(undefined); setStatus('idle')
      let userToken     = auth?.userToken
      const storedEk2 = (() => { try { return sessionStorage.getItem('circle_ek') ?? undefined } catch { return undefined } })()
      let encryptionKey = auth?.encryptionKey ?? storedEk2
      const walletId      = auth?.circleWalletId
      const appId         = import.meta.env.VITE_CIRCLE_APP_ID as string | undefined
      if (!userToken || !walletId) {
        setError('Circle session expired — please log in again')
        setStatus('error')
        return undefined
      }
      {
        const fresh = await resolveCircleSession()
        if (!fresh.encryptionKey) {
          setError(SESSION_EXPIRED_MSG)
          setStatus('error')
          return undefined
        }
        userToken = fresh.userToken ?? userToken
        encryptionKey = fresh.encryptionKey
      }
      if (!appId) {
        setError('VITE_CIRCLE_APP_ID is not set')
        setStatus('error')
        return undefined
      }
      setStatus('creating')
      const resp = await fetch('/api/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sign-typed-data', userToken, walletId, data: typedDataJson }),
      })
      const data = await resp.json() as { challengeId?: string; error?: string }
      if (!resp.ok || !data.challengeId) {
        setError(data.error ?? `Failed to create sign-typed-data challenge (HTTP ${resp.status})`)
        setStatus('error')
        return undefined
      }
      setStatus('approving')
      const { W3SSdk } = await import('@circle-fin/w3s-pw-web-sdk')
      const sdk = new W3SSdk({ appSettings: { appId } })
      sdk.setAuthentication({ userToken, encryptionKey: encryptionKey ?? '' })
      return new Promise<string | undefined>(resolve => {
        sdk.execute(data.challengeId!, (err, result) => {
          if (err) {
            setError(err.message ?? 'Sign typed data challenge failed')
            setStatus('error')
            resolve(undefined)
          } else {
            // The W3S SDK wraps the signature differently across versions:
            //   result.signature          — most common
            //   result.result             — some SDK versions
            //   result.data?.signature    — nested on some iOS SDK variants
            const anyResult = result as Record<string, unknown> | undefined
            const nested = anyResult?.['data'] as Record<string, unknown> | undefined
            const sig = (anyResult?.['signature'] as string | undefined)
              ?? (anyResult?.['result'] as string | undefined)
              ?? (nested?.['signature'] as string | undefined)
              ?? undefined
            setStatus('complete')
            resolve(sig)
          }
        })
      })
    },
    [auth, setError],
  )

  /**
   * Sign an arbitrary message via Circle SDK challenge (sign-message action).
   * Returns the hex signature string, or undefined on failure.
   * Used for EIP-712 typed data signing on the Circle UCW path.
   */
  const signMessage = useCallback(
    async (message: string): Promise<string | undefined> => {
      setError(undefined); setStatus('idle')
      let userToken     = auth?.userToken
      const storedEk3 = (() => { try { return sessionStorage.getItem('circle_ek') ?? undefined } catch { return undefined } })()
      let encryptionKey = auth?.encryptionKey ?? storedEk3
      const walletId      = auth?.circleWalletId
      const appId         = import.meta.env.VITE_CIRCLE_APP_ID as string | undefined
      if (!userToken || !walletId) {
        setError('Circle session expired — please log in again')
        setStatus('error')
        return undefined
      }
      {
        const fresh = await resolveCircleSession()
        if (!fresh.encryptionKey) {
          setError(SESSION_EXPIRED_MSG)
          setStatus('error')
          return undefined
        }
        userToken = fresh.userToken ?? userToken
        encryptionKey = fresh.encryptionKey
      }
      if (!appId) {
        setError('VITE_CIRCLE_APP_ID is not set')
        setStatus('error')
        return undefined
      }
      setStatus('creating')
      const resp = await fetch('/api/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sign-message', userToken, walletId, message }),
      })
      const data = await resp.json() as { challengeId?: string; error?: string }
      if (!resp.ok || !data.challengeId) {
        setError(data.error ?? `Failed to create sign challenge (HTTP ${resp.status})`)
        setStatus('error')
        return undefined
      }
      setStatus('approving')
      const sdk = new W3SSdk({ appSettings: { appId } })
      // Only pass encryptionKey when it is genuinely present in memory.
      // Passing '' tells the SDK the key is missing and triggers a re-auth popup
      // even mid-session. When present, pass it so the SDK can sign immediately.
      sdk.setAuthentication({ userToken, encryptionKey: encryptionKey ?? '' })
      return new Promise<string | undefined>(resolve => {
        sdk.execute(data.challengeId!, (err, result) => {
          if (err) {
            setError(err.message ?? 'Sign challenge failed')
            setStatus('error')
            resolve(undefined)
          } else {
            const anyResult = result as Record<string, unknown> | undefined
            const nested = anyResult?.['data'] as Record<string, unknown> | undefined
            const sig = (anyResult?.['signature'] as string | undefined)
              ?? (anyResult?.['result'] as string | undefined)
              ?? (nested?.['signature'] as string | undefined)
              ?? undefined
            setStatus('complete')
            resolve(sig)
          }
        })
      })
    },
    [auth, setError],
  )

  const reset = useCallback(() => {
    setStatus('idle'); setTxHash(undefined); setError(undefined)
  }, [setError])

  return { sendTransfer, executeContract, signMessage, signTypedData, status, txHash, error, getLastError, reset }
}
