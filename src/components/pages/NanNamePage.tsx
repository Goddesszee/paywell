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
import { encodeFunctionData } from 'viem'
import { toast } from 'sonner'
import { useAppStore } from '../../store/appStore'
import { useNanName, REGISTRY_ABI, ERC20_APPROVE_ABI, PRICES } from '../../hooks/useNanName'
import { useNanTheme } from '../../hooks/useNanTheme'
import { useCircleTransaction } from '../../hooks/useCircleTransaction'
import { buildAddressExplorerUrl } from '../../onchain-facts'

const NAME_REGISTRY = (import.meta.env.VITE_NAME_REGISTRY as string | undefined) ?? ''
const USDC_ADDRESS  = '0x3600000000000000000000000000000000000000'
const ARC_CHAIN_ID  = 5042002

const F    = "'Inter', -apple-system, sans-serif"
const MONO = "'JetBrains Mono', Menlo, monospace"

type Step = 'loading' | 'noWallet' | 'noRegistry' | 'lookup' | 'registered' | 'approving' | 'registering' | 'success'

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
  const C = useNanTheme()
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
          background: 'linear-gradient(135deg, #0066FF 0%, #0044CC 100%)',
          borderRadius: 28, padding: '36px 40px', textAlign: 'center',
          boxShadow: '0 24px 80px rgba(0,102,255,0.5)',
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
          Registered onchain on Arc Testnet.<br />
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

  const [step, setStep]                     = useState<Step>('loading')
  const [myHandle, setMyHandle]             = useState('')
  const [myNames, setMyNames]               = useState<string[]>([])
  const [newHandle, setNewHandle]           = useState('')
  const [handleError, setHandleError]       = useState('')
  const [duration, setDuration]             = useState<Dur>(1)
  const [searchInput, setSearchInput]       = useState('')
  const [searchResult, setSearchResult]     = useState<'available' | 'taken' | null>(null)
  const [searchOwner, setSearchOwner]       = useState<string | null>(null)
  const [searching, setSearching]           = useState(false)
  const [copied, setCopied]                 = useState(false)
  const [justRegistered, setJustRegistered] = useState('')
  const [showCelebration, setShowCelebration] = useState(false)
  const [altBusy, setAltBusy]               = useState(false)

  const pendingRef = useRef<{ fn: string; handle: string }>({ fn: '', handle: '' })

  // ── wagmi writes ──────────────────────────────────────────────────────────
  const approveWrite  = useWriteContract()
  const registerWrite = useWriteContract()

  const approveHash  = approveWrite.data
  const registerHash = registerWrite.data

  const { isLoading: approveConfirming, isSuccess: approveSuccess } = useWaitForTransactionReceipt({ hash: approveHash })
  const { isLoading: registerConfirming, isSuccess: registerSuccess } = useWaitForTransactionReceipt({ hash: registerHash })

  const isBusy = approveWrite.isPending || approveConfirming
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

  // ── after approve confirmed → fire register ───────────────────────────────
  useEffect(() => {
    if (!approveSuccess) return
    const { handle } = pendingRef.current
    const dur = duration
    setStep('registering')
    registerWrite.writeContract({
      address: NAME_REGISTRY as `0x${string}`,
      abi: REGISTRY_ABI,
      functionName: 'register',
      args: [handle, dur],
      chainId: ARC_CHAIN_ID,
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approveSuccess])

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
    approveWrite.reset()
    registerWrite.reset()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setStoreHandle])

  // ── Circle path: approve then register ────────────────────────────────────
  const submitCircle = useCallback(async (h: string, dur: Dur) => {
    setAltBusy(true)
    setStep('approving')
    // Step 1: approve USDC spend on NAME_REGISTRY
    const approveTxId = await circleTx.executeContract({
      contractAddress: USDC_ADDRESS,
      abiFunctionSignature: 'approve(address,uint256)',
      abiParameters: [NAME_REGISTRY, String(PRICES[dur])],
      amount: '0',
    })
    if (!approveTxId) {
      toast.error(circleTx.error ?? 'USDC approval failed — check your Circle PIN and balance')
      setStep('lookup'); setAltBusy(false); return
    }
    // Step 2: register name
    setStep('registering')
    const regTxId = await circleTx.executeContract({
      contractAddress: NAME_REGISTRY,
      abiFunctionSignature: 'register(string,uint8)',
      abiParameters: [h, String(dur)],
      amount: '0',
    })
    setAltBusy(false)
    if (regTxId) {
      onSuccess(h)
    } else {
      const msg = circleTx.error ?? 'Registration failed'
      toast.error(msg.includes('Name already taken') ? 'That name is already taken.' : msg.slice(0, 100))
      setStep('lookup')
    }
  }, [circleTx, onSuccess])

  // ── Passkey path: two sequential UserOperations ────────────────────────────
  const submitPasskey = useCallback(async (h: string, dur: Dur) => {
    const clientKey = import.meta.env.VITE_CLIENT_KEY as string | undefined
    if (!clientKey) { toast.error('VITE_CLIENT_KEY is not set'); return }
    setAltBusy(true)
    setStep('approving')
    try {
      const { createPublicClient } = await import('viem')
      const { arcTestnet } = await import('viem/chains')
      const { toCircleSmartAccount, toModularTransport } = await import('@circle-fin/modular-wallets-core')
      const { createBundlerClient, toWebAuthnAccount } = await import('viem/account-abstraction')
      const MODULAR_URL = 'https://modular-sdk.circle.com/v1/rpc/w3s/buidl'
      const stored = localStorage.getItem('nan_passkey_credential')
      if (!stored) { toast.error('Passkey credential not found — please log in again'); setAltBusy(false); return }
      const credential = JSON.parse(stored) as Parameters<typeof toWebAuthnAccount>[0]['credential']
      const modularTransport = toModularTransport(`${MODULAR_URL}/arcTestnet`, clientKey)
      const publicClient = createPublicClient({ chain: arcTestnet, transport: modularTransport })
      const account = await toCircleSmartAccount({ client: publicClient, owner: toWebAuthnAccount({ credential }) })
      const bundler = createBundlerClient({ account, chain: arcTestnet, transport: modularTransport })

      // Arc Testnet bundler requires explicit gas params — auto-estimation fails
      const gasOverrides = {
        callGasLimit: 300_000n,
        verificationGasLimit: 500_000n,
        preVerificationGas: 100_000n,
        maxFeePerGas: 100_000_000n,
        maxPriorityFeePerGas: 10_000_000n,
      }

      // Step 1: approve USDC
      const approveData = encodeFunctionData({ abi: ERC20_APPROVE_ABI, functionName: 'approve', args: [NAME_REGISTRY as `0x${string}`, PRICES[dur]] })
      const approveOp = await bundler.sendUserOperation({ account, calls: [{ to: USDC_ADDRESS, data: approveData, value: 0n }], ...gasOverrides })
      await bundler.waitForUserOperationReceipt({ hash: approveOp })

      // Step 2: register
      setStep('registering')
      const registerData = encodeFunctionData({ abi: REGISTRY_ABI, functionName: 'register', args: [h, dur] })
      const registerOp = await bundler.sendUserOperation({ account, calls: [{ to: NAME_REGISTRY as `0x${string}`, data: registerData, value: 0n }], ...gasOverrides })
      await bundler.waitForUserOperationReceipt({ hash: registerOp })

      onSuccess(h)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Passkey transaction failed'
      toast.error(msg.includes('Name already taken') ? 'That name is already taken.' : msg.slice(0, 100))
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
    pendingRef.current = { fn: 'register', handle: h }

    if (isCircleUser) { void submitCircle(h, duration); return }
    if (isPasskeyUser) { void submitPasskey(h, duration); return }

    // wagmi: step 1 — approve USDC
    setStep('approving')
    approveWrite.writeContract({
      address: USDC_ADDRESS,
      abi: ERC20_APPROVE_ABI,
      functionName: 'approve',
      args: [NAME_REGISTRY as `0x${string}`, PRICES[duration]],
      chainId: ARC_CHAIN_ID,
    })
  }

  // ── search ────────────────────────────────────────────────────────────────
  const doSearch = async () => {
    const h = sanitize(searchInput.trim())
    if (!h) return
    setSearching(true); setSearchResult(null); setSearchOwner(null)
    try {
      const available = await checkAvailable(h)
      if (available) {
        setSearchResult('available')
      } else {
        setSearchResult('taken')
        setSearchOwner(null)
      }
    } catch { setSearchResult(null) }
    setSearching(false)
  }

  const copyAddress = (addr: string) => {
    void navigator.clipboard.writeText(addr)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ── step label for progress indicator ─────────────────────────────────────
  const stepLabel = step === 'approving'    ? 'Step 1/2: Approving USDC spend…'
    : step === 'registering' ? 'Step 2/2: Registering name onchain…'
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
        <div style={{ background: 'rgba(240,165,0,0.08)', border: '1px solid rgba(240,165,0,0.2)', borderRadius: 14, padding: '14px 16px', marginBottom: 20, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <AlertCircle size={15} color="#F0A500" style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 13, color: '#F0A500', lineHeight: 1.5 }}>
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
            background: 'linear-gradient(135deg, rgba(0,102,255,0.15) 0%, rgba(0,102,255,0.05) 100%)',
            border: '1.5px solid rgba(0,102,255,0.3)',
            borderRadius: 22, padding: '28px 22px', marginBottom: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 56, height: 56, borderRadius: 18, background: '#0066FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 4px 20px rgba(0,102,255,0.4)' }}>
                <AtSign size={24} color="#fff" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: C.t3, fontWeight: 600, marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Your NAN Name</div>
                <div style={{ fontSize: 26, fontWeight: 900, color: C.text, letterSpacing: '-0.03em', lineHeight: 1, fontFamily: MONO }}>
                  @{myHandle}
                </div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#00C853', background: 'rgba(0,200,83,0.10)', border: '1px solid rgba(0,200,83,0.18)', borderRadius: 20, padding: '4px 12px', flexShrink: 0 }}>
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
                  {copied ? <Check size={14} color="#00C853" /> : <Copy size={14} color={C.t3} />}
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
                  {n === myHandle && <Star size={12} color="#F0A500" fill="#F0A500" />}
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
      {(step === 'lookup' || step === 'approving' || step === 'registering') && (
        <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 18, padding: '20px', marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 2 }}>Register a handle</div>
          <div style={{ fontSize: 12, color: C.t3, marginBottom: 16 }}>Claim a unique @handle linked to your wallet.</div>

          {/* Handle input */}
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 16, fontWeight: 700, color: '#0066FF', pointerEvents: 'none', zIndex: 1 }}>@</span>
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
                background: C.surf2, border: `1.5px solid ${handleError ? '#FF3B3B' : newHandle ? '#0066FF' : C.bdr}`,
                borderRadius: 12, color: C.text, fontSize: 16, fontWeight: 700, fontFamily: MONO,
                outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s',
                opacity: isBusy ? 0.6 : 1,
              }}
            />
          </div>
          {handleError && <div style={{ fontSize: 12, color: '#FF3B3B', marginBottom: 8 }}>{handleError}</div>}
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
                    background: duration === d.val ? 'rgba(0,102,255,0.10)' : C.surf2,
                    border: `1.5px solid ${duration === d.val ? '#0066FF' : C.bdr}`,
                    transition: 'all 0.15s',
                  }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: duration === d.val ? '#0066FF' : C.text }}>{d.label}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: duration === d.val ? '#0066FF' : C.t2, marginTop: 2 }}>{d.price}</div>
                  <div style={{ fontSize: 10, color: C.t3, marginTop: 1 }}>{d.sub}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Progress indicator */}
          {stepLabel && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,102,255,0.06)', border: '1px solid rgba(0,102,255,0.15)', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
              <Loader2 size={14} color="#0066FF" style={{ animation: 'nan-spin 0.8s linear infinite', flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: '#0066FF', fontWeight: 600 }}>{stepLabel}</span>
            </div>
          )}

          <button onClick={handleSubmit} disabled={isBusy || !newHandle.trim()}
            style={{
              width: '100%', height: 50, borderRadius: 13,
              background: (isBusy || !newHandle.trim()) ? C.surf2 : '#0066FF',
              border: 'none',
              color: (isBusy || !newHandle.trim()) ? C.t3 : '#fff',
              fontSize: 15, fontWeight: 700,
              cursor: (isBusy || !newHandle.trim()) ? 'not-allowed' : 'pointer',
              fontFamily: F,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: (!isBusy && newHandle.trim()) ? '0 4px 18px rgba(0,102,255,0.35)' : 'none',
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
              style={{ width: 44, height: 44, borderRadius: 12, background: '#0066FF', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {searching ? <Loader2 size={16} color="#fff" style={{ animation: 'nan-spin 0.8s linear infinite' }} /> : <Search size={16} color="#fff" />}
            </button>
          </div>

          {searchResult === 'available' && (
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,200,83,0.08)', border: '1px solid rgba(0,200,83,0.18)', borderRadius: 10, padding: '10px 14px' }}>
              <CheckCircle2 size={15} color="#00C853" />
              <span style={{ fontSize: 13, color: '#00C853', fontWeight: 600, flex: 1 }}>@{searchInput} is available!</span>
              {step === 'lookup' && (
                <button onClick={() => { setNewHandle(searchInput); setStep('lookup') }}
                  style={{ fontSize: 12, fontWeight: 700, color: '#00C853', background: 'none', border: 'none', cursor: 'pointer', fontFamily: F }}>
                  Register it
                </button>
              )}
            </div>
          )}
          {searchResult === 'taken' && (
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,59,59,0.06)', border: '1px solid rgba(255,59,59,0.18)', borderRadius: 10, padding: '10px 14px' }}>
              <AlertCircle size={15} color="#FF3B3B" />
              <span style={{ fontSize: 13, color: '#FF3B3B', fontWeight: 600 }}>@{searchInput} is taken</span>
            </div>
          )}
        </div>
      )}

      {/* Info footer */}
      <div style={{ background: C.surf2, border: `1px solid ${C.bdr}`, borderRadius: 14, padding: '14px 16px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.t2, marginBottom: 6 }}>About NAN Names</div>
        <div style={{ fontSize: 12, color: C.t3, lineHeight: 1.6 }}>
          NAN Names are onchain handles stored on Arc Testnet. Your @handle resolves to your wallet address — anyone can send you USDC without a long hex address. Registration costs 2 USDC/yr and requires two wallet approvals (approve + register).
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
