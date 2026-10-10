/**
 * NanNamePage — register, view, and manage your @handle on the NAN Name Registry.
 *
 * The NAME_REGISTRY contract at 0x043D072B12CBe488DBA3d2975c42Db3055F2836f
 * exposes three writable functions:
 *   register(string name)   — register an unclaimed @handle to msg.sender
 *   update(string name)     — change your registered handle
 *   release()               — release (unregister) your current handle
 *
 * The hook useNanName already handles reads. This page handles writes + UX.
 */
import { useState, useEffect, useCallback } from 'react'
import {
  AtSign, CheckCircle2, AlertCircle, ArrowLeft,
  Search, Loader2, Pencil, Trash2, ExternalLink, Copy, Check,
} from 'lucide-react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { encodeFunctionData } from 'viem'
import { toast } from 'sonner'
import { useAppStore } from '../../store/appStore'
import { useNanName } from '../../hooks/useNanName'
import { useNanTheme } from '../../hooks/useNanTheme'
import { useCircleTransaction } from '../../hooks/useCircleTransaction'
import { buildAddressExplorerUrl } from '../../onchain-facts'

const NAME_REGISTRY = (import.meta.env.VITE_NAME_REGISTRY as string | undefined) ?? ''
const ARC = 5042002

const REGISTRY_ABI = [
  { name: 'register', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'name', type: 'string' }], outputs: [] },
  { name: 'update',   type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'name', type: 'string' }], outputs: [] },
  { name: 'release',  type: 'function', stateMutability: 'nonpayable', inputs: [], outputs: [] },
] as const

const F    = "'Inter', -apple-system, sans-serif"
const MONO = "'JetBrains Mono', Menlo, monospace"

// very loose handle validation — letters, digits, underscore, hyphen, 1–24 chars
function isValidHandle(h: string) {
  return /^[a-zA-Z0-9_-]{1,24}$/.test(h)
}

type PageState = 'loading' | 'noWallet' | 'noRegistry' | 'lookup' | 'registered' | 'editing' | 'registering'

export function NanNamePage() {
  const C = useNanTheme()
  const { setActiveView, auth } = useAppStore()
  const { address: wagmiAddress } = useAccount()
  const address = wagmiAddress ?? (auth?.circleWalletAddress as `0x${string}` | undefined)

  // Detect auth path
  const isCircleUser  = !wagmiAddress && !!auth?.circleWalletId && !auth?.isPasskeyUser
  const isPasskeyUser = !!auth?.isPasskeyUser

  const { resolveHandle, resolveName, resolving, registrySet } = useNanName()
  const circleTx = useCircleTransaction()

  // ── state ──────────────────────────────────────────────────────────────────
  const [pageState, setPageState]           = useState<PageState>('loading')
  const [myHandle, setMyHandle]             = useState<string>('')
  const [searchInput, setSearchInput]       = useState('')
  const [searchResult, setSearchResult]     = useState<'available' | 'taken' | null>(null)
  const [searchOwner, setSearchOwner]       = useState<string | null>(null)
  const [searching, setSearching]           = useState(false)
  const [newHandle, setNewHandle]           = useState('')
  const [handleError, setHandleError]       = useState('')
  const [copied, setCopied]                 = useState(false)
  const [confirmRelease, setConfirmRelease] = useState(false)
  const [altBusy, setAltBusy]               = useState(false) // Circle/passkey in-flight

  // ── wagmi write (MetaMask / external wallet) ───────────────────────────────
  const { writeContract, data: txHash, isPending, error: writeError, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })
  const isBusy = isPending || isConfirming || altBusy

  // ── shared: run after any successful tx ───────────────────────────────────
  const onTxSuccess = useCallback((fnName: string, handle: string) => {
    toast.success(fnName === 'register' ? `@${handle} registered!`
      : fnName === 'update' ? `Handle updated to @${handle}`
      : 'Handle released')
    setNewHandle('')
    setConfirmRelease(false)
    reset()
    void loadMyHandle()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── load my current handle on mount ───────────────────────────────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const loadMyHandle = useCallback(async () => {
    if (!address) { setPageState('noWallet'); return }
    if (!registrySet) { setPageState('noRegistry'); return }
    setPageState('loading')
    const handle = await resolveName(address)
    setMyHandle(handle)
    setPageState(handle ? 'registered' : 'lookup')
  }, [address, registrySet, resolveName])

  useEffect(() => { void loadMyHandle() }, [loadMyHandle])

  // ── wagmi success / error effects ─────────────────────────────────────────
  useEffect(() => {
    if (!isSuccess) return
    const fnName = myHandle ? (pageState === 'editing' ? 'update' : 'release') : 'register'
    onTxSuccess(fnName, newHandle)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess])

  useEffect(() => {
    if (!writeError) return
    const msg = writeError.message?.includes('reverted')
      ? 'Transaction reverted — the name may already be taken or the contract rejected it.'
      : (writeError.message?.slice(0, 120) ?? 'Transaction failed')
    toast.error(msg)
    reset()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [writeError])

  // ── search a handle ────────────────────────────────────────────────────────
  const doSearch = async () => {
    const h = searchInput.trim().replace(/^@/, '')
    if (!h) return
    if (!isValidHandle(h)) { setSearchResult(null); return }
    setSearching(true); setSearchResult(null); setSearchOwner(null)
    const owner = await resolveHandle('@' + h)
    setSearching(false)
    if (!owner) { setSearchResult('available') }
    else { setSearchResult('taken'); setSearchOwner(owner) }
  }

  // ── encode calldata for Circle / passkey paths ────────────────────────────
  function encodeRegistryCall(fnName: 'register' | 'update' | 'release', handle?: string): `0x${string}` {
    if (fnName === 'release') {
      return encodeFunctionData({ abi: REGISTRY_ABI, functionName: 'release', args: [] })
    }
    return encodeFunctionData({ abi: REGISTRY_ABI, functionName: fnName, args: [handle!] })
  }

  // ── dispatch write across all auth paths ──────────────────────────────────
  const dispatchWrite = useCallback(async (fnName: 'register' | 'update' | 'release', handle?: string) => {
    if (isPasskeyUser) {
      const clientKey = import.meta.env.VITE_CLIENT_KEY as string | undefined
      if (!clientKey) { toast.error('VITE_CLIENT_KEY is not set'); return }
      setAltBusy(true)
      try {
        // Passkey: sendUserOperation with raw calldata (0 value, no token transfer)
        const { createPublicClient } = await import('viem')
        const { arcTestnet } = await import('viem/chains')
        const {
          toCircleSmartAccount, toModularTransport,
        } = await import('@circle-fin/modular-wallets-core')
        const { createBundlerClient, toWebAuthnAccount } = await import('viem/account-abstraction')
        const MODULAR_URL = 'https://modular-sdk.circle.com/v1/rpc/w3s/buidl'
        const stored = localStorage.getItem('nan_passkey_credential')
        if (!stored) { toast.error('Passkey credential not found — please log in again'); return }
        const credential = JSON.parse(stored) as Parameters<typeof toWebAuthnAccount>[0]['credential']
        const modularTransport = toModularTransport(`${MODULAR_URL}/arcTestnet`, clientKey)
        const publicClient = createPublicClient({ chain: arcTestnet, transport: modularTransport })
        const account = await toCircleSmartAccount({ client: publicClient, owner: toWebAuthnAccount({ credential }) })
        const bundlerClient = createBundlerClient({ account, chain: arcTestnet, transport: modularTransport })
        const callData = encodeRegistryCall(fnName, handle)
        let userOpHash: `0x${string}`
        try {
          userOpHash = await bundlerClient.sendUserOperation({ account, calls: [{ to: NAME_REGISTRY as `0x${string}`, data: callData, value: 0n }], paymaster: true })
        } catch {
          userOpHash = await bundlerClient.sendUserOperation({ account, calls: [{ to: NAME_REGISTRY as `0x${string}`, data: callData, value: 0n }] })
        }
        await bundlerClient.waitForUserOperationReceipt({ hash: userOpHash })
        onTxSuccess(fnName, handle ?? '')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Passkey transaction failed')
      } finally {
        setAltBusy(false)
      }
      return
    }

    if (isCircleUser) {
      setAltBusy(true)
      const callData = encodeRegistryCall(fnName, handle)
      const hash = await circleTx.executeContract({
        contractAddress: NAME_REGISTRY,
        callData,
      })
      setAltBusy(false)
      if (hash) { onTxSuccess(fnName, handle ?? '') }
      else { toast.error(circleTx.error ?? 'Transaction failed') }
      return
    }

    // wagmi path
    if (fnName === 'release') {
      writeContract({ address: NAME_REGISTRY as `0x${string}`, abi: REGISTRY_ABI, functionName: 'release', args: [], chainId: ARC })
    } else {
      writeContract({ address: NAME_REGISTRY as `0x${string}`, abi: REGISTRY_ABI, functionName: fnName, args: [handle!], chainId: ARC })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCircleUser, isPasskeyUser, circleTx, writeContract, onTxSuccess])

  // ── register / update ──────────────────────────────────────────────────────
  const handleSubmit = () => {
    const h = newHandle.trim().replace(/^@/, '')
    if (!isValidHandle(h)) { setHandleError('1–24 chars: letters, numbers, _ or -'); return }
    setHandleError('')
    void dispatchWrite(myHandle ? 'update' : 'register', h)
  }

  // ── release ────────────────────────────────────────────────────────────────
  const handleRelease = () => {
    void dispatchWrite('release')
  }

  const copyAddress = (addr: string) => {
    void navigator.clipboard.writeText(addr)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ width: '100%', fontFamily: F, paddingBottom: 80 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={() => setActiveView('profile')}
          style={{ width: 36, height: 36, borderRadius: 10, background: C.surf, border: `1px solid ${C.bdr}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
          <ArrowLeft size={16} color={C.t2} />
        </button>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.text, letterSpacing: '-0.02em' }}>NAN Name</div>
          <div style={{ fontSize: 12, color: C.t3 }}>Your onchain identity handle</div>
        </div>
      </div>

      {/* No registry banner */}
      {!registrySet && (
        <div style={{ background: 'rgba(240,165,0,0.08)', border: '1px solid rgba(240,165,0,0.2)', borderRadius: 14, padding: '14px 16px', marginBottom: 20, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <AlertCircle size={15} color="#F0A500" style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 13, color: '#F0A500', lineHeight: 1.5 }}>
            Name registry contract not configured. Add <code style={{ fontFamily: MONO, fontSize: 12 }}>VITE_NAME_REGISTRY</code> to your <code style={{ fontFamily: MONO, fontSize: 12 }}>.env</code>.
          </div>
        </div>
      )}

      {/* No wallet */}
      {pageState === 'noWallet' && (
        <div style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ width: 56, height: 56, borderRadius: 18, background: C.surf2, border: `1px solid ${C.bdr}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <AtSign size={24} color={C.t3} />
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 6 }}>Connect a wallet</div>
          <div style={{ fontSize: 13, color: C.t3, marginBottom: 20 }}>Connect or log in to register your @handle.</div>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <ConnectKitButton />
          </div>
        </div>
      )}

      {/* Loading spinner */}
      {pageState === 'loading' && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <Loader2 size={28} color={C.blue} style={{ animation: 'nan-spin 0.9s linear infinite' }} />
        </div>
      )}

      {/* ── Registered view ── */}
      {pageState === 'registered' && myHandle && (
        <div style={{ marginBottom: 20 }}>
          {/* Handle hero card */}
          <div style={{
            background: `linear-gradient(135deg, rgba(0,102,255,0.12) 0%, rgba(0,102,255,0.04) 100%)`,
            border: '1px solid rgba(0,102,255,0.22)',
            borderRadius: 20, padding: '24px 22px', marginBottom: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 52, height: 52, borderRadius: 16, background: '#0066FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 4px 16px rgba(0,102,255,0.35)' }}>
                <AtSign size={22} color="#fff" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: '-0.03em', lineHeight: 1 }}>
                  @{myHandle}
                </div>
                <div style={{ fontSize: 12, color: C.blue, marginTop: 4, fontWeight: 600 }}>
                  Registered on Arc Testnet
                </div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#00C853', background: 'rgba(0,200,83,0.10)', border: '1px solid rgba(0,200,83,0.18)', borderRadius: 20, padding: '3px 10px' }}>
                Active
              </span>
            </div>

            {address && (
              <div style={{ marginTop: 16, background: 'rgba(0,0,0,0.2)', borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: C.t3, fontFamily: MONO, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {address.slice(0, 12)}…{address.slice(-8)}
                </span>
                <button onClick={() => copyAddress(address)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', flexShrink: 0 }}>
                  {copied ? <Check size={14} color="#00C853" /> : <Copy size={14} color={C.t3} />}
                </button>
                <a href={buildAddressExplorerUrl(ARC, address)} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', color: C.t3, flexShrink: 0 }}>
                  <ExternalLink size={14} />
                </a>
              </div>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => { setNewHandle(myHandle); setPageState('editing') }}
              style={{ flex: 1, height: 46, borderRadius: 12, background: C.surf, border: `1px solid ${C.bdr}`, color: C.text, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: F, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Pencil size={14} /> Change handle
            </button>
            <button
              onClick={() => setConfirmRelease(true)}
              style={{ flex: 1, height: 46, borderRadius: 12, background: 'rgba(255,59,59,0.06)', border: '1px solid rgba(255,59,59,0.18)', color: '#FF3B3B', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: F, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Trash2 size={14} /> Release
            </button>
          </div>

          {/* Release confirm */}
          {confirmRelease && (
            <div style={{ marginTop: 14, background: 'rgba(255,59,59,0.06)', border: '1px solid rgba(255,59,59,0.2)', borderRadius: 14, padding: '16px 18px' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#FF3B3B', marginBottom: 6 }}>Release @{myHandle}?</div>
              <div style={{ fontSize: 13, color: C.t2, marginBottom: 14, lineHeight: 1.5 }}>
                This will free the handle. Anyone will be able to claim it after you release it.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setConfirmRelease(false)}
                  style={{ flex: 1, height: 40, borderRadius: 10, background: C.surf, border: `1px solid ${C.bdr}`, color: C.text, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: F }}>
                  Cancel
                </button>
                <button onClick={handleRelease} disabled={isBusy}
                  style={{ flex: 1, height: 40, borderRadius: 10, background: '#FF3B3B', border: 'none', color: '#fff', fontSize: 14, fontWeight: 700, cursor: isBusy ? 'not-allowed' : 'pointer', fontFamily: F, opacity: isBusy ? 0.7 : 1 }}>
                  {isBusy ? 'Waiting…' : 'Confirm release'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Register / Edit form ── */}
      {(pageState === 'lookup' || pageState === 'registering' || pageState === 'editing') && (
        <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 18, padding: '20px', marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 2 }}>
            {pageState === 'editing' ? 'Change your handle' : 'Register a handle'}
          </div>
          <div style={{ fontSize: 12, color: C.t3, marginBottom: 14 }}>
            {pageState === 'editing'
              ? `Currently @${myHandle}. Choose a new one to replace it.`
              : 'Claim a unique @handle linked to your wallet.'}
          </div>

          {/* Input */}
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 16, fontWeight: 700, color: '#0066FF', pointerEvents: 'none', zIndex: 1 }}>@</span>
            <input
              autoFocus
              value={newHandle}
              onChange={e => { setNewHandle(e.target.value.replace(/^@/, '')); setHandleError('') }}
              onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}
              placeholder="yourhandle"
              maxLength={24}
              style={{
                width: '100%', height: 52, paddingLeft: 30, paddingRight: 16,
                background: C.surf2, border: `1.5px solid ${handleError ? '#FF3B3B' : newHandle ? '#0066FF' : C.bdr}`,
                borderRadius: 12, color: C.text, fontSize: 16, fontWeight: 700, fontFamily: MONO,
                outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s',
              }}
            />
          </div>
          {handleError && <div style={{ fontSize: 12, color: '#FF3B3B', marginBottom: 10 }}>{handleError}</div>}
          <div style={{ fontSize: 11, color: C.t3, marginBottom: 16 }}>
            1–24 characters: letters, numbers, _ or -. Case-sensitive.
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            {(pageState === 'editing') && (
              <button onClick={() => { setPageState('registered'); setHandleError('') }}
                style={{ flex: 1, height: 46, borderRadius: 12, background: C.surf2, border: `1px solid ${C.bdr}`, color: C.t2, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: F }}>
                Cancel
              </button>
            )}
            <button onClick={handleSubmit} disabled={isBusy || !newHandle.trim()}
              style={{
                flex: 2, height: 46, borderRadius: 12,
                background: isBusy || !newHandle.trim() ? C.surf2 : '#0066FF',
                border: 'none',
                color: isBusy || !newHandle.trim() ? C.t3 : '#fff',
                fontSize: 15, fontWeight: 700, cursor: (isBusy || !newHandle.trim()) ? 'not-allowed' : 'pointer',
                fontFamily: F, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                boxShadow: !isBusy && newHandle.trim() ? '0 4px 16px rgba(0,102,255,0.35)' : 'none',
                transition: 'all 0.15s',
              }}>
              {isBusy
                ? <><Loader2 size={15} style={{ animation: 'nan-spin 0.8s linear infinite' }} /> {isCircleUser ? 'Approve in popup…' : isPasskeyUser ? 'Confirm with passkey…' : 'Confirming…'}</>
                : pageState === 'editing' ? 'Update handle' : 'Register @handle'}
            </button>
          </div>
        </div>
      )}

      {/* ── Handle search / availability checker ── */}
      {(pageState === 'lookup' || pageState === 'registered') && registrySet && (
        <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 18, padding: '20px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 10 }}>Check availability</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, fontWeight: 700, color: C.t3, pointerEvents: 'none' }}>@</span>
              <input
                value={searchInput}
                onChange={e => { setSearchInput(e.target.value.replace(/^@/, '')); setSearchResult(null) }}
                onKeyDown={e => { if (e.key === 'Enter') { void doSearch() } }}
                placeholder="search"
                maxLength={24}
                style={{
                  width: '100%', height: 44, paddingLeft: 28, paddingRight: 12,
                  background: C.surf2, border: `1.5px solid ${C.bdr}`,
                  borderRadius: 12, color: C.text, fontSize: 14, fontFamily: MONO, fontWeight: 600,
                  outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>
            <button onClick={() => { void doSearch() }} disabled={searching || resolving}
              style={{ width: 44, height: 44, borderRadius: 12, background: '#0066FF', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {(searching || resolving) ? <Loader2 size={16} color="#fff" style={{ animation: 'nan-spin 0.8s linear infinite' }} /> : <Search size={16} color="#fff" />}
            </button>
          </div>

          {/* Search result */}
          {searchResult === 'available' && (
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,200,83,0.08)', border: '1px solid rgba(0,200,83,0.18)', borderRadius: 10, padding: '10px 14px' }}>
              <CheckCircle2 size={15} color="#00C853" />
              <span style={{ fontSize: 13, color: '#00C853', fontWeight: 600 }}>@{searchInput} is available!</span>
              {pageState === 'lookup' && (
                <button
                  onClick={() => { setNewHandle(searchInput); setPageState('registering') }}
                  style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: '#00C853', background: 'none', border: 'none', cursor: 'pointer', fontFamily: F }}>
                  Register it
                </button>
              )}
            </div>
          )}
          {searchResult === 'taken' && (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6, background: 'rgba(255,59,59,0.06)', border: '1px solid rgba(255,59,59,0.18)', borderRadius: 10, padding: '10px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertCircle size={15} color="#FF3B3B" />
                <span style={{ fontSize: 13, color: '#FF3B3B', fontWeight: 600 }}>@{searchInput} is taken</span>
              </div>
              {searchOwner && (
                <span style={{ fontSize: 11, color: C.t3, fontFamily: MONO, paddingLeft: 23 }}>
                  Owner: {searchOwner.slice(0, 10)}…{searchOwner.slice(-6)}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Info footer */}
      <div style={{ marginTop: 20, background: C.surf2, border: `1px solid ${C.bdr}`, borderRadius: 14, padding: '14px 16px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.t2, marginBottom: 6 }}>About NAN Names</div>
        <div style={{ fontSize: 12, color: C.t3, lineHeight: 1.6 }}>
          NAN Names are onchain handles stored in the NAN Name Registry on Arc Testnet.
          Your @handle resolves to your wallet address, making it easy for others to send you USDC without pasting long hex addresses.
          Registration, updates, and releases are standard ERC-20 contract calls — a tiny amount of USDC covers gas.
        </div>
      </div>
    </div>
  )
}
