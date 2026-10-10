import { useEffect } from 'react'
import { useAccount } from 'wagmi'
import { useAppStore } from '../store/appStore'

/**
 * Registers the signed-in user and their wallets with the server so the admin
 * dashboard can show real user/wallet totals. Fire-and-forget; runs once per
 * identity/wallet combination per browser tab.
 */
export function usePresence() {
  const auth = useAppStore(s => s.auth)
  const mainWalletAddress = useAppStore(s => s.mainWalletAddress)
  const agentAddress = useAppStore(s => s.agentWallet?.address)
  const { address: wagmiAddress } = useAccount()

  const email = auth?.email ?? ''
  const wallet = auth?.walletAddress ?? mainWalletAddress ?? wagmiAddress ?? ''
  const circleWallet = auth?.circleWalletAddress ?? ''
  const loginType = auth?.isPasskeyUser ? 'passkey' : (auth?.userToken || auth?.circleWalletAddress) ? 'email' : (wallet ? 'wallet' : 'unknown')

  useEffect(() => {
    if (!email && !wallet && !circleWallet) return
    const fingerprint = [email, wallet, circleWallet, agentAddress ?? ''].join('|').toLowerCase()
    let first = true
    try {
      if (sessionStorage.getItem('nan_presence') === fingerprint) return
      first = !sessionStorage.getItem('nan_presence_seen')
      sessionStorage.setItem('nan_presence', fingerprint)
      sessionStorage.setItem('nan_presence_seen', '1')
    } catch { /* storage blocked — still report */ }
    void fetch('/api/identify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, walletAddress: wallet, circleWalletAddress: circleWallet, agentWalletAddress: agentAddress ?? '', loginType, newSession: first }),
    }).catch(() => {})
  }, [email, wallet, circleWallet, agentAddress, loginType])
}
