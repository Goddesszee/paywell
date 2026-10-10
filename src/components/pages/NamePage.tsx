/**
 * NamePage — redirect bridge.
 * Previously showed a name-input form after login. Now the onchain NAN Name
 * registry is the single identity source, so we redirect straight to it.
 */
import { useEffect } from 'react'
import { useAppStore } from '../../store/appStore'

export function NamePage() {
  const { setActiveView } = useAppStore()
  useEffect(() => { setActiveView('nan-name') }, [setActiveView])
  return null
}
