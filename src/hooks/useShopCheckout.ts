/**
 * useShopCheckout — pays the merchant wallet in USDC onchain via wagmi.
 * Reads USDC address + decimals from onchain-facts.
 * Uses ERC-20 transfer (no approval needed for direct transfer).
 */
import { useCallback, useState } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { parseUnits } from 'viem'
import { getUsdc } from '../onchain-facts'
import { CartItem } from '../store/appStore'
import { useAppStore } from '../store/appStore'

export type CheckoutStatus = 'idle' | 'signing' | 'pending' | 'confirmed' | 'error'

const USDC_ABI = [
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
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
  const [error, setError] = useState<string | undefined>()

  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  const checkout = useCallback(async (cart: CartItem[]) => {
    if (!chainId) { setError('No wallet connected'); return false }

    const usdc = getUsdc(chainId)
    if (!usdc) { setError('USDC not found on this chain'); return false }

    // Sum all items and pay one combined transfer to the merchant wallet
    const total = cart.reduce((acc, c) => acc + c.product.price * c.quantity, 0)
    const merchantWallet = cart[0]?.product.merchantWallet as `0x${string}`
    if (!merchantWallet) { setError('No merchant wallet'); return false }

    try {
      setStatus('signing')
      setError(undefined)
      const amount = parseUnits(total.toFixed(6), usdc.decimals)
      const hash = await writeContractAsync({
        address: usdc.address as `0x${string}`,
        abi: USDC_ABI,
        functionName: 'transfer',
        args: [merchantWallet, amount],
      })
      setTxHash(hash)
      setStatus('pending')

      // Log each item as a purchase activity
      cart.forEach((item) => {
        addActivity({
          type: 'purchase',
          description: item.product.name,
          amount: item.product.price * item.quantity,
          sign: '-',
          status: 'confirmed',
          counterparty: item.product.merchant,
          productId: item.product.id,
          txHash: hash,
        })
      })
      setStatus('confirmed')
      return true
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Transaction failed'
      setError(msg.includes('User rejected') ? 'Transaction cancelled' : msg)
      setStatus('error')
      return false
    }
  }, [chainId, writeContractAsync, addActivity])

  return { checkout, status, txHash, error, isSuccess }
}
