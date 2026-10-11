import { ArrowLeft } from 'lucide-react'
import { useGoBack } from '../../hooks/useGoBack'

/** Square back button matching the other pages; returns to wherever the user came from. */
export function BackButton({ from }: { from: string }) {
  const goBack = useGoBack(from)
  return (
    <button onClick={goBack} aria-label="Back"
      style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--nan-surface)', border: '1px solid var(--nan-bdr)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', marginBottom: 14 }}>
      <ArrowLeft size={15} color="var(--nan-text2)" />
    </button>
  )
}
