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

import { useState, useCallback } from 'react'
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
}

const TERMINAL = new Set(['COMPLETE', 'FAILED', 'DENIED', 'CANCELLED'])
const POLL_INTERVAL_MS = 2000
const POLL_TIMEOUT_MS  = 120_000

export function useCircleTransaction() {
  const auth = useAppStore(s => s.auth)
  const [status, setStatus]   = useState<CircleTxStatus>('idle')
  const [txHash, setTxHash]   = useState<string | undefined>()
  const [error,  setError]    = useState<string | undefined>()

  /** Calls the backend to create a challenge, then executes it via the SDK */
  const _execute = useCallback(
    async (action: string, extraBody: Record<string, string>): Promise<string | undefined> => {
      const userToken     = auth?.userToken
      const encryptionKey = auth?.encryptionKey
      const walletId      = auth?.circleWalletId
      const appId         = import.meta.env.VITE_CIRCLE_APP_ID as string | undefined

      if (!userToken || !encryptionKey || !walletId) {
        setError('Circle session expired — please log in again')
        setStatus('error')
        return undefined
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

      // 2. Execute challenge in Circle SDK popup (user approves with PIN / email)
      setStatus('approving')
      const sdk = new W3SSdk({ appSettings: { appId } })
      sdk.setAuthentication({ userToken, encryptionKey })

      const executeResult = await new Promise<string | undefined>(resolve => {
        sdk.execute(challengeId, (err, result) => {
          if (err) {
            setError(err.message ?? 'Challenge failed')
            setStatus('error')
            resolve(undefined)
          } else {
            // ChallengeResult, SignMessageResult, SignTransactionResult — all may carry data
            const anyResult = result as Record<string, unknown> | undefined
            resolve(anyResult?.['transactionId'] as string ?? anyResult?.['result'] as string ?? undefined)
          }
        })
      })

      return executeResult
    },
    [auth],
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
    [auth],
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
    [_execute, _poll],
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
      const transactionId = await _execute('create-contract-exec', body)
      if (!transactionId) return undefined
      return _poll(transactionId)
    },
    [_execute, _poll],
  )

  const reset = useCallback(() => {
    setStatus('idle'); setTxHash(undefined); setError(undefined)
  }, [])

  return { sendTransfer, executeContract, status, txHash, error, reset }
}
