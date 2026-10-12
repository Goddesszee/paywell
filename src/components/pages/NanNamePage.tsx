/**
 * NanNamePage — register and manage your @handle on the NANNameRegistry.
 *
 * Real contract flow:
 *   1. USDC.approve(NAME_REGISTRY, price)
 *   2. register(name, duration)   ← duration: 1 | 2 | 5 (years)
 *
 * Prices (6-decimal USDC): 1yr = 2 USDC, 2yr = 3 USDC, 5yr = 8 USDC
 * Name rules: 2-32 chars, lowercase letters + digits + hyphens only.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  AtSign, CheckCircle2, AlertCircle, ArrowLeft,
  Search, Loader2, ExternalLink, Copy, Check, Star,
} from 'lucide-react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { encodeFunctionData, encodePacked, keccak256, toHex } from 'viem'
import { toast } from 'sonner'
import { useAppStore } from '../../store/appStore'
import { useNanName, REGISTRY_ABI, ERC20_APPROVE_ABI, PRICES } from '../../hooks/useNanName'
import { useNanTheme } from '../../hooks/useNanTheme'
import { useCircleTransaction } from '../../hooks/useCircleTransaction'
import { buildAddressExplorerUrl } from '../../onchain-facts'
import { getClientKey } from '../../lib/circle-session'

const NAME_REGISTRY = ((import.meta.env.VITE_NAME_REGISTRY as string | undefined) ?? '').trim()
  || '0x7b839c3bE9394b2a6baC286776f37042609f83b2'
const USDC_ADDRESS  = '0x3600000000000000000000000000000000000000'
const ARC_CHAIN_ID  = 5042

const F    = "'Inter', -apple-system, sans-serif"
const MONO = "'JetBrains Mono', Menlo, monospace"

type Step = 'loading' | 'noWallet' | 'noRegistry' | 'lookup' | 'registered' | 'approving' | 'committing' | 'waitingBlocks' | 'registering' | 'success'

/** Generate a random 32-byte salt as a hex string */
function generateSalt(): `0x${string}` {
  const arr = new Uint8Array(32)
  crypto.getRandomValues(arr)
  return toHex(arr)
}

/** Build the commitment hash: keccak256(abi.encodePacked(name, salt, address)) */
function makeCommitment(name: string, salt: `0x${string}`, addr: `0x${string}`): `0x${string}` {
  return keccak256(encodePacked(['string', 'bytes32', 'address'], [name, salt, addr]))
}

/** Validate: lowercase letters, digits, hyphens only; 2–32 chars */
function isValidHandle(h: string) {
  return /^[a-z0-9-]{2,32}$/.test(h)
}

function sanitize(raw: string) {
  return raw.toLowerCase().replace(/[^a-z0-9-]/g, '')
}

// ── Balloon confetti overlay ──────────────────────────────────────────────────
const BALLOONS = ['🎈', '🎉', '🎊', '✨', '🥳', '🌟', '💫', '🎈']

function BalloonCelebration({ handle, onDone }: { handle: string; onDone: () => void }) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const t = setTimeout(() => { setVisible(false); onDone() }, 5000)
    return () => clearTimeout(t)
  }, [onDone])

  if (!visible) return null

  return (
    <div
      onClick={() => { setVisible(false); onDone() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer',
      }}
    >
      {/* Floating balloons */}
      {BALLOONS.map((b, i) => (
        <span
          key={i}
          style={{
            position: 'absolute',
            fontSize: 36 + (i % 3) * 10,
            left: `${8 + i * 11}%`,
            top: `${10 + (i % 4) * 20}%`,
            animation: `nanFloat ${2.5 + i * 0.3}s ease-in-out infinite alternate`,
            animationDelay: `${i * 0.2}s`,
            userSelect: 'none',
          }}
        >{b}</span>
      ))}

      {/* Hero card */}
      <div
        style={{
          background: 'linear-gradient(135deg, #0866F5 0%, #0044CC 100%)',
          borderRadius: 28, padding: '36px 40px', textAlign: 'center',
          boxShadow: '0 24px 80px rgba(8,102,245,0.5)',
          maxWidth: 320, width: '90%',
          animation: 'nanPop 0.5s cubic-bezier(0.34,1.56,0.64,1)',
        }}
      >
        <div style={{ fontSize: 56, marginBottom: 8 }}>🎉</div>
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', fontWeight: 600, marginBottom: 4 }}>
          Your NAN Name is ready!
        </div>
        <div style={{
          fontSize: 34, fontWeight: 900, color: '#fff',
          letterSpacing: '-0.03em', marginBottom: 8,
          fontFamily: MONO,
        }}>
          @{handle}
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 1.5 }}>
          Registered onchain on Arc.<br />
          Anyone can send you USDC at @{handle}.
        </div>
        <div style={{ marginTop: 20, fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
          Tap anywhere to continue
        </div>
      </div>

      <style>{`
        @keyframes nanFloat {
          from { transform: translateY(0) rotate(-8deg); }
          to   { transform: translateY(-24px) rotate(8deg); }
        }
        @keyframes nanPop {
          from { transform: scale(0.5); opacity: 0; }
          to   { transform: scale(1);   opacity: 1; }
        }
        @keyframes nan-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

// ── Duration picker ───────────────────────────────────────────────────────────
type Dur = 1 | 2 | 5
const DUR_OPTS: { val: Dur; label: string; price: string; sub: string }[] = [
  { val: 1, label: '1 Year',  price: '2 USDC', sub: 'Most popular' },
  { val: 2, label: '2 Years', price: '3 USDC', sub: 'Save 25%' },
  { val: 5, label: '5 Years', price: '8 USDC', sub: 'Best value' },
]

// ── Main component ────────────────────────────────────────────────────────────
export function NanNamePage() {
  const C = useNanTheme()
  const { setActiveView, auth, setNanHandle: setStoreHandle } = useAppStore()
  const { address: wagmiAddress } = useAccount()
  const address = wagmiAddress ?? (auth?.circleWalletAddress as `0x${string}` | undefined)

  const isCircleUser  = !wagmiAddress && !!auth?.circleWalletId && !auth?.isPasskeyUser
  const isPasskeyUser = !!auth?.isPasskeyUser

  const { resolveName, checkAvailable, registrySet } = useNanName()
  const circleTx = useCircleTransaction()
  // Latest circleTx.error — the closure value is stale right after an awaited call
  const circleErrRef = useRef<string | null>(null)
  circleErrRef.current = circleTx.error ?? null

  const [step, setStep]                     = useState<Step>('loading')
  const [myHandle, setMyHandle]             = useState('')
  const [myNames, _setMyNames]              = useState<string[]>([])
  const [newHandle, setNewHandle]           = useState('')
  const [handleError, setHandleError]       = useState('')
  const [duration, setDuration]             = useState<Dur>(1)
  const [searchInput, setSearchInput]       = useState('')
  const [searchResult, setSearchResult]     = useState<'available' | 'taken' | 'error' | null>(null)
  const [_searchOwner, setSearchOwner]      = useState<string | null>(null)
  const [searching, setSearching]           = useState(false)
  const [copied, setCopied]                 = useState(false)
  const [justRegistered, setJustRegistered] = useState('')
  const [showCelebration, setShowCelebration] = useState(false)
  const [altBusy, setAltBusy]               = useState(false)

  const pendingRef = useRef<{ fn: string; handle: string; salt: `0x${string}` }>({ fn: '', handle: '', salt: '0x' })

  // Name / duration requested by the NAN Agent ("register @ada for 2 years") — user still taps Register
  useEffect(() => {
    const pre = useAppStore.getState().nanNamePrefill
    if (!pre) return
    setNewHandle(pre.name)
    if (pre.years) setDuration(pre.years)
    useAppStore.getState().setNanNamePrefill(null)
  }, [])

  // ── wagmi writes ──────────────────────────────────────────────────────────
  const approveWrite  = useWriteContract()
  const commitWrite   = useWriteContract()
  const registerWrite = useWriteContract()

  const approveHash  = approveWrite.data
  const commitHash   = commitWrite.data
  const registerHash = registerWrite.data

  const { isLoading: approveConfirming,  isSuccess: approveSuccess  } = useWaitForTransactionReceipt({ hash: approveHash  })
  const { isLoading: commitConfirming,   isSuccess: commitSuccess   } = useWaitForTransactionReceipt({ hash: commitHash   })
  const { isLoading: registerConfirming, isSuccess: registerSuccess } = useWaitForTransactionReceipt({ hash: registerHash })

  const isBusy = approveWrite.isPending || approveConfirming
    || commitWrite.isPending || commitConfirming
    || registerWrite.isPending || registerConfirming || altBusy

  // ── load handle on mount ──────────────────────────────────────────────────
  const loadMyHandle = useCallback(async () => {
    if (!address) { setStep('noWallet'); return }
    if (!registrySet) { setStep('noRegistry'); return }
    setStep('loading')
    const handle = await resolveName(address)
    setMyHandle(handle)
    setStep(handle ? 'registered' : 'lookup')
  }, [address, registrySet, resolveName])

  useEffect(() => { void loadMyHandle() }, [loadMyHandle])

  // ── after approve confirmed → fire commit ─────────────────────────────────
  useEffect(() => {
    if (!approveSuccess) return
    const { handle, salt } = pendingRef.current
    if (!address) return
    const commitment = makeCommitment(handle, salt, address)
    setStep('committing')
    commitWrite.writeContract({
      address: NAME_REGISTRY as `0x${string}`,
      abi: REGISTRY_ABI,
      functionName: 'commit',
      args: [commitment],
      chainId: ARC_CHAIN_ID,
      gasPrice: 1_000_000n,
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approveSuccess])

  // ── after commit confirmed → wait COMMIT_DELAY blocks then register ───────
  useEffect(() => {
    if (!commitSuccess) return
    const { handle, salt } = pendingRef.current
    const dur = duration
    setStep('waitingBlocks')
    // COMMIT_DELAY = 2 blocks (~4s on Arc). Wait 6s to be safe then register.
    const timer = setTimeout(() => {
      setStep('registering')
      registerWrite.writeContract({
        address: NAME_REGISTRY as `0x${string}`,
        abi: REGISTRY_ABI,
        functionName: 'register',
        args: [handle, dur, salt],
        chainId: ARC_CHAIN_ID,
        gasPrice: 1_000_000n,
      })
    }, 6000)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commitSuccess])

  // ── after register confirmed (wagmi) ─────────────────────────────────────
  useEffect(() => {
    if (!registerSuccess) return
    const { handle } = pendingRef.current
    onSuccess(handle)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerSuccess])

  // ── wagmi errors ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!approveWrite.error) return
    toast.error('Approval failed: ' + (approveWrite.error.message?.slice(0, 100) ?? 'unknown'))
    approveWrite.reset()
    setStep('lookup')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approveWrite.error])

  useEffect(() => {
    if (!commitWrite.error) return
    toast.error('Commit failed: ' + (commitWrite.error.message?.slice(0, 100) ?? 'unknown'))
    commitWrite.reset()
    setStep('lookup')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commitWrite.error])

  useEffect(() => {
    if (!registerWrite.error) return
    const msg = registerWrite.error.message ?? ''
    const human = msg.includes('Name already taken') ? 'That name is already taken.'
      : msg.includes('Payment failed') ? 'USDC payment failed — do you have enough USDC?'
      : msg.includes('Invalid name') ? 'Invalid name — use lowercase letters, numbers, hyphens only.'
      : msg.slice(0, 100)
    toast.error(human)
    registerWrite.reset()
    setStep('lookup')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerWrite.error])

  // ── success helper ─────────────────────────────────────────────────────────
  const onSuccess = useCallback((handle: string) => {
    setJustRegistered(handle)
    setMyHandle(handle)
    setStoreHandle(handle)   // update global store so ProfilePage shows it immediately
    setShowCelebration(true)
    setStep('success')
    // Report the registration (price = revenue) to the admin ledger — fire-and-forget
    try {
      const st = useAppStore.getState()
      const price = Number(PRICES[duration]) / 1e6
      void fetch('/api/tx-track', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(st.auth?.sessionToken ? { authorization: `Bearer ${st.auth.sessionToken}` } : {}) },
        body: JSON.stringify({
          walletType: 'main', userEmail: st.auth?.email ?? '',
          walletAddress: st.auth?.walletAddress ?? st.auth?.circleWalletAddress ?? st.mainWalletAddress ?? '',
          type: 'name_registration', amount: price, description: `Registered @${handle} (${duration}y)`, chain: 'Arc',
        }),
      }).catch(() => {})
    } catch { /* never block the UI */ }
    approveWrite.reset()
    registerWrite.reset()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setStoreHandle])

  // ── Circle path: approve → commit → wait → register ──────────────────────
  const submitCircle = useCallback(async (h: string, dur: Dur, salt: `0x${string}`) => {
    if (!address) return
    setAltBusy(true)
    setStep('approving')

    // Step 1: approve USDC spend
    const approveCallData = encodeFunctionData({ abi: ERC20_APPROVE_ABI, functionName: 'approve', args: [NAME_REGISTRY as `0x${string}`, PRICES[dur]] })
    const approveTxId = await circleTx.executeContract({ contractAddress: USDC_ADDRESS, callData: approveCallData })
    if (!approveTxId) {
      await new Promise(r => setTimeout(r, 60))
      const why = circleErrRef.current
      toast.error(why ? why.slice(0, 140) : 'USDC approval failed. Make sure you have at least ' + (Number(PRICES[dur]) / 1e6) + ' USDC.')
      setStep('lookup'); setAltBusy(false); return
    }

    // Step 2: commit
    setStep('committing')
    const commitment = makeCommitment(h, salt, address)
    const commitCallData = encodeFunctionData({ abi: REGISTRY_ABI, functionName: 'commit', args: [commitment] })
    const commitTxId = await circleTx.executeContract({ contractAddress: NAME_REGISTRY, callData: commitCallData })
    if (!commitTxId) {
      await new Promise(r => setTimeout(r, 60))
      toast.error(circleErrRef.current?.slice(0, 140) ?? 'Commit failed. Please try again.')
      setStep('lookup'); setAltBusy(false); return
    }

    // Step 3: wait COMMIT_DELAY blocks (~6s on Arc)
    setStep('waitingBlocks')
    await new Promise(r => setTimeout(r, 7000))

    // Step 4: register
    setStep('registering')
    const registerCallData = encodeFunctionData({ abi: REGISTRY_ABI, functionName: 'register', args: [h, dur, salt] })
    const regTxId = await circleTx.executeContract({ contractAddress: NAME_REGISTRY, callData: registerCallData })
    setAltBusy(false)
    if (regTxId) {
      onSuccess(h)
    } else {
      await new Promise(r => setTimeout(r, 60))
      const msg = circleErrRef.current ?? 'Registration failed'
      toast.error(msg.includes('Name already taken') ? 'That name is already taken.'
        : msg.includes('Payment') ? 'USDC payment failed — the approve may not have settled yet. Try again in a moment.'
        : msg.slice(0, 120))
      setStep('lookup')
    }
  }, [circleTx, onSuccess, address])

  // ── Passkey path: approve + commit (UserOp 1) → wait → register (UserOp 2) ─
  const submitPasskey = useCallback(async (h: string, dur: Dur, salt: `0x${string}`) => {
    const clientKey = getClientKey()
    if (!clientKey) { toast.error('VITE_CLIENT_KEY is not set'); return }
    setAltBusy(true)
    setStep('approving')
    try {
      const { createPublicClient } = await import('viem')
      const { arc } = await import('viem/chains')
      const { toCircleSmartAccount, toModularTransport, toPasskeyTransport, toWebAuthnCredential, WebAuthnMode } = await import('@circle-fin/modular-wallets-core')
      const { createBundlerClient, toWebAuthnAccount } = await import('viem/account-abstraction')
      const MODULAR_URL = 'https://modular-sdk.circle.com/v1/rpc/w3s/buidl'
      const modularTransport = toModularTransport(`${MODULAR_URL}/arc`, clientKey)
      const publicClient = createPublicClient({ chain: arc, transport: modularTransport })

      const passkeyTransport = toPasskeyTransport(MODULAR_URL, clientKey)
      const credential = await toWebAuthnCredential({ transport: passkeyTransport, mode: WebAuthnMode.Login })
      const account = await toCircleSmartAccount({ client: publicClient, owner: toWebAuthnAccount({ credential }) })
      const bundler = createBundlerClient({ account, chain: arc, transport: modularTransport })

      const accountAddress = account.address
      const commitment = makeCommitment(h, salt, accountAddress)

      // UserOp 1: approve + commit (batched, one passkey prompt)
      const approveData = encodeFunctionData({ abi: ERC20_APPROVE_ABI, functionName: 'approve', args: [NAME_REGISTRY as `0x${string}`, PRICES[dur]] })
      const commitData  = encodeFunctionData({ abi: REGISTRY_ABI, functionName: 'commit', args: [commitment] })
      const calls1 = [
        { to: USDC_ADDRESS as `0x${string}`, data: approveData, value: 0n },
        { to: NAME_REGISTRY as `0x${string}`, data: commitData, value: 0n },
      ]
      setStep('committing')
      let op1Hash: `0x${string}`
      try {
        op1Hash = await bundler.sendUserOperation({ account, calls: calls1, paymaster: true })
      } catch (e1: unknown) {
        const e = e1 as { code?: number; name?: string; shortMessage?: string; message?: string } | undefined
        const internal = e?.code === -32603 || e?.name === 'InternalRpcError' || /internal error/i.test(e?.shortMessage ?? e?.message ?? '')
        if (!internal) throw e1
        op1Hash = await bundler.sendUserOperation({ account, calls: calls1 })
      }
      await bundler.waitForUserOperationReceipt({ hash: op1Hash })

      // Wait COMMIT_DELAY blocks (~6s on Arc at ~3s/block)
      setStep('waitingBlocks')
      await new Promise(r => setTimeout(r, 7000))

      // UserOp 2: register (second passkey prompt)
      setStep('registering')
      const registerData = encodeFunctionData({ abi: REGISTRY_ABI, functionName: 'register', args: [h, dur, salt] })
      const calls2 = [{ to: NAME_REGISTRY as `0x${string}`, data: registerData, value: 0n }]
      let op2Hash: `0x${string}`
      try {
        op2Hash = await bundler.sendUserOperation({ account, calls: calls2, paymaster: true })
      } catch (e2: unknown) {
        const e = e2 as { code?: number; name?: string; shortMessage?: string; message?: string } | undefined
        const internal = e?.code === -32603 || e?.name === 'InternalRpcError' || /internal error/i.test(e?.shortMessage ?? e?.message ?? '')
        if (!internal) throw e2
        op2Hash = await bundler.sendUserOperation({ account, calls: calls2 })
      }
      await bundler.waitForUserOperationReceipt({ hash: op2Hash })

      onSuccess(h)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Passkey transaction failed'
      const lower = msg.toLowerCase()
      toast.error(msg.includes('Name already taken') ? 'That name is already taken.'
        : lower.includes('cancel') || lower.includes('notallowed') || lower.includes('not allowed') ? 'Passkey approval was cancelled.'
        : lower.includes('insufficient') || lower.includes('transfer amount exceeds') ? 'Not enough USDC — you need the name price plus a little for gas.'
        : msg.slice(0, 120))
      setStep('lookup')
    } finally {
      setAltBusy(false)
    }
  }, [onSuccess])

  // ── submit: route to correct path ──────────────────────────────────────────
  const handleSubmit = () => {
    const h = sanitize(newHandle.trim())
    if (!isValidHandle(h)) {
      setHandleError('2–32 chars: lowercase letters, numbers, hyphens only')
      return
    }
    setHandleError('')
    const salt = generateSalt()
    pendingRef.current = { fn: 'register', handle: h, salt }

    if (isCircleUser) { void submitCircle(h, duration, salt); return }
    if (isPasskeyUser) { void submitPasskey(h, duration, salt); return }

    // wagmi: step 1 — approve USDC
    // Arc gas is paid in USDC (native = USDC). Set a low gasPrice so wallets
    // don't prompt for ETH and don't over-estimate fees.
    setStep('approving')
    approveWrite.writeContract({
      address: USDC_ADDRESS,
      abi: ERC20_APPROVE_ABI,
      functionName: 'approve',
      args: [NAME_REGISTRY as `0x${string}`, PRICES[duration]],
      chainId: ARC_CHAIN_ID,
      gasPrice: 1_000_000n, // 0.000001 gwei in USDC-native units — Arc fees are very low
    })
  }

  // ── search ────────────────────────────────────────────────────────────────
  const doSearch = async () => {
    const h = sanitize(searchInput.trim())
    if (!h) return
    setSearching(true); setSearchResult(null); setSearchOwner(null)
    try {
      const available = await checkAvailable(h)
      if (available === null) {
        setSearchResult('error')
      } else if (available) {
        setSearchResult('available')
      } else {
        setSearchResult('taken')
        setSearchOwner(null)
      }
    } catch { setSearchResult('error') }
    setSearching(false)
  }

  const copyAddress = (addr: string) => {
    void navigator.clipboard.writeText(addr)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ── step label for progress indicator ─────────────────────────────────────
  const stepLabel = step === 'approving'      ? 'Step 1/4: Approving USDC spend…'
    : step === 'committing'    ? 'Step 2/4: Committing name reservation…'
    : step === 'waitingBlocks' ? 'Step 3/4: Waiting for confirmation…'
    : step === 'registering'   ? 'Step 4/4: Registering name onchain…'
    : null

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ width: '100%', fontFamily: F, paddingBottom: 80 }}>

      {/* Balloon celebration overlay */}
      {showCelebration && (
        <BalloonCelebration
          handle={justRegistered}
          onDone={() => { setShowCelebration(false); void loadMyHandle() }}
        />
      )}

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
        <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 14, padding: '14px 16px', marginBottom: 20, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <AlertCircle size={15} color="#F59E0B" style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 13, color: '#F59E0B', lineHeight: 1.5 }}>
            Name registry contract not configured.
          </div>
        </div>
      )}

      {/* No wallet */}
      {step === 'noWallet' && (
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
      {step === 'loading' && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <Loader2 size={28} color={C.blue} style={{ animation: 'nan-spin 0.9s linear infinite' }} />
        </div>
      )}

      {/* ── Registered / Success view ── */}
      {(step === 'registered' || step === 'success') && myHandle && (
        <div style={{ marginBottom: 20 }}>
          {/* Handle hero card */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(8,102,245,0.15) 0%, rgba(8,102,245,0.05) 100%)',
            border: '1.5px solid rgba(8,102,245,0.3)',
            borderRadius: 22, padding: '28px 22px', marginBottom: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 56, height: 56, borderRadius: 18, background: '#0866F5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 4px 20px rgba(8,102,245,0.4)' }}>
                <AtSign size={24} color="#fff" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: C.t3, fontWeight: 600, marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Your NAN Name</div>
                <div style={{ fontSize: 26, fontWeight: 900, color: C.text, letterSpacing: '-0.03em', lineHeight: 1, fontFamily: MONO }}>
                  @{myHandle}
                </div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#10B981', background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.18)', borderRadius: 20, padding: '4px 12px', flexShrink: 0 }}>
                Active
              </span>
            </div>

            {address && (
              <div style={{ marginTop: 16, background: 'rgba(0,0,0,0.18)', borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: C.t3, fontFamily: MONO, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {address.slice(0, 14)}…{address.slice(-8)}
                </span>
                <button onClick={() => copyAddress(address)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', flexShrink: 0 }}>
                  {copied ? <Check size={14} color="#10B981" /> : <Copy size={14} color={C.t3} />}
                </button>
                <a href={buildAddressExplorerUrl(ARC_CHAIN_ID, address)} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', color: C.t3, flexShrink: 0 }}>
                  <ExternalLink size={14} />
                </a>
              </div>
            )}
          </div>

          {/* Owned names list if >1 */}
          {myNames.length > 1 && (
            <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 14, padding: '14px 16px', marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.t2, marginBottom: 10 }}>All your names</div>
              {myNames.map(n => (
                <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <AtSign size={13} color={C.blue} />
                  <span style={{ fontSize: 14, fontWeight: 700, color: C.text, fontFamily: MONO }}>{n}</span>
                  {n === myHandle && <Star size={12} color="#F59E0B" fill="#F59E0B" />}
                </div>
              ))}
            </div>
          )}

          {/* Register another */}
          <button onClick={() => setStep('lookup')}
            style={{ width: '100%', height: 44, borderRadius: 12, background: C.surf, border: `1px solid ${C.bdr}`, color: C.t2, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: F }}>
            + Register another name
          </button>
        </div>
      )}

      {/* ── Register form ── */}
      {(step === 'lookup' || step === 'approving' || step === 'committing' || step === 'waitingBlocks' || step === 'registering') && (
        <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 18, padding: '20px', marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 2 }}>Register a handle</div>
          <div style={{ fontSize: 12, color: C.t3, marginBottom: 16 }}>Claim a unique @handle linked to your wallet.</div>

          {/* Handle input */}
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 16, fontWeight: 700, color: '#0866F5', pointerEvents: 'none', zIndex: 1 }}>@</span>
            <input
              autoFocus
              value={newHandle}
              onChange={e => { setNewHandle(sanitize(e.target.value)); setHandleError('') }}
              onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}
              placeholder="yourname"
              maxLength={32}
              disabled={isBusy}
              style={{
                width: '100%', height: 52, paddingLeft: 30, paddingRight: 16,
                background: C.surf2, border: `1.5px solid ${handleError ? '#EF4444' : newHandle ? '#0866F5' : C.bdr}`,
                borderRadius: 12, color: C.text, fontSize: 16, fontWeight: 700, fontFamily: MONO,
                outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s',
                opacity: isBusy ? 0.6 : 1,
              }}
            />
          </div>
          {handleError && <div style={{ fontSize: 12, color: '#EF4444', marginBottom: 8 }}>{handleError}</div>}
          <div style={{ fontSize: 11, color: C.t3, marginBottom: 16, lineHeight: 1.5 }}>
            2–32 chars · lowercase letters, numbers, hyphens only · case-insensitive
          </div>

          {/* Duration picker */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.t2, marginBottom: 10 }}>Registration period</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {DUR_OPTS.map(d => (
                <button key={d.val} onClick={() => !isBusy && setDuration(d.val)}
                  style={{
                    flex: 1, borderRadius: 12, padding: '10px 8px', cursor: isBusy ? 'not-allowed' : 'pointer',
                    background: duration === d.val ? 'rgba(8,102,245,0.10)' : C.surf2,
                    border: `1.5px solid ${duration === d.val ? '#0866F5' : C.bdr}`,
                    transition: 'all 0.15s',
                  }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: duration === d.val ? '#0866F5' : C.text }}>{d.label}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: duration === d.val ? '#0866F5' : C.t2, marginTop: 2 }}>{d.price}</div>
                  <div style={{ fontSize: 10, color: C.t3, marginTop: 1 }}>{d.sub}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Progress indicator */}
          {stepLabel && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(8,102,245,0.06)', border: '1px solid rgba(8,102,245,0.15)', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
              <Loader2 size={14} color="#0866F5" style={{ animation: 'nan-spin 0.8s linear infinite', flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: '#0866F5', fontWeight: 600 }}>{stepLabel}</span>
            </div>
          )}

          <button onClick={handleSubmit} disabled={isBusy || !newHandle.trim()}
            style={{
              width: '100%', height: 50, borderRadius: 13,
              background: (isBusy || !newHandle.trim()) ? C.surf2 : '#0866F5',
              border: 'none',
              color: (isBusy || !newHandle.trim()) ? C.t3 : '#fff',
              fontSize: 15, fontWeight: 700,
              cursor: (isBusy || !newHandle.trim()) ? 'not-allowed' : 'pointer',
              fontFamily: F,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: (!isBusy && newHandle.trim()) ? '0 4px 18px rgba(8,102,245,0.35)' : 'none',
              transition: 'all 0.15s',
            }}>
            {isBusy
              ? <><Loader2 size={16} style={{ animation: 'nan-spin 0.8s linear infinite' }} /> {stepLabel ?? 'Working…'}</>
              : <>Register @handle · {DUR_OPTS.find(d => d.val === duration)?.price}</>}
          </button>
        </div>
      )}

      {/* ── Search / availability checker ── */}
      {(step === 'lookup' || step === 'registered') && registrySet && (
        <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 18, padding: '20px', marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 10 }}>Check availability</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, fontWeight: 700, color: C.t3, pointerEvents: 'none' }}>@</span>
              <input
                value={searchInput}
                onChange={e => { setSearchInput(sanitize(e.target.value)); setSearchResult(null) }}
                onKeyDown={e => { if (e.key === 'Enter') { void doSearch() } }}
                placeholder="search"
                maxLength={32}
                style={{
                  width: '100%', height: 44, paddingLeft: 28, paddingRight: 12,
                  background: C.surf2, border: `1.5px solid ${C.bdr}`,
                  borderRadius: 12, color: C.text, fontSize: 14, fontFamily: MONO, fontWeight: 600,
                  outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>
            <button onClick={() => { void doSearch() }} disabled={searching}
              style={{ width: 44, height: 44, borderRadius: 12, background: '#0866F5', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {searching ? <Loader2 size={16} color="#fff" style={{ animation: 'nan-spin 0.8s linear infinite' }} /> : <Search size={16} color="#fff" />}
            </button>
          </div>

          {searchResult === 'available' && (
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.18)', borderRadius: 10, padding: '10px 14px' }}>
              <CheckCircle2 size={15} color="#10B981" />
              <span style={{ fontSize: 13, color: '#10B981', fontWeight: 600, flex: 1 }}>@{searchInput} is available!</span>
              {step === 'lookup' && (
                <button onClick={() => { setNewHandle(searchInput); setStep('lookup') }}
                  style={{ fontSize: 12, fontWeight: 700, color: '#10B981', background: 'none', border: 'none', cursor: 'pointer', fontFamily: F }}>
                  Register it
                </button>
              )}
            </div>
          )}
          {searchResult === 'taken' && (
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.18)', borderRadius: 10, padding: '10px 14px' }}>
              <AlertCircle size={15} color="#EF4444" />
              <span style={{ fontSize: 13, color: '#EF4444', fontWeight: 600 }}>@{searchInput} is already taken</span>
            </div>
          )}
          {searchResult === 'error' && (
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 10, padding: '10px 14px' }}>
              <AlertCircle size={15} color="#F59E0B" />
              <span style={{ fontSize: 13, color: '#F59E0B', fontWeight: 600 }}>Couldn't check — try again in a moment</span>
            </div>
          )}
        </div>
      )}

      {/* Info footer */}
      <div style={{ background: C.surf2, border: `1px solid ${C.bdr}`, borderRadius: 14, padding: '14px 16px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.t2, marginBottom: 6 }}>About NAN Names</div>
        <div style={{ fontSize: 12, color: C.t3, lineHeight: 1.6 }}>
          NAN Names are onchain handles stored on Arc. Your @handle resolves to your wallet address — anyone can send you USDC without a long hex address. Registration costs 2 USDC/yr and requires two wallet approvals (approve + register).
        </div>
      </div>

      <style>{`
        @keyframes nan-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
