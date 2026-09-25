/**
 * useShopCheckout — creates a real escrow order on PaywellEscrow contract.
 * 1. Buyer approves USDC to the escrow contract
 * 2. createOrder(merchant, amount) is called — USDC moves to escrow
 * 3. Buyer can confirmOrder(id) to release to merchant, or wait 3 days for auto-release
 */
import { useCallback, useState } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { parseUnits } from 'viem'
import { getUsdc } from '../onchain-facts'
import { CartItem } from '../store/appStore'
import { useAppStore } from '../store/appStore'
import escrowArtifact from '../../contracts/out/PaywellEscrow.sol/PaywellEscrow.json'

export type CheckoutStatus = 'idle' | 'approving' | 'creating-order' | 'pending' | 'confirmed' | 'error'

const ESCROW_ADDRESS = '0x1d33876fa77b0d0026f8cee30448941c0cf075cb' as const

const USDC_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const

export function useShopCheckout() {
  const { chainId } = useAccount()
  const { writeContractAsync } = useWriteContract()
  const { addActivity } = useAppStore()
  const [status, setStatus] = useState<CheckoutStatus>('idle')
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>()
  const [orderId, setOrderId] = useState<number | undefined>()
  const [error, setError] = useState<string | undefined>()

  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  const checkout = useCallback(async (cart: CartItem[]) => {
    if (!chainId) { setError('No wallet connected'); return false }

    const usdc = getUsdc(chainId)
    if (!usdc) { setError('USDC not found on this chain'); return false }

    const total = cart.reduce((acc, c) => acc + c.product.price * c.quantity, 0)
    const merchantWallet = cart[0]?.product.merchantWallet as `0x${string}`
    if (!merchantWallet) { setError('No merchant wallet'); return false }

    try {
      setStatus('approving')
      setError(undefined)
      const amount = parseUnits(total.toFixed(6), usdc.decimals)

      // Step 1 — approve escrow to spend USDC
      await writeContractAsync({
        address: usdc.address as `0x${string}`,
        abi: USDC_ABI,
        functionName: 'approve',
        args: [ESCROW_ADDRESS, amount],
      })

      // Step 2 — create escrow order
      setStatus('creating-order')
      const hash = await writeContractAsync({
        address: ESCROW_ADDRESS,
        abi: escrowArtifact.abi,
        functionName: 'createOrder',
        args: [merchantWallet, amount],
      })

      setTxHash(hash)
      setStatus('pending')

      cart.forEach((item) => {
        addActivity({
          type: 'purchase',
          description: `${item.product.name} (escrow)`,
          amount: item.product.price * item.quantity,
          sign: '-',
          status: 'pending',
          counterparty: item.product.merchant,
          productId: item.product.id,
          txHash: hash,
        })
      })

      setStatus('confirmed')
      return true
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Transaction failed'
      setError(msg.includes('User rejected') ? 'Transaction cancelled' : msg.slice(0, 120))
      setStatus('error')
      return false
    }
  }, [chainId, writeContractAsync, addActivity])

  const confirmDelivery = useCallback(async (id: number) => {
    try {
      const hash = await writeContractAsync({
        address: ESCROW_ADDRESS,
        abi: escrowArtifact.abi,
        functionName: 'confirmOrder',
        args: [BigInt(id)],
      })
      setTxHash(hash)
      return hash
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed'
      setError(msg.slice(0, 120))
      return null
    }
  }, [writeContractAsync])

  return { status, txHash, orderId, error, isSuccess, checkout, confirmDelivery }
}
